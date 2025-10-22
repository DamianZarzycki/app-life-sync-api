import { Router } from 'express';
import { listCategoriesHandler } from '../controllers/categories.controller.js';

/**
 * Router for categories endpoints
 * 
 * Public endpoint - no authentication middleware needed
 */
const router = Router();

/**
 * GET /api/categories
 * 
 * Retrieve a paginated list of categories with optional filtering and sorting
 * 
 * Query Parameters:
 * - active (boolean, default: true) - Filter by active status
 * - sort (enum, default: 'name_asc') - Sort by name ascending or descending
 * - limit (integer 1-100, default: 20) - Pagination limit
 * - offset (integer >=0, default: 0) - Pagination offset
 */
router.get('/', listCategoriesHandler);

export default router;
