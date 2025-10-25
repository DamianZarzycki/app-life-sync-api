// Zod schema for validating Authorization header in the format: "Bearer <jwt>"
import { z } from 'zod';

export const AuthHeaderSchema = z
  .string({ required_error: 'Authorization header is required' })
  .regex(/^Bearer\s+\S+$/, {
    message: 'Authorization header must be in the format: Bearer <token>',
  });

export type AuthHeader = z.infer<typeof AuthHeaderSchema>;

// Zod schema for sign-in request
export const SignInRequestSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .email('email must be a valid email address'),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'password must not be empty'),
});

export type SignInRequest = z.infer<typeof SignInRequestSchema>;

// Zod schema for creating a note
export const CreateNoteRequestSchema = z.object({
  category_id: z
    .string({ required_error: 'category_id is required' })
    .uuid('category_id must be a valid UUID'),
  title: z
    .string()
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

export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;
