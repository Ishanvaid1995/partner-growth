import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  pgcApiKey: string;
  watsonxServiceUrl: string;
  watsonxProjectId: string;
  watsonxModelId: string;
  watsonxVersion: string;
  watsonxApiKey: string;
  orchestrateHostUrl: string;
  orchestrateAgentId: string;
  orchestrateEnvironmentId: string;
  orchestrateApiKey: string;
  salesforceClientId: string;
  salesforceClientSecret: string;
  salesforceMyDomainUrl: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  pgcApiKey: process.env.PGC_API_KEY || 'default-secret-key-change-me',
  watsonxServiceUrl: process.env.WATSONX_SERVICE_URL || 'https://ca-tor.ml.cloud.ibm.com',
  watsonxProjectId: process.env.WATSONX_PROJECT_ID || '',
  watsonxModelId: process.env.WATSONX_MODEL_ID || 'meta-llama/llama-3-3-70b-instruct',
  watsonxVersion: process.env.WATSONX_VERSION || '2024-05-31',
  watsonxApiKey: process.env.WATSONX_API_KEY || '',
  orchestrateHostUrl: process.env.ORCHESTRATE_HOST_URL || 'https://api.ca-tor.watson-orchestrate.cloud.ibm.com/instances/dcf235a5-27f4-4e1c-bfb1-65b3e1cf5d66',
  orchestrateAgentId: process.env.ORCHESTRATE_AGENT_ID || '255fce2b-bf14-4c1a-8b55-2633e1ecbbce',
  orchestrateEnvironmentId: process.env.ORCHESTRATE_ENVIRONMENT_ID || 'd6d7e725-8c1b-401f-8bf0-8ebe14c4afcd',
  orchestrateApiKey: process.env.ORCHESTRATE_API_KEY || process.env.WATSONX_API_KEY || '',
  salesforceClientId: process.env.SALESFORCE_CLIENT_ID || '',
  salesforceClientSecret: process.env.SALESFORCE_CLIENT_SECRET || '',
  salesforceMyDomainUrl: process.env.SALESFORCE_MY_DOMAIN_URL || '',
};

export function validateWatsonxConfig(): void {
  const missing: string[] = [];
  if (!config.watsonxApiKey) missing.push('WATSONX_API_KEY');
  if (!config.watsonxProjectId) missing.push('WATSONX_PROJECT_ID');

  if (missing.length > 0) {
    throw new Error(`Missing required watsonx environment variables: ${missing.join(', ')}`);
  }
}
