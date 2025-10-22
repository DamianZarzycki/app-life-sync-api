import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { UUID, PreferencesDto, UpdatePreferencesCommand } from '../types.js';
import { supabaseClient } from '../db/supabase.client.js';

/**
 * Custom error for when user preferences are not found
 */
export class PreferencesNotFoundError extends Error {
  constructor(userId: UUID) {
    super(`Preferences not found for user ${userId}`);
    this.name = 'PreferencesNotFoundError';
  }
}

/**
 * Custom error for when referenced categories don't exist
 */
export class InvalidCategoriesError extends Error {
  constructor(public invalidCategoryIds: UUID[]) {
    super(`Invalid category IDs: ${invalidCategoryIds.join(', ')}`);
    this.name = 'InvalidCategoriesError';
  }
}

/**
 * PreferencesService handles user preferences operations
 * Manages validation and persistence of preferences via Supabase
 */
export class PreferencesService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement)
   * @param adminClient - Admin Supabase client (for category validation queries)
   */
  constructor(
    private userClient: SupabaseClient<Database>,
    private adminClient: SupabaseClient<Database> = supabaseClient
  ) {}

  /**
   * Validate that all requested category IDs exist in the database
   * @param categoryIds - Array of category UUIDs to validate
   * @throws InvalidCategoriesError if any categories don't exist
   */
  async validateCategories(categoryIds: UUID[]): Promise<void> {
    // Skip validation if no categories requested
    if (categoryIds.length === 0) {
      return;
    }

    // Query categories table for all requested UUIDs
    const { data: existingCategories, error } = await this.adminClient
      .from('categories')
      .select('id', { count: 'exact' })
      .in('id', categoryIds);

    if (error) {
      throw new Error(`Failed to validate categories: ${error.message}`);
    }

    // Check if all requested categories were found
    const foundCategoryIds = new Set(existingCategories?.map((c) => c.id) ?? []);
    const invalidCategoryIds = categoryIds.filter((id) => !foundCategoryIds.has(id));

    if (invalidCategoryIds.length > 0) {
      throw new InvalidCategoriesError(invalidCategoryIds);
    }
  }

  /**
   * Update user preferences in the database
   * @param userId - UUID of the user
   * @param command - UpdatePreferencesCommand with new preference values
   * @returns Updated PreferencesDto
   * @throws PreferencesNotFoundError if preferences record doesn't exist
   * @throws InvalidCategoriesError if any referenced categories don't exist
   * @throws Error for database or unexpected errors
   */
  async updatePreferences(userId: UUID, command: UpdatePreferencesCommand): Promise<PreferencesDto> {
    // Validate that all active categories exist in the database
    await this.validateCategories(command.active_categories);

    // Execute update query with user's scoped client (enforces RLS)
    const { data: updatedPreference, error } = await this.userClient
      .from('preferences')
      .update({
        active_categories: command.active_categories,
        report_dow: command.report_dow,
        report_hour: command.report_hour,
        preferred_delivery_channels: command.preferred_delivery_channels,
        email_unsubscribed_at: command.email_unsubscribed_at,
        max_daily_notes: command.max_daily_notes,
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      // Distinguish between not found and other errors
      if (error.code === 'PGRST116') {
        // PGRST116 is Supabase's "rows affected" error (no rows updated)
        throw new PreferencesNotFoundError(userId);
      }
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    if (!updatedPreference) {
      throw new PreferencesNotFoundError(userId);
    }

    return updatedPreference as PreferencesDto;
  }

  /**
   * Retrieve user preferences from the database
   * @param userId - UUID of the user
   * @returns PreferencesDto with user's preferences
   * @throws PreferencesNotFoundError if preferences record doesn't exist
   * @throws Error for database or unexpected errors
   */
  async getPreferences(userId: UUID): Promise<PreferencesDto> {
    // Execute query with user's scoped client (enforces RLS)
    const { data: preferences, error } = await this.userClient
      .from('preferences')
      .select()
      .eq('user_id', userId)
      .single();

    if (error) {
      // Distinguish between not found and other errors
      // PGRST116 is Supabase's error code for "no rows returned"
      if (error.code === 'PGRST116') {
        throw new PreferencesNotFoundError(userId);
      }
      throw new Error(`Failed to retrieve preferences: ${error.message}`);
    }

    if (!preferences) {
      throw new PreferencesNotFoundError(userId);
    }

    return preferences as PreferencesDto;
  }
}
