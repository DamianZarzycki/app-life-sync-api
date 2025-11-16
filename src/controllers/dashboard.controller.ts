import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { DashboardQuerySchema } from '../validation/dashboard.js';
import type { Database } from '../db/database.types.js';
import { DashboardService, PreferencesNotFoundError } from '../services/dashboard.service.js';
import type { ErrorResponseDto } from '../types.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/dashboard
 * Retrieves aggregated dashboard data for the authenticated user
 *
 * Query Parameters:
 * - timezone: optional string (valid IANA timezone) for streak calculation in user's local time
 * - since: optional string (ISO date YYYY-MM-DD) for filtering notes; defaults to 4 weeks ago
 *
 * Success Response:
 * - 200 OK: DashboardDto with summary and recent reports
 * - Cache-Control: private, max-age=300 (5 minutes)
 *
 * Error Responses:
 * - 400: Query validation errors (invalid timezone or date format)
 * - 401: Missing/invalid authentication
 * - 500: Server error (database connection, unexpected errors)
 */
export const getDashboardHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      const errorResponse: ErrorResponseDto = {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // 2. Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = DashboardQuerySchema.parse(req.query);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const dashboardService = new DashboardService(userClient);

    // 4. Call service to retrieve dashboard data
    const dashboardData = await dashboardService.getDashboard(userId, validatedQuery);

    // 5. Return response with cache headers
    res
      .status(200)
      .set('Cache-Control', 'private, max-age=300')
      .json(dashboardData);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof PreferencesNotFoundError) {
      console.error('getDashboardHandler error:', err);
      // Preferences should exist for all users, but if not, return 500
      const errorResponse: ErrorResponseDto = {
        error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
      };
      res.status(500).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('getDashboardHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
