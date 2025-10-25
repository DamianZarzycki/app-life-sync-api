import { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthHeaderSchema } from '../validation/auth.js';
import type { Database } from '../db/database.types.js';

const supabaseUrl = process.env.SUPABASE_URL as string;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL env variable');
}

/**
 * Development mode flag - set to true to skip JWT validation
 * Use X-Mock-User-Id header to specify a mock user ID
 * Default mock user ID: "00000000-0000-0000-0000-000000000001"
 */
const DEV_MODE = process.env.NODE_ENV !== 'production' || process.env.SKIP_AUTH === 'true';

const DEFAULT_MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.header('Authorization');

    // In development mode, allow requests without valid JWT
    if (DEV_MODE) {
      // If auth header exists, try to validate it
      if (authHeader) {
        try {
          const parsedHeader = AuthHeaderSchema.parse(authHeader);
          const jwt = parsedHeader.split(' ')[1];
          const serviceKey = process.env.SUPABASE_SERVICE_KEY as string;

          if (serviceKey) {
            const adminClient = createClient<Database>(supabaseUrl, serviceKey);
            const {
              data: { user },
              error,
            } = await adminClient.auth.getUser(jwt);

            if (!error && user) {
              // Valid JWT found
              req.auth = {
                userId: user.id,
                email: user.email ?? '',
                emailVerified: !!user.email_confirmed_at,
                jwt,
              };
              return next();
            }
          }
        } catch (e) {
          // Fall through to mock user
        }
      }

      // Use mock user for development
      const mockUserId = req.header('X-Mock-User-Id') || DEFAULT_MOCK_USER_ID;
      const mockEmail = req.header('X-Mock-Email') || `user-${mockUserId.split('-')[0]}@test.local`;

      console.log(`✅ DEV MODE: Using mock user ${mockUserId}`);

      req.auth = {
        userId: mockUserId,
        email: mockEmail,
        emailVerified: true,
        jwt: 'mock-jwt-token-dev',
      };

      return next();
    }

    // Production mode: strict JWT validation required
    if (!authHeader) {
      return res.status(401).json({
        error: { code: 'AUTH_HEADER_MISSING', message: 'Authorization header is required' },
      });
    }

    // Validate header presence & format
    const parsedHeader = AuthHeaderSchema.parse(authHeader);
    const jwt = parsedHeader.split(' ')[1];

    // Validate using Supabase admin API
    const serviceKey = process.env.SUPABASE_SERVICE_KEY as string;

    if (!serviceKey) {
      throw new Error('Missing SUPABASE_SERVICE_KEY env variable');
    }

    const adminClient = createClient<Database>(supabaseUrl, serviceKey);

    const {
      data: { user },
      error,
    } = await adminClient.auth.getUser(jwt);

    if (error || !user) {
      return res
        .status(401)
        .json({ error: { code: 'JWT_INVALID', message: 'Invalid credentials' } });
    }

    req.auth = {
      userId: user.id,
      email: user.email ?? '',
      emailVerified: !!user.email_confirmed_at,
      jwt,
    };

    return next();
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'ZodError') {
        return res
          .status(401)
          .json({ error: { code: 'AUTH_HEADER_INVALID', message: err.message } });
      }
    }

    console.error('Auth middleware error', err);
    return res
      .status(500)
      .json({ error: { code: 'SERVER_ERROR', message: 'Unexpected authentication error' } });
  }
};
