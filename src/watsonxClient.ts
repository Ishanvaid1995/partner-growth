import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';
import { config, validateWatsonxConfig } from './config';

const SYSTEM_PROMPT = `You are a senior IBM solution architect designing IBM‑centric solutions for channel partners. The user just provided the customer name, industry, and deal context in the previous message. Use that information plus your own reasoning to propose a solution that primarily uses IBM watsonx, watsonx Orchestrate, and related IBM services. Output a concise proposal with sections: Overview, Architecture summary, Key IBM components, Business benefits, and Next steps. Keep it under 500 words and assume the audience is technical + business.`;

export class WatsonxClient {
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
   * Generates an IBM-centric solution proposal using watsonx.ai textChat Runtime API.
   * @param rawInput Deal context provided from watsonx Assistant or API call.
   * @returns Generated solution proposal string.
   */
  async generateProposal(rawInput: string): Promise<string> {
    const service = this.getService();

    const params = {
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: rawInput,
        },
      ],
      modelId: config.watsonxModelId,
      projectId: config.watsonxProjectId,
      maxTokens: 800,
    };

    try {
      const response = await service.textChat(params);

      if (
        response.result &&
        response.result.choices &&
        response.result.choices.length > 0
      ) {
        const content = response.result.choices[0].message?.content;
        if (content) {
          return content.trim();
        }
      }

      throw new Error('watsonx.ai returned an empty response choices array');
    } catch (error: any) {
      // Log detailed error server-side without exposing API keys
      console.error('[watsonxClient Error]', {
        message: error?.message || 'Unknown error during watsonx textChat execution',
        status: error?.status || error?.code,
        details: error?.body || error?.stack,
      });
      throw error;
    }
  }
}

export const watsonxClient = new WatsonxClient();
