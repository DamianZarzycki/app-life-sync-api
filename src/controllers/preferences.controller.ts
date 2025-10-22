import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import { UpdatePreferencesCommandSchema } from '../validation/preferences.js';
import {
  PreferencesService,
  PreferencesNotFoundError,
  InvalidCategoriesError,
} from '../services/preferences.service.js';
import type { ErrorResponseDto } from '../types.js';

/**
 * Helper function to determine if a Zod error is structural (400) or constraint (422)
 * Structural errors: missing required fields, wrong types
 * Constraint errors: values out of range, invalid enum values
 */
function isStructuralError(error: ZodError): boolean {
  return error.errors.some(
    (e) =>
      e.code === 'invalid_type' ||
      e.code === 'unrecognized_keys'
  );
}

/**
 * Helper to extract field-level errors from ZodError
 */
function extractZodErrors(error: ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    details[path] = err.message;
  });
  return details;
}

/**
 * Handler for PUT /api/preferences
 * Updates user preferences including weekly report scheduling and delivery channels
 *
 * @param req - Express request with authenticated user and JSON body
 * @param res - Express response object
 * @returns 200 OK with updated PreferencesDto on success, error response otherwise
 */
export const updatePreferencesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Step 1: Verify authentication
    console.log('req.auth', req.auth);
    if (!req.auth) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'JWT_INVALID',
          message: 'Invalid credentials',
        },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Step 2: Validate request body against schema
    let validated;
    try {
      validated = UpdatePreferencesCommandSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const isStructural = isStructuralError(err);
        const statusCode = isStructural ? 400 : 422;
        const errorCode = isStructural ? 'VALIDATION_ERROR' : 'VALIDATION_ERROR';
        const details = extractZodErrors(err);

        const errorResponse: ErrorResponseDto = {
          error: {
            code: errorCode,
            message: isStructural
              ? 'Request body validation failed'
              : 'Preference validation failed',
            details,
          },
        };
        res.status(statusCode).json(errorResponse);
        return;
      }
      throw err;
    }

    // Step 3: Create user-scoped Supabase client for RLS enforcement
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);

    // Step 4: Initialize service and call update
    const preferencesService = new PreferencesService(userClient);
    const updatedPreferences = await preferencesService.updatePreferences(
      req.auth.userId,
      validated
    );

    // Step 5: Return success response
    res.status(200).json(updatedPreferences);
  } catch (err) {
    // Handle PreferencesNotFoundError (404)
    if (err instanceof PreferencesNotFoundError) {
      console.log('err', err);
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: 'User preferences not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Handle InvalidCategoriesError (422)
    if (err instanceof InvalidCategoriesError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Preference validation failed',
          details: {
            active_categories: `The following category IDs do not exist: ${err.invalidCategoryIds.join(', ')}`,
          },
        },
      };
      res.status(422).json(errorResponse);
      return;
    }

    // Log unexpected errors for debugging
    console.error('Preferences update handler error', err);

    // Return generic server error (500)
    const errorResponse: ErrorResponseDto = {
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    };
    res.status(500).json(errorResponse);
  }
};

/**
 * Handler for GET /api/preferences
 * Retrieves current user's preferences
 *
 * @param req - Express request with authenticated user
 * @param res - Express response object
 * @returns 200 OK with PreferencesDto on success, error response otherwise
 */
export const getPreferencesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Step 1: Verify authentication
    if (!req.auth) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'JWT_INVALID',
          message: 'Invalid credentials',
        },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Step 2: Create user-scoped Supabase client for RLS enforcement
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);

    // Step 3: Initialize service and call get
    const preferencesService = new PreferencesService(userClient);
    const preferences = await preferencesService.getPreferences(req.auth.userId);

    // Step 4: Return success response
    res.status(200).json(preferences);
  } catch (err) {
    // Handle PreferencesNotFoundError (404)
    if (err instanceof PreferencesNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: 'User preferences not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Log unexpected errors for debugging
    console.error('Preferences get handler error', err);

    // Return generic server error (500)
    const errorResponse: ErrorResponseDto = {
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    };
    res.status(500).json(errorResponse);
  }
};
