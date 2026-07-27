export const OPPORTUNITY_SYSTEM_PROMPT = `You are an enterprise CRM administrator for IBM partner operations.
Extract structured sales opportunity information from the customer context and proposed solution.
Output a valid JSON object matching this exact schema:

{
  "opportunity_name": "<Structured Opportunity Name e.g. Acme Retail - watsonx AI Transformation>",
  "account_name": "<Customer Account Name>",
  "stage": "Qualification",
  "notes": "<Brief CRM deal overview and key IBM components>",
  "estimated_value": "<Estimated deal size based on context budget or target range e.g. $100,000 USD>"
}

Guidelines:
- Extract or infer the customer account name accurately.
- Stage must be set to "Qualification".
- Value should reflect input budget or estimated scope.
- Respond strictly with valid JSON only.`;

export function buildOpportunityUserPrompt(
  rawInput: string,
  proposal?: string,
  customerName?: string
): string {
  return `Customer Deal Context:
${rawInput}

Explicit Customer Name: ${customerName || 'Extracted from context'}
Proposed Solution Overview:
${proposal || 'IBM watsonx solution proposal'}

Generate CRM opportunity stub data and output strictly valid JSON matching the specified schema.`;
}
