import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { proposalRateLimiter } from '../middleware/rateLimiter';
import { createSalesforceOpportunity } from '../integrations/salesforce';

const router = Router();

/**
 * POST /api/push-to-salesforce & POST /push-to-salesforce
 * Endpoint to push a generated CRM opportunity stub directly to Salesforce.
 */
const handlePushToSalesforce = async (req: Request, res: Response): Promise<void> => {
  const body = req.body || {};
  const crmStub = body.crm_stub || body.opportunity || body;

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  console.log('[Audit Log] POST /api/push-to-salesforce', {
    timestamp: new Date().toISOString(),
    clientIp,
    opportunityName: crmStub.opportunity_name || crmStub.opportunityname || crmStub.Name || 'Unspecified',
  });

  try {
    const result = await createSalesforceOpportunity(crmStub);
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[POST /api/push-to-salesforce] Error:', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Salesforce Integration Error',
      message: err?.message || 'Failed to create opportunity in Salesforce',
      details: [err?.message || 'Salesforce creation error'],
    });
  }
};

router.post('/api/push-to-salesforce', proposalRateLimiter, apiKeyAuth, handlePushToSalesforce);
router.post('/push-to-salesforce', proposalRateLimiter, apiKeyAuth, handlePushToSalesforce);

export default router;
