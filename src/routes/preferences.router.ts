import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  updatePreferencesHandler,
  getPreferencesHandler,
} from '../controllers/preferences.controller.js';

const router = Router();

/**
 * GET /api/preferences
 * Retrieve current user's preferences
 * @requires Authorization header with valid JWT
 */
router.get('/', authMiddleware, getPreferencesHandler);

/**
 * PUT /api/preferences
 * Update user preferences for reports, delivery channels, and daily note constraints
 * @requires Authorization header with valid JWT
 */
router.put('/', authMiddleware, updatePreferencesHandler);

export default router;
