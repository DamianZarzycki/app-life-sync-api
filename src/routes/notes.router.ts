import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { listNotesHandler, createNoteHandler } from '../controllers/notes.controller.js';

const router = Router();

/**
 * GET /api/notes
 * Retrieves paginated list of notes for the authenticated user with optional filtering
 * Requires: Authorization header with Bearer token
 * Query parameters: category_id, from, to, include_deleted, limit, offset, sort
 */
router.get('/', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  listNotesHandler(req, res, next)
);

/**
 * POST /api/notes
 * Creates a new note for the authenticated user
 * Requires: Authorization header with Bearer token
 */
router.post('/', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  createNoteHandler(req, res, next)
);

export default router;
