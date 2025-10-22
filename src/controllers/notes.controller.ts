import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { CreateNoteRequestSchema } from '../validation/auth.js';
import type { CreateNoteCommand, NoteDto } from '../types.js';
import type { Database } from '../db/database.types.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * POST /api/notes
 * Creates a new note for the authenticated user.
 *
 * Business Logic:
 * 1. Validate request body (category_id UUID, title string|null, content string <=1000)
 * 2. Verify user has preferences initialized (required to create notes)
 * 3. Check that category_id is in user's active_categories
 * 4. Count notes created today for this category in user's timezone
 * 5. Enforce daily per-category limit from preferences
 * 6. Insert note and return created NoteDto
 *
 * Error Responses:
 * - 400/422: Validation errors (invalid UUID, content too long, etc.)
 * - 401: Missing/invalid authentication
 * - 403: Category not active in user preferences
 * - 409: Daily per-category limit exceeded
 * - 500: Server error
 */
export const createNoteHandler = async (req: Request, res: Response): Promise<Response> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    // 2. Validate request body
    let validatedBody: z.infer<typeof CreateNoteRequestSchema>;
    try {
      validatedBody = CreateNoteRequestSchema.parse(req.body);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        return res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details,
          },
        });
      }
      throw validationError;
    }

    const { category_id, title, content } = validatedBody;
    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);

    // 4. Fetch user's preferences to check active categories and daily limit
    const { data: prefData, error: prefError } = await userClient
      .from('preferences')
      .select('active_categories, max_daily_notes, user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefError) {
      console.error('Error fetching preferences:', prefError);
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch user preferences' },
      });
    }

    if (!prefData) {
      // User doesn't have preferences initialized
      return res.status(403).json({
        error: {
          code: 'PREFERENCES_NOT_INITIALIZED',
          message: 'User preferences not initialized. Please set up your profile and preferences first.',
        },
      });
    }

    // 5. Verify category is in active categories
    const activeCategoryIds = (prefData.active_categories || []) as string[];
    if (!activeCategoryIds.includes(category_id)) {
      return res.status(403).json({
        error: {
          code: 'CATEGORY_NOT_ACTIVE',
          message: 'Category is not in your active categories',
        },
      });
    }

    // 6. Fetch user's profile to get timezone
    const { data: profileData, error: profileError } = await userClient
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch user profile' },
      });
    }

    const timezone = profileData?.timezone || 'UTC';

    // 7. Count notes created today for this category
    // Use Supabase's RLS and timezone-aware query through user client
    // Get today's date in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });
    const [year, month, day] = formatter.format(now).split('-');
    const todayStart = `${year}-${month}-${day}T00:00:00Z`;
    const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowFormatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    });
    const [tyear, tmonth, tday] = tomorrowFormatter.format(tomorrowStart).split('-');
    const todayEnd = `${tyear}-${tmonth}-${tday}T00:00:00Z`;

    const { data: notesData, error: countError } = await userClient
      .from('notes')
      .select('id', { count: 'exact' })
      .eq('category_id', category_id)
      .eq('user_id', userId)
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd)
      .is('deleted_at', null);

    if (countError) {
      console.error('Error counting notes:', countError);
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to check daily note limit' },
      });
    }

    const notesTodayCount = notesData?.length || 0;

    // 8. Check if user has reached daily limit
    if (notesTodayCount >= prefData.max_daily_notes) {
      return res.status(409).json({
        error: {
          code: 'DAILY_LIMIT_EXCEEDED',
          message: `Daily limit of ${prefData.max_daily_notes} notes per category has been reached`,
        },
      });
    }

    // 9. Insert the note
    const noteCommand: CreateNoteCommand = {
      category_id,
      title: title || null,
      content,
    };

    const { data: createdNote, error: insertError } = await userClient
      .from('notes')
      .insert([
        {
          ...noteCommand,
          user_id: userId,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating note:', insertError);
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Failed to create note' },
      });
    }

    // 10. Return created note with 201 Created
    return res.status(201).json(createdNote as NoteDto);
  } catch (err) {
    console.error('createNoteHandler error:', err);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'Unexpected server error' },
    });
  }
};
