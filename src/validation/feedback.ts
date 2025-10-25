import { z } from 'zod';

/**
 * Schema for validating POST /api/feedback request body
 *
 * Handles:
 * - report_id: required UUID string for the report
 * - rating: required integer, must be -1, 0, or 1
 * - comment: optional string, max 300 characters, can be null
 *
 * Returns 400 Bad Request with field-level errors on validation failure
 */
export const SubmitFeedbackCommandSchema = z.object({
  report_id: z.string().uuid({ message: 'report_id must be a valid UUID' }),
  rating: z
    .number()
    .int({ message: 'rating must be an integer' })
    .refine((val) => [-1, 0, 1].includes(val), {
      message: 'rating must be one of: -1, 0, 1',
    }),
  comment: z
    .string()
    .max(300, { message: 'comment must be at most 300 characters' })
    .nullable()
    .optional(),
});

export type SubmitFeedbackCommand = z.infer<typeof SubmitFeedbackCommandSchema>;

/**
 * Schema for validating POST /api/feedback query parameters
 *
 * Handles:
 * - upsert: optional boolean (default: false) to enable update-or-create mode
 *   Query parameters come as strings from URL, so we coerce/transform as needed
 */
export const SubmitFeedbackQuerySchema = z.object({
  upsert: z
    .enum(['true', 'false'], {
      errorMap: () => ({
        message: "upsert must be 'true' or 'false'",
      }),
    })
    .transform((val) => val === 'true')
    .optional()
    .default('false')
    .transform((val) => (typeof val === 'string' ? val === 'true' : val)),
});

export type SubmitFeedbackQuery = z.infer<typeof SubmitFeedbackQuerySchema>;
