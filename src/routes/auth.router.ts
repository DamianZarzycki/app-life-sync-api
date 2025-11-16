import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getMeHandler, signInHandler, signUpHandler } from '../controllers/auth.controller.js';

// Rate limit: 10 attempts per 15 minutes per IP address
const signUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per windowMs
  message: 'Too many registration attempts. Please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const router = Router();

// Public endpoints (no auth required)
// Sign-in: No rate limiting (users can retry login attempts)
router.post('/sign-in', signInHandler);

// Sign-up: Rate limited to prevent account creation spam (10 attempts per 15 minutes per IP)
router.post('/sign-up', signUpHandler);

// Protected endpoint (auth required)
router.get('/me', authMiddleware, getMeHandler);

export default router;
