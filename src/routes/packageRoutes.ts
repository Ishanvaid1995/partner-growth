import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { watsonxService } from '../services/watsonxService';

const router = Router();

/**
 * POST /generate-full-opportunity-package
 * Protected endpoint generating complete pre-sales package:
 * - Proposal Blueprint
 * - Executive Follow-Up Email
 * - Technical Handoff Summary
 * - CRM Opportunity Stub
 * - Deal Readiness Score
 * - Next Best Actions
 */
const handleFullPackage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { raw_input, industry, account_name, use_case } = req.body || {};

    if (!raw_input || typeof raw_input !== 'string' || !raw_input.trim()) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing or invalid required parameter "raw_input".',
        details: ['raw_input is required and must be a non-empty string.'],
      });
      return;
    }

    if (raw_input.length > 8000) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Parameter "raw_input" exceeds maximum allowed length of 8000 characters.',
        details: ['raw_input must not exceed 8000 characters.'],
      });
      return;
    }

    console.log('[Audit Log] POST /api/packages/full', {
      timestamp: new Date().toISOString(),
      clientIp: req.ip,
      inputLength: raw_input.length,
      industry: industry || 'general',
    });

    const result = await watsonxService.generateFullOpportunityPackage({
      raw_input,
      industry,
      account_name,
      use_case,
    });

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[packageRoutes Error]', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err?.message || 'Failed to generate full opportunity package.',
      details: [err?.message || 'Full package generation error.'],
    });
  }
};

router.post('/api/packages/full', proposalRateLimiter, apiKeyAuth, handleFullPackage);
router.post('/generate-full-opportunity-package', proposalRateLimiter, apiKeyAuth, handleFullPackage);

export default router;
