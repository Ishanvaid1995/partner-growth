export interface DealScoreResult {
  score: number;
  reasoning: string[];
  missing_fields: string[];
  recommended_path: 'nurture' | 'discovery_workshop' | 'pilot_ready' | 'proposal_ready';
  next_best_actions: string[];
}

export function evaluateDealInput(rawInput: string, industry?: string): DealScoreResult {
  const text = (rawInput || '').toLowerCase();
  let score = 0;
  const reasoning: string[] = [];
  const missing_fields: string[] = [];

  // 1. Industry Clarity (20 points)
  const knownIndustries = ['retail', 'manufacturing', 'healthcare', 'financial', 'banking', 'automotive', 'e-commerce', 'telecom'];
  const hasExplicitIndustry = (industry && industry.trim().length > 0) || knownIndustries.some(ind => text.includes(ind));
  if (hasExplicitIndustry) {
    score += 20;
    reasoning.push('Industry domain is explicitly identified.');
  } else {
    missing_fields.push('Explicit Industry domain');
    reasoning.push('Industry domain is unspecified or general.');
  }

  // 2. Business Problem / Use Case Clarity (25 points)
  const problemKeywords = ['use case', 'problem', 'need', 'analytics', 'downtime', 'predictive', 'modernization', 'automation', 'compliance', 'inventory', 'customer'];
  const hasProblemClarity = problemKeywords.some(kw => text.includes(kw)) && text.length > 30;
  if (hasProblemClarity) {
    score += 25;
    reasoning.push('Clear business use case and technical objectives provided.');
  } else {
    missing_fields.push('Detailed business problem / use case description');
    reasoning.push('Business use case needs further technical elaboration.');
  }

  // 3. Budget Clarity (20 points)
  const budgetKeywords = ['budget', '$', 'k', 'usd', 'cost', '100k', '250k', '500k', '1m'];
  const hasBudget = budgetKeywords.some(kw => text.includes(kw));
  if (hasBudget) {
    score += 20;
    reasoning.push('Financial budget or scope range is specified.');
  } else {
    missing_fields.push('Budget estimate or price target');
    reasoning.push('No budget figures found in deal intake string.');
  }

  // 4. Timeline Clarity (15 points)
  const timelineKeywords = ['q1', 'q2', 'q3', 'q4', 'timeline', 'month', 'days', 'immediate', 'quarter', 'go-live', '2026', '2027'];
  const hasTimeline = timelineKeywords.some(kw => text.includes(kw));
  if (hasTimeline) {
    score += 15;
    reasoning.push('Project deployment timeline or target target date specified.');
  } else {
    missing_fields.push('Target deployment timeline');
    reasoning.push('Deployment timeline target is absent.');
  }

  // 5. Stakeholder / Customer Name Clarity (20 points)
  const stakeholderKeywords = ['customer', 'acme', 'vp', 'cio', 'director', 'team', 'stakeholder', 'sponsor', 'client', 'account'];
  const hasStakeholder = stakeholderKeywords.some(kw => text.includes(kw));
  if (hasStakeholder) {
    score += 20;
    reasoning.push('Customer account or key executive stakeholder identified.');
  } else {
    missing_fields.push('Account name or key stakeholder contact');
    reasoning.push('Customer account name or decision-maker sponsor is missing.');
  }

  // Determine recommended path & next best actions based on score
  let recommended_path: 'nurture' | 'discovery_workshop' | 'pilot_ready' | 'proposal_ready' = 'proposal_ready';
  const next_best_actions: string[] = [];

  if (score >= 80) {
    recommended_path = 'proposal_ready';
    next_best_actions.push('Schedule executive proposal presentation with client sponsor.');
    next_best_actions.push('Provision IBM watsonx sandbox environment for pilot validation.');
    next_best_actions.push('Share formal technical handoff summary with engineering delivery team.');
    next_best_actions.push('Log CRM opportunity stub into Salesforce / HubSpot.');
  } else if (score >= 60) {
    recommended_path = 'pilot_ready';
    next_best_actions.push('Conduct 30-minute discovery call to clarify missing deal scope.');
    next_best_actions.push('Confirm budget approval authority with client executive sponsor.');
    next_best_actions.push('Share preliminary IBM solution architecture overview.');
  } else if (score >= 40) {
    recommended_path = 'discovery_workshop';
    next_best_actions.push('Host an interactive IBM Architecture Discovery Workshop with client leads.');
    next_best_actions.push('Gather quantitative KPI targets (e.g. downtime reduction, latency).');
    next_best_actions.push('Identify primary IT security and data governance compliance requirements.');
  } else {
    recommended_path = 'nurture';
    next_best_actions.push('Send IBM watsonx product enablement overview collateral.');
    next_best_actions.push('Qualify customer budget range and target implementation year.');
    next_best_actions.push('Re-engage account executive in 30 days.');
  }

  return {
    score,
    reasoning,
    missing_fields,
    recommended_path,
    next_best_actions,
  };
}
