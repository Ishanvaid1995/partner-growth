// Preset Deals
const presets = {
  retail: "Customer: Acme Retail; Industry: Retail & E-Commerce; Use case: AI analytics for customer personalization and real-time inventory prediction; Budget: $100k; Timeline: Q4.",
  healthcare: "Customer: HealthFirst Canada; Industry: Healthcare; Use case: EHR data lake consolidation, HIPAA governance, and predictive patient flow; Budget: $250k; Timeline: Q1.",
  banking: "Customer: Apex Financial; Industry: Banking; Use case: Real-time fraud detection on wire transactions and automated compliance audit trails; Budget: $500k; Timeline: Immediate."
};

function loadPreset(type) {
  if (presets[type]) {
    document.getElementById('rawInput').value = presets[type];
  }
}

function switchTab(tabId) {
  const tabs = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => tab.classList.remove('active'));
  panes.forEach(pane => pane.classList.add('hidden'));

  const activeBtn = Array.from(tabs).find(b => b.getAttribute('onclick').includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.remove('hidden');
}

async function runEndToEndWorkflow() {
  const rawInput = document.getElementById('rawInput').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const loader = document.getElementById('statusLoader');
  const loaderText = document.getElementById('loaderText');

  if (!rawInput) {
    alert('Please enter customer deal context or select a sample preset!');
    return;
  }

  loader.classList.remove('hidden');
  loaderText.innerText = 'Invoking IBM watsonx.ai Agent...';

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-PGC-KEY': apiKey || 'pgc-secret-key-123',
    };

    // 1. Generate Proposal
    loaderText.innerText = '[1/4] Generating IBM Solution Blueprint...';
    const propRes = await fetch('/generate-proposal', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: rawInput }),
    });

    if (!propRes.ok) {
      const errData = await propRes.json();
      throw new Error(errData.error || `Proposal API error (${propRes.status})`);
    }

    const propData = await propRes.json();

    // Render Proposal
    document.getElementById('proposalText').innerText = propData.proposal || 'No proposal generated';
    document.getElementById('propSolutionName').innerText = propData.solution_name || 'IBM Solution Blueprint';
    document.getElementById('propStack').innerText = Array.isArray(propData.recommended_ibm_stack) 
      ? propData.recommended_ibm_stack.join(', ') 
      : 'IBM watsonx.ai, watsonx Orchestrate';
    document.getElementById('propOutcomes').innerText = Array.isArray(propData.business_outcomes) 
      ? propData.business_outcomes.join(' | ') 
      : 'Automated pre-sales';

    // 2. Draft Follow-up Email
    loaderText.innerText = '[2/4] Drafting Customer Follow-up Email...';
    const emailRes = await fetch('/draft-followup-email', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: rawInput, proposal: propData.proposal }),
    });

    if (emailRes.ok) {
      const emailData = await emailRes.json();
      document.getElementById('emailSubject').innerText = emailData.subject || '-';
      document.getElementById('emailBody').innerText = emailData.email_body || '-';
    }

    // 3. Create Handoff Summary
    loaderText.innerText = '[3/4] Creating Technical Handoff Summary...';
    const handoffRes = await fetch('/create-handoff-summary', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: rawInput, proposal: propData.proposal }),
    });

    if (handoffRes.ok) {
      const handoffData = await handoffRes.json();
      document.getElementById('handoffSummaryText').innerText = handoffData.summary || '-';
      
      const nextStepsUl = document.getElementById('handoffNextSteps');
      nextStepsUl.innerHTML = Array.isArray(handoffData.next_steps)
        ? handoffData.next_steps.map(s => `<li>${s}</li>`).join('')
        : '<li>Schedule technical discovery session</li>';

      const risksUl = document.getElementById('handoffRisks');
      risksUl.innerHTML = Array.isArray(handoffData.risks)
        ? handoffData.risks.map(r => `<li>${r}</li>`).join('')
        : '<li>Verify cloud security policies</li>';
    }

    // 4. Create CRM Opportunity Stub
    loaderText.innerText = '[4/4] Creating CRM Opportunity Payload...';
    const oppRes = await fetch('/create-opportunity-stub', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: rawInput, proposal: propData.proposal }),
    });

    if (oppRes.ok) {
      const oppData = await oppRes.json();
      document.getElementById('oppName').innerText = oppData.opportunity_name || '-';
      document.getElementById('oppAccount').innerText = oppData.account_name || '-';
      document.getElementById('oppStage').innerText = oppData.stage || 'Qualification';
      document.getElementById('oppValue').innerText = oppData.estimated_value || '$100,000 USD';
      document.getElementById('oppNotes').innerText = oppData.notes || '-';
    }

    // Switch to Proposal Tab
    switchTab('proposal');

  } catch (err) {
    alert(`Workflow Execution Error: ${err.message}`);
  } finally {
    loader.classList.add('hidden');
  }
}

// Pre-fill default preset on page load
window.addEventListener('DOMContentLoaded', () => {
  loadPreset('retail');
});
