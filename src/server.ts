import express, { Request, Response } from 'express';
import cors from 'cors';
import { apiKeyAuth } from './middleware/auth';
import { proposalRateLimiter } from './middleware/rateLimiter';
import { watsonxClient } from './watsonxClient';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Root route for web browser test checks
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'partner-growth-copilot',
    status: 'online',
    endpoints: {
      health: 'GET /health',
      generateProposal: 'POST /generate-proposal',
    },
    documentation: 'https://github.com/Ishanvaid1995/partner-growth',
  });
});

// Health check endpoint (Public for probes / load balancers)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'partner-growth-copilot' });
});

/**
 * POST /generate-proposal
 * Protected endpoint consumed by IBM watsonx Assistant custom extension.
 */
app.post(
  '/generate-proposal',
  proposalRateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { raw_input } = req.body || {};

    // Validate raw_input presence, type, and reasonable string length (<= 8000 chars)
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

    // Safe audit logging: Log metadata only, never leak full deal context text
    console.log('[Audit Log]', {
      timestamp: new Date().toISOString(),
      clientIp,
      inputLength: trimmedInput.length,
    });

    try {
      const proposal = await watsonxClient.generateProposal(trimmedInput);
      res.status(200).json({ proposal });
    } catch (err: any) {
      // Log server-side error without leaking credentials
      console.error('[POST /generate-proposal] Error:', err?.message || err);
      res.status(500).json({ error: 'Failed to generate proposal' });
    }
  }
);
