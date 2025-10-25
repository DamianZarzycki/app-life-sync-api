import { z } from 'zod';

/**
 * Schema for validating GET /api/reports query parameters
 *
 * Handles:
 * - week_start_local: optional ISO date (YYYY-MM-DD) for filtering reports by week
 * - generated_by: optional enum ('scheduled' or 'on_demand') for filtering by generation method
 * - include_deleted: optional boolean (default: false) to include soft-deleted reports
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 * - sort: created_at_desc or created_at_asc (default: created_at_desc)
 *
 * Query parameters come as strings from URL, so we coerce/transform them as needed
 */
export const ListReportsQuerySchema = z.object({
  week_start_local: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'week_start_local must be a valid ISO date (YYYY-MM-DD)',
    })
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'week_start_local must be a valid date',
    })
    .optional(),

  generated_by: z
    .enum(['scheduled', 'on_demand'], {
      errorMap: () => ({
        message: "generated_by must be one of: 'scheduled', 'on_demand'",
      }),
    })
    .optional(),

  include_deleted: z
    .enum(['true', 'false'], {
      errorMap: () => ({
        message: "include_deleted must be 'true' or 'false'",
      }),
    })
    .transform((val) => val === 'true')
    .optional()
    .default('false')
    .transform((val) => (typeof val === 'string' ? val === 'true' : val)),

  limit: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    })
    .optional()
    .default('20')
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),

  offset: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: 'offset must be an integer >= 0',
    })
    .optional()
    .default('0')
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),

  sort: z
    .enum(['created_at_desc', 'created_at_asc'], {
      errorMap: () => ({
        message: 'sort must be one of: created_at_desc, created_at_asc',
      }),
    })
    .optional()
    .default('created_at_desc'),
});

export type ListReportsQuery = z.infer<typeof ListReportsQuerySchema>;

/**
 * Schema for validating POST /api/reports/generate request body
 *
 * Handles:
 * - include_categories: array of UUID strings (1-3 elements)
 *   - Each element must be a valid UUID v4
 *   - No duplicate UUIDs allowed
 *   - Business logic validation (active, authorized) happens in service layer
 *
 * Returns 400 Bad Request with field-level errors on validation failure
 */
export const GenerateReportCommandSchema = z.object({
  include_categories: z
    .array(z.string().uuid({ message: 'Each category ID must be a valid UUID' }))
    .min(1, { message: 'At least one category must be specified' })
    .max(3, { message: 'Maximum 3 categories allowed' })
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate category IDs are not allowed',
    }),
});

export type GenerateReportCommand = z.infer<typeof GenerateReportCommandSchema>;

/**
 * Schema for validating DELETE /api/reports/{id} path parameters
 *
 * Handles:
 * - id: required UUID string for the report to delete
 *
 * Path parameters come from URL params, so we validate the string format
 */
export const DeleteReportParamSchema = z.object({
  id: z.string().uuid({ message: 'Report ID must be a valid UUID' }),
});

export type DeleteReportParam = z.infer<typeof DeleteReportParamSchema>;
