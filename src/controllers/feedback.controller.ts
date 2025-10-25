import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { SubmitFeedbackCommandSchema, SubmitFeedbackQuerySchema } from '../validation/feedback.js';
import type { Database } from '../db/database.types.js';
import {
  FeedbackService,
  ReportNotFoundError,
  FeedbackAlreadyExistsError,
} from '../services/feedback.service.js';
import type { ErrorResponseDto } from '../types.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * POST /api/feedback
 * Submit feedback for a report (1:1 relationship). Create new or update existing.
 *
 * Query Parameters:
 * - upsert: optional boolean (default: false) - if true, update existing or create new
 *   if false, return 409 if feedback already exists
 *
 * Request Body:
 * - report_id: required UUID of the report
 * - rating: required integer (-1, 0, or 1)
 * - comment: optional string (max 300 chars, can be null)
 *
 * Success Response:
 * - 201 Created: New feedback submitted with Location header
 * - 200 OK: Existing feedback updated (when upsert=true)
 *
 * Error Responses:
 * - 400: Validation error (invalid UUID, rating out of range, comment too long)
 * - 401: Missing/invalid authentication
 * - 404: Report not found or user doesn't own it
 * - 409: Feedback already exists (only if upsert=false)
 * - 500: Server error
 */
export const submitFeedbackHandler = async (
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

    // 2. Validate request body
    let validatedBody;
    try {
      validatedBody = SubmitFeedbackCommandSchema.parse(req.body);
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

    // 3. Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = SubmitFeedbackQuerySchema.parse(req.query);
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

    // 4. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const feedbackService = new FeedbackService(userClient);

    // 5. Submit feedback through service
    const feedback = await feedbackService.submitFeedback(
      userId,
      validatedBody,
      validatedQuery.upsert
    );

    // 6. Determine if this is a new feedback (created_at === updated_at) or update
    // For new feedback: return 201 Created with Location header
    // For updated feedback: return 200 OK
    const isNewFeedback = feedback.created_at === feedback.updated_at;
    const statusCode = isNewFeedback ? 201 : 200;
    const response = res.status(statusCode);

    // Set Location header for 201 Created responses
    if (isNewFeedback) {
      response.set('Location', `/api/feedback/${feedback.id}`);
    }

    response.json(feedback);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes

    if (err instanceof ReportNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'REPORT_NOT_FOUND',
          message: 'Report not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    if (err instanceof FeedbackAlreadyExistsError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'FEEDBACK_ALREADY_EXISTS',
          message: 'Feedback for this report already exists',
          details: {
            feedback_id: err.feedbackId,
            existing_rating: err.existingRating,
            hint: 'Use ?upsert=true to update existing feedback',
          },
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('submitFeedbackHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
