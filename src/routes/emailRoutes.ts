import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /draft-followup-email
 * Tool endpoint for drafting executive follow-up emails.
 */
router.post(
  '/draft-followup-email',
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

    console.log('[Audit Log] POST /draft-followup-email', {
      timestamp: new Date().toISOString(),
      clientIp,
      inputLength: trimmedInput.length,
    });

    try {
      const result = await watsonxService.draftFollowupEmail(trimmedInput, proposal);
      res.status(200).json(result);
    } catch (err: any) {
      console.error('[POST /draft-followup-email] Error:', err?.message || err);
      res.status(500).json({ error: 'Failed to draft follow-up email' });
    }
  }
);

export default router;
