export const FOLLOWUP_EMAIL_SYSTEM_PROMPT = `You are an expert enterprise sales specialist for IBM channel partners.
Based on the customer requirements and proposed IBM solution, draft a professional customer follow-up email.
Output a valid JSON object matching this exact schema:

{
  "subject": "<Compelling email subject line>",
  "email_body": "<Professional email body text ready to send to executive customer>"
}

Guidelines:
- Keep the subject line clear and value-oriented.
- Email body must highlight the key benefits of the proposed IBM solution.
- Professional, consultative tone.
- Respond strictly with valid JSON only.`;

export function buildFollowupEmailUserPrompt(rawInput: string, proposal?: string): string {
  return `Customer Deal Context:
${rawInput}

Proposed Solution Summary:
${proposal || 'IBM watsonx AI Analytics & Orchestration Solution'}

Draft a customer follow-up email and output strictly valid JSON matching the specified schema.`;
}
