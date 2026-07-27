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
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  pgcApiKey: process.env.PGC_API_KEY || 'default-secret-key-change-me',
  watsonxServiceUrl: process.env.WATSONX_SERVICE_URL || 'https://ca-tor.ml.cloud.ibm.com',
  watsonxProjectId: process.env.WATSONX_PROJECT_ID || '',
  watsonxModelId: process.env.WATSONX_MODEL_ID || 'meta-llama/llama-3-3-70b-instruct',
  watsonxVersion: process.env.WATSONX_VERSION || '2024-05-31',
  watsonxApiKey: process.env.WATSONX_API_KEY || '',
};

export function validateWatsonxConfig(): void {
  const missing: string[] = [];
  if (!config.watsonxApiKey) missing.push('WATSONX_API_KEY');
  if (!config.watsonxProjectId) missing.push('WATSONX_PROJECT_ID');

  if (missing.length > 0) {
    throw new Error(`Missing required watsonx environment variables: ${missing.join(', ')}`);
  }
}
