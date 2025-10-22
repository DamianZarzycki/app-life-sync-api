import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getMeHandler, signInHandler } from '../controllers/auth.controller.js';

const router = Router();

// Public endpoint with rate limiting (to prevent brute force attacks)
router.post('/sign-in', signInHandler);

// Protected endpoint (auth required)
router.get('/me', authMiddleware, getMeHandler);

export default router;
