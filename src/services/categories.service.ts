import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { ListCategoriesQuery, ListCategoriesResponseDto } from '../types.js';
import { supabaseClient } from '../db/supabase.client.js';

/**
 * CategoriesService handles retrieval and filtering of categories
 *
 * This service is public-facing with no RLS enforcement needed since
 * categories are read-only and accessible to all users
 */
export class CategoriesService {
  /**
   * Initialize service with Supabase client
   * @param adminClient - Admin Supabase client for category queries (no RLS needed)
   */
  constructor(private adminClient: SupabaseClient<Database> = supabaseClient) {}

  /**
   * List all categories with filtering, sorting, and pagination
   *
   * @param query - Query parameters with active filter, sort order, and pagination
   * @returns Promise resolving to paginated categories response
   * @throws Error on database failure (logged and re-thrown as generic 500 error)
   */
  async listCategories(query: ListCategoriesQuery): Promise<ListCategoriesResponseDto> {
    try {
      // Build base query - select specific columns
      let categoryQuery = this.adminClient
        .from('categories')
        .select('id, slug, name, active, created_at', { count: 'exact' });

      // Apply active filter
      categoryQuery = categoryQuery.eq('active', query.active);

      // Apply sorting
      const isAscending = query.sort === 'name_asc';
      categoryQuery = categoryQuery.order('name', { ascending: isAscending });

      // Apply pagination
      categoryQuery = categoryQuery.range(query.offset, query.offset + query.limit - 1);

      // Execute query
      const { data, error, count } = await categoryQuery;

      if (error) {
        console.error('Failed to list categories:', error);
        throw new Error(`Database query failed: ${error.message}`);
      }

      // Build response DTO with pagination metadata
      const response: ListCategoriesResponseDto = {
        items: data || [],
        total: count || 0,
        limit: query.limit,
        offset: query.offset,
      };

      return response;
    } catch (err) {
      // Log error for debugging
      console.error('CategoriesService.listCategories error:', err);
      // Re-throw to be handled by controller
      throw err;
    }
  }
}
