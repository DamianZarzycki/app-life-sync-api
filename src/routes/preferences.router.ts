import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { updatePreferencesHandler } from '../controllers/preferences.controller.js';

const router = Router();

/**
 * PUT /api/preferences
 * Update user preferences for reports, delivery channels, and daily note constraints
 * @requires Authorization header with valid JWT
 */
router.put('/', authMiddleware, updatePreferencesHandler);

export default router;
