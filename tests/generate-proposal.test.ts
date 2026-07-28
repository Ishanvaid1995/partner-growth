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
  },
}));

describe('Partner Growth Copilot API Endpoints & Auth Middleware', () => {
  const validKey = config.pgcApiKey;

  afterEach(() => {
    jest.clearAllMocks();
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
      if (process.env.NODE_ENV !== 'production') {
        expect(res.headers['x-auth-mode']).toBe('x-api-key');
      }
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
      if (process.env.NODE_ENV !== 'production') {
        expect(res.headers['x-auth-mode']).toBe('x-pgc-key');
      }
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
      if (process.env.NODE_ENV !== 'production') {
        expect(res.headers['x-auth-mode']).toBe('bearer');
      }
    });

    it('should handle case-insensitive header names reliably (e.g. X-API-KEY)', async () => {
      (watsonxService.generateProposal as jest.Mock).mockResolvedValue({
        proposal: 'Sample proposal text',
        solution_name: 'IBM watsonx Retail Analytics',
        recommended_ibm_stack: ['IBM watsonx.ai'],
        business_outcomes: ['Faster decisions'],
      });

      await request(app)
        .post('/generate-proposal')
        .set('X-API-KEY', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);
    });

    it('should return 400 when raw_input exceeds 8000 chars', async () => {
      const hugeInput = 'A'.repeat(8001);
      await request(app)
        .post('/generate-proposal')
        .set('x-api-key', validKey)
        .send({ raw_input: hugeInput })
        .expect(400);
    });
  });

  describe('POST /draft-followup-email', () => {
    it('should return 200 and email draft when authorized via x-api-key', async () => {
      const mockResult = {
        subject: 'Follow-up: IBM Solution Overview',
        email_body: 'Dear Acme Retail team...',
      };
      (watsonxService.draftFollowupEmail as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/draft-followup-email')
        .set('x-api-key', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });

  describe('POST /create-handoff-summary', () => {
    it('should return 200 and technical handoff summary when authorized', async () => {
      const mockResult = {
        summary: 'Technical implementation scope',
        next_steps: ['Architecture review'],
        risks: ['IAM credentials'],
      };
      (watsonxService.createHandoffSummary as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/create-handoff-summary')
        .set('x-api-key', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });

  describe('POST /create-opportunity-stub', () => {
    it('should return 200 and CRM opportunity payload when authorized', async () => {
      const mockResult = {
        opportunity_name: 'Acme Retail - IBM watsonx AI',
        account_name: 'Acme Retail',
        stage: 'Qualification',
        notes: 'AI analytics deal',
        estimated_value: '$100,000 USD',
      };
      (watsonxService.createOpportunityStub as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/create-opportunity-stub')
        .set('x-api-key', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });
});
