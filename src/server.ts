import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import healthRoutes from './routes/healthRoutes';
import proposalRoutes from './routes/proposalRoutes';
import emailRoutes from './routes/emailRoutes';
import handoffRoutes from './routes/handoffRoutes';
import opportunityRoutes from './routes/opportunityRoutes';
import packageRoutes from './routes/packageRoutes';
import scoreRoutes from './routes/scoreRoutes';
import chatAuthRoutes from './routes/chatAuthRoutes';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Bulletproof public directory resolution for both dev (ts-node) and prod (dist)
const publicDir = fs.existsSync(path.join(__dirname, '../public'))
  ? path.join(__dirname, '../public')
  : path.join(process.cwd(), 'public');

app.use(express.static(publicDir));

// Mount Modular API Routes
app.use('/', healthRoutes);
app.use('/', proposalRoutes);
app.use('/', emailRoutes);
app.use('/', handoffRoutes);
app.use('/', opportunityRoutes);
app.use('/', packageRoutes);
app.use('/', scoreRoutes);
app.use('/', chatAuthRoutes);

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
        getWatsonxChatToken: 'GET /api/watsonx-chat-token',
        getWatsonxChatPublicKey: 'GET /api/watsonx-chat-public-key',
        generateProposal: 'POST /generate-proposal',
        draftFollowupEmail: 'POST /draft-followup-email',
        createHandoffSummary: 'POST /create-handoff-summary',
        createOpportunityStub: 'POST /create-opportunity-stub',
        generateFullOpportunityPackage: 'POST /generate-full-opportunity-package',
        scoreOpportunity: 'POST /score-opportunity',
      },
    });
  }
});
