import { z } from 'zod';

/**
 * Schema for validating GET /api/report-deliveries query parameters
 *
 * Handles:
 * - report_id: optional UUID to filter by specific report
 * - channel: optional enum ('in_app' or 'email')
 * - status: optional enum ('queued', 'sent', or 'opened')
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 *
 * Query parameters come as strings from URL, so we coerce/transform them
 */
export const ListReportDeliveriesQuerySchema = z.object({
  report_id: z.string().uuid({ message: 'report_id must be a valid UUID' }).optional(),

  channel: z
    .enum(['in_app', 'email'], {
      errorMap: () => ({
        message: "channel must be one of: 'in_app', 'email'",
      }),
    })
    .optional(),

  status: z
    .enum(['queued', 'sent', 'opened'], {
      errorMap: () => ({
        message: "status must be one of: 'queued', 'sent', 'opened'",
      }),
    })
    .optional(),

  limit: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    })
    .optional()
    .default(20)
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),

  offset: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: 'offset must be an integer >= 0',
    })
    .optional()
    .default(0)
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),
});

export type ListReportDeliveriesQuery = z.infer<typeof ListReportDeliveriesQuerySchema>;

/**
 * Schema for validating POST /api/report-deliveries/{id}/mark-opened path parameter
 *
 * Handles:
 * - id: required UUID of the report delivery to mark as opened
 */
export const MarkOpenedParamSchema = z.object({
  id: z.string().uuid({ message: 'Delivery ID must be a valid UUID' }),
});

export type MarkOpenedParam = z.infer<typeof MarkOpenedParamSchema>;
