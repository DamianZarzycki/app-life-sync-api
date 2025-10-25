import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ListReportDeliveriesQuerySchema } from '../validation/report-deliveries.js';
import type { Database } from '../db/database.types.js';
import {
  ReportDeliveriesService,
  ReportNotFoundError,
  EmailUnsubscribedError,
  EmailNotPreferredError,
  PreferencesNotFoundError,
  DeliveryAlreadyExistsError,
  DeliveryNotFoundError,
} from '../services/report-deliveries.service.js';
import type { ErrorResponseDto } from '../types.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/report-deliveries
 * Retrieves paginated list of report deliveries for the authenticated user with optional filtering
 *
 * Query Parameters:
 * - report_id: optional UUID to filter by specific report
 * - channel: optional enum ('in_app' or 'email')
 * - status: optional enum ('queued', 'sent', or 'opened')
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 *
 * Success Response:
 * - 200 OK: ListReportDeliveriesResponseDto with paginated deliveries
 *
 * Error Responses:
 * - 400: Query validation errors
 * - 401: Missing/invalid authentication
 * - 500: Server error
 */
export const listReportDeliveriesHandler = async (
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
      validatedQuery = ListReportDeliveriesQuerySchema.parse(req.query);
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
    const deliveriesService = new ReportDeliveriesService(userClient);

    // 4. Call service to retrieve deliveries
    const listResult = await deliveriesService.listReportDeliveries(userId, validatedQuery);

    // 5. Return paginated response
    res.status(200).json(listResult);
  } catch (err) {
    console.error('listReportDeliveriesHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};

/**
 * POST /api/reports/{id}/deliveries/email
 * Request/queue email delivery for a report if user preferences allow
 *
 * Path Parameters:
 * - id: required UUID of the report
 *
 * Success Response:
 * - 202 Accepted: EmailDeliveryResponseDto with queued delivery
 *
 * Error Responses:
 * - 400: Validation or business logic error (not preferred, unsubscribed, etc.)
 * - 401: Missing/invalid authentication
 * - 404: Report not found
 * - 409: Delivery already exists
 * - 500: Server error
 */
export const queueEmailDeliveryHandler = async (
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

    // 2. Validate path parameter - check UUID format
    const reportId = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!reportId || !uuidRegex.test(reportId)) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report ID format',
          details: { id: 'Report ID must be a valid UUID' },
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportDeliveriesService = new ReportDeliveriesService(userClient);

    // 4. Queue email delivery through service
    const result = await reportDeliveriesService.queueEmailDelivery(userId, reportId);

    // 5. Return 202 Accepted with delivery info
    res.status(202).json(result);
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

    if (err instanceof EmailUnsubscribedError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'EMAIL_UNSUBSCRIBED',
          message: 'User has unsubscribed from email delivery',
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    if (err instanceof EmailNotPreferredError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'EMAIL_NOT_PREFERRED',
          message: 'Email delivery is not enabled in user preferences',
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    if (err instanceof PreferencesNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: 'User preferences not found',
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    if (err instanceof DeliveryAlreadyExistsError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'DELIVERY_ALREADY_EXISTS',
          message: 'Email delivery already queued for this report',
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('queueEmailDeliveryHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};

/**
 * POST /api/report-deliveries/{id}/mark-opened
 * Mark a report delivery as opened for in-app delivery tracking
 *
 * Path Parameters:
 * - id: required UUID of the report delivery
 *
 * Success Response:
 * - 204 No Content: Empty response body
 *
 * Error Responses:
 * - 400: Validation error (invalid UUID format)
 * - 401: Missing/invalid authentication
 * - 404: Delivery not found or user doesn't own it
 * - 500: Server error
 */
export const markOpenedHandler = async (
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

    // 2. Validate path parameter - check UUID format
    const deliveryId = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!deliveryId || !uuidRegex.test(deliveryId)) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid delivery ID format',
          details: { id: 'Delivery ID must be a valid UUID' },
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportDeliveriesService = new ReportDeliveriesService(userClient);

    // 4. Mark delivery as opened through service
    await reportDeliveriesService.markDeliveryOpened(userId, deliveryId);

    // 5. Return 204 No Content
    res.status(204).send();
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes

    if (err instanceof DeliveryNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'DELIVERY_NOT_FOUND',
          message: 'Report delivery not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('markOpenedHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
