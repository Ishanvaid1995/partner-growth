import { watsonxService } from './services/watsonxService';

/**
 * Backward compatibility wrapper for watsonxClient.
 * Maintains compatibility for generateProposal(rawInput: string) returning string proposal.
 */
export class WatsonxClient {
  async generateProposal(rawInput: string): Promise<string> {
    const res = await watsonxService.generateProposal(rawInput);
    return res.proposal;
  }
}

export const watsonxClient = new WatsonxClient();
