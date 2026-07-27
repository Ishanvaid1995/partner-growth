import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /create-handoff-summary
 * Tool endpoint for creating internal technical handoff summaries.
 */
router.post(
  '/create-handoff-summary',
  proposalRateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { raw_input, proposal } = req.body || {};

    if (
      !raw_input ||
      typeof raw_input !== 'string' ||
      raw_input.trim().length === 0 ||
      raw_input.length > 8000
    ) {
      res
        .status(400)
        .json({ error: 'raw_input is required and must be a reasonable-length string' });
      return;
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const trimmedInput = raw_input.trim();

    console.log('[Audit Log] POST /create-handoff-summary', {
      timestamp: new Date().toISOString(),
      clientIp,
      inputLength: trimmedInput.length,
    });

    try {
      const result = await watsonxService.createHandoffSummary(trimmedInput, proposal);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[POST /create-handoff-summary] Error:', err?.message || err);
      res.status(500).json({ error: 'Failed to create handoff summary' });
    }
  }
);

export default router;
