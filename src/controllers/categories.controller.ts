import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ListCategoriesQuerySchema } from '../validation/categories.js';
import { CategoriesService } from '../services/categories.service.js';
import type { ErrorResponseDto } from '../types.js';

/**
 * Helper function to extract field-level errors from a Zod validation error
 * Converts nested error path to dot notation for API response
 */
function extractZodErrors(error: ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    details[path] = err.message;
  });
  return details;
}

/**
 * Handler for GET /api/categories
 *
 * Public endpoint for retrieving a paginated list of categories
 * with filtering and sorting support.
 *
 * Query Parameters:
 * - active (boolean, default: true) - Filter by active status
 * - sort (enum, default: 'name_asc') - Sort by name ascending or descending
 * - limit (integer 1-100, default: 20) - Pagination limit
 * - offset (integer >=0, default: 0) - Pagination offset
 *
 * @param req - Express request with query parameters
 * @param res - Express response object
 * @returns 200 OK with ListCategoriesResponseDto, 400 on validation error, 500 on server error
 */
export const listCategoriesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Step 1: Parse and validate query parameters
    let validated;
    try {
      validated = ListCategoriesQuerySchema.parse(req.query);
    } catch (err) {
      if (err instanceof ZodError) {
        const details = extractZodErrors(err);
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }
      throw err;
    }

    // Step 2: Initialize service and retrieve categories
    const categoriesService = new CategoriesService();
    const categories = await categoriesService.listCategories(validated);

    // Step 3: Return success response
    res.status(200).json(categories);
  } catch (err) {
    // Log unexpected errors for debugging
    console.error('Categories list handler error:', err);

    // Return generic server error (500)
    const errorResponse: ErrorResponseDto = {
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    };
    res.status(500).json(errorResponse);
  }
};
