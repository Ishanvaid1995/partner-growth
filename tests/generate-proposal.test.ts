import request from 'supertest';
import { app } from '../src/server';
import { config } from '../src/config';
import { watsonxService } from '../src/services/watsonxService';

// Mock the watsonxService module
jest.mock('../src/services/watsonxService', () => ({
  watsonxService: {
    generateProposal: jest.fn(),
    draftFollowupEmail: jest.fn(),
    createHandoffSummary: jest.fn(),
    createOpportunityStub: jest.fn(),
  },
}));

describe('Partner Growth Copilot API Endpoints', () => {
  const validKey = config.pgcApiKey;

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health & GET /', () => {
    it('should return 200 OK on GET /health', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', service: 'partner-growth-copilot' });
    });

    it('should return 200 OK and HTML landing page on GET /', async () => {
      const res = await request(app).get('/').expect(200);
      expect(res.text).toContain('Partner Growth Copilot');
    });
  });

  describe('POST /generate-proposal', () => {
    it('should return 401 Unauthorized when X-PGC-KEY header is missing', async () => {
      const res = await request(app)
        .post('/generate-proposal')
        .send({ raw_input: 'Valid deal input' })
        .expect(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('should return 200 and structured proposal when authorized', async () => {
      const mockResult = {
        proposal: 'Sample proposal text',
        solution_name: 'IBM watsonx Retail Analytics',
        recommended_ibm_stack: ['IBM watsonx.ai', 'IBM watsonx Orchestrate'],
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

    it('should return 400 when raw_input exceeds 8000 chars', async () => {
      const hugeInput = 'A'.repeat(8001);
      await request(app)
        .post('/generate-proposal')
        .set('X-PGC-KEY', validKey)
        .send({ raw_input: hugeInput })
        .expect(400);
    });
  });

  describe('POST /draft-followup-email', () => {
    it('should return 200 and email draft when authorized', async () => {
      const mockResult = {
        subject: 'Follow-up: IBM Solution Overview',
        email_body: 'Dear Acme Retail team...',
      };
      (watsonxService.draftFollowupEmail as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/draft-followup-email')
        .set('X-PGC-KEY', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });

  describe('POST /create-handoff-summary', () => {
    it('should return 200 and technical handoff summary', async () => {
      const mockResult = {
        summary: 'Technical implementation scope',
        next_steps: ['Architecture review'],
        risks: ['IAM credentials'],
      };
      (watsonxService.createHandoffSummary as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/create-handoff-summary')
        .set('X-PGC-KEY', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });

  describe('POST /create-opportunity-stub', () => {
    it('should return 200 and CRM opportunity payload', async () => {
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
        .set('X-PGC-KEY', validKey)
        .send({ raw_input: 'Acme Retail deal context' })
        .expect(200);

      expect(res.body).toEqual(mockResult);
    });
  });
});
