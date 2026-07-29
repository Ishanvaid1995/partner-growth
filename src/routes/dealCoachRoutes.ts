import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /api/deal-coach
 * Returns structured deal coaching: readiness score, missing info, risks, next actions.
 */
router.post(
  '/api/deal-coach',
  proposalRateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { raw_input, industry } = req.body || {};

      if (!raw_input || typeof raw_input !== 'string' || !raw_input.trim()) {
        res.status(400).json({ error: 'Bad Request', message: 'Missing or invalid "raw_input".' });
        return;
      }

      console.log('[Audit Log] POST /api/deal-coach', {
        timestamp: new Date().toISOString(),
        clientIp: req.ip,
        inputLength: raw_input.length,
      });

      const result = await watsonxService.dealCoach(raw_input, industry);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[dealCoachRoutes Error]', err);
      res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Deal coach analysis failed.' });
    }
  }
);

export default router;
