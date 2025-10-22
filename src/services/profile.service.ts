import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { UUID, ProfileDto, UpdateProfileCommand } from '../types.js';

/**
 * Custom error class for when a user profile is not found
 * Thrown when a GET or UPDATE operation targets a non-existent profile
 */
export class ProfileNotFoundError extends Error {
  constructor(userId: UUID) {
    super(`Profile not found for user ${userId}`);
    this.name = 'ProfileNotFoundError';
  }
}

/**
 * ProfileService handles all user profile operations
 * Manages retrieval and updates of user profile information via Supabase
 * 
 * Uses user-scoped Supabase clients to enforce Row-Level Security (RLS)
 * ensuring users can only access their own profile data
 */
export class ProfileService {
  /**
   * Initialize service with a user-scoped Supabase client
   * @param userClient - User-scoped Supabase client (enforces RLS via JWT)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Retrieve the authenticated user's profile from the database
   * 
   * @param userId - UUID of the authenticated user
   * @returns Promise<ProfileDto> User's profile information
   * @throws ProfileNotFoundError if profile record doesn't exist
   * @throws Error for unexpected database or network errors
   */
  async getProfile(userId: UUID): Promise<ProfileDto> {
    // Execute query with user's scoped client (RLS enforced by Supabase)
    const { data: profile, error } = await this.userClient
      .from('profiles')
      .select('user_id, timezone, created_at, updated_at')
      .eq('user_id', userId)
      .single();

    // Handle database errors
    if (error) {
      // PGRST116 is Supabase's error code for "no rows returned"
      if (error.code === 'PGRST116') {
        throw new ProfileNotFoundError(userId);
      }
      // Re-throw unexpected database errors with context
      throw new Error(`Failed to retrieve profile: ${error.message}`);
    }

    // Double-check profile exists (defensive programming)
    if (!profile) {
      throw new ProfileNotFoundError(userId);
    }

    return profile as ProfileDto;
  }

  /**
   * Update the authenticated user's profile in the database
   * 
   * Currently supports updating:
   * - timezone: User's preferred timezone for reports and scheduling
   * 
   * Updated fields:
   * - updated_at: Automatically set by database trigger to current timestamp
   * 
   * @param userId - UUID of the authenticated user
   * @param command - UpdateProfileCommand with new profile values
   * @returns Promise<ProfileDto> Updated user profile information
   * @throws ProfileNotFoundError if profile record doesn't exist
   * @throws Error for unexpected database or network errors
   */
  async updateProfile(userId: UUID, command: UpdateProfileCommand): Promise<ProfileDto> {
    // Execute update query with user's scoped client (RLS enforced by Supabase)
    const { data: updatedProfile, error } = await this.userClient
      .from('profiles')
      .update({
        timezone: command.timezone,
      })
      .eq('user_id', userId)
      .select('user_id, timezone, created_at, updated_at')
      .single();

    // Handle database errors
    if (error) {
      // PGRST116 is Supabase's error code for "no rows affected" (update matched no records)
      if (error.code === 'PGRST116') {
        throw new ProfileNotFoundError(userId);
      }
      // Re-throw unexpected database errors with context
      throw new Error(`Failed to update profile: ${error.message}`);
    }

    // Double-check updated profile exists (defensive programming)
    if (!updatedProfile) {
      throw new ProfileNotFoundError(userId);
    }

    return updatedProfile as ProfileDto;
  }
}
