import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  ListReportsQuerySchema,
  GenerateReportCommandSchema,
  DeleteReportParamSchema,
  GenerateReportFromReflectionsSchema,
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
import { createOpenRouterService, InsufficientDataError } from '../open-router-integration/index.js';

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
 * POST /api/reports/generate-auto
 * Automatically generate a report based on user's preferences
 *
 * Fetches the user's active_categories from preferences and generates a report
 * focused on notes from those categories. If no active categories or notes exist,
 * silently skips without error (returns 204 No Content).
 *
 * Headers:
 * - None required
 *
 * Success Response:
 * - 201 Created: Full ReportDto with Location header
 * - 204 No Content: If no active categories or notes found (silent skip)
 *
 * Error Responses:
 * - 401: Missing/invalid authentication
 * - 409: Weekly limit exceeded
 * - 500: Server error
 */
export const generateAutoReportHandler = async (
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

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 2. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportsService = new ReportsService(userClient);
    const openRouterService = createOpenRouterService();

    // 3. Fetch user preferences (active_categories)
    const { data: preferences, error: prefError } = await userClient
      .from('preferences')
      .select('active_categories')
      .eq('user_id', userId)
      .single();

    if (prefError) {
      console.log(
        `[INFO] User ${userId} preferences not found, skipping auto report generation`
      );
      res.status(204).send();
      return;
    }

    // 4. Check if user has active categories
    const activeCategories = preferences?.active_categories;
    if (!activeCategories || activeCategories.length === 0) {
      console.log(`[INFO] User ${userId} has no active categories, skipping auto report`);
      res.status(204).send();
      return;
    }

    // 5. Fetch user profile for timezone
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .single();

    if (profileError) {
      console.log(`[INFO] User ${userId} profile not found, skipping auto report generation`);
      res.status(204).send();
      return;
    }

    const timezone = profile?.timezone || 'UTC';

    // 6. Validate that active categories exist and are active in the system
    let validatedCategories;
    try {
      const { data: existingCategories, error: catError } = await userClient
        .from('categories')
        .select('*')
        .in('id', activeCategories)
        .eq('active', true);

      if (catError) {
        throw new Error(`Failed to validate categories: ${catError.message}`);
      }

      if (!existingCategories || existingCategories.length === 0) {
        console.log(
          `[INFO] User ${userId} has no valid active categories, skipping auto report`
        );
        res.status(204).send();
        return;
      }

      validatedCategories = existingCategories;
    } catch (err) {
      console.error('generateAutoReportHandler category validation error:', err);
      // Silently skip if we can't validate categories
      res.status(204).send();
      return;
    }

    // 7. Check weekly limit (max 3 reports per week, including this auto-generated one)
    let weekStart: string;
    let weekEnd: string;
    try {
      // Calculate week boundaries based on user's timezone
      const now = new Date();
      const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const dayOfWeek = userDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      const monday = new Date(userDate);
      monday.setDate(userDate.getDate() - daysToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      weekStart = monday.toISOString().split('T')[0] + 'T00:00:00Z';
      weekEnd = sunday.toISOString().split('T')[0] + 'T23:59:59Z';

      // Count on-demand and scheduled reports this week
      const { count, error: countError } = await userClient
        .from('reports')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .in('generated_by', ['on_demand', 'scheduled'])
        .gte('created_at', weekStart)
        .lte('created_at', weekEnd);

      if (countError) {
        throw new Error(`Failed to count reports: ${countError.message}`);
      }

      const reportCount = count ?? 0;
      // TODO: TEMPORARILY DISABLED - Weekly limit check
      // if (reportCount >= 3) {
      //   console.log(
      //     `[INFO] User ${userId} at weekly report limit (${reportCount}/3), skipping auto report`
      //   );
      //   res.status(204).send();
      //   return;
      // }
    } catch (err) {
      console.error('generateAutoReportHandler weekly limit check error:', err);
      res.status(204).send();
      return;
    }

    // 8. Fetch notes for active categories
    const { data: notes, error: notesError } = await userClient
      .from('notes')
      .select('*')
      .in('category_id', activeCategories)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (notesError) {
      console.error('generateAutoReportHandler notes fetch error:', notesError);
      res.status(204).send();
      return;
    }

    // 9. If no notes found, skip silently
    if (!notes || notes.length === 0) {
      console.log(`[INFO] User ${userId} has no notes for active categories, skipping auto report`);
      res.status(204).send();
      return;
    }

    // 10. Generate report via OpenRouter service
    let reportContent;
    try {
      reportContent = await openRouterService.generateWeeklyReport(
        notes,
        validatedCategories,
        { timezone }
      );
    } catch (err) {
      if (err instanceof InsufficientDataError) {
        console.log(
          `[INFO] Insufficient data for report generation: ${err.message}, skipping auto report`
        );
        res.status(204).send();
        return;
      }
      throw err;
    }

    console.log(
      `[INFO] Auto report generated for user ${userId} using ${notes.length} notes from ${validatedCategories.length} categories`
    );

    // 11. Insert report into database with generated_by: 'scheduled'
    const { data: report, error: insertError } = await userClient
      .from('reports')
      .insert({
        user_id: userId,
        generated_by: 'scheduled',
        html: reportContent.html,
        text_version: reportContent.text_version,
        pdf_path: null,
        llm_model: reportContent.llm_model,
        system_prompt_version: reportContent.system_prompt_version,
        categories_snapshot: JSON.stringify(validatedCategories) as any,
      })
      .select('*')
      .single();

    if (insertError || !report) {
      console.error('generateAutoReportHandler report insert error:', insertError);
      throw new Error(`Failed to insert report: ${insertError?.message}`);
    }

    // 12. Return created report with 201 Created and Location header
    res.status(201).set('Location', `/api/reports/${report.id}`).json(report);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof WeeklyLimitExceededError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'WEEKLY_LIMIT_REACHED',
          message: 'Maximum 3 reports allowed per week',
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

    // Generic error handling
    console.error('generateAutoReportHandler error:', err);
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
 * POST /api/reports/generate-from-reflections
 * Generate a report from user-provided reflections grouped by category
 *
 * Request Body:
 * {
 *   "categoryName": [
 *     { "title": "string", "description": "string", "date": "YYYY-MM-DD" }
 *   ]
 * }
 *
 * Success Response:
 * - 201 Created: Full ReportDto with Location header
 */
export const generateReportFromReflectionsHandler = async (
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
    let validatedReflections;
    try {
      validatedReflections =
        GenerateReportFromReflectionsSchema.parse(req.body);
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

    // 3. Create OpenRouter service
    const openRouterService = createOpenRouterService();

    // 4. Generate report from reflections
    const reportContent =
      await openRouterService.generateReportFromReflections(
        validatedReflections
      );

    console.log(
      `[INFO] Report generated from reflections for user ${req.auth.userId}`
    );

    // 5. Return generated report content with 201 Created
    res.status(201).json({
      html: reportContent.html,
      text_version: reportContent.text_version,
      llm_model: reportContent.llm_model,
      system_prompt_version: reportContent.system_prompt_version,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    // Handle specific service errors
    if (err instanceof InsufficientDataError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'INSUFFICIENT_DATA',
          message: err.message,
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('generateReportFromReflectionsHandler error:', err);
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
