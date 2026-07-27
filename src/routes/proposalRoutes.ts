import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /generate-proposal
 * Consumed by watsonx Assistant, watsonx Orchestrate tool, or REST client.
 */
router.post(
  '/generate-proposal',
  proposalRateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { raw_input } = req.body || {};

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

    console.log('[Audit Log] POST /generate-proposal', {
      timestamp: new Date().toISOString(),
      clientIp,
      inputLength: trimmedInput.length,
    });

    try {
      const result = await watsonxService.generateProposal(trimmedInput);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[POST /generate-proposal] Error:', err?.message || err);
      res.status(500).json({ error: 'Failed to generate proposal' });
    }
  }
);

export default router;
