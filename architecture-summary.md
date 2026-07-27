# Architecture Summary: Partner Growth Copilot

> **Technical Architecture & Data Flow Overview**

---

## 🏛️ 1. Architecture Overview

```text
┌───────────────────────────┐      OpenAPI 3.0 HTTPS (X-PGC-KEY Header)      ┌───────────────────────────────┐
│                           │ ────────────────────────────────────────────>  │  IBM Cloud Code Engine        │
│  IBM watsonx Assistant    │   POST /generate-proposal                      │  Partner Growth Copilot App   │
│  (Front-End Web Chat)     │   POST /draft-followup-email                   │  (Node.js + Express + TS)     │
└─────────────┬─────────────┘   POST /create-handoff-summary                 └───────────────┬───────────────┘
              │                 POST /create-opportunity-stub                                │
              │                                                                              │ @ibm-cloud/watsonx-ai SDK
              ▼                                                                              ▼
┌───────────────────────────┐                                                ┌───────────────────────────────┐
│                           │                                                │  IBM watsonx.ai Runtime       │
│  IBM watsonx Orchestrate  │ ─────────────────────────────────────────────> │  (Llama-3-3-70b-instruct)     │
│  (Workflow Engine)        │   Tool Execution via OpenAPI Specs             └───────────────────────────────┘
└───────────────────────────┘
```

---

## ⚙️ 2. Core Architecture Components

### A. Conversation Layer (IBM watsonx Assistant)
- **Role**: Conversational intake interface embedded into the landing page or partner portal.
- **Function**: Guides partner reps through natural language deal capture and renders final proposals directly in chat.

### B. Orchestration Layer (IBM watsonx Orchestrate)
- **Role**: Agentic decision-making and tool execution engine.
- **Function**: Imports `openapi.yaml` custom tools, routes inputs to backend operations, handles human-in-the-loop approvals, and sequences multi-step workflows.

### C. Backend Tool Layer (Node.js Microservice on IBM Cloud Code Engine)
- **Role**: Secured serverless API host.
- **Function**: Provides 4 JSON tool endpoints (`/generate-proposal`, `/draft-followup-email`, `/create-handoff-summary`, `/create-opportunity-stub`) protected by `X-PGC-KEY` authentication and rate limiting.

### D. Foundation AI Layer (IBM watsonx.ai)
- **Role**: Enterprise generative AI & structured reasoning.
- **Function**: Executes LLM textChat requests using `meta-llama/llama-3-3-70b-instruct` with domain-tailored system prompts.

---

## 🔄 3. End-to-End Data Flow

1. **Intake**: Sales rep submits deal context via watsonx Assistant or Landing Page Playground.
2. **Orchestration**: watsonx Orchestrate evaluates the request and selects tool `generate_proposal`.
3. **Execution**: Code Engine receives HTTPS request, verifies `X-PGC-KEY`, and forwards prompt to `@ibm-cloud/watsonx-ai` SDK.
4. **Reasoning**: `watsonx.ai` processes prompt and returns structured JSON (proposal markdown, solution name, recommended IBM stack, outcomes).
5. **Multi-Artifact Generation**: Parallel/sequential tool calls generate customer email, technical handoff summary, and CRM opportunity payload.
6. **Human Approval & CRM Logging**: Rep reviews proposal and approves CRM logging via watsonx Orchestrate.
