import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  listReportDeliveriesHandler,
  markOpenedHandler,
} from '../controllers/report-deliveries.controller.js';

const router = Router();

/**
 * GET /api/report-deliveries
 * Retrieves paginated list of report deliveries for the authenticated user with optional filtering
 * Requires: Authorization header with Bearer token
 * Query parameters: report_id, channel, status, limit, offset
 */
router.get('/', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  listReportDeliveriesHandler(req, res, _next)
);

/**
 * POST /api/report-deliveries/{id}/mark-opened
 * Marks a report delivery as opened by the authenticated user
 * Requires: Authorization header with Bearer token
 * Path parameters: id (UUID of delivery to mark as opened)
 */
router.post(
  '/:id/mark-opened',
  authMiddleware,
  (req: Request, res: Response, _next: NextFunction) => markOpenedHandler(req, res, _next)
);

export default router;
