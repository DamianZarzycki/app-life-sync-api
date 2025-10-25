import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '../db/database.types.js';
import type {
  UUID,
  NoteDto,
  ListNotesQuery,
  CreateNoteCommand,
  ListNotesResponseDto,
} from '../types.js';

/**
 * Custom error for when a category is not active in user preferences
 */
export class CategoryNotActiveError extends Error {
  constructor(public categoryId: UUID) {
    super(`Category ${categoryId} is not active in user preferences`);
    this.name = 'CategoryNotActiveError';
  }
}

/**
 * Custom error for when daily limit is exceeded
 */
export class DailyLimitExceededError extends Error {
  constructor(
    public categoryId: UUID,
    public limit: number,
    public countToday: number
  ) {
    super(`Daily limit of ${limit} notes reached for category ${categoryId}`);
    this.name = 'DailyLimitExceededError';
  }
}

/**
 * Custom error for when category is not found
 */
export class CategoryNotFoundError extends Error {
  constructor(public categoryId: UUID) {
    super(`Category ${categoryId} not found`);
    this.name = 'CategoryNotFoundError';
  }
}

/**
 * Custom error for when a note is not found
 */
export class NoteNotFoundError extends Error {
  constructor(public noteId: UUID) {
    super(`Note ${noteId} not found`);
    this.name = 'NoteNotFoundError';
  }
}

/**
 * NotesService handles notes operations
 * Manages listing, filtering, creating notes with business rule enforcement
 */
export class NotesService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Retrieve paginated list of notes for authenticated user with optional filtering
   *
   * @param userId - UUID of the authenticated user
   * @param query - ListNotesQuery with optional filters (category_id, from, to, include_deleted, sort, limit, offset)
   * @returns ListNotesResponseDto with paginated notes and metadata
   * @throws Error if database query fails
   */
  async listNotes(userId: UUID, query: ListNotesQuery): Promise<ListNotesResponseDto> {
    const {
      category_id: categoryIds,
      from,
      to,
      include_deleted = false,
      limit = 20,
      offset = 0,
      sort = 'created_at_desc',
    } = query;

    // Normalize category_id to array (could be single UUID or array)
    const categoryIdArray = Array.isArray(categoryIds)
      ? categoryIds
      : categoryIds
        ? [categoryIds]
        : [];

    // Build the query
    let countQuery = this.userClient
      .from('notes')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    let dataQuery = this.userClient.from('notes').select('*').eq('user_id', userId);

    // Apply category filter if provided
    if (categoryIdArray.length > 0) {
      countQuery = countQuery.in('category_id', categoryIdArray);
      dataQuery = dataQuery.in('category_id', categoryIdArray);
    }

    // Apply date range filters if provided
    if (from) {
      countQuery = countQuery.gte('created_at', from);
      dataQuery = dataQuery.gte('created_at', from);
    }

    if (to) {
      countQuery = countQuery.lte('created_at', to);
      dataQuery = dataQuery.lte('created_at', to);
    }

    // Apply soft-delete filter
    if (!include_deleted) {
      countQuery = countQuery.is('deleted_at', null);
      dataQuery = dataQuery.is('deleted_at', null);
    }

    // Apply sorting
    const isAscending = sort === 'created_at_asc';
    const orderByColumn = sort.startsWith('created_at') ? 'created_at' : 'updated_at';
    dataQuery = dataQuery.order(orderByColumn, { ascending: isAscending });

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + limit - 1);

    // Execute count query
    const { error: countError, count } = await countQuery;
    if (countError) {
      throw new Error(`Failed to count notes: ${countError.message}`);
    }

    // Execute data query
    const { data: notes, error: dataError } = await dataQuery;
    if (dataError) {
      throw new Error(`Failed to retrieve notes: ${dataError.message}`);
    }

    const total = count ?? 0;
    return {
      items: (notes || []) as NoteDto[],
      total,
      limit,
      offset,
    };
  }

  /**
   * Create a new note with validation
   *
   * Business Logic:
   * 1. Verify category exists in the database
   * 2. Verify category is active in user preferences
   * 3. Check that daily per-category limit is not exceeded
   * 4. Insert the note
   *
   * @param userId - UUID of the authenticated user
   * @param command - CreateNoteCommand with category_id, title, and content
   * @returns Created NoteDto
   * @throws CategoryNotFoundError if category doesn't exist
   * @throws CategoryNotActiveError if category is not in user's active list
   * @throws DailyLimitExceededError if daily limit is reached
   * @throws Error if database operations fail
   */
  async createNote(userId: UUID, command: CreateNoteCommand): Promise<NoteDto> {
    const { category_id: categoryId, title, content } = command;

    // Step 1: Verify category exists
    const { data: categoryExists, error: categoryError } = await this.userClient
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .maybeSingle();

    if (categoryError) {
      throw new Error(`Failed to verify category: ${categoryError.message}`);
    }

    if (!categoryExists) {
      throw new CategoryNotFoundError(categoryId);
    }

    // Step 2: Fetch user preferences to verify category is active
    const { data: preferences, error: prefError } = await this.userClient
      .from('preferences')
      .select('active_categories, max_daily_notes')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefError) {
      throw new Error(`Failed to fetch preferences: ${prefError.message}`);
    }

    if (!preferences) {
      throw new Error('User preferences not found');
    }

    // Verify category is in active_categories
    const activeCategoryIds = (preferences.active_categories || []) as string[];
    if (!activeCategoryIds.includes(categoryId)) {
      throw new CategoryNotActiveError(categoryId);
    }

    // Step 3: Fetch user's timezone from profile
    const { data: profile, error: profileError } = await this.userClient
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to fetch profile: ${profileError.message}`);
    }

    const timezone = profile?.timezone || 'UTC';

    // Step 4: Count notes created today for this category
    const { startOfToday, endOfToday } = this.getTodayBoundariesInTimezone(timezone);

    const {
      data: notesToday,
      error: countError,
      count: countValue,
    } = await this.userClient
      .from('notes')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .gte('created_at', startOfToday)
      .lt('created_at', endOfToday)
      .is('deleted_at', null);

    if (countError) {
      throw new Error(`Failed to count today's notes: ${countError.message}`);
    }

    const notesTodayCount = countValue ?? 0;

    // Step 5: Check daily limit
    if (notesTodayCount >= preferences.max_daily_notes) {
      throw new DailyLimitExceededError(categoryId, preferences.max_daily_notes, notesTodayCount);
    }

    // Step 6: Create the note
    const { data: createdNote, error: insertError } = await this.userClient
      .from('notes')
      .insert([
        {
          user_id: userId,
          category_id: categoryId,
          title: title || null,
          content,
        },
      ])
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create note: ${insertError.message}`);
    }

    if (!createdNote) {
      throw new Error('Note creation returned no data');
    }

    return createdNote as NoteDto;
  }

  /**
   * Retrieve a single note by ID for the authenticated user
   *
   * Enforces ownership through user-scoped client (RLS)
   * Excludes soft-deleted notes by default
   *
   * @param userId - UUID of the authenticated user
   * @param noteId - UUID of the note to retrieve
   * @returns NoteDto if note exists and user owns it
   * @throws NoteNotFoundError if note doesn't exist or user doesn't own it
   * @throws Error for unexpected database errors
   */
  async getNoteById(userId: UUID, noteId: UUID): Promise<NoteDto> {
    const { data: note, error } = await this.userClient
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .is('deleted_at', null)
      .single();

    if (error) {
      // PGRST116 is Supabase's error code for "no rows returned"
      if (error.code === 'PGRST116') {
        throw new NoteNotFoundError(noteId);
      }
      throw new Error(`Failed to retrieve note: ${error.message}`);
    }

    if (!note) {
      throw new NoteNotFoundError(noteId);
    }

    return note as NoteDto;
  }

  /**
   * Soft-delete a note by ID for the authenticated user
   *
   * Sets deleted_at timestamp to mark note as deleted without physical removal
   * Enforces user ownership through RLS and explicit verification
   *
   * @param userId - UUID of the authenticated user
   * @param noteId - UUID of the note to delete
   * @returns void (on success)
   * @throws NoteNotFoundError if note doesn't exist or user doesn't own it
   * @throws Error for unexpected database errors
   */
  async deleteNoteById(userId: UUID, noteId: UUID): Promise<void> {
    // Step 1: Verify note exists and user owns it
    const { data: note, error: getError } = await this.userClient
      .from('notes')
      .select('id, user_id')
      .eq('id', noteId)
      .is('deleted_at', null)
      .single();

    if (getError) {
      // PGRST116 is Supabase's error code for "no rows returned"
      if (getError.code === 'PGRST116') {
        throw new NoteNotFoundError(noteId);
      }
      throw new Error(`Failed to retrieve note: ${getError.message}`);
    }

    if (!note) {
      throw new NoteNotFoundError(noteId);
    }

    // Defense-in-depth: Explicitly verify user ownership
    // (RLS already enforces this, but we verify for extra safety)
    if (note.user_id !== userId) {
      throw new NoteNotFoundError(noteId);
    }

    // Step 2: Soft-delete the note
    const { error: updateError } = await this.userClient
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', noteId);

    if (updateError) {
      throw new Error(`Failed to delete note: ${updateError.message}`);
    }
  }

  /**
   * Update an existing note with new values (partial update)
   *
   * Business Logic:
   * 1. Verify note exists and user owns it
   * 2. If category_id provided: verify category exists and is in active_categories
   * 3. Build update object with only provided fields
   * 4. Update the note
   *
   * @param userId - UUID of the authenticated user
   * @param noteId - UUID of the note to update
   * @param command - UpdateNoteCommand with optional category_id, title, and content
   * @returns Updated NoteDto
   * @throws NoteNotFoundError if note doesn't exist or user doesn't own it
   * @throws CategoryNotFoundError if category doesn't exist (when category_id provided)
   * @throws CategoryNotActiveError if category is not in user's active list (when category_id provided)
   * @throws Error for unexpected database errors
   */
  async updateNote(userId: UUID, noteId: UUID, command: any): Promise<NoteDto> {
    const { category_id: categoryId, title, content } = command;

    // Step 1: Verify note exists and user owns it
    const { data: note, error: getNoteError } = await this.userClient
      .from('notes')
      .select('id, user_id, category_id')
      .eq('id', noteId)
      .is('deleted_at', null)
      .maybeSingle();

    if (getNoteError) {
      throw new Error(`Failed to retrieve note: ${getNoteError.message}`);
    }

    if (!note) {
      throw new NoteNotFoundError(noteId);
    }

    // Defense-in-depth: Explicitly verify user ownership
    // (RLS already enforces this, but we verify for extra safety)
    if (note.user_id !== userId) {
      throw new NoteNotFoundError(noteId);
    }

    // Step 2: If category_id is provided, verify it exists and is active
    if (categoryId) {
      // Verify category exists
      const { data: categoryExists, error: categoryError } = await this.userClient
        .from('categories')
        .select('id')
        .eq('id', categoryId)
        .maybeSingle();

      if (categoryError) {
        throw new Error(`Failed to verify category: ${categoryError.message}`);
      }

      if (!categoryExists) {
        throw new CategoryNotFoundError(categoryId);
      }

      // Fetch user's active_categories from preferences
      const { data: preferences, error: prefError } = await this.userClient
        .from('preferences')
        .select('active_categories')
        .eq('user_id', userId)
        .maybeSingle();

      if (prefError) {
        throw new Error(`Failed to fetch preferences: ${prefError.message}`);
      }

      if (!preferences) {
        throw new Error('User preferences not found');
      }

      // Verify category is in active_categories
      const activeCategoryIds = (preferences.active_categories || []) as string[];
      if (!activeCategoryIds.includes(categoryId)) {
        throw new CategoryNotActiveError(categoryId);
      }
    }

    // Step 3: Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (categoryId !== undefined) {
      updateData.category_id = categoryId;
    }

    if (title !== undefined) {
      updateData.title = title || null;
    }

    if (content !== undefined) {
      updateData.content = content;
    }

    // Step 4: Update the note
    const { data: updatedNote, error: updateError } = await this.userClient
      .from('notes')
      .update(updateData)
      .eq('id', noteId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update note: ${updateError.message}`);
    }

    if (!updatedNote) {
      throw new Error('Note update returned no data');
    }

    return updatedNote as NoteDto;
  }

  /**
   * Helper: Calculate today's date boundaries in user's timezone
   * Returns ISO 8601 datetime strings for start and end of today
   *
   * @param timezone - IANA timezone string (e.g., 'America/New_York', 'UTC')
   * @returns Object with startOfToday and endOfToday as ISO 8601 strings
   */
  private getTodayBoundariesInTimezone(timezone: string): {
    startOfToday: string;
    endOfToday: string;
  } {
    const now = new Date();

    // Format current date in the user's timezone to get YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });

    const [year, month, day] = formatter.format(now).split('-');
    const todayStart = `${year}-${month}-${day}T00:00:00Z`;

    // Get tomorrow's date in the user's timezone
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowFormatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });

    const [tyear, tmonth, tday] = tomorrowFormatter.format(tomorrow).split('-');
    const todayEnd = `${tyear}-${tmonth}-${tday}T00:00:00Z`;

    return {
      startOfToday: todayStart,
      endOfToday: todayEnd,
    };
  }
}
