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

  /**
   * Sign up a new user with email and password
   * Creates a new account in Supabase Auth
   * Returns user info and session tokens on success
   *
   * @param email - User's email address (must be unique)
   * @param password - User's plaintext password
   * @returns SignInResponseDto with user and session information
   * @throws Error if email already exists or Supabase returns an error
   */
  async signUp(email: string, password: string): Promise<SignInResponseDto> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error('Invalid authentication response from Supabase');
    }

    // Note: data.session may be null if email confirmation is required
    // Check Supabase configuration for email verification behavior
    const session = data.session || null;

    if (!session) {
      throw new Error('No session returned after sign-up. Email verification may be required.');
    }

    // Map Supabase response to SignInResponseDto
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        email_confirmed_at: data.user.email_confirmed_at ?? null,
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in ?? 3600,
        token_type: 'bearer',
      },
    };
  }
}
