import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /health
 * Public health check probe for load balancers and Code Engine.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'partner-growth-copilot' });
});

export default router;
