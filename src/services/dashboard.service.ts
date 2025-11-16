import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '../db/database.types.js';
import type {
  UUID,
  DashboardDto,
  DashboardQuery,
  DashboardSummaryDto,
  RecentReportDto,
  CategorySummaryDto,
} from '../types.js';
import { supabaseClient } from '../db/supabase.client.js';

/**
 * Custom error for when user preferences are not found
 */
export class PreferencesNotFoundError extends Error {
  constructor(userId: UUID) {
    super(`Preferences not found for user ${userId}`);
    this.name = 'PreferencesNotFoundError';
  }
}

/**
 * DashboardService handles dashboard data aggregation operations
 * Manages aggregation of notes, streak calculation, and recent reports
 *
 * This service uses user-scoped Supabase clients to enforce RLS (Row-Level Security)
 * ensuring users can only access their own data
 */
export class DashboardService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement via JWT)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Retrieve complete dashboard data for authenticated user
   *
   * Orchestrates all sub-operations:
   * 1. Fetches user preferences (for timezone and delivery preferences)
   * 2. Gets profile timezone if not provided in query
   * 3. Fetches all active categories from system
   * 4. Counts notes per category within date range
   * 5. Calculates consecutive-day streak
   * 6. Fetches recent reports (max 10)
   *
   * @param userId - UUID of the authenticated user
   * @param query - DashboardQuery with optional timezone and since parameters
   * @returns DashboardDto with summary including all categories and their note counts, plus recent reports
   * @throws PreferencesNotFoundError if user preferences not found
   * @throws Error for unexpected database errors
   */
  async getDashboard(userId: UUID, query: DashboardQuery): Promise<DashboardDto> {
    // 1. Fetch user preferences (for future use and validation)
    const preferences = await this.getUserPreferences(userId);

    // 2. Determine timezone (use query param or profile default)
    let timezone = query.timezone;
    if (!timezone) {
      timezone = await this.getProfileTimezone(userId);
    }

    // 3. Determine date range (use query param or default to 4 weeks ago)
    const since = query.since ? new Date(query.since) : this.getFourWeeksAgo();

    // 4. Fetch all active categories from system
    const allCategories = await this.getAllCategories();

    // 5. Get notes count for all categories
    const notesCounts = await this.getNotesCounts(userId, since);

    // 6. Build category summary with names and note counts
    const categorySummaries: CategorySummaryDto[] = allCategories.map((category) => ({
      id: category.id,
      name: category.name,
      notes_count: notesCounts[category.id] || 0,
    }));

    // 7. Calculate consecutive-day streak
    const streakDays = await this.calculateStreak(userId, timezone);

    // 8. Get recent reports
    const recentReports = await this.getRecentReports(userId);

    // 9. Assemble and return response
    const summary: DashboardSummaryDto = {
      categories: categorySummaries,
      streak_days: streakDays,
    };

    return {
      summary,
      recent_reports: recentReports,
    };
  }

  /**
   * Retrieve user preferences including active categories
   *
   * @param userId - UUID of the authenticated user
   * @returns User preferences with active categories list
   * @throws PreferencesNotFoundError if preferences not found
   * @throws Error for unexpected database errors
   */
  private async getUserPreferences(
    userId: UUID
  ): Promise<Tables<'preferences'>> {
    const { data: preferences, error } = await this.userClient
      .from('preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        throw new PreferencesNotFoundError(userId);
      }
      throw new Error(`Failed to retrieve preferences: ${error.message}`);
    }

    if (!preferences) {
      throw new PreferencesNotFoundError(userId);
    }

    return preferences;
  }

  /**
   * Retrieve user's profile timezone
   *
   * Used as default when timezone is not provided in query parameters
   *
   * @param userId - UUID of the authenticated user
   * @returns User's timezone string (default 'UTC' if not set)
   * @throws Error for unexpected database errors
   */
  private async getProfileTimezone(userId: UUID): Promise<string> {
    const { data: profile, error } = await this.userClient
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Profile not found, return default
        return 'UTC';
      }
      throw new Error(`Failed to retrieve profile timezone: ${error.message}`);
    }

    return profile?.timezone || 'UTC';
  }

  /**
   * Fetch all active categories from the system
   *
   * @returns Array of all active categories with id and name
   * @throws Error for unexpected database errors
   */
  private async getAllCategories(): Promise<Array<{ id: UUID; name: string }>> {
    const { data: categories, error } = await supabaseClient
      .from('categories')
      .select('id, name')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to retrieve categories: ${error.message}`);
    }

    return (categories || []) as Array<{ id: UUID; name: string }>;
  }

  /**
   * Count notes per category for given user and date range
   *
   * Counts non-deleted notes for all categories
   *
   * @param userId - UUID of the authenticated user
   * @param since - Date range start (ISO date)
   * @returns Map of category_id to note count
   * @throws Error for unexpected database errors
   */
  private async getNotesCounts(
    userId: UUID,
    since: Date
  ): Promise<Record<UUID, number>> {
    const { data: notesCounts, error } = await this.userClient
      .from('notes')
      .select('category_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', since.toISOString());

    if (error) {
      throw new Error(`Failed to retrieve notes counts: ${error.message}`);
    }

    // Aggregate counts by category
    const countMap: Record<UUID, number> = {};
    if (notesCounts) {
      for (const note of notesCounts) {
        const categoryId = note.category_id;
        countMap[categoryId] = (countMap[categoryId] || 0) + 1;
      }
    }

    return countMap;
  }

  /**
   * Calculate consecutive-day streak for user
   *
   * Counts consecutive days from today backward where user has at least one note
   *
   * Algorithm:
   * 1. Query all distinct note dates in past 90 days (optimization)
   * 2. Sort dates in descending order
   * 3. Count consecutive days from today backward
   * 4. Break on first gap
   *
   * @param userId - UUID of the authenticated user
   * @param timezone - User's timezone for local date boundaries
   * @returns Number of consecutive days with notes
   * @throws Error for unexpected database errors
   */
  private async calculateStreak(userId: UUID, timezone: string): Promise<number> {
    // Query distinct dates with notes in the past 90 days
    const { data: noteDates, error } = await this.userClient
      .from('notes')
      .select('created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('created_at', this.get90DaysAgo().toISOString());

    if (error) {
      throw new Error(`Failed to calculate streak: ${error.message}`);
    }

    if (!noteDates || noteDates.length === 0) {
      return 0;
    }

    // Extract and deduplicate dates in user's timezone
    const dateSet = new Set<string>();
    for (const noteRecord of noteDates) {
      const date = new Date(noteRecord.created_at);
      const localDateStr = this.getLocalDateString(date, timezone);
      dateSet.add(localDateStr);
    }

    // Convert to array and sort descending
    const sortedDates = Array.from(dateSet).sort().reverse();

    // Count consecutive days from today backward
    let streak = 0;
    let currentDate = new Date();
    const todayStr = this.getLocalDateString(currentDate, timezone);

    for (const dateStr of sortedDates) {
      const expectedDateStr = this.getLocalDateString(currentDate, timezone);

      if (dateStr === expectedDateStr) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (dateStr < expectedDateStr) {
        // Streak is broken (gap in dates)
        break;
      }
    }

    // Only return streak if today or yesterday has a note
    const yesterdayStr = new Date(currentDate.getTime() + 86400000); // Add back 1 day
    if (streak === 0 || (todayStr !== sortedDates[0] && !sortedDates.includes(todayStr))) {
      return 0;
    }

    return streak;
  }

  /**
   * Retrieve recent reports for user
   *
   * Returns up to 10 most recent non-deleted reports sorted by creation date descending
   *
   * @param userId - UUID of the authenticated user
   * @returns Array of recent report metadata
   * @throws Error for unexpected database errors
   */
  private async getRecentReports(userId: UUID): Promise<RecentReportDto[]> {
    const { data: reports, error } = await this.userClient
      .from('reports')
      .select('id, generated_by, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw new Error(`Failed to retrieve recent reports: ${error.message}`);
    }

    return (reports as RecentReportDto[]) || [];
  }

  /**
   * Helper: Get date 4 weeks ago from today
   */
  private getFourWeeksAgo(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 28);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Helper: Get date 90 days ago from today
   */
  private get90DaysAgo(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Helper: Convert Date to local date string in given timezone
   * Format: YYYY-MM-DD
   *
   * @param date - Date to convert
   * @param timezone - IANA timezone string
   * @returns Local date string in format YYYY-MM-DD
   */
  private getLocalDateString(date: Date, timezone: string): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(date);
    } catch {
      // Fallback to UTC if timezone is invalid
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
}
