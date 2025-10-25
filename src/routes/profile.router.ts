import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { updateProfileHandler, getProfileHandler } from '../controllers/profile.controller.js';

const router = Router();

/**
 * GET /api/profile
 * Retrieve current user's profile information
 * @requires Authorization header with valid JWT
 * @returns 200 OK with ProfileDto, 401 if unauthorized, 404 if not initialized, 500 on error
 */
router.get('/', authMiddleware, getProfileHandler);

/**
 * PUT /api/profile
 * Update user profile (timezone only)
 * @requires Authorization header with valid JWT
 * @returns 200 OK with updated ProfileDto, 400/422 for validation errors, 401 if unauthorized, 404 if not initialized, 500 on error
 */
router.put('/', authMiddleware, updateProfileHandler);

export default router;
