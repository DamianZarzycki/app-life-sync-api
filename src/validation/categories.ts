import { z } from 'zod';

/**
 * Schema for validating GET /api/categories query parameters
 * 
 * Handles:
 * - active: boolean filter (default: true)
 * - sort: name_asc or name_desc (default: name_asc)
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 * 
 * Query parameters come as strings from URL, so we coerce/transform them
 */
export const ListCategoriesQuerySchema = z.object({
  active: z
    .enum(['true', 'false'], { errorMap: () => ({ message: 'active must be true or false' }) })
    .transform((val) => val === 'true')
    .optional()
    .default('true')
    .transform((val) => typeof val === 'string' ? val === 'true' : val),

  sort: z
    .enum(['name_asc', 'name_desc'], {
      errorMap: () => ({ message: 'sort must be "name_asc" or "name_desc"' }),
    })
    .optional()
    .default('name_asc'),

  limit: z
    .union([z.number(), z.string()])
    .transform((val) => typeof val === 'string' ? parseInt(val, 10) : val)
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    })
    .optional()
    .default('20')
    .transform((val) => typeof val === 'string' ? parseInt(val, 10) : val),

  offset: z
    .union([z.number(), z.string()])
    .transform((val) => typeof val === 'string' ? parseInt(val, 10) : val)
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: 'offset must be an integer >= 0',
    })
    .optional()
    .default('0')
    .transform((val) => typeof val === 'string' ? parseInt(val, 10) : val),
});

export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;
