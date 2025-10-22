import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import { UpdateProfileCommandSchema } from '../validation/profile.js';
import { ProfileService, ProfileNotFoundError } from '../services/profile.service.js';
import type { ErrorResponseDto } from '../types.js';

/**
 * Helper function to determine if a Zod error is structural (400) or constraint (422)
 * 
 * Structural errors: Missing required fields, wrong types, unrecognized keys
 * These represent client mistakes in request format
 * 
 * Constraint errors: Values out of range, invalid enum values, custom validation failures
 * These represent semantically invalid but syntactically correct data
 */
function isStructuralError(error: ZodError): boolean {
  return error.errors.some(
    (e) =>
      e.code === 'invalid_type' ||
      e.code === 'unrecognized_keys'
  );
}

/**
 * Helper to extract field-level errors from a Zod validation error
 * Converts nested error path to dot notation for API response
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
 * Handler for GET /api/profile
 * Retrieves the authenticated user's profile information
 * 
 * Requires valid JWT token in Authorization header
 * Uses user-scoped Supabase client to enforce RLS
 * 
 * @param req - Express request with authenticated user
 * @param res - Express response object
 * @returns 200 OK with ProfileDto, or error response
 */
export const getProfileHandler = async (req: Request, res: Response): Promise<void> => {
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

    // Step 2: Create user-scoped Supabase client (enforces RLS via user JWT)
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);

    // Step 3: Initialize service and retrieve profile
    const profileService = new ProfileService(userClient);
    const profile = await profileService.getProfile(req.auth.userId);

    // Step 4: Return success response
    res.status(200).json(profile);
  } catch (err) {
    // Handle ProfileNotFoundError (404)
    if (err instanceof ProfileNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'User profile not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Log unexpected errors for debugging
    console.error('Profile get handler error:', err);

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
 * Handler for PUT /api/profile
 * Updates the authenticated user's profile (timezone only)
 * 
 * Requires valid JWT token in Authorization header
 * Validates request body with Zod schema
 * Uses user-scoped Supabase client to enforce RLS
 * 
 * @param req - Express request with authenticated user and JSON body
 * @param res - Express response object
 * @returns 200 OK with updated ProfileDto, or error response
 */
export const updateProfileHandler = async (req: Request, res: Response): Promise<void> => {
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

    // Step 2: Validate request body against schema
    let validated;
    try {
      validated = UpdateProfileCommandSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        // Differentiate between structural (400) and constraint (422) errors
        const isStructural = isStructuralError(err);
        const statusCode = isStructural ? 400 : 422;
        const details = extractZodErrors(err);

        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: isStructural
              ? 'Request body validation failed'
              : 'Profile validation failed',
            details,
          },
        };
        res.status(statusCode).json(errorResponse);
        return;
      }
      throw err;
    }

    // Step 3: Create user-scoped Supabase client (enforces RLS via user JWT)
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);

    // Step 4: Initialize service and call update
    const profileService = new ProfileService(userClient);
    const updatedProfile = await profileService.updateProfile(req.auth.userId, validated);

    // Step 5: Return success response
    res.status(200).json(updatedProfile);
  } catch (err) {
    // Handle ProfileNotFoundError (404)
    if (err instanceof ProfileNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'User profile not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Log unexpected errors for debugging
    console.error('Profile update handler error:', err);

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
