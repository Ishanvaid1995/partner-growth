import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import healthRoutes from './routes/healthRoutes';
import proposalRoutes from './routes/proposalRoutes';
import emailRoutes from './routes/emailRoutes';
import handoffRoutes from './routes/handoffRoutes';
import opportunityRoutes from './routes/opportunityRoutes';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static frontend landing page & interactive demo app
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Mount Modular API Routes
app.use('/', healthRoutes);
app.use('/', proposalRoutes);
app.use('/', emailRoutes);
app.use('/', handoffRoutes);
app.use('/', opportunityRoutes);

// Fallback GET / for static index.html or JSON info if requested with Accept header
app.get('/', (req: Request, res: Response) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(publicDir, 'index.html'));
  } else {
    res.status(200).json({
      service: 'partner-growth-copilot',
      status: 'online',
      endpoints: {
        health: 'GET /health',
        generateProposal: 'POST /generate-proposal',
        draftFollowupEmail: 'POST /draft-followup-email',
        createHandoffSummary: 'POST /create-handoff-summary',
        createOpportunityStub: 'POST /create-opportunity-stub',
      },
      documentation: 'https://github.com/Ishanvaid1995/partner-growth',
    });
  }
});
