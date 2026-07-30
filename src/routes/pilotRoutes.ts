import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /api/pilot-recommendation
 * Returns smallest viable IBM pilot recommendation with KPIs and scope.
 */
const handlePilotRecommendation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { raw_input, industry } = req.body || {};

    if (!raw_input || typeof raw_input !== 'string' || !raw_input.trim()) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing or invalid "raw_input".',
        details: ['raw_input is required'],
      });
      return;
    }

    console.log('[Audit Log] POST /api/analysis/pilot-recommendation', {
      timestamp: new Date().toISOString(),
      clientIp: req.ip,
      inputLength: raw_input.length,
    });

    const result = await watsonxService.pilotRecommendation(raw_input, industry);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[pilotRoutes Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err?.message || 'Pilot recommendation failed.',
      details: [err?.message || 'Pilot recommendation error'],
    });
  }
};

router.post('/api/analysis/pilot-recommendation', proposalRateLimiter, apiKeyAuth, handlePilotRecommendation);
router.post('/api/pilot-recommendation', proposalRateLimiter, apiKeyAuth, handlePilotRecommendation);

export default router;
