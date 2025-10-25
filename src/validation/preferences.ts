import { z } from 'zod';
import type { DeliveryChannel } from '../types.js';

/**
 * Schema for updating user preferences
 * Validates all required fields with appropriate constraints and custom error messages
 */
export const UpdatePreferencesCommandSchema = z
  .object({
    active_categories: z
      .array(z.string().uuid('active_categories must contain valid UUIDs'), {
        required_error: 'active_categories is required',
      })
      .max(3, { message: 'active_categories must have a maximum of 3 categories' })
      .default([]),

    report_dow: z
      .number({ required_error: 'report_dow is required' })
      .int('report_dow must be an integer')
      .min(0, { message: 'report_dow must be between 0 and 6' })
      .max(6, { message: 'report_dow must be between 0 and 6' }),

    report_hour: z
      .number({ required_error: 'report_hour is required' })
      .int('report_hour must be an integer')
      .min(0, { message: 'report_hour must be between 0 and 23' })
      .max(23, { message: 'report_hour must be between 0 and 23' }),

    preferred_delivery_channels: z
      .array(
        z.enum(['in_app', 'email'] as const, {
          errorMap: () => ({
            message: 'preferred_delivery_channels must contain only "in_app" or "email"',
          }),
        }),
        { required_error: 'preferred_delivery_channels is required' }
      )
      .nonempty({ message: 'preferred_delivery_channels must have at least one channel' })
      .refine((channels) => new Set(channels).size === channels.length, {
        message: 'preferred_delivery_channels must not contain duplicate values',
      }),

    email_unsubscribed_at: z
      .string({ required_error: 'email_unsubscribed_at is required' })
      .datetime({ message: 'email_unsubscribed_at must be a valid ISO datetime string' })
      .nullable()
      .default(null),

    max_daily_notes: z
      .number({ required_error: 'max_daily_notes is required' })
      .int('max_daily_notes must be an integer')
      .min(1, { message: 'max_daily_notes must be between 1 and 10' })
      .max(10, { message: 'max_daily_notes must be between 1 and 10' }),
  })
  .strict();

export type UpdatePreferencesCommand = z.infer<typeof UpdatePreferencesCommandSchema>;
