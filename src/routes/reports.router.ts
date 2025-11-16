import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  listReportsHandler,
  getReportHandler,
  generateReportHandler,
  generateAutoReportHandler,
  deleteReportHandler,
  generateReportFromReflectionsHandler,
} from '../controllers/reports.controller.js';

const router = Router();


/**
 * POST /api/reports/generate-auto
 * Automatically generate a report based on user's active categories preferences
 * Fetches notes from the user's preferred active_categories and generates a focused report
 * Silently skips (returns 204) if no active categories or notes exist
 * Requires: Authorization header with Bearer token
 * Response: 201 Created with full ReportDto OR 204 No Content if skipped
 */
router.post('/generate-auto', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  generateAutoReportHandler(req, res, _next)
);

/**
 * POST /api/reports/generate
 * Generate a new on-demand report for the authenticated user
 * Requires: Authorization header with Bearer token
 * Optional: Idempotency-Key header for deduplication
 * Request Body: { include_categories: UUID[] }
 * Response: 201 Created with full ReportDto
 */
router.post('/generate', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  generateReportHandler(req, res, _next)
);

/**
 * POST /api/reports/generate-from-reflections
 * Generate a report from user-provided reflections grouped by category
 * Requires: Authorization header with Bearer token
 * Request Body: { categoryName: [{ title, description, date }] }
 * Response: 201 Created with report content (html, text_version, llm_model, system_prompt_version)
 * This endpoint does NOT save to database - it just returns the generated content
 */
router.post('/generate-from-reflections', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  generateReportFromReflectionsHandler(req, res, _next)
);

/**
 * DELETE /api/reports/{id}
 * Soft-delete a report for the authenticated user (owner only)
 * Requires: Authorization header with Bearer token
 * Response: 204 No Content on success
 * Errors: 400 (invalid UUID), 401 (unauthorized), 404 (not found), 500 (server error)
 */
router.delete('/:id', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  deleteReportHandler(req, res, _next)
);



/**
 * GET /api/reports
 * Retrieves paginated list of reports for the authenticated user with optional filtering
 * Requires: Authorization header with Bearer token
 * Query parameters: week_start_local, generated_by, include_deleted, limit, offset, sort
 */
router.get('/', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  listReportsHandler(req, res, _next)
);

/**
 * GET /api/reports/{id}
 * Retrieves a single report by ID for the authenticated user (owner only)
 * Requires: Authorization header with Bearer token
 */
router.get('/:id', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  getReportHandler(req, res, _next)
);

export default router;
