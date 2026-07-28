# IBM watsonx Orchestrate Tool & Workflow Integration Guide

This guide provides step-by-step instructions for importing the **Partner Growth Copilot** OpenAPI specification into **IBM watsonx Orchestrate**, creating custom tools, and building the autonomous **"End-to-End Partner Solution Workflow"**.

---

## 🛠️ Step 1: Import OpenAPI Spec into watsonx Orchestrate

1. Log into your **IBM watsonx Orchestrate** instance.
2. In the left navigation menu, click **Skill studio** (or **Tools** → **Add custom tool**).
3. Select **Import OpenAPI specification**.
4. Choose **Upload file** and select [openapi.yaml](file:///Users/ishanvaid/Desktop/Narnel%20tech/IBM_project/openapi.yaml) (or [openapi/partner-growth-openapi.json](file:///Users/ishanvaid/Desktop/Narnel%20tech/IBM_project/openapi/partner-growth-openapi.json)).
5. Click **Next**.

---

## 🔐 Step 2: Configure Tool Connection & Authentication

1. Under **Server configuration**, verify the server URL is set to:
   `https://partner-growth.2csujuhkf3ha.ca-tor.codeengine.appdomain.cloud`
2. Under **Authentication**:
   - **Authentication type**: Select **API Key** (Header).
   - **Header Name**: `x-api-key` (Recommended for watsonx Orchestrate; `X-PGC-KEY` or `Authorization: Bearer <key>` also supported for backward compatibility).
   - **API Key Value**: Enter your secret `PGC_API_KEY` (default: `pgc-secret-key-123`).
3. Click **Connect & Save**.

---

## 🧰 Step 3: Register Custom Tools

watsonx Orchestrate will automatically detect the 5 operations defined in the OpenAPI spec:

| Operation ID | Tool Name | Tool Description |
| :--- | :--- | :--- |
| `generate_proposal` | **Generate IBM Solution Proposal** | Creates structured IBM proposal, architecture summary, & stack recommendations. |
| `draft_followup_email` | **Draft Customer Follow-Up Email** | Formats an executive customer-ready follow-up email. |
| `create_handoff_summary` | **Create Internal Handoff Summary** | Generates engineering scope, next steps, & implementation risks. |
| `create_opportunity_stub` | **Create CRM Opportunity Stub** | Prepares structured Salesforce/HubSpot opportunity payload. |
| `health_check` | **Check Service Health** | Verifies operational status of Code Engine microservice. |

Click **Publish all tools** to make them available to your AI agents.

---

## 🤖 Step 4: Create the "Partner Growth Orchestrator" Agent

1. Navigate to **Agents** → Click **Create Agent**.
2. **Agent Name**: `Partner Growth Orchestrator`
3. **Description**: `Autonomous pre-sales AI agent automating end-to-end partner solution design, email drafting, technical handoff, and CRM opportunity creation.`
4. **Model**: Select `IBM Granite` or `Llama-3.3-70b-instruct`.
5. Under **Tools**, attach the 4 published tools:
   - `generate_proposal`
   - `draft_followup_email`
   - `create_handoff_summary`
   - `create_opportunity_stub`

---

## 🔄 Step 5: Build the "End-to-End Partner Solution Workflow"

Create an automated workflow sequence in watsonx Orchestrate:

```text
[1. User Context Intake] ➔ [2. generate_proposal] ➔ [3. draft_followup_email]
                                                             │
                                                             ▼
[6. create_opportunity_stub] ◀─ [5. Human Approval Step] ◀─ [4. create_handoff_summary]
```

### Workflow Step Breakdown:
1. **Intake Step**: Capture user deal parameters string (`raw_input`).
2. **Tool 1 (`generate_proposal`)**: Input `raw_input` → Output `proposal`, `solution_name`, `recommended_ibm_stack`.
3. **Tool 2 (`draft_followup_email`)**: Input `raw_input` + `proposal` → Output `subject`, `email_body`.
4. **Tool 3 (`create_handoff_summary`)**: Input `raw_input` + `proposal` → Output `summary`, `next_steps`, `risks`.
5. **Human-in-the-Loop Approval Step**: Prompt the partner rep: *"Review generated IBM proposal and email. Approve opportunity creation?"*
6. **Tool 4 (`create_opportunity_stub`)**: On approval, execute `create_opportunity_stub` to log the deal.

---

## 🧪 Step 6: Test the Workflow End-to-End

1. Open the chat test bar in watsonx Orchestrate.
2. Enter the prompt:
   > *"Run pre-sales automation for Acme Retail in the retail industry. Use case: AI analytics for inventory prediction. Budget: $100k, Timeline: Q4."*
3. Watch the **Partner Growth Orchestrator** sequence tools in real time:
   - ✅ Generates IBM Solution Proposal
   - ✅ Drafts Follow-up Email
   - ✅ Formats Technical Handoff Summary
   - ⏸️ Pauses for Human Approval
   - ✅ Creates CRM Opportunity Stub
