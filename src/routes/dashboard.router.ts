import { Router } from 'express';
import { getDashboardHandler } from '../controllers/dashboard.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

/**
 * Router for dashboard endpoints
 *
 * Private endpoint - authentication middleware required
 */
const router = Router();

/**
 * GET /api/dashboard
 *
 * Retrieve the dashboard data for the authenticated user
 *
 * Query Parameters:
 * - timezone: optional string (valid IANA timezone) for streak calculation in user's local time
 * - since: optional string (ISO date YYYY-MM-DD) for filtering notes; defaults to 4 weeks ago
 */
router.get('/', authMiddleware, getDashboardHandler);

export default router;
