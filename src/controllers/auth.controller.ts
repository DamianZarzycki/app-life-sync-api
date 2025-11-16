import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { UserContextService } from '../services/userContext.service.js';
import { AuthService } from '../services/auth.service.js';
import { PreferencesService } from '../services/preferences.service.js';
import type { Database } from '../db/database.types.js';
import { SignInRequestSchema, SignUpRequestSchema } from '../validation/auth.js';

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

/**
 * Handler for POST /api/auth/sign-up
 * Registers a new user with email and password
 * Returns user info and JWT tokens on success
 *
 * Handles:
 * - Input validation (email format, password non-empty)
 * - Supabase authentication errors (email exists, weak password)
 * - Server errors (network, unexpected exceptions)
 * - Preferences creation with sensible defaults
 */
export const signUpHandler = async (req: Request, res: Response) => {
  try {
    // Validate request body against schema
    const request = SignUpRequestSchema.parse(req.body);

    // Call auth service to register with Supabase
    const response = await authService.signUp(request.email, request.password);

    // Log successful sign-up
    console.log(`Sign-up successful: ${request.email}`);

    // Create default profile and preferences for the new user
    try {
      const supabaseUrl = process.env.SUPABASE_URL as string;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_KEY)');
      }

      // Use admin client to create profile and preferences (bypasses RLS for new user)
      const adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // Step 1: Create profile FIRST (required for foreign key constraint)
      await PreferencesService.createDefaultProfile(response.user.id, adminClient);
      console.log(`Profile created for user: ${response.user.id}`);

      // Step 2: Create preferences (depends on profile existing)
      await PreferencesService.createDefaultPreferences(response.user.id, adminClient);
      console.log(`Preferences created for user: ${response.user.id}`);
    } catch (preferencesError) {
      // Log profile/preferences creation error but don't fail the sign-up
      // User can still use the app, just without preferences (will get defaults)
      console.error('Failed to create profile/preferences during sign-up:', preferencesError);
      // Note: In production, consider whether this should fail the sign-up or continue
    }

    // Return 201 Created with sign-up response
    return res.status(201).set('Location', '/api/auth/me').json(response);
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
    if (err instanceof Error) {
      const errorMessage = err.message.toLowerCase();

      // Email already registered
      if (
        errorMessage.includes('user already exists') ||
        errorMessage.includes('duplicate key') ||
        errorMessage.includes('already registered')
      ) {
        console.log('Sign-up failed: email already registered');
        return res.status(409).json({
          error: {
            code: 'EMAIL_EXISTS',
            message: 'Email address is already registered',
          },
        });
      }

      // Weak password
      if (
        errorMessage.includes('password') ||
        errorMessage.includes('strength') ||
        errorMessage.includes('weak')
      ) {
        console.log('Sign-up failed: password strength insufficient');
        return res.status(422).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password does not meet strength requirements',
          },
        });
      }
    }

    // Handle server errors
    console.error('Sign-up handler error', err);
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
