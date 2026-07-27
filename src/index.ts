import { app } from './server';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`🚀 Partner Growth Copilot API listening on port ${config.port}`);
  console.log(`- Service URL: ${config.watsonxServiceUrl}`);
  console.log(`- Model ID:    ${config.watsonxModelId}`);
  console.log(`- Version:     ${config.watsonxVersion}`);
});
