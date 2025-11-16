import { z } from 'zod';

/**
 * Valid IANA timezone list for validation
 * Subset of common timezones used for validation
 */
const VALID_TIMEZONES = [
  'UTC',
  'GMT',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Europe/Moscow',
  'US/Eastern',
  'US/Central',
  'US/Mountain',
  'US/Pacific',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Buenos_Aires',
  'America/São_Paulo',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Anchorage',
  'Pacific/Fiji',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Jakarta',
  'Asia/Seoul',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Vienna',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Istanbul',
];

/**
 * Schema for validating GET /api/dashboard query parameters
 *
 * Handles:
 * - timezone: optional IANA timezone string for streak calculation in user's local time
 * - since: optional ISO date (YYYY-MM-DD) for filtering notes; defaults to 4 weeks ago
 *
 * Query parameters come as strings from URL, so we coerce/transform them as needed
 */
export const DashboardQuerySchema = z.object({
  timezone: z
    .string()
    .min(1, 'Timezone cannot be empty')
    .refine((tz) => VALID_TIMEZONES.includes(tz), {
      message: `Invalid timezone. Must be a valid IANA timezone (e.g., UTC, Europe/Warsaw, US/Eastern)`,
    })
    .optional(),

  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'since must be a valid ISO date in format YYYY-MM-DD',
    })
    .refine((dateStr) => !isNaN(Date.parse(dateStr)), {
      message: 'since must be a valid date',
    })
    .refine((dateStr) => {
      // Ensure date is not in the future
      const queryDate = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      queryDate.setHours(0, 0, 0, 0);
      return queryDate <= today;
    }, {
      message: 'since date cannot be in the future',
    })
    .optional(),
});

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
