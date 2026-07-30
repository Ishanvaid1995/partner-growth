import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { watsonxService } from '../services/watsonxService';
import { config } from '../config';
import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';

const router = Router();

const PACKAGE_TRIGGERS = [
  /\bcustomer\s*:/i,
  /\bindustry\s*:/i,
  /\buse\s+case\s*:/i,
  /\bbudget\s*:/i,
  /\bgenerate\s+(a\s+)?(proposal|package|solution|plan)\b/i,
  /\bcreate\s+(a\s+)?(proposal|package|solution|plan)\b/i,
  /\bbuild\s+(a\s+)?(proposal|package)\b/i,
  /\bproposal\s+for\b/i,
  /\bpre.?sales\s+package\b/i,
];

function detectIntent(message: string): 'generate_package' | 'followup' {
  for (const pattern of PACKAGE_TRIGGERS) {
    if (pattern.test(message)) return 'generate_package';
  }
  return 'followup';
}

const CHAT_SYSTEM_PROMPT = `You are Partner Growth Copilot, an expert IBM Pre-Sales AI Assistant built for IBM Business Partners and Solution Engineers.

You help IBM sales teams with:
- Analyzing deal risks and objections
- Explaining IBM product architecture and capabilities
- Suggesting pilot strategies and POC scope
- Answering questions about IBM watsonx, Red Hat, IBM Cloud, and IBM industry solutions
- Refining and adjusting previously generated proposals

You have access to the conversation history below. Use it to give precise, contextually relevant answers.

When answering:
- Be concise and direct — answer exactly what was asked
- Use bullet points for lists (use markdown: - item)
- Use **bold** for IBM product names
- Use markdown tables where useful (| Col | Col |)
- Do NOT regenerate the full proposal unless explicitly asked
- Do NOT say "I'm sorry" or "I can't" — always give your best answer

If the user asks about risks → list the specific technical and commercial risks for THIS deal
If the user asks to adjust budget → propose a revised scope and tradeoffs
If the user asks about a product → explain it in the context of their deal
`;

router.get('/api/chat-service', (req: Request, res: Response): void => {
  res.json({ status: 'online', model: config.watsonxModelId });
});

router.post('/api/chat', apiKeyAuth, async (req: Request, res: Response): Promise<void> => {
  const { message, history = [], conversation_context = '' } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Bad Request', message: 'message is required.' });
    return;
  }

  const intent = detectIntent(message.trim());

  if (intent === 'generate_package') {
    try {
      const packageData = await watsonxService.generateFullOpportunityPackage({
        raw_input: message.trim(),
        industry: detectIndustry(message.trim()),
        account_name: extractAccountName(message.trim()),
      });

      res.json({
        role: 'assistant',
        type: 'proposal',
        content: packageData.proposal?.proposal || '',
        package_data: packageData,
        intent: 'generate_package',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Generation failed', message: err.message });
    }
    return;
  }

  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ];

    if (conversation_context) {
      messages.push({
        role: 'system',
        content: `Deal Context (previously generated package):\n${conversation_context}`,
      });
    }

    const recentHistory = (history as Array<{ role: string; content: string }>).slice(-10);
    for (const turn of recentHistory) {
      if (turn.role && turn.content) {
        messages.push({ role: turn.role, content: String(turn.content) });
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    const service = new WatsonXAI({
      version: config.watsonxVersion,
      serviceUrl: config.watsonxServiceUrl,
      authenticator: new IamAuthenticator({ apikey: config.watsonxApiKey }),
    });

    const response = await service.textChat({
      messages,
      modelId: config.watsonxModelId,
      projectId: config.watsonxProjectId,
      maxTokens: 800,
    });

    const rawContent = response.result?.choices?.[0]?.message?.content || '';

    res.json({
      role: 'assistant',
      type: 'followup',
      content: rawContent.trim(),
      intent: 'followup',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Chat failed', message: err.message });
  }
});

function detectIndustry(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('retail') || lower.includes('e-commerce')) return 'retail';
  if (lower.includes('manufactur') || lower.includes('industrial')) return 'manufacturing';
  if (lower.includes('health') || lower.includes('hospital') || lower.includes('patient')) return 'healthcare';
  if (lower.includes('finance') || lower.includes('bank') || lower.includes('insurance')) return 'financial';
  return 'general';
}

function extractAccountName(input: string): string {
  const match = input.match(/Customer\s*:\s*([^;,\n]+)/i);
  return match ? match[1].trim() : 'Customer Account';
}

export default router;
