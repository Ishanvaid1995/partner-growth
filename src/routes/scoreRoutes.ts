import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /score-opportunity
 * Protected endpoint evaluating deal intake string and returning deal readiness score, missing fields, and recommended next path.
 */
const handleScoreOpportunity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { raw_input, industry } = req.body || {};

    if (!raw_input || typeof raw_input !== 'string' || !raw_input.trim()) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing or invalid required parameter "raw_input".',
        details: ['raw_input is required'],
      });
      return;
    }

    if (raw_input.length > 8000) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Parameter "raw_input" exceeds maximum allowed length of 8000 characters.',
        details: ['raw_input must not exceed 8000 characters'],
      });
      return;
    }

    console.log('[Audit Log] POST /api/opportunities/score', {
      timestamp: new Date().toISOString(),
      clientIp: req.ip,
      inputLength: raw_input.length,
    });

    const result = watsonxService.scoreOpportunity(raw_input, industry);

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[scoreRoutes Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err?.message || 'Failed to evaluate deal score.',
      details: [err?.message || 'Deal score evaluation error'],
    });
  }
};

router.post('/api/opportunities/score', proposalRateLimiter, apiKeyAuth, handleScoreOpportunity);
router.post('/score-opportunity', proposalRateLimiter, apiKeyAuth, handleScoreOpportunity);

export default router;
