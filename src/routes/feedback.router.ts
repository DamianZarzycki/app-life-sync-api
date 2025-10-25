import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { submitFeedbackHandler } from '../controllers/feedback.controller.js';

const router = Router();

/**
 * POST /api/feedback
 * Submit feedback for a report (1:1 relationship)
 * Requires: Authorization header with Bearer token
 * Query: upsert (optional boolean, default false)
 * Body: { report_id: UUID, rating: -1|0|1, comment?: string|null }
 * Response: 201 Created (new) or 200 OK (updated)
 * Errors: 400 (validation), 401 (unauthorized), 404 (report not found), 409 (conflict), 500 (server error)
 */
router.post('/', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  submitFeedbackHandler(req, res, _next)
);

export default router;
