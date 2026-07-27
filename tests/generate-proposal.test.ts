import request from 'supertest';
import { app } from '../src/server';
import { config } from '../src/config';
import { watsonxClient } from '../src/watsonxClient';

// Mock the watsonxClient module
jest.mock('../src/watsonxClient', () => ({
  watsonxClient: {
    generateProposal: jest.fn(),
  },
}));

describe('POST /generate-proposal', () => {
  const validKey = config.pgcApiKey;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 OK and service status info on GET /', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.body).toHaveProperty('service', 'partner-growth-copilot');
    expect(response.body).toHaveProperty('status', 'online');
  });

  it('should return 401 Unauthorized when X-PGC-KEY header is missing', async () => {
    const response = await request(app)
      .post('/generate-proposal')
      .send({ raw_input: 'Valid deal input string' })
      .expect(401);

    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(watsonxClient.generateProposal).not.toHaveBeenCalled();
  });

  it('should return 401 Unauthorized when X-PGC-KEY header is invalid', async () => {
    const response = await request(app)
      .post('/generate-proposal')
      .set('X-PGC-KEY', 'wrong-invalid-key')
      .send({ raw_input: 'Valid deal input string' })
      .expect(401);

    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(watsonxClient.generateProposal).not.toHaveBeenCalled();
  });

  it('should return 200 and generated proposal when valid key and raw_input are provided', async () => {
    const mockProposal = `### Overview
Acme Retail solution proposal using IBM watsonx.

### Architecture summary
IBM watsonx.ai integrated with watsonx Orchestrate.

### Key IBM components
- IBM watsonx.ai
- IBM watsonx Orchestrate

### Business benefits
Reduced operational cost and enhanced analytics.

### Next steps
Schedule technical discovery session.`;

    (watsonxClient.generateProposal as jest.Mock).mockResolvedValue(mockProposal);

    const payload = {
      raw_input: 'Customer: Acme Retail; Industry: retail; Use case: AI analytics; Budget: 100k; Timeline: Q4.',
    };

    const response = await request(app)
      .post('/generate-proposal')
      .set('X-PGC-KEY', validKey)
      .send(payload)
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.proposal).toBe(mockProposal);
    expect(watsonxClient.generateProposal).toHaveBeenCalledWith(payload.raw_input);
  });

  it('should return 400 when raw_input is missing', async () => {
    const response = await request(app)
      .post('/generate-proposal')
      .set('X-PGC-KEY', validKey)
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/raw_input is required/i);
    expect(watsonxClient.generateProposal).not.toHaveBeenCalled();
  });

  it('should return 400 when raw_input is an empty string', async () => {
    const response = await request(app)
      .post('/generate-proposal')
      .set('X-PGC-KEY', validKey)
      .send({ raw_input: '   ' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/raw_input is required/i);
    expect(watsonxClient.generateProposal).not.toHaveBeenCalled();
  });

  it('should return 400 when raw_input exceeds 8000 characters', async () => {
    const hugeInput = 'A'.repeat(8001);
    const response = await request(app)
      .post('/generate-proposal')
      .set('X-PGC-KEY', validKey)
      .send({ raw_input: hugeInput })
      .expect(400);

    expect(response.body).toEqual({
      error: 'raw_input is required and must be a reasonable-length string',
    });
    expect(watsonxClient.generateProposal).not.toHaveBeenCalled();
  });

  it('should return 500 when watsonxClient throws an error', async () => {
    (watsonxClient.generateProposal as jest.Mock).mockRejectedValue(
      new Error('watsonx service connection failure')
    );

    const response = await request(app)
      .post('/generate-proposal')
      .set('X-PGC-KEY', validKey)
      .send({ raw_input: 'Valid context input' })
      .expect(500);

    expect(response.body).toEqual({ error: 'Failed to generate proposal' });
    expect(watsonxClient.generateProposal).toHaveBeenCalledWith('Valid context input');
  });
});
