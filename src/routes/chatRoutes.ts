import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { config } from '../config';
import { IamTokenManager } from 'ibm-cloud-sdk-core';

const router = Router();

// Configure the IAM Token Manager for Orchestrate API
const tokenManager = new IamTokenManager({
  apikey: config.orchestrateApiKey,
});

router.get('/api/chat-service', (req: Request, res: Response): void => {
  res.json({ status: 'online', mode: 'orchestrate-proxy', agent: config.orchestrateAgentId });
});

router.post('/api/chat', apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  const { message, history = [], conversation_context = '' } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Bad Request', message: 'message is required.' });
    return;
  }

  try {
    const token = await tokenManager.getToken();
    
    // Construct the Orchestrate endpoint based on common Watsonx API patterns
    const baseUrl = config.orchestrateHostUrl.replace(/\/$/, '');
    const agentId = config.orchestrateAgentId;
    
    // Some WxO environments use /v1/orchestrate/{agentId}/chat/completions or similar. 
    // Adjust path if your deployment differs.
    const orchestrateUrl = `${baseUrl}/v1/orchestrate/${agentId}/chat/completions`;

    const messages = [];
    
    // Include the context if it's a follow-up conversation
    if (conversation_context) {
      messages.push({
        role: 'system',
        content: `Deal Context (previously generated package):\n${conversation_context}`
      });
    }

    const recentHistory = (history as Array<{ role: string; content: string }>).slice(-10);
    for (const turn of recentHistory) {
      if (turn.role && turn.content) {
        messages.push({ role: turn.role, content: String(turn.content) });
      }
    }
    messages.push({ role: 'user', content: message.trim() });

    console.log(`[Proxy] Sending message to Orchestrate Agent ${agentId}...`);
    
    const response = await fetch(orchestrateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        messages,
        stream: false,
        agentEnvironmentId: config.orchestrateEnvironmentId
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Orchestrate API Error]', response.status, errText);
      res.status(response.status).json({ error: 'Orchestrate Agent Error', details: errText });
      return;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    
    console.log('[Proxy] Received response from Orchestrate Agent');

    // Attempt to parse out structured data if Orchestrate returned a JSON payload
    let parsedPackage = null;
    let isProposal = false;
    let isEmail = false;

    // Check if Orchestrate generated a package based on the text or embedded JSON
    try {
      const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) || rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const potentialJson = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(potentialJson);
        if (parsed.proposal || parsed.handoff_summary || parsed.crm_stub || parsed.recommended_ibm_stack) {
          parsedPackage = parsed;
          isProposal = true;
        } else if (parsed.email_body || parsed.subject) {
          parsedPackage = parsed;
          isEmail = true;
        }
      }
    } catch(e) {
      // Not structured JSON or unparseable, handle as regular text
    }

    // Heuristic fallbacks if JSON parsing failed but structure is detected
    if (!parsedPackage) {
      if (rawContent.includes('Solution Name:') || rawContent.includes('Recommended IBM Stack') || rawContent.includes('### 1. CRM Opportunity Stub')) {
        isProposal = true;
        // The UI's parseMarkdownToHtml will handle raw markdown rendering if we just pass it in proposal text
        parsedPackage = {
          proposal: {
            proposal: rawContent
          }
        };
      } else if (rawContent.includes('Subject:') && (rawContent.includes('Dear') || rawContent.includes('Hi'))) {
        isEmail = true;
        parsedPackage = {
          email_body: rawContent
        };
      }
    }

    if (isProposal) {
      res.json({
        role: 'assistant',
        type: 'proposal',
        assistant_message: parsedPackage?.proposal?.proposal || rawContent,
        content: rawContent,
        package_data: parsedPackage,
        intent: 'generate_package'
      });
    } else if (isEmail) {
      res.json({
        role: 'assistant',
        type: 'email',
        assistant_message: rawContent,
        content: rawContent,
        email_data: parsedPackage,
        intent: 'draft_email'
      });
    } else {
      res.json({
        role: 'assistant',
        type: 'followup',
        content: rawContent,
        intent: 'followup'
      });
    }

  } catch (err: any) {
    console.error('[chatRoutes Proxy Error]', err);
    res.status(500).json({ error: 'Proxy failed', message: err.message });
  }
});

export default router;
