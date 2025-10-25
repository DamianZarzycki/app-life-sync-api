import { z } from 'zod';

/**
 * Schema for validating GET /api/notes query parameters
 *
 * Handles:
 * - category_id: optional UUID or comma-separated UUIDs for filtering
 * - from: optional ISO 8601 start datetime for range filtering
 * - to: optional ISO 8601 end datetime for range filtering
 * - include_deleted: optional boolean to include soft-deleted notes (default: false)
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 * - sort: created_at_desc, created_at_asc, or updated_at_desc (default: created_at_desc)
 *
 * Query parameters come as strings from URL, so we coerce/transform them as needed
 */
export const ListNotesQuerySchema = z
  .object({
    category_id: z
      .string()
      .uuid('category_id must be a valid UUID')
      .optional()
      .or(
        z
          .string()
          .transform((val) => val.split(',').map((id) => id.trim()))
          .pipe(z.array(z.string().uuid('category_id must contain valid UUIDs')))
      ),

    from: z
      .string()
      .datetime({ message: 'from must be a valid ISO 8601 datetime string' })
      .optional(),

    to: z.string().datetime({ message: 'to must be a valid ISO 8601 datetime string' }).optional(),

    include_deleted: z
      .enum(['true', 'false'], {
        errorMap: () => ({ message: 'include_deleted must be true or false' }),
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
      .enum(['created_at_desc', 'created_at_asc', 'updated_at_desc'], {
        errorMap: () => ({
          message: 'sort must be one of: created_at_desc, created_at_asc, updated_at_desc',
        }),
      })
      .optional()
      .default('created_at_desc'),
  })
  .refine((data) => !data.from || !data.to || new Date(data.from) <= new Date(data.to), {
    message: 'to must be greater than or equal to from',
    path: ['to'],
  });

export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

/**
 * Schema for validating POST /api/notes request body
 *
 * Validates:
 * - category_id: required UUID of an active category
 * - title: optional string, max 255 characters
 * - content: required non-empty string, max 1000 characters
 */
export const CreateNoteCommandSchema = z.object({
  category_id: z
    .string({ required_error: 'category_id is required' })
    .uuid('category_id must be a valid UUID'),

  title: z
    .string()
    .max(255, { message: 'title must not exceed 255 characters' })
    .nullable()
    .optional()
    .default(null)
    .refine((val) => val === null || (typeof val === 'string' && val.length <= 255), {
      message: 'title must be null or a string with max 255 characters',
    }),

  content: z
    .string({ required_error: 'content is required' })
    .min(1, { message: 'content must not be empty' })
    .max(1000, { message: 'content must not exceed 1000 characters' }),
});

export type CreateNoteCommand = z.infer<typeof CreateNoteCommandSchema>;

/**
 * Schema for validating GET /api/notes/{id} path parameter
 *
 * Validates:
 * - id: required UUID of the note to retrieve
 */
export const GetNoteParamSchema = z.object({
  id: z.string({ required_error: 'Note ID is required' }).uuid('Note ID must be a valid UUID'),
});

export type GetNoteParam = z.infer<typeof GetNoteParamSchema>;

/**
 * Schema for validating PATCH /api/notes/{id} path parameter
 *
 * Validates:
 * - id: required UUID of the note to update
 */
export const UpdateNoteParamSchema = z.object({
  id: z.string({ required_error: 'Note ID is required' }).uuid('Note ID must be a valid UUID'),
});

export type UpdateNoteParam = z.infer<typeof UpdateNoteParamSchema>;

/**
 * Schema for validating PATCH /api/notes/{id} request body
 *
 * Validates:
 * - category_id: optional UUID of an active category (if provided)
 * - title: optional string, max 255 characters (can be null)
 * - content: optional non-empty string, max 1000 characters
 *
 * All fields optional for partial update operations
 */
export const UpdateNoteCommandSchema = z.object({
  category_id: z
    .string()
    .uuid('category_id must be a valid UUID')
    .optional(),

  title: z
    .string()
    .max(255, { message: 'title must not exceed 255 characters' })
    .nullable()
    .optional()
    .refine((val) => val === null || val === undefined || (typeof val === 'string' && val.length <= 255), {
      message: 'title must be null or a string with max 255 characters',
    }),

  content: z
    .string()
    .min(1, { message: 'content must not be empty' })
    .max(1000, { message: 'content must not exceed 1000 characters' })
    .optional(),
});

export type UpdateNoteCommand = z.infer<typeof UpdateNoteCommandSchema>;
