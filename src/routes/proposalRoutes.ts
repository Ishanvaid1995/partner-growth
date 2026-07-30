import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /generate-proposal
 * Consumed by watsonx Assistant, watsonx Orchestrate tool, or REST client.
 */
const handleProposal = async (req: Request, res: Response): Promise<void> => {
  const { raw_input } = req.body || {};

  if (
    !raw_input ||
    typeof raw_input !== 'string' ||
    raw_input.trim().length === 0 ||
    raw_input.length > 8000
  ) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'raw_input is required and must be a string up to 8000 characters.',
      details: ['raw_input is required'],
    });
    return;
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const trimmedInput = raw_input.trim();

  console.log('[Audit Log] POST /api/proposals', {
    timestamp: new Date().toISOString(),
    clientIp,
    inputLength: trimmedInput.length,
  });

  try {
    const result = await watsonxService.generateProposal(trimmedInput);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[POST /api/proposals] Error:', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Failed to generate proposal',
      details: [err?.message || 'Proposal generation error'],
    });
  }
};

router.post('/api/proposals', proposalRateLimiter, apiKeyAuth, handleProposal);
router.post('/generate-proposal', proposalRateLimiter, apiKeyAuth, handleProposal);

export default router;
