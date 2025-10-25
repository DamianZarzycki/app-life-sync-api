import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { UUID, ReportDto, ListReportsResponseDto } from '../types.js';
import type { ListReportsQuery } from '../validation/reports.js';

/**
 * Custom error for when a report is not found
 */
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID) {
    super(`Report ${reportId} not found`);
    this.name = 'ReportNotFoundError';
  }
}

/**
 * Custom error for when weekly on-demand report limit is exceeded
 */
export class WeeklyLimitExceededError extends Error {
  constructor(
    public readonly count: number,
    public readonly limit: number = 3,
    public readonly weekStart: string,
    public readonly weekEnd: string
  ) {
    super(
      `Weekly on-demand report limit exceeded: ${count}/${limit} for week ${weekStart} to ${weekEnd}`
    );
    this.name = 'WeeklyLimitExceededError';
  }
}

/**
 * Custom error for when one or more categories are invalid or unauthorized
 */
export class InvalidCategoriesError extends Error {
  constructor(public readonly invalidIds: UUID[]) {
    super(`Invalid or unauthorized categories: ${invalidIds.join(', ')}`);
    this.name = 'InvalidCategoriesError';
  }
}

/**
 * Custom error for when an idempotency key is already being processed
 */
export class DuplicateIdempotencyKeyError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(`Request with this Idempotency-Key is already being processed`);
    this.name = 'DuplicateIdempotencyKeyError';
  }
}

/**
 * ReportsService handles reports operations
 * Manages listing, filtering, and retrieval of user reports
 *
 * This service uses user-scoped Supabase clients to enforce RLS (Row-Level Security)
 * ensuring users can only access their own reports
 */
export class ReportsService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement via JWT)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Retrieve paginated list of reports for authenticated user with optional filtering
   *
   * @param userId - UUID of the authenticated user
   * @param query - ListReportsQuery with optional filters (week_start_local, generated_by, include_deleted, sort, limit, offset)
   * @returns ListReportsResponseDto with paginated reports and metadata
   * @throws Error if database query fails
   */
  async listReports(userId: UUID, query: ListReportsQuery): Promise<ListReportsResponseDto> {
    const {
      week_start_local,
      generated_by,
      include_deleted = false,
      limit = 20,
      offset = 0,
      sort = 'created_at_desc',
    } = query;

    // Build the count query to get total number of matching reports
    let countQuery = this.userClient
      .from('reports')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    // Build the data query to get paginated results
    let dataQuery = this.userClient.from('reports').select('*').eq('user_id', userId);

    // Apply soft-delete filter (exclude deleted_at unless include_deleted is true)
    if (!include_deleted) {
      countQuery = countQuery.is('deleted_at', null);
      dataQuery = dataQuery.is('deleted_at', null);
    }

    // Apply generated_by filter if provided
    if (generated_by) {
      countQuery = countQuery.eq('generated_by', generated_by);
      dataQuery = dataQuery.eq('generated_by', generated_by);
    }

    // Apply week_start_local filter if provided
    // Convert week start date to ISO datetime range for the week (Monday 00:00 to Sunday 23:59:59)
    if (week_start_local) {
      const weekStartDateTime = `${week_start_local}T00:00:00Z`;
      // Calculate end of week (Sunday 23:59:59 in UTC)
      const weekStartDate = new Date(weekStartDateTime);
      const weekEndDate = new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000);
      const weekEndDateTime = `${weekEndDate.toISOString().split('T')[0]}T23:59:59Z`;

      countQuery = countQuery
        .gte('created_at', weekStartDateTime)
        .lte('created_at', weekEndDateTime);
      dataQuery = dataQuery.gte('created_at', weekStartDateTime).lte('created_at', weekEndDateTime);
    }

    // Apply sorting
    const isAscending = sort === 'created_at_asc';
    dataQuery = dataQuery.order('created_at', { ascending: isAscending });

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + limit - 1);

    // Execute count query
    const { error: countError, count } = await countQuery;
    if (countError) {
      console.error('ReportsService.listReports count query error:', countError);
      throw new Error(`Failed to count reports: ${countError.message}`);
    }

    // Execute data query
    const { data: reports, error: dataError } = await dataQuery;
    if (dataError) {
      console.error('ReportsService.listReports data query error:', dataError);
      throw new Error(`Failed to retrieve reports: ${dataError.message}`);
    }

    // Build and return paginated response DTO
    const total = count ?? 0;
    return {
      items: (reports || []) as ReportDto[],
      total,
      limit,
      offset,
    };
  }

  /**
   * Retrieve a single report by ID for the authenticated user
   *
   * @param userId - UUID of the authenticated user
   * @param reportId - UUID of the report to retrieve
   * @returns ReportDto if report exists and user owns it
   * @throws ReportNotFoundError if report doesn't exist or user doesn't own it
   * @throws Error for unexpected database errors
   */
  async getReportById(userId: UUID, reportId: UUID): Promise<ReportDto> {
    const { data: report, error } = await this.userClient
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .is('deleted_at', null)
      .single();

    // Handle not found error (PGRST116 is Supabase's error code for "no rows returned")
    if (error) {
      if (error.code === 'PGRST116') {
        throw new ReportNotFoundError(reportId);
      }
      console.error('ReportsService.getReportById error:', error);
      throw new Error(`Failed to retrieve report: ${error.message}`);
    }

    if (!report) {
      throw new ReportNotFoundError(reportId);
    }

    return report as ReportDto;
  }

  /**
   * Soft-delete a report by ID for the authenticated user
   *
   * Sets deleted_at timestamp to mark report as deleted without physical removal
   * Enforces user ownership through RLS and explicit verification
   *
   * @param userId - UUID of the authenticated user
   * @param reportId - UUID of the report to delete
   * @returns void (on success)
   * @throws ReportNotFoundError if report doesn't exist or user doesn't own it
   * @throws Error for unexpected database errors
   */
  async deleteReportById(userId: UUID, reportId: UUID): Promise<void> {
    // Step 1: Verify report exists and user owns it
    const { data: report, error: getError } = await this.userClient
      .from('reports')
      .select('id, user_id')
      .eq('id', reportId)
      .is('deleted_at', null)
      .single();

    if (getError) {
      // PGRST116 is Supabase's error code for "no rows returned"
      if (getError.code === 'PGRST116') {
        throw new ReportNotFoundError(reportId);
      }
      console.error('ReportsService.deleteReportById error retrieving report:', getError);
      throw new Error(`Failed to retrieve report: ${getError.message}`);
    }

    if (!report) {
      throw new ReportNotFoundError(reportId);
    }

    // Defense-in-depth: Explicitly verify user ownership
    // (RLS already enforces this, but we verify for extra safety)
    if (report.user_id !== userId) {
      throw new ReportNotFoundError(reportId);
    }

    // Step 2: Soft-delete the report
    const { error: updateError } = await this.userClient
      .from('reports')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', reportId);

    if (updateError) {
      console.error('ReportsService.deleteReportById error updating report:', updateError);
      throw new Error(`Failed to delete report: ${updateError.message}`);
    }
  }

  /**
   * Generate a new on-demand report for the authenticated user
   *
   * @param userId - UUID of authenticated user
   * @param command - GenerateReportCommand with include_categories
   * @param idempotencyKey - Optional Idempotency-Key for deduplication
   * @returns Generated ReportDto
   * @throws WeeklyLimitExceededError if limit reached
   * @throws InvalidCategoriesError if categories invalid/unauthorized
   * @throws Error for unexpected DB/LLM failures
   */
  async generateReport(
    userId: UUID,
    command: { include_categories: UUID[] },
    idempotencyKey?: string
  ): Promise<ReportDto> {
    // 1. Idempotency check (if key provided)
    if (idempotencyKey) {
      const existing = await this.checkIdempotencyKey(userId, idempotencyKey);
      if (existing) {
        console.log(`[INFO] Idempotency key ${idempotencyKey} found, returning cached report`);
        return existing; // Return cached result
      }
    }

    // 2. Validate categories
    const validatedCategories = await this.validateCategories(userId, command.include_categories);
    console.log(`[INFO] Validated ${validatedCategories.length} categories for user ${userId}`);

    // 3. Check weekly limit
    const { weekStart, weekEnd } = await this.checkWeeklyLimit(userId);
    console.log(
      `[INFO] Weekly limit check passed for user ${userId} (week ${weekStart} to ${weekEnd})`
    );

    // 4. Fetch notes for report content
    const notes = await this.fetchNotesForReport(userId, command.include_categories);
    console.log(`[INFO] Fetched ${notes.length} notes for report generation`);

    // 5. Generate report via LLM
    const generatedContent = await this.generateReportContent(notes, validatedCategories);
    console.log(`[INFO] Generated report content (${generatedContent.html.length} bytes HTML)`);

    // 6. Insert report into database
    const report = await this.insertReport(userId, generatedContent, validatedCategories);
    console.log(`[INFO] Report inserted with ID ${report.id}`);

    // 7. Store idempotency key (if provided)
    if (idempotencyKey) {
      await this.storeIdempotencyKey(userId, idempotencyKey, report.id);
      console.log(`[INFO] Idempotency key stored for future requests`);
    }

    return report;
  }

  /**
   * Check if Idempotency-Key has been processed recently
   * Returns cached report if key found, null otherwise
   */
  private async checkIdempotencyKey(
    userId: UUID,
    idempotencyKey: string
  ): Promise<ReportDto | null> {
    try {
      // Query idempotency_keys table
      // Note: This table will be created via database migration
      const { data: keyRecord, error } = await (this.userClient as any)
        .from('idempotency_keys')
        .select('report_id')
        .eq('user_id', userId)
        .eq('key', idempotencyKey)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        // PGRST116 means no rows found, which is expected for new keys
        if (error.code !== 'PGRST116') {
          console.warn(`[WARN] Error checking idempotency key: ${error.message}`);
        }
        return null;
      }

      if (!keyRecord) {
        return null; // Key not found or expired
      }

      // Fetch the cached report
      return this.getReportById(userId, keyRecord.report_id);
    } catch (err) {
      console.warn(`[WARN] Idempotency key check failed, continuing with generation: ${err}`);
      return null; // Graceful fallback: proceed with generation
    }
  }

  /**
   * Validate all categories exist, are active, and user is authorized
   */
  private async validateCategories(
    userId: UUID,
    categoryIds: UUID[]
  ): Promise<Array<{ id: UUID; name?: string; active?: boolean }>> {
    // 1. Fetch categories that exist and are active
    const { data: existingCategories, error: catError } = await this.userClient
      .from('categories')
      .select('*')
      .in('id', categoryIds)
      .eq('active', true);

    if (catError) {
      console.error(`[ERROR] Failed to validate categories: ${catError.message}`);
      throw new Error(`Failed to validate categories: ${catError.message}`);
    }

    // 2. Check if all requested categories exist and are active
    const foundIds = new Set((existingCategories || []).map((c: any) => c.id));
    const notFoundIds = categoryIds.filter((id) => !foundIds.has(id));

    if (notFoundIds.length > 0) {
      console.warn(
        `[WARN] User ${userId} requested invalid/inactive categories: ${notFoundIds.join(', ')}`
      );
      throw new InvalidCategoriesError(notFoundIds);
    }

    // 3. Fetch user preferences to verify authorization
    const { data: prefs, error: prefError } = await this.userClient
      .from('preferences')
      .select('active_categories')
      .eq('user_id', userId)
      .single();

    if (prefError) {
      console.error(`[ERROR] Failed to fetch preferences: ${prefError.message}`);
      throw new Error(`Failed to fetch preferences: ${prefError.message}`);
    }

    // 4. Verify all categories are in active_categories
    const activeCatSet = new Set(prefs?.active_categories || []);
    const unauthorizedIds = categoryIds.filter((id) => !activeCatSet.has(id));

    if (unauthorizedIds.length > 0) {
      console.warn(
        `[WARN] User ${userId} attempted unauthorized category access: ${unauthorizedIds.join(', ')}`
      );
      throw new InvalidCategoriesError(unauthorizedIds);
    }

    return existingCategories as Array<{ id: UUID; name?: string; active?: boolean }>;
  }

  /**
   * Check if user has already created 3 on-demand reports this week
   * Uses user's timezone to determine week boundaries
   */
  private async checkWeeklyLimit(userId: UUID): Promise<{ weekStart: string; weekEnd: string }> {
    // 1. Get user's timezone from profile
    const { data: profile, error: profError } = await this.userClient
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .single();

    if (profError) {
      console.error(`[ERROR] Failed to fetch profile: ${profError.message}`);
      throw new Error(`Failed to fetch profile: ${profError.message}`);
    }

    // 2. Calculate week start and end in user's timezone
    const { weekStart, weekEnd } = this.calculateWeekBoundaries(profile.timezone);

    // 3. Count on-demand reports this week (includes soft-deleted)
    const {
      data: reports,
      error: countError,
      count,
    } = await this.userClient
      .from('reports')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('generated_by', 'on_demand')
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd);

    if (countError) {
      console.error(`[ERROR] Failed to count reports: ${countError.message}`);
      throw new Error(`Failed to count reports: ${countError.message}`);
    }

    const reportCount = count ?? reports?.length ?? 0;
    if (reportCount >= 3) {
      console.info(`[INFO] User ${userId} attempted to exceed weekly limit: ${reportCount}/3`);
      throw new WeeklyLimitExceededError(reportCount, 3, weekStart, weekEnd);
    }

    return { weekStart, weekEnd };
  }

  /**
   * Calculate week start and end for user's timezone
   * Week: Monday 00:00:00 to Sunday 23:59:59 in UTC
   */
  private calculateWeekBoundaries(timezone: string): { weekStart: string; weekEnd: string } {
    // Get current date in user's timezone
    const now = new Date();
    const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    // Calculate days since Monday (0 = Sunday, 1 = Monday in JS)
    const dayOfWeek = userDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Calculate Monday of current week
    const monday = new Date(userDate);
    monday.setDate(userDate.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);

    // Calculate Sunday of current week
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Return ISO strings
    const weekStart = monday.toISOString().split('T')[0] + 'T00:00:00Z';
    const weekEnd = sunday.toISOString().split('T')[0] + 'T23:59:59Z';

    return { weekStart, weekEnd };
  }

  /**
   * Fetch notes from included categories for LLM input
   */
  private async fetchNotesForReport(
    userId: UUID,
    categoryIds: UUID[]
  ): Promise<Record<string, any>[]> {
    const { data, error } = await this.userClient
      .from('notes')
      .select('*')
      .in('category_id', categoryIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100); // Limit to prevent LLM overload

    if (error) {
      console.error(`[ERROR] Failed to fetch notes: ${error.message}`);
      throw new Error(`Failed to fetch notes: ${error.message}`);
    }

    return (data || []) as Record<string, any>[];
  }

  /**
   * Generate report HTML/text via LLM service
   * Currently returns placeholder content
   * TODO: Integrate with LLM service (OpenAI, OpenRouter, etc.)
   */
  private async generateReportContent(
    _notes: Record<string, any>[],
    _categories: Array<{ id: UUID; name?: string; active?: boolean }>
  ): Promise<{
    html: string;
    text_version: string | null;
    pdf_path: string | null;
    llm_model: string;
    system_prompt_version: string;
  }> {
    // Placeholder implementation
    // TODO: Replace with actual LLM integration
    console.log('[INFO] Generating report content via LLM service...');

    return {
      html: '<html><body><h1>Weekly Report</h1><p>Report content generated.</p></body></html>',
      text_version: 'Weekly Report\nReport content generated.',
      pdf_path: null, // Would be populated by actual LLM service
      llm_model: 'gpt-4',
      system_prompt_version: 'v1.0',
    };
  }

  /**
   * Insert report into database and trigger auto-delivery creation
   */
  private async insertReport(
    userId: UUID,
    content: {
      html: string;
      text_version: string | null;
      pdf_path: string | null;
      llm_model: string;
      system_prompt_version: string;
    },
    categories: Array<{ id: UUID; name?: string; active?: boolean }>
  ): Promise<ReportDto> {
    const { data: report, error } = await this.userClient
      .from('reports')
      .insert({
        user_id: userId,
        generated_by: 'on_demand',
        html: content.html,
        text_version: content.text_version,
        pdf_path: content.pdf_path,
        llm_model: content.llm_model,
        system_prompt_version: content.system_prompt_version,
        categories_snapshot: JSON.stringify(categories) as any,
      })
      .select('*')
      .single();

    if (error) {
      console.error(`[ERROR] Failed to insert report: ${error.message}`);
      throw new Error(`Failed to insert report: ${error.message}`);
    }

    if (!report) {
      throw new Error('Failed to insert report: No data returned');
    }

    return report as ReportDto;
  }

  /**
   * Store Idempotency-Key with 24-hour expiration
   * Non-critical operation - does not block report generation on failure
   */
  private async storeIdempotencyKey(
    userId: UUID,
    idempotencyKey: string,
    reportId: UUID
  ): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error } = await (this.userClient as any).from('idempotency_keys').insert({
        user_id: userId,
        key: idempotencyKey,
        report_id: reportId,
        expires_at: expiresAt.toISOString(),
      });

      if (error) {
        // Log but don't fail the request if idempotency storage fails
        console.warn(`[WARN] Failed to store idempotency key: ${error.message}`);
      }
    } catch (err) {
      // Graceful error handling - idempotency is nice to have, not critical
      console.warn(`[WARN] Idempotency key storage failed: ${err}`);
    }
  }
}
