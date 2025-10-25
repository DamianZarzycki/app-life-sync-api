import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  ListReportsQuerySchema,
  GenerateReportCommandSchema,
  DeleteReportParamSchema,
} from '../validation/reports.js';
import type { Database } from '../db/database.types.js';
import {
  ReportsService,
  ReportNotFoundError,
  WeeklyLimitExceededError,
  InvalidCategoriesError,
} from '../services/reports.service.js';
import type { ErrorResponseDto } from '../types.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/reports
 * Retrieves paginated list of reports for the authenticated user with optional filtering
 *
 * Query Parameters:
 * - week_start_local: optional ISO date (YYYY-MM-DD) to filter by week
 * - generated_by: optional enum ('scheduled' | 'on_demand') to filter by type
 * - include_deleted: optional boolean (default: false) to include soft-deleted reports
 * - limit: optional integer 1-100 (default: 20) for pagination
 * - offset: optional integer >=0 (default: 0) for pagination
 * - sort: optional enum ('created_at_desc' | 'created_at_asc', default: 'created_at_desc')
 *
 * Success Response:
 * - 200 OK: ListReportsResponseDto with paginated reports
 *
 * Error Responses:
 * - 400: Query validation errors
 * - 401: Missing/invalid authentication
 * - 500: Server error
 */
export const listReportsHandler = async (
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
      validatedQuery = ListReportsQuerySchema.parse(req.query);
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
    const reportsService = new ReportsService(userClient);

    // 4. Call service to retrieve reports
    const listResult = await reportsService.listReports(userId, validatedQuery);

    // 5. Return paginated response
    res.status(200).json(listResult);
  } catch (err) {
    console.error('listReportsHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};

/**
 * GET /api/reports/{id}
 * Retrieves a single report by ID for the authenticated user (owner only)
 *
 * Path Parameters:
 * - id: required UUID of the report to retrieve
 *
 * Success Response:
 * - 200 OK: Full ReportDto
 *
 * Error Responses:
 * - 400: Invalid UUID format
 * - 401: Missing/invalid authentication
 * - 404: Report not found or user doesn't own it
 * - 500: Server error
 */
export const getReportHandler = async (
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
    const reportsService = new ReportsService(userClient);

    // 4. Call service to retrieve report
    const report = await reportsService.getReportById(userId, reportId);

    // 5. Return report
    res.status(200).json(report);
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

    // Generic error handling
    console.error('getReportHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};

/**
 * POST /api/reports/generate
 * Generate a new on-demand report for the authenticated user
 *
 * Request Body:
 * - include_categories: UUID[] (1-3 elements, all valid/authorized)
 *
 * Headers:
 * - Idempotency-Key: optional UUID or string for deduplication
 *
 * Success Response:
 * - 201 Created: Full ReportDto with Location header
 *
 * Error Responses:
 * - 400: Validation error (invalid UUIDs, empty array, etc.)
 * - 401: Missing/invalid authentication
 * - 409: Weekly limit exceeded or invalid categories
 * - 500: Server error
 */
export const generateReportHandler = async (
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
      validatedBody = GenerateReportCommandSchema.parse(req.body);
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

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;
    const idempotencyKey = req.header('Idempotency-Key');

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportsService = new ReportsService(userClient);

    // 4. Generate report through service
    const generatedReport = await reportsService.generateReport(
      userId,
      validatedBody,
      idempotencyKey
    );

    // 5. Return created report with 201 Created and Location header
    res.status(201).set('Location', `/api/reports/${generatedReport.id}`).json(generatedReport);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes

    if (err instanceof WeeklyLimitExceededError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'WEEKLY_LIMIT_REACHED',
          message: 'Maximum 3 on-demand reports allowed per week',
          details: {
            limit: err.limit,
            count_this_week: err.count,
            week_start: err.weekStart,
            week_end: err.weekEnd,
          },
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    if (err instanceof InvalidCategoriesError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'INVALID_CATEGORIES',
          message: 'One or more categories are invalid or not authorized',
          details: {
            invalid_ids: err.invalidIds,
          },
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('generateReportHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};

/**
 * DELETE /api/reports/{id}
 * Soft-delete a report for the authenticated user (owner only)
 *
 * Path Parameters:
 * - id: required UUID of the report to delete
 *
 * Success Response:
 * - 204 No Content (empty response body)
 *
 * Error Responses:
 * - 400: Invalid UUID format
 * - 401: Missing/invalid authentication
 * - 404: Report not found or user doesn't own it
 * - 500: Server error
 */
export const deleteReportHandler = async (
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

    // 2. Validate path parameter using Zod schema
    let validatedParam;
    try {
      validatedParam = DeleteReportParamSchema.parse(req.params);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid report ID format',
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
    const reportId = validatedParam.id;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportsService = new ReportsService(userClient);

    // 4. Call service to delete report
    await reportsService.deleteReportById(userId, reportId);

    // 5. Return 204 No Content on success
    res.status(204).send();
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

    // Generic error handling
    console.error('deleteReportHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
