import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ListNotesQuerySchema, CreateNoteCommandSchema } from '../validation/notes.js';
import type { Database } from '../db/database.types.js';
import { NotesService, CategoryNotActiveError, DailyLimitExceededError, CategoryNotFoundError } from '../services/notes.service.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/notes
 * Retrieves paginated list of notes for the authenticated user with optional filtering
 *
 * Query Parameters:
 * - category_id: optional UUID or comma-separated UUIDs to filter notes
 * - from: optional ISO 8601 datetime for range start
 * - to: optional ISO 8601 datetime for range end
 * - include_deleted: optional boolean (default: false)
 * - limit: optional integer 1-100 (default: 20)
 * - offset: optional integer >=0 (default: 0)
 * - sort: optional 'created_at_desc' | 'created_at_asc' | 'updated_at_desc' (default: 'created_at_desc')
 *
 * Success Response:
 * - 200 OK: ListNotesResponseDto with paginated notes
 *
 * Error Responses:
 * - 400: Query validation errors
 * - 401: Missing/invalid authentication
 * - 500: Server error
 */
export const listNotesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // 2. Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = ListNotesQuerySchema.parse(req.query);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details,
          },
        });
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const notesService = new NotesService(userClient);

    // 4. Call service to retrieve notes
    const listResult = await notesService.listNotes(userId, validatedQuery);

    // 5. Return paginated response
    res.status(200).json(listResult);
  } catch (err) {
    console.error('listNotesHandler error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  }
};

/**
 * POST /api/notes
 * Creates a new note for the authenticated user.
 *
 * Request Body:
 * - category_id: required UUID of an active category
 * - title: optional string, max 255 characters
 * - content: required non-empty string, max 1000 characters
 *
 * Business Logic:
 * 1. Validate request body
 * 2. Verify category exists
 * 3. Check that category_id is in user's active_categories
 * 4. Count notes created today for this category in user's timezone
 * 5. Enforce daily per-category limit from preferences
 * 6. Insert note and return created NoteDto
 *
 * Success Response:
 * - 201 Created: Full NoteDto with Location header
 *
 * Error Responses:
 * - 400/422: Validation errors (invalid UUID, content too long, etc.)
 * - 401: Missing/invalid authentication
 * - 403: Category not active in user preferences
 * - 409: Daily per-category limit exceeded
 * - 500: Server error
 */
export const createNoteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // 2. Validate request body
    let validatedBody;
    try {
      validatedBody = CreateNoteCommandSchema.parse(req.body);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details,
          },
        });
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const notesService = new NotesService(userClient);

    // 4. Create note through service
    const createdNote = await notesService.createNote(userId, validatedBody);

    // 5. Return created note with 201 Created and Location header
    res.status(201)
      .set('Location', `/api/notes/${createdNote.id}`)
      .json(createdNote);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof CategoryNotActiveError) {
      res.status(403).json({
        error: {
          code: 'CATEGORY_NOT_ACTIVE',
          message: 'The specified category is not active in your preferences',
        },
      });
      return;
    }

    if (err instanceof DailyLimitExceededError) {
      res.status(409).json({
        error: {
          code: 'DAILY_LIMIT_REACHED',
          message: 'Daily note limit reached for this category',
          details: {
            category_id: err.categoryId,
            limit: err.limit,
            count_today: err.countToday,
          },
        },
      });
      return;
    }

    if (err instanceof CategoryNotFoundError) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            category_id: `The specified category does not exist`,
          },
        },
      });
      return;
    }

    // Generic error handling
    console.error('createNoteHandler error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  }
};
