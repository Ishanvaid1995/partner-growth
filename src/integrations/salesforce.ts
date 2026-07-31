import { config } from '../config';

export interface SalesforceOpportunityInput {
  opportunity_name?: string;
  opportunityname?: string;
  Name?: string;
  account_name?: string;
  accountname?: string;
  Account?: string;
  stage?: string;
  StageName?: string;
  notes?: string;
  Description?: string;
  estimated_value?: string | number;
  estimatedvalue?: string | number;
  Amount?: string | number;
  close_date?: string;
  CloseDate?: string;
}

export interface SalesforceOpportunityResponse {
  success: boolean;
  salesforce_opportunity_id: string;
  salesforceopportunityid: string;
  salesforce_url: string;
  salesforceurl: string;
  account_id: string;
  account_name: string;
  opportunity_name: string;
  stage: string;
  amount?: number;
  close_date: string;
  display_message: string;
}

interface TokenCache {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

function sanitizeMyDomainUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Fetch and cache Salesforce OAuth 2.0 Access Token using Client Credentials Flow.
 * Never logs access token or client secret.
 */
export async function getSalesforceAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  const domainUrl = sanitizeMyDomainUrl(config.salesforceMyDomainUrl);
  const clientId = (config.salesforceClientId || '').trim();
  const clientSecret = (config.salesforceClientSecret || '').trim();

  if (!domainUrl || !clientId || !clientSecret) {
    throw new Error(
      'Salesforce configuration incomplete. Please set SALESFORCE_MY_DOMAIN_URL, SALESFORCE_CLIENT_ID, and SALESFORCE_CLIENT_SECRET in your environment.'
    );
  }

  const now = Date.now();
  // Return cached token if valid for at least another 60 seconds
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return {
      accessToken: cachedToken.accessToken,
      instanceUrl: cachedToken.instanceUrl,
    };
  }

  const tokenEndpoint = `${domainUrl}/services/oauth2/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (err: any) {
    throw new Error(`Failed to connect to Salesforce OAuth endpoint at ${domainUrl}: ${err?.message || err}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`Salesforce OAuth authentication failed [${response.status}]: ${errorMsg}`);
  }

  const accessToken = data.access_token;
  const instanceUrl = sanitizeMyDomainUrl(data.instance_url || domainUrl);
  const issuedAt = parseInt(data.issued_at || String(now), 10);
  // Default expiry 2 hours (7200 seconds) minus 5 minutes buffer
  const expiresInMs = 7200 * 1000 - 300 * 1000;
  const expiresAt = issuedAt + expiresInMs;

  if (!accessToken) {
    throw new Error('Salesforce OAuth token response missing access_token.');
  }

  cachedToken = {
    accessToken,
    instanceUrl,
    expiresAt,
  };

  return { accessToken, instanceUrl };
}

/**
 * Query for an Account by Name in Salesforce (SOQL).
 * If found, returns existing Account ID.
 * If not found, creates a new Account and returns its ID.
 */
export async function getOrCreateSalesforceAccount(
  rawAccountName: string,
  accessToken: string,
  instanceUrl: string
): Promise<{ accountId: string; accountName: string }> {
  const accountName = (rawAccountName || '').trim() || 'Default Customer Account';
  const escapedName = accountName.replace(/'/g, "\\'");

  const queryUrl = `${instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(
    `SELECT Id, Name FROM Account WHERE Name = '${escapedName}' LIMIT 1`
  )}`;

  const queryRes = await fetch(queryUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (queryRes.ok) {
    const queryData = await queryRes.json().catch(() => ({}));
    if (Array.isArray(queryData.records) && queryData.records.length > 0) {
      return {
        accountId: queryData.records[0].Id,
        accountName: queryData.records[0].Name || accountName,
      };
    }
  }

  // Account not found or query failed; create a new Account
  const createAccountUrl = `${instanceUrl}/services/data/v60.0/sobjects/Account/`;
  const createRes = await fetch(createAccountUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Name: accountName,
      Description: 'Account auto-created by Partner Growth Copilot integration.',
    }),
  });

  const createData = await createRes.json().catch(() => ({}));

  if (!createRes.ok) {
    const errorDetails = Array.isArray(createData)
      ? createData.map((e: any) => `${e.errorCode || ''}: ${e.message || ''}`).join('; ')
      : JSON.stringify(createData);
    throw new Error(`Failed to create Salesforce Account "${accountName}" [${createRes.status}]: ${errorDetails}`);
  }

  if (!createData.id) {
    throw new Error('Salesforce Account creation response missing record id.');
  }

  return {
    accountId: createData.id,
    accountName,
  };
}

/**
 * Parse monetary string into numeric value.
 * Example: "$150,000 USD" -> 150000
 */
function parseAmount(val?: string | number): number | undefined {
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  if (!val || typeof val !== 'string') return undefined;

  const cleaned = val.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Standardize Salesforce StageName values to standard Developer org picklist values.
 */
function normalizeStageName(rawStage?: string): string {
  const stage = (rawStage || '').trim();
  if (!stage) return 'Qualification';

  const lower = stage.toLowerCase();
  if (lower.includes('prospect')) return 'Prospecting';
  if (lower.includes('qualif')) return 'Qualification';
  if (lower.includes('need') || lower.includes('analys')) return 'Needs Analysis';
  if (lower.includes('value') || lower.includes('prop')) return 'Value Proposition';
  if (lower.includes('decision')) return 'Id. Decision Makers';
  if (lower.includes('perception')) return 'Perception Analysis';
  if (lower.includes('proposal') || lower.includes('quote')) return 'Proposal/Price Quote';
  if (lower.includes('negotiat') || lower.includes('review')) return 'Negotiation/Review';
  if (lower.includes('won')) return 'Closed Won';
  if (lower.includes('lost')) return 'Closed Lost';

  return 'Qualification';
}

/**
 * Calculate default CloseDate (+90 days from today formatted as YYYY-MM-DD).
 */
function getDefaultCloseDate(providedDate?: string): string {
  if (providedDate && /^\d{4}-\d{2}-\d{2}$/.test(providedDate.trim())) {
    return providedDate.trim();
  }
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().split('T')[0];
}

/**
 * Creates a real Opportunity record in Salesforce based on CRM stub data.
 */
export async function createSalesforceOpportunity(
  input: SalesforceOpportunityInput
): Promise<SalesforceOpportunityResponse> {
  const { accessToken, instanceUrl } = await getSalesforceAccessToken();

  const rawAccountName = input.account_name || input.accountname || input.Account || 'Default Account';
  const rawOpportunityName = input.opportunity_name || input.opportunityname || input.Name || 'IBM Pre-Sales Opportunity';
  const rawStage = input.stage || input.StageName || 'Qualification';
  const rawNotes = input.notes || input.Description || 'Qualified pre-sales deal context generated by Partner Growth Copilot.';
  const rawAmount = input.estimated_value ?? input.estimatedvalue ?? input.Amount;
  const rawCloseDate = input.close_date || input.CloseDate;

  // 1. Get or create Account in Salesforce
  const { accountId, accountName } = await getOrCreateSalesforceAccount(rawAccountName, accessToken, instanceUrl);

  // 2. Prepare Opportunity payload fields
  const opportunityName = rawOpportunityName.trim();
  const stageName = normalizeStageName(rawStage);
  const closeDate = getDefaultCloseDate(rawCloseDate);
  const amount = parseAmount(rawAmount);
  const description = (typeof rawNotes === 'string' ? rawNotes : JSON.stringify(rawNotes)).trim();

  const oppBody: Record<string, any> = {
    Name: opportunityName,
    AccountId: accountId,
    StageName: stageName,
    CloseDate: closeDate,
    Description: description,
  };

  if (amount !== undefined) {
    oppBody.Amount = amount;
  }

  // 3. POST to Salesforce sobjects/Opportunity/
  const createOppUrl = `${instanceUrl}/services/data/v60.0/sobjects/Opportunity/`;
  const oppRes = await fetch(createOppUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(oppBody),
  });

  const oppData = await oppRes.json().catch(() => ({}));

  if (!oppRes.ok) {
    const errorDetails = Array.isArray(oppData)
      ? oppData.map((e: any) => `[${e.errorCode || 'ERROR'}]: ${e.message || ''} (Fields: ${(e.fields || []).join(', ')})`).join('; ')
      : JSON.stringify(oppData);
    throw new Error(`Salesforce Opportunity creation failed [${oppRes.status}]: ${errorDetails}`);
  }

  const oppId = oppData.id;
  if (!oppId) {
    throw new Error('Salesforce Opportunity creation response missing record id.');
  }

  const salesforceUrl = `${instanceUrl}/lightning/r/Opportunity/${oppId}/view`;

  return {
    success: true,
    salesforce_opportunity_id: oppId,
    salesforceopportunityid: oppId,
    salesforce_url: salesforceUrl,
    salesforceurl: salesforceUrl,
    account_id: accountId,
    account_name: accountName,
    opportunity_name: opportunityName,
    stage: stageName,
    amount,
    close_date: closeDate,
    display_message: `Successfully created Salesforce Opportunity "${opportunityName}" (ID: ${oppId}). Direct URL: ${salesforceUrl}`,
  };
}
