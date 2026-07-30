import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';
import { config, validateWatsonxConfig } from '../config';
import { evaluateDealInput, DealScoreResult } from './dealScorer';
import {
  PROPOSAL_SYSTEM_PROMPT,
  buildProposalUserPrompt,
} from '../prompts/proposalPrompt';
import {
  FOLLOWUP_EMAIL_SYSTEM_PROMPT,
  buildFollowupEmailUserPrompt,
} from '../prompts/followupEmailPrompt';
import {
  HANDOFF_SUMMARY_SYSTEM_PROMPT,
  buildHandoffSummaryUserPrompt,
} from '../prompts/handoffSummaryPrompt';
import {
  OPPORTUNITY_SYSTEM_PROMPT,
  buildOpportunityUserPrompt,
} from '../prompts/opportunityPrompt';
import {
  DEAL_COACH_SYSTEM_PROMPT,
  buildDealCoachUserPrompt,
} from '../prompts/dealCoachPrompt';
import {
  PILOT_SYSTEM_PROMPT,
  buildPilotUserPrompt,
} from '../prompts/pilotPrompt';
import {
  RED_TEAM_SYSTEM_PROMPT,
  buildRedTeamUserPrompt,
} from '../prompts/redTeamPrompt';

export interface ProposalResult {
  proposal: string;
  solution_name: string;
  recommended_ibm_stack: string[];
  business_outcomes: string[];
}

export interface EmailResult {
  subject: string;
  email_body: string;
}

export interface HandoffResult {
  summary: string;
  next_steps: string[];
  risks: string[];
}

export interface OpportunityResult {
  opportunity_name: string;
  account_name: string;
  stage: string;
  notes: string;
  estimated_value: string;
}

export interface FullPackageParams {
  raw_input: string;
  industry?: string;
  account_name?: string;
  use_case?: string;
}

export interface FullPackageResult {
  proposal: ProposalResult;
  followup_email: EmailResult;
  handoff_summary: HandoffResult;
  crm_stub: OpportunityResult;
  deal_score: {
    score: number;
    reasoning: string[];
    missing_fields: string[];
    recommended_path: string;
  };
  next_best_actions: string[];
}

export interface DealCoachResult {
  readiness_score: number;
  readiness_label: string;
  missing_information: string[];
  risks: string[];
  next_best_actions: string[];
  coaching_notes: string;
}

export interface PilotResult {
  pilot_name: string;
  smallest_viable_pilot: string;
  recommended_ibm_products: string[];
  estimated_scope: {
    duration_weeks: number;
    team_size: number;
    estimated_cost_usd: string;
  };
  success_kpis: string[];
  expansion_path: string;
  quick_wins: string[];
}

export interface RedTeamResult {
  likely_objections: Array<{
    objection: string;
    stakeholder: string;
    severity: string;
    suggested_response: string;
  }>;
  commercial_risks: string[];
  technical_risks: string[];
  competitive_threats: string[];
  deal_breakers: string[];
}

function repairAndSanitizeJson(rawStr: string): string {
  let str = rawStr.trim();
  str = str.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();

  let inString = false;
  let isEscaped = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
    }

    if (char === '\\' && !isEscaped) {
      isEscaped = true;
    } else {
      isEscaped = false;
    }
  }

  return result;
}

function cleanProposalText(text: string): string {
  if (!text) return '';
  let clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

  if (clean.includes('"solution_name"') || clean.startsWith('{')) {
    const match = clean.match(/"proposal"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"|\s*\}$)/);
    if (match && match[1]) {
      clean = match[1];
    } else {
      clean = clean
        .replace(/",\s*"solution_name"[\s\S]*/i, '')
        .replace(/^\{\s*"proposal"\s*:\s*"/i, '')
        .replace(/",\s*"recommended_ibm_stack"[\s\S]*/i, '')
        .replace(/\s*\}\s*$/, '');
    }
  }

  return clean
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/^"|"$/g, '')
    .trim();
}

export class WatsonxService {
  private service: WatsonXAI | null = null;

  private getService(): WatsonXAI {
    if (!this.service) {
      validateWatsonxConfig();
      this.service = new WatsonXAI({
        version: config.watsonxVersion,
        serviceUrl: config.watsonxServiceUrl,
        authenticator: new IamAuthenticator({
          apikey: config.watsonxApiKey,
        }),
      });
    }
    return this.service;
  }

  /**
   * Safe helper to execute textChat and parse JSON results cleanly.
   */
  private async executeChat<T>(
    systemPrompt: string,
    userPrompt: string,
    fallbackBuilder: (rawText: string) => T
  ): Promise<T> {
    const service = this.getService();

    const params = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      modelId: config.watsonxModelId,
      projectId: config.watsonxProjectId,
      maxTokens: 1000,
    };

    try {
      const response = await service.textChat(params);
      let rawContent = response.result?.choices?.[0]?.message?.content || '';

      if (!rawContent.trim()) {
        throw new Error('watsonx.ai returned an empty response string');
      }

      // Repair & sanitize unescaped control characters in JSON strings
      const sanitizedJsonStr = repairAndSanitizeJson(rawContent);

      try {
        const parsed = JSON.parse(sanitizedJsonStr) as any;

        if (parsed.email_body && typeof parsed.email_body === 'string') {
          parsed.email_body = parsed.email_body
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/^"|"$/g, '')
            .trim();
        }

        if (parsed.proposal) {
          if (typeof parsed.proposal === 'string') {
            parsed.proposal = parsed.proposal
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .replace(/\\n/g, '\n')
              .trim();
          } else if (typeof parsed.proposal === 'object') {
            parsed.solution_name = parsed.proposal.solution_name || parsed.solution_name || 'IBM Pre-Sales Solution';
            parsed.recommended_ibm_stack = parsed.proposal.recommended_ibm_stack || parsed.recommended_ibm_stack;
            parsed.business_outcomes = parsed.proposal.business_outcomes || parsed.business_outcomes;
            parsed.proposal = parsed.proposal.proposal || JSON.stringify(parsed.proposal);
          }
        }

        return parsed as T;
      } catch (parseError) {
        console.warn('[watsonxService] JSON parse failed, utilizing fallback formatter:', parseError);
        return fallbackBuilder(cleanProposalText(rawContent));
      }
    } catch (err: any) {
      console.error('[watsonxService Error]', {
        message: err?.message || err,
        status: err?.status || err?.code,
      });
      throw err;
    }
  }

  /**
   * Generates structured IBM Solution Proposal.
   */
  async generateProposal(rawInput: string, industry?: string): Promise<ProposalResult> {
    return this.executeChat<ProposalResult>(
      PROPOSAL_SYSTEM_PROMPT,
      buildProposalUserPrompt(rawInput, industry),
      (rawText) => {
        const lower = (rawInput + ' ' + (industry || '')).toLowerCase();
        let solution_name = 'IBM Enterprise AI & Automation Solution';
        let recommended_ibm_stack = ['IBM watsonx.ai', 'IBM watsonx Orchestrate', 'IBM watsonx.data', 'Red Hat OpenShift'];

        if (lower.includes('manufactur') || lower.includes('industrial') || lower.includes('iot') || lower.includes('predictive maintenance')) {
          solution_name = 'IBM Predictive Maintenance for Industrial & Automotive';
          recommended_ibm_stack = ['IBM Watson IoT', 'IBM Cloud Pak for Data', 'IBM Watson Studio', 'IBM Cloud Pak for Automation', 'Red Hat OpenShift'];
        } else if (lower.includes('retail') || lower.includes('e-commerce')) {
          solution_name = 'IBM Retail Analytics & Personalization Solution';
          recommended_ibm_stack = ['IBM watsonx.ai', 'IBM watsonx Orchestrate', 'IBM watsonx.data', 'Red Hat OpenShift'];
        } else if (lower.includes('health') || lower.includes('patient') || lower.includes('hospital')) {
          solution_name = 'IBM Healthcare Virtual Agent & EHR Solution';
          recommended_ibm_stack = ['IBM watsonx Assistant', 'IBM watsonx.ai', 'IBM Cloud Pak for Data', 'Red Hat OpenShift'];
        }

        return {
          proposal: cleanProposalText(rawText),
          solution_name,
          recommended_ibm_stack,
          business_outcomes: [
            'Accelerated operational decision-making',
            'Automated partner pre-sales workflows',
            'Enhanced governance and compliance',
          ],
        };
      }
    );
  }

  /**
   * Drafts customer follow-up email.
   */
  async draftFollowupEmail(rawInput: string, proposal?: string): Promise<EmailResult> {
    return this.executeChat<EmailResult>(
      FOLLOWUP_EMAIL_SYSTEM_PROMPT,
      buildFollowupEmailUserPrompt(rawInput, proposal),
      (rawText) => ({
        subject: 'Follow-up: IBM Solution Proposal Overview',
        email_body: rawText.replace(/\\n/g, '\n').trim(),
      })
    );
  }

  /**
   * Creates internal technical handoff summary.
   */
  async createHandoffSummary(rawInput: string, proposal?: string): Promise<HandoffResult> {
    return this.executeChat<HandoffResult>(
      HANDOFF_SUMMARY_SYSTEM_PROMPT,
      buildHandoffSummaryUserPrompt(rawInput, proposal),
      (rawText) => ({
        summary: rawText,
        next_steps: [
          'Schedule technical architecture deep dive',
          'Provision watsonx project workspace',
          'Validate data connector credentials',
        ],
        risks: [
          'Ensure network access to regional cloud endpoints',
          'Verify IAM permissions for API key execution',
        ],
      })
    );
  }

  /**
   * Creates CRM opportunity stub payload.
   */
  async createOpportunityStub(
    rawInput: string,
    proposal?: string,
    customerName?: string
  ): Promise<OpportunityResult> {
    return this.executeChat<OpportunityResult>(
      OPPORTUNITY_SYSTEM_PROMPT,
      buildOpportunityUserPrompt(rawInput, proposal, customerName),
      (rawText) => ({
        opportunity_name: `${customerName || 'Customer'} - IBM watsonx AI Transformation`,
        account_name: customerName || 'Customer Account',
        stage: 'Qualification',
        notes: rawText || 'Captured via Partner Growth Copilot AI Agent',
        estimated_value: '$100,000 USD',
      })
    );
  }

  /**
   * Evaluates deal intake and scores opportunity readiness.
   */
  scoreOpportunity(rawInput: string, industry?: string): DealScoreResult {
    return evaluateDealInput(rawInput, industry);
  }

  /**
   * Deal Coach: evaluates deal readiness with structured coaching feedback.
   */
  async dealCoach(rawInput: string, industry?: string): Promise<DealCoachResult> {
    return this.executeChat<DealCoachResult>(
      DEAL_COACH_SYSTEM_PROMPT,
      buildDealCoachUserPrompt(rawInput, industry),
      (rawText) => ({
        readiness_score: 50,
        readiness_label: 'Needs Work',
        missing_information: ['Budget specifics', 'Decision-maker name', 'Timeline clarity'],
        risks: ['Scope may be too broad for initial engagement'],
        next_best_actions: ['Schedule discovery call', 'Identify executive sponsor', 'Define success criteria'],
        coaching_notes: rawText.substring(0, 300),
      })
    );
  }

  /**
   * Pilot Recommendation: recommends smallest viable IBM pilot.
   */
  async pilotRecommendation(rawInput: string, industry?: string): Promise<PilotResult> {
    return this.executeChat<PilotResult>(
      PILOT_SYSTEM_PROMPT,
      buildPilotUserPrompt(rawInput, industry),
      (rawText) => ({
        pilot_name: 'IBM watsonx Discovery Pilot',
        smallest_viable_pilot: rawText.substring(0, 200),
        recommended_ibm_products: ['IBM watsonx.ai', 'IBM watsonx Orchestrate'],
        estimated_scope: { duration_weeks: 6, team_size: 3, estimated_cost_usd: '$30,000 - $50,000' },
        success_kpis: ['Time-to-insight reduction', 'Automation rate improvement', 'User adoption rate'],
        expansion_path: 'Pilot success validates full enterprise deployment.',
        quick_wins: ['First AI model deployed in week 1', 'Stakeholder demo in week 2'],
      })
    );
  }

  /**
   * Red Team Analysis: surfaces objections, risks, and competitive threats.
   */
  async redTeamAnalysis(rawInput: string, industry?: string): Promise<RedTeamResult> {
    return this.executeChat<RedTeamResult>(
      RED_TEAM_SYSTEM_PROMPT,
      buildRedTeamUserPrompt(rawInput, industry),
      (rawText) => ({
        likely_objections: [
          { objection: 'Why IBM over AWS/Azure?', stakeholder: 'CTO', severity: 'high', suggested_response: 'IBM watsonx provides enterprise governance and hybrid cloud flexibility that hyperscalers lack.' },
        ],
        commercial_risks: ['Budget may not cover full implementation scope'],
        technical_risks: ['Data integration complexity with legacy systems'],
        competitive_threats: ['AWS Bedrock', 'Azure OpenAI Service', 'Google Vertex AI'],
        deal_breakers: ['No executive sponsor identified'],
      })
    );
  }

  /**
   * Generates complete pre-sales opportunity package: proposal, email, handoff, CRM stub, deal score, & actions.
   */
  async generateFullOpportunityPackage(params: FullPackageParams): Promise<FullPackageResult> {
    const combinedInput = [
      params.account_name ? `Account Name: ${params.account_name}` : '',
      params.industry ? `Industry: ${params.industry}` : '',
      params.use_case ? `Use Case: ${params.use_case}` : '',
      params.raw_input,
    ].filter(Boolean).join('\n');

    // 1. Generate Proposal
    const proposalRes = await this.generateProposal(combinedInput, params.industry);

    // 2. Draft Follow-up Email
    const emailRes = await this.draftFollowupEmail(combinedInput, proposalRes.proposal);

    // 3. Create Handoff Summary
    const handoffRes = await this.createHandoffSummary(combinedInput, proposalRes.proposal);

    // 4. Create CRM Opportunity Stub
    const crmRes = await this.createOpportunityStub(combinedInput, proposalRes.proposal, params.account_name);

    // 5. Evaluate Deal Score & Next Best Actions
    const dealScore = this.scoreOpportunity(combinedInput, params.industry);

    return {
      proposal: proposalRes,
      followup_email: emailRes,
      handoff_summary: handoffRes,
      crm_stub: crmRes,
      deal_score: {
        score: dealScore.score,
        reasoning: dealScore.reasoning,
        missing_fields: dealScore.missing_fields,
        recommended_path: dealScore.recommended_path,
      },
      next_best_actions: dealScore.next_best_actions,
    };
  }
}

export const watsonxService = new WatsonxService();
