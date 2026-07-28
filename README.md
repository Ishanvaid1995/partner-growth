# Partner Growth Copilot (`partner-growth`)

> **Secured IBM watsonx.ai Solution Proposal Microservice & IBM watsonx Assistant Custom Extension**

`partner-growth` is an enterprise-grade Node.js & TypeScript application designed for IBM channel ecosystem partners. It integrates with the official **IBM watsonx.ai Node.js SDK** (`@ibm-cloud/watsonx-ai`) using foundation instruct models (such as `meta-llama/llama-3-3-70b-instruct` or `ibm/granite-4-h-small`) to generate multi-paragraph, structured IBM solution proposals from raw deal context.

The service is fully hardened with **API Key header authentication (`X-PGC-KEY`)**, request size limits (1MB), rate limiting (50 req/min), and safe audit logging. It exposes an **OpenAPI 3.0** compliant endpoint deployed on **IBM Cloud Code Engine** with a public HTTPS URL ready for consumption by **IBM watsonx Assistant**.

---

## 🏗️ Architecture & Security Overview

```text
┌───────────────────────────┐      OpenAPI 3.0 (X-PGC-KEY Header)       ┌───────────────────────────────┐
│                           │ ───────────────────────────────────────>  │  IBM Cloud Code Engine        │
│  IBM watsonx Assistant    │   POST /generate-proposal                 │  Partner Growth Copilot App   │
│  (Custom Extension)       │ <───────────────────────────────────────  │  (Node.js + Express)          │
└───────────────────────────┘      { "proposal": "<markdown>" }         └───────────────┬───────────────┘
                                                                                        │
                                                                                        │ @ibm-cloud/watsonx-ai SDK
                                                                                        ▼
                                                                        ┌───────────────────────────────┐
                                                                        │  IBM watsonx.ai Runtime       │
                                                                        │  (llama-3-3-70b-instruct)     │
                                                                        └───────────────────────────────┘
```

### Security Features Built-In
- 🔐 **API Key Authentication**: Middleware validates `X-PGC-KEY` header against `PGC_API_KEY`. Rejects unauthorized requests with `HTTP 401`.
- ⚡ **Rate Limiting**: Protects endpoint with `express-rate-limit` (50 requests per minute per IP).
- 🛡️ **Payload Validation**: `express.json({ limit: '1mb' })` and strict string length check (max 8000 characters) returning `HTTP 400`.
- 📝 **Safe Audit Logging**: Logs request metadata (timestamp, client IP, payload length) without leaking sensitive customer deal context text into logs.

---

## 📁 Repository Structure

```text
partner-growth/
├── openapi/
│   └── partner-growth-openapi.json   # OpenAPI 3.0.1 specification with ApiKeyAuth schema
├── src/
│   ├── config.ts                     # Environment variable loader & validation
│   ├── middleware/
│   │   ├── auth.ts                   # X-PGC-KEY API Key authentication middleware
│   │   └── rateLimiter.ts            # 50 req/min rate limiter middleware
│   ├── watsonxClient.ts              # IBM watsonx.ai SDK client wrapper & system prompt
│   ├── server.ts                     # Express app, input validation, & route handlers
│   └── index.ts                      # Entry point listening on PORT
├── tests/
│   └── generate-proposal.test.ts     # Jest + Supertest test suite (7 tests)
├── scripts/
│   └── deploy-code-engine.sh         # Automated IBM Cloud Code Engine deployment script
├── .dockerignore                     # Docker build exclusion rules
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore rules
├── Dockerfile                        # Multi-stage Docker production image definition
├── jest.config.js                    # Jest TypeScript configuration
├── package.json                      # Build & dependency declarations
├── tsconfig.json                     # TypeScript compiler options
└── README.md                         # Full documentation & deployment guides
```

---

## 🚀 Local Development

### 1. Installation
```bash
git clone https://github.com/your-org/partner-growth.git
cd partner-growth
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

Example `.env`:
```env
PORT=3000
PGC_API_KEY=pgc-secret-key-123
WATSONX_SERVICE_URL=https://ca-tor.ml.cloud.ibm.com
WATSONX_PROJECT_ID=790d4f29-8329-46b1-bf11-6746632afbf8
WATSONX_MODEL_ID=meta-llama/llama-3-3-70b-instruct
WATSONX_VERSION=2024-05-31
WATSONX_API_KEY=your-ibm-cloud-api-key-here
```

### 3. Run Commands
```bash
npm run dev     # Start development server with hot-reload
npm test        # Run Jest test suite (7 passing tests)
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled production server
```

---

## 🔒 Authentication Methods

The API enforces shared-secret API key authentication across all protected endpoints (`POST /generate-proposal`, `POST /draft-followup-email`, `POST /create-handoff-summary`, `POST /create-opportunity-stub`, `POST /generate-full-opportunity-package`, `POST /score-opportunity`).

Supported headers (evaluated in priority order):
1. **`x-api-key: <key>`** *(Recommended for IBM watsonx Orchestrate OpenAPI tool imports)*
2. **`X-PGC-KEY: <key>`** *(Legacy custom header compatibility)*
3. **`Authorization: Bearer <key>`** *(Standard Bearer token format)*

---

## 🛠️ watsonx Orchestrate Workflow Endpoints

### 1. Full Pre-Sales Opportunity Package (`POST /generate-full-opportunity-package`)
Generates an end-to-end pre-sales package containing proposal blueprint, customer email, technical handoff summary, CRM opportunity stub, deterministic deal score, and next best actions.

```bash
curl -X POST http://localhost:3000/generate-full-opportunity-package \
  -H "Content-Type: application/json" \
  -H "x-api-key: pgc-secret-key-123" \
  -d '{
    "raw_input": "Customer: Acme Retail; Use case: AI analytics for inventory prediction; Budget: $100k; Timeline: Q4.",
    "industry": "retail",
    "account_name": "Acme Retail"
  }'
```

#### Sample Output JSON:
```json
{
  "proposal": {
    "proposal": "Markdown proposal text...",
    "solution_name": "IBM watsonx Retail Analytics Solution",
    "recommended_ibm_stack": ["IBM watsonx.ai", "watsonx Orchestrate", "watsonx.data"],
    "business_outcomes": ["Improved inventory forecast accuracy by 15%"]
  },
  "followup_email": {
    "subject": "Follow-up: IBM Solution Proposal Overview",
    "email_body": "Dear Acme Retail Team,\n\nThank you for..."
  },
  "handoff_summary": {
    "summary": "Technical delivery scope for Acme Retail...",
    "next_steps": ["Schedule technical discovery call"],
    "risks": ["Verify IAM credentials"]
  },
  "crm_stub": {
    "opportunity_name": "Acme Retail - IBM watsonx AI Transformation",
    "account_name": "Acme Retail",
    "stage": "Qualification",
    "notes": "Retail AI analytics opportunity",
    "estimated_value": "$100,000 USD"
  },
  "deal_score": {
    "score": 95,
    "reasoning": ["Industry domain is explicitly identified.", "Clear business use case provided.", "Financial budget range specified.", "Project deployment timeline specified."],
    "missing_fields": [],
    "recommended_path": "proposal_ready"
  },
  "next_best_actions": [
    "Schedule executive proposal presentation with client sponsor.",
    "Provision IBM watsonx sandbox environment for pilot validation.",
    "Share formal technical handoff summary with engineering delivery team."
  ]
}
```

### 2. Score Opportunity Readiness (`POST /score-opportunity`)
Evaluates deal intake text to calculate a 0-100 readiness score, identify missing parameters, and recommend the optimal sales path.

```bash
curl -X POST http://localhost:3000/score-opportunity \
  -H "Content-Type: application/json" \
  -H "x-api-key: pgc-secret-key-123" \
  -d '{"raw_input": "Acme Retail needs AI analytics"}'
```

#### Sample Output JSON:
```json
{
  "score": 45,
  "reasoning": [
    "Industry domain is explicitly identified.",
    "Business use case needs further technical elaboration.",
    "No budget figures found in deal intake string."
  ],
  "missing_fields": [
    "Budget estimate or price target",
    "Target deployment timeline"
  ],
  "recommended_path": "discovery_workshop",
  "next_best_actions": [
    "Host an interactive IBM Architecture Discovery Workshop with client leads.",
    "Gather quantitative KPI targets (e.g. downtime reduction, latency)."
  ]
}
```

---

## 🔑 RS256 JWT Web Chat Security (`/api/watsonx-chat-token`)

To support IBM watsonx Orchestrate / Assistant Web Chat Security (JWT mode), the backend includes an RS256 JWT token minting endpoint.

### Endpoints:
* **`GET /api/watsonx-chat-token`**: Mints a short-lived (1 hour) RS256 JWT `identityToken`.
* **`GET /api/watsonx-chat-public-key`**: Returns the active RS256 Public Key in PEM format to upload into IBM Cloud Console.

### Generating RS256 Keypair with OpenSSL:
```bash
# 1. Generate 2048-bit Private Key
openssl genrsa -out private.pem 2048

# 2. Extract Public Key in PEM format
openssl rsa -in private.pem -pubout -out public.pem
```

### IBM Cloud Code Engine Environment Variable:
Set `WATSONX_CHAT_PRIVATE_KEY` in Code Engine:
```bash
export WATSONX_CHAT_PRIVATE_KEY="$(cat private.pem)"
```
*(If `WATSONX_CHAT_PRIVATE_KEY` is omitted, the server automatically generates a temporary in-memory RSA keypair for local development).*

### IBM watsonx Orchestrate Security Upload Steps:
1. Open **IBM watsonx Orchestrate Console** → **Agents** → Select `255fce2b-bf14-4c1a-8b55-2633e1ecbbce`.
2. Go to **Channels** → **Web Chat** → **Security**.
3. Under **Public Key**, copy and paste the contents of `public.pem` (or fetch from `https://partner-growth.2csujuhkf3ha.ca-tor.codeengine.appdomain.cloud/api/watsonx-chat-public-key`).
4. Click **Save**.

---

## 🧪 Testing Legacy Endpoints with `curl`

### 1. Standard `x-api-key` (Recommended for watsonx Orchestrate)
```bash
curl -X POST http://localhost:3000/generate-proposal \
  -H "Content-Type: application/json" \
  -H "x-api-key: pgc-secret-key-123" \
  -d '{"raw_input":"Customer: Acme Retail; Use case: AI analytics; Budget: 100k; Timeline: Q4."}'
```

### 2. Legacy `X-PGC-KEY` (Custom Client Compatibility)
```bash
curl -X POST http://localhost:3000/generate-proposal \
  -H "Content-Type: application/json" \
  -H "X-PGC-KEY: pgc-secret-key-123" \
  -d '{"raw_input":"Customer: Acme Retail; Use case: AI analytics; Budget: 100k; Timeline: Q4."}'
```

### 3. Bearer Token (`Authorization: Bearer`)
```bash
curl -X POST http://localhost:3000/generate-proposal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pgc-secret-key-123" \
  -d '{"raw_input":"Customer: Acme Retail; Use case: AI analytics; Budget: 100k; Timeline: Q4."}'
```

### Health Check (`GET /health`) - Unsecured Public Endpoint
```bash
curl -i http://localhost:3000/health
```

### Unauthorized Request Test (Missing / Invalid Key)
```bash
curl -X POST http://localhost:3000/generate-proposal \
  -H "Content-Type: application/json" \
  -d '{"raw_input":"Acme Retail"}'
```
*Returns `HTTP 401 Unauthorized`:*
```json
{
  "error": "Unauthorized",
  "message": "Valid API credentials were not provided."
}
```

---

## ☁️ IBM Cloud Code Engine Deployment

Deploy `partner-growth` directly to **IBM Cloud Code Engine** to obtain a public HTTPS URL.

### Option A: Automated CLI Script Deployment
Ensure you are logged into IBM Cloud via CLI (`ibmcloud login`), then run:

```bash
# Export environment variables
export PGC_API_KEY="your-pgc-secret-key"
export WATSONX_SERVICE_URL="https://ca-tor.ml.cloud.ibm.com"
export WATSONX_PROJECT_ID="your-watsonx-project-id"
export WATSONX_MODEL_ID="meta-llama/llama-3-3-70b-instruct"
export WATSONX_VERSION="2024-05-31"
export WATSONX_API_KEY="your-ibm-cloud-api-key"

# Run automated deployment script
./scripts/deploy-code-engine.sh
```

### Option B: Manual Steps via IBM Cloud Console / CLI

1. **Create Code Engine Project**:
   ```bash
   ibmcloud ce project create --name partner-growth-project
   ibmcloud ce project select --name partner-growth-project
   ```

2. **Deploy Application from Local Source Code**:
   ```bash
   ibmcloud ce application create --name partner-growth-copilot \
     --build-source . \
     --port 3000 \
     --min-scale 1 \
     --max-scale 5 \
     --env PORT=3000 \
     --env PGC_API_KEY="your-pgc-secret-key" \
     --env WATSONX_SERVICE_URL="https://ca-tor.ml.cloud.ibm.com" \
     --env WATSONX_PROJECT_ID="your-watsonx-project-id" \
     --env WATSONX_MODEL_ID="meta-llama/llama-3-3-70b-instruct" \
     --env WATSONX_VERSION="2024-05-31" \
     --env WATSONX_API_KEY="your-ibm-cloud-api-key"
   ```

3. **Get Your Deployed HTTPS URL**:
   ```bash
   ibmcloud ce application get --name partner-growth-copilot
   ```
   *Your live application URL will look like:*
   `https://partner-growth-copilot.1a2b3c4d.us-south.codeengine.appdomain.cloud`

---

## 🤖 Integration with IBM watsonx Assistant

Follow these steps to connect your deployed Code Engine application to **IBM watsonx Assistant**:

### Step 1: Build Custom Extension
1. Open your **IBM watsonx Assistant** instance.
2. In the left navigation menu, select **Integrations**.
3. Under **Extensions**, click **Build custom extension**.
4. Set Name: `Partner Growth Copilot`.
5. Description: `Generates IBM-centric solution proposals using IBM watsonx.ai models`.
6. Click **Next** and upload `openapi/partner-growth-openapi.json`.
7. Click **Finish**.

### Step 2: Add Extension & Configure Server & Authentication
1. Click **Add** on your newly created **Partner Growth Copilot** extension card.
2. Click **Next** to configure authentication:
   - **Server URL**: Paste your Code Engine HTTPS URL (e.g. `https://partner-growth-copilot.1a2b3c4d.us-south.codeengine.appdomain.cloud`).
   - **Authentication Type**: Select **API key**.
   - **Key location**: Select **Header**.
   - **Header name**: Enter `X-PGC-KEY`.
   - **API key**: Enter your `PGC_API_KEY` secret value.
3. Click **Save** and **Finish**.

### Step 3: Configure Assistant Action ("Start a new deal")
1. Navigate to **Actions** → Create or open the action **"Start a new deal"**.
2. Add steps to prompt the user for deal details (Customer Name, Industry, Use Case, Budget, Timeline).
3. Add an **Extension Step**:
   - Choose extension **Partner Growth Copilot** → operation `generateProposal`.
   - Map request parameter `raw_input` to the collected conversation input string `${step_input_text}`.
4. Add a **Response Step**:
   - Display message: `${step_extension_result.body.proposal}`.
5. Save and test the interactive deal flow in the assistant preview!

---

## 💡 IBM Partner Ecosystem Impact

`partner-growth` provides automated end-to-end enablement for channel partners:
1. **Intake**: watsonx Assistant captures deal context from partner reps or customers.
2. **AI Reasoning**: Request is securely passed over Code Engine to `watsonx.ai` running `meta-llama/llama-3-3-70b-instruct`.
3. **Structured Proposal**: Produces a 5-part IBM solution proposal (Overview, Architecture, Components, Benefits, Next Steps).
4. **Partner Velocity**: Cuts solution blueprinting turnaround time from days to seconds.
