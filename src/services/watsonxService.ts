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

      // Stripping backticks & json wrappers
      let cleanJson = rawContent
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      try {
        const parsed = JSON.parse(cleanJson) as any;
        
        // Clean up email_body if nested string escaping exists
        if (parsed.email_body && typeof parsed.email_body === 'string') {
          parsed.email_body = parsed.email_body
            .replace(/\\n/g, '\n')
            .replace(/^"|"$/g, '')
            .trim();
        }

        return parsed as T;
      } catch (parseError) {
        console.warn('[watsonxService] JSON parse failed, utilizing fallback formatter:', parseError);
        return fallbackBuilder(rawContent);
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
      (rawText) => ({
        proposal: rawText,
        solution_name: 'IBM watsonx Enterprise Solution',
        recommended_ibm_stack: [
          'IBM watsonx.ai',
          'IBM watsonx Orchestrate',
          'IBM watsonx.data',
        ],
        business_outcomes: [
          'Accelerated operational decision-making',
          'Automated partner pre-sales workflows',
          'Enhanced governance and compliance',
        ],
      })
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
