import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  listNotesHandler,
  createNoteHandler,
  getNoteHandler,
  deleteNoteHandler,
  updateNoteHandler,
} from '../controllers/notes.controller.js';

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
 * GET /api/notes/{id}
 * Retrieves a single note by ID for the authenticated user (owner only)
 * Requires: Authorization header with Bearer token
 */
router.get('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  getNoteHandler(req, res, next)
);

/**
 * POST /api/notes
 * Creates a new note for the authenticated user
 * Requires: Authorization header with Bearer token
 */
router.post('/', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  createNoteHandler(req, res, next)
);

/**
 * PATCH /api/notes/{id}
 * Partially updates an existing note for the authenticated user (title, content, category)
 * All fields optional - only provided fields will be updated
 * Enforces active category constraint when category_id is provided
 * Requires: Authorization header with Bearer token
 * Response: Updated NoteDto on success, error on validation/authorization failure
 */
router.patch('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  updateNoteHandler(req, res, next)
);

/**
 * DELETE /api/notes/{id}
 * Soft-delete a note for the authenticated user
 * Requires: Authorization header with Bearer token
 */
router.delete('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  deleteNoteHandler(req, res, next)
);

export default router;
