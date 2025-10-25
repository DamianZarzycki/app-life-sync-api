import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  ListNotesQuerySchema,
  CreateNoteCommandSchema,
  GetNoteParamSchema,
  UpdateNoteParamSchema,
  UpdateNoteCommandSchema,
} from '../validation/notes.js';
import type { Database } from '../db/database.types.js';
import {
  NotesService,
  CategoryNotActiveError,
  DailyLimitExceededError,
  CategoryNotFoundError,
  NoteNotFoundError,
} from '../services/notes.service.js';
import type { ErrorResponseDto } from '../types.js';
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
    res.status(201).set('Location', `/api/notes/${createdNote.id}`).json(createdNote);
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

/**
 * GET /api/notes/{id}
 * Retrieves a single note by ID for the authenticated user (owner only)
 *
 * Path Parameters:
 * - id: required UUID of the note to retrieve
 *
 * Success Response:
 * - 200 OK: Full NoteDto
 *
 * Error Responses:
 * - 400: Invalid UUID format
 * - 401: Missing/invalid authentication
 * - 404: Note not found or user doesn't own it
 * - 500: Server error
 */
export const getNoteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'JWT_INVALID', message: 'Invalid credentials' },
      });
      return;
    }

    // 2. Validate path parameter
    let validatedParam;
    try {
      validatedParam = GetNoteParamSchema.parse(req.params);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid note ID format',
            details,
          },
        });
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const noteId = validatedParam.id;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const notesService = new NotesService(userClient);

    // 4. Call service to retrieve note
    const note = await notesService.getNoteById(userId, noteId);

    // 5. Return note
    res.status(200).json(note);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOTE_NOT_FOUND',
          message: 'Note not found',
        },
      });
      return;
    }

    // Generic error handling
    console.error('getNoteHandler error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  }
};

/**
 * DELETE /api/notes/{id}
 * Soft-delete a note for the authenticated user
 *
 * Path Parameters:
 * - id: required UUID of the note to delete
 *
 * Success Response:
 * - 204 No Content
 *
 * Error Responses:
 * - 400: Invalid UUID format
 * - 401: Missing/invalid authentication
 * - 404: Note not found or user doesn't own it
 * - 500: Server error
 */
export const deleteNoteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'JWT_INVALID', message: 'Invalid credentials' },
      });
      return;
    }

    // 2. Validate path parameter
    let validatedParam;
    try {
      validatedParam = GetNoteParamSchema.parse(req.params);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid note ID format',
            details,
          },
        });
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const noteId = validatedParam.id;
    const jwt = req.auth.jwt;
    console.log('noteId:: ', noteId);
    console.log('userId:: ', userId);
    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const notesService = new NotesService(userClient);
    console.log('notesService:: ', await notesService.listNotes(userId, { limit: 10, offset: 0 }));
    // 4. Delete note through service
    await notesService.deleteNoteById(userId, noteId);

    // 5. Return 204 No Content
    res.status(204).send();
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOTE_NOT_FOUND',
          message: 'Note not found',
        },
      });
      return;
    }

    // Generic error handling
    console.error('deleteNoteHandler error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  }
};

/**
 * PATCH /api/notes/{id}
 * Partially updates an existing note for the authenticated user
 *
 * Path Parameters:
 * - id: required UUID of the note to update
 *
 * Request Body (all fields optional):
 * - category_id: optional UUID of an active category (if provided)
 * - title: optional string, max 255 characters (can be null)
 * - content: optional non-empty string, max 1000 characters
 *
 * Success Response:
 * - 200 OK: Updated NoteDto
 *
 * Error Responses:
 * - 400: Path or body validation errors
 * - 401: Missing/invalid authentication
 * - 403: Category not active in user preferences (when category_id provided)
 * - 404: Note not found or user doesn't own it
 * - 422: Category validation errors (when category_id provided)
 * - 500: Server error
 */
export const updateNoteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      const errorResponse: ErrorResponseDto = {
        error: { code: 'JWT_INVALID', message: 'Invalid credentials' },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // 2. Validate path parameter
    let validatedParam;
    try {
      validatedParam = UpdateNoteParamSchema.parse(req.params);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid note ID format',
            details,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }
      throw validationError;
    }

    // 3. Validate request body (all fields optional for PATCH)
    let validatedBody;
    try {
      validatedBody = UpdateNoteCommandSchema.parse(req.body);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }
      throw validationError;
    }

    // 4. Check that at least one field is provided for update
    if (!validatedBody.category_id && !validatedBody.title && !validatedBody.content) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one field must be provided for update',
          details: {
            body: 'Provide at least one of: category_id, title, or content'
          },
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    const userId = req.auth.userId;
    const noteId = validatedParam.id;
    const jwt = req.auth.jwt;

    // 5. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const notesService = new NotesService(userClient);

    // 6. Call service to update note
    const updatedNote = await notesService.updateNote(userId, noteId, validatedBody);

    // 7. Return updated note with 200 OK
    res.status(200).json(updatedNote);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof CategoryNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: {
            category_id: 'The specified category does not exist',
          },
        },
      };
      res.status(422).json(errorResponse);
      return;
    }

    if (err instanceof CategoryNotActiveError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'CATEGORY_NOT_ACTIVE',
          message: 'The specified category is not active in your preferences',
        },
      };
      res.status(403).json(errorResponse);
      return;
    }

    if (err instanceof NoteNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'NOTE_NOT_FOUND',
          message: 'Note not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('updateNoteHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
