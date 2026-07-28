import { Router, Request, Response } from 'express';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { jwtService } from '../services/jwtService';

const router = Router();

/**
 * GET /api/watsonx-chat-token
 * Mints a short-lived RS256 JWT for IBM watsonx Assistant / Orchestrate Web Chat Security.
 */
router.get(
  '/api/watsonx-chat-token',
  proposalRateLimiter,
  (req: Request, res: Response): void => {
    try {
      const userId = req.query.user_id ? String(req.query.user_id) : undefined;
      const { token, expiresInSeconds } = jwtService.mintWatsonxChatJwt(userId);

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[ChatAuth Log] Minted RS256 JWT for sub: ${userId || 'anonymous'}`);
      }

      res.status(200).json({
        token,
        expires_in: expiresInSeconds,
      });
    } catch (err: any) {
      console.error('[chatAuthRoutes Error]', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to mint chat identity token.',
      });
    }
  }
);

/**
 * POST /api/watsonx-chat-token
 * Support POST method for identity token requests.
 */
router.post(
  '/api/watsonx-chat-token',
  proposalRateLimiter,
  (req: Request, res: Response): void => {
    try {
      const { user_id } = req.body || {};
      const { token, expiresInSeconds } = jwtService.mintWatsonxChatJwt(user_id);

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[ChatAuth Log] Minted RS256 JWT for sub: ${user_id || 'anonymous'}`);
      }

      res.status(200).json({
        token,
        expires_in: expiresInSeconds,
      });
    } catch (err: any) {
      console.error('[chatAuthRoutes Error]', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to mint chat identity token.',
      });
    }
  }
);

/**
 * GET /api/watsonx-chat-public-key
 * Endpoint exposing the active RS256 Public Key PEM for IBM Cloud Console configuration.
 */
router.get('/api/watsonx-chat-public-key', (req: Request, res: Response): void => {
  res.status(200).json({
    public_key: jwtService.getPublicKeyPem(),
  });
});

export default router;
