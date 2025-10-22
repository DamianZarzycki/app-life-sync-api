import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createNoteHandler } from '../controllers/notes.controller.js';

const router = Router();

/**
 * POST /api/notes
 * Creates a new note for the authenticated user
 * Requires: Authorization header with Bearer token
 */
router.post('/', authMiddleware, createNoteHandler);

export default router;
