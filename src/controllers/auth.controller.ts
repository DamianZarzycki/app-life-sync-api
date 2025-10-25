import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { UserContextService } from '../services/userContext.service.js';
import { AuthService } from '../services/auth.service.js';
import { SignInRequestSchema } from '../validation/auth.js';

const userContextService = new UserContextService();
const authService = new AuthService();

/**
 * Handler for POST /api/auth/sign-in
 * Authenticates a user with email and password
 * Returns user info and JWT tokens on success
 */
export const signInHandler = async (req: Request, res: Response) => {
  try {
    // Validate request body against schema
    const request = SignInRequestSchema.parse(req.body);

    // Call auth service to authenticate with Supabase
    const response = await authService.signIn(request.email, request.password);

    // Return 200 OK with sign-in response
    return res.status(200).json(response);
  } catch (err) {
    // Handle Zod validation errors
    if (err instanceof ZodError) {
      const errorMessage = err.errors[0]?.message ?? 'Validation failed';
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
        },
      });
    }

    // Handle Supabase authentication errors
    // Supabase returns status 400 for both "user not found" and "wrong password"
    if (err instanceof Error) {
      const errorMessage = err.message.toLowerCase();
      if (
        errorMessage.includes('invalid login credentials') ||
        errorMessage.includes('user not found') ||
        errorMessage.includes('invalid password')
      ) {
        console.log(`Sign-in failed for email: ${req.body.email}`);
        return res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }
    }

    // Handle server errors
    console.error('Sign-in handler error', err);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    });
  }
};

export const getMeHandler = async (req: Request, res: Response) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: { code: 'JWT_INVALID', message: 'Unauthenticated' } });
    }

    const dto = await userContextService.getMe(req.auth);
    return res.status(200).json(dto);
  } catch (err) {
    console.error('getMeHandler error', err);
    return res
      .status(500)
      .json({ error: { code: 'SERVER_ERROR', message: 'Unexpected server error' } });
  }
};
