import request from 'supertest';
import { app } from '../src/server';
import { config } from '../src/config';
import { watsonxService } from '../src/services/watsonxService';
import { extractApiCredential } from '../src/middleware/auth';

// Mock the watsonxService module
jest.mock('../src/services/watsonxService', () => ({
  watsonxService: {
    generateProposal: jest.fn(),
    draftFollowupEmail: jest.fn(),
    createHandoffSummary: jest.fn(),
    createOpportunityStub: jest.fn(),
    scoreOpportunity: jest.fn(),
    generateFullOpportunityPackage: jest.fn(),
  },
}));

describe('Partner Growth Copilot API Endpoints & Auth Middleware', () => {
  const validKey = config.pgcApiKey;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/watsonx-chat-token & GET /api/watsonx-chat-public-key', () => {
    it('should return 200 and a signed RS256 JWT token on GET /api/watsonx-chat-token', async () => {
      const res = await request(app).get('/api/watsonx-chat-token').expect(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('expires_in', 3600);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.split('.').length).toBe(3); // Valid JWT 3-part format
    });

    it('should return 200 and RS256 public key on GET /api/watsonx-chat-public-key', async () => {
      const res = await request(app).get('/api/watsonx-chat-public-key').expect(200);
      expect(res.body).toHaveProperty('public_key');
      expect(res.body.public_key).toContain('-----BEGIN PUBLIC KEY-----');
    });
  });

  describe('extractApiCredential Helper', () => {
    it('should extract x-api-key first if present', () => {
      const mockReq = {
        headers: {
          'x-api-key': 'key-1',
          'x-pgc-key': 'key-2',
          authorization: 'Bearer key-3',
        },
      } as any;
      expect(extractApiCredential(mockReq)).toEqual({ token: 'key-1', source: 'x-api-key' });
    });

    it('should extract x-pgc-key if x-api-key is missing', () => {
      const mockReq = {
        headers: {
          'x-pgc-key': 'key-2',
          authorization: 'Bearer key-3',
        },
      } as any;
      expect(extractApiCredential(mockReq)).toEqual({ token: 'key-2', source: 'x-pgc-key' });
    });

    it('should extract Bearer token if header keys are missing', () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer key-3',
        },
      } as any;
      expect(extractApiCredential(mockReq)).toEqual({ token: 'key-3', source: 'bearer' });
    });

    it('should return null when no valid auth headers exist', () => {
      const mockReq = { headers: {} } as any;
      expect(extractApiCredential(mockReq)).toEqual({ token: null, source: null });
    });
  });

  describe('GET /health & GET /', () => {
    it('should return 200 OK on GET /health without auth', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', service: 'partner-growth-copilot' });
    });

    it('should return 200 OK and HTML landing page on GET /', async () => {
      const res = await request(app).get('/').expect(200);
      expect(res.text).toContain('Partner Growth Copilot');
    });
  });

  describe('Authentication Integration Tests', () => {
    it('should fail with 401 and structured error when auth header is missing', async () => {
      const res = await request(app)
        .post('/generate-proposal')
        .send({ raw_input: 'Valid deal input' })
        .expect(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'Valid API credentials were not provided.',
      });
    });

    it('should fail with 401 when invalid API key is sent', async () => {
      const res = await request(app)
        .post('/generate-proposal')
        .set('x-api-key', 'wrong-key-123')
        .send({ raw_input: 'Valid deal input' })
        .expect(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'Valid API credentials were not provided.',
      });
    });

    it('should succeed with valid x-api-key header (watsonx Orchestrate standard)', async () => {
      const mockResult = {
        proposal: 'Sample proposal text',
        solution_name: 'IBM watsonx Retail Analytics',
        recommended_ibm_stack: ['IBM watsonx.ai', 'IBM watsonx Orchestrate'],
        business_outcomes: ['Faster decisions'],
      };
      (watsonxService.generateProposal as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/generate-proposal')
        .set('x-api-key', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });

    it('should succeed with valid X-PGC-KEY header (legacy support)', async () => {
      const mockResult = {
        proposal: 'Sample proposal text',
        solution_name: 'IBM watsonx Retail Analytics',
        recommended_ibm_stack: ['IBM watsonx.ai'],
        business_outcomes: ['Faster decisions'],
      };
      (watsonxService.generateProposal as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/generate-proposal')
        .set('X-PGC-KEY', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });

    it('should succeed with valid Authorization Bearer token', async () => {
      const mockResult = {
        proposal: 'Sample proposal text',
        solution_name: 'IBM watsonx Retail Analytics',
        recommended_ibm_stack: ['IBM watsonx.ai'],
        business_outcomes: ['Faster decisions'],
      };
      (watsonxService.generateProposal as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/generate-proposal')
        .set('Authorization', `Bearer ${validKey}`)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });

  describe('POST /generate-full-opportunity-package', () => {
    it('should return 401 when unauthorized', async () => {
      await request(app)
        .post('/generate-full-opportunity-package')
        .send({ raw_input: 'Retail AI deal' })
        .expect(401);
    });

    it('should return 200 and complete package when authorized', async () => {
      const mockPackage = {
        proposal: { proposal: 'Proposal text', solution_name: 'IBM Retail Analytics', recommended_ibm_stack: ['IBM watsonx.ai'], business_outcomes: ['Outcome 1'] },
        followup_email: { subject: 'Follow-up Email', email_body: 'Dear Acme team...' },
        handoff_summary: { summary: 'Handoff summary', next_steps: ['Step 1'], risks: ['Risk 1'] },
        crm_stub: { opportunity_name: 'Acme Retail Deal', account_name: 'Acme Retail', stage: 'Qualification', notes: 'Notes', estimated_value: '$100k' },
        deal_score: { score: 85, reasoning: ['Good clarity'], missing_fields: [], recommended_path: 'proposal_ready' },
        next_best_actions: ['Action 1', 'Action 2'],
      };
      (watsonxService.generateFullOpportunityPackage as jest.Mock).mockResolvedValue(mockPackage);

      const res = await request(app)
        .post('/generate-full-opportunity-package')
        .set('x-api-key', validKey)
        .send({
          raw_input: 'Customer: Acme Retail; Industry: retail; Use case: AI analytics; Budget: 100k; Timeline: Q4.',
          industry: 'retail',
          account_name: 'Acme Retail',
        })
        .expect(200);

      expect(res.body).toEqual(mockPackage);
    });
  });

  describe('POST /score-opportunity', () => {
    it('should return 401 when unauthorized', async () => {
      await request(app)
        .post('/score-opportunity')
        .send({ raw_input: 'Retail AI deal' })
        .expect(401);
    });

    it('should return 200 and deal score payload when authorized', async () => {
      const mockScore = {
        score: 80,
        reasoning: ['Industry identified', 'Clear problem statement'],
        missing_fields: [],
        recommended_path: 'proposal_ready',
        next_best_actions: ['Schedule discovery call'],
      };
      (watsonxService.scoreOpportunity as jest.Mock).mockReturnValue(mockScore);

      const res = await request(app)
        .post('/score-opportunity')
        .set('x-api-key', validKey)
        .send({ raw_input: 'Acme Retail AI analytics' })
        .expect(200);

      expect(res.body).toEqual(mockScore);
    });
  });
});
