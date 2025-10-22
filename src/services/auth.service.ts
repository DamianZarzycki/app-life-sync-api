import { supabaseClient } from '../db/supabase.client.js';
import type { SignInResponseDto } from '../types.js';

/**
 * AuthService handles user authentication operations
 * Responsible for sign-in logic and interaction with Supabase Auth
 */
export class AuthService {
  private supabase = supabaseClient;

  /**
   * Sign in a user with email and password
   * @param email - User's email address
   * @param password - User's plaintext password
   * @returns SignInResponseDto with user and session information
   * @throws Error if authentication fails or Supabase returns an error
   */
  async signIn(email: string, password: string): Promise<SignInResponseDto> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.user || !data.session) {
      throw new Error('Invalid authentication response from Supabase');
    }

    // Map Supabase response to SignInResponseDto
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        email_confirmed_at: data.user.email_confirmed_at ?? null,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in ?? 3600,
        token_type: 'bearer',
      },
    };
  }
}
