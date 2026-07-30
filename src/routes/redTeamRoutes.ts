import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /api/red-team
 * Returns objections, risks, competitive threats, and deal breakers.
 */
const handleRedTeam = async (req: Request, res: Response): Promise<void> => {
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

    console.log('[Audit Log] POST /api/analysis/red-team', {
      timestamp: new Date().toISOString(),
      clientIp: req.ip,
      inputLength: raw_input.length,
    });

    const result = await watsonxService.redTeamAnalysis(raw_input, industry);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[redTeamRoutes Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err?.message || 'Red team analysis failed.',
      details: [err?.message || 'Red team error'],
    });
  }
};

router.post('/api/analysis/red-team', proposalRateLimiter, apiKeyAuth, handleRedTeam);
router.post('/api/red-team', proposalRateLimiter, apiKeyAuth, handleRedTeam);

export default router;
