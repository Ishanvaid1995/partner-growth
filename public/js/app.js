// Sample Prompt Scenarios
const promptScenarios = {
  retail: "Customer: Acme Retail; Industry: Retail & E-Commerce; Use case: AI analytics for customer personalization and real-time inventory prediction; Budget: $100,000 USD; Timeline: Q4.",
  manufacturing: "Customer: Apex Manufacturing; Industry: Industrial & Automotive; Use case: IoT predictive maintenance, downtime reduction, and equipment failure forecasting; Budget: $250,000 USD; Timeline: Q1.",
  healthcare: "Customer: HealthFirst Care; Industry: Healthcare & Life Sciences; Use case: Customer service virtual agent for patient scheduling, HIPAA compliance, and EHR query automation; Budget: $150,000 USD; Timeline: Immediate."
};

function applyPrompt(key) {
  if (promptScenarios[key]) {
    document.getElementById('dealInput').value = promptScenarios[key];
  }
}

function triggerChatOrScroll() {
  // If watsonx Assistant web chat instance exists, open it
  if (window.watsonAssistantChatInstance) {
    window.watsonAssistantChatInstance.openWindow();
  } else {
    // Otherwise scroll smoothly to the live demo playground section
    const demoSec = document.getElementById('demo');
    if (demoSec) {
      demoSec.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

function switchOutputTab(tabName) {
  const tabs = document.querySelectorAll('.out-tab');
  const panes = document.querySelectorAll('.out-pane');

  tabs.forEach(tab => tab.classList.remove('active'));
  panes.forEach(pane => pane.classList.add('hidden'));

  const targetTab = Array.from(tabs).find(t => t.getAttribute('onclick').includes(tabName));
  if (targetTab) targetTab.classList.add('active');

  const targetPane = document.getElementById(`out-${tabName}`);
  if (targetPane) targetPane.classList.remove('hidden');
}

async function executeWorkflow() {
  const dealInput = document.getElementById('dealInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const loader = document.getElementById('loaderSpinner');
  const spinnerText = document.getElementById('spinnerText');

  if (!dealInput) {
    alert('Please select a sample scenario or enter deal context to run the agent.');
    return;
  }

  loader.classList.remove('hidden');
  spinnerText.innerText = 'Invoking watsonx.ai Agent...';

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-PGC-KEY': apiKey || 'pgc-secret-key-123',
    };

    // 1. Generate Proposal
    spinnerText.innerText = '[1/4] Formulating IBM Solution Proposal Blueprint...';
    const propRes = await fetch('/generate-proposal', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: dealInput }),
    });

    if (!propRes.ok) {
      const err = await propRes.json();
      throw new Error(err.error || `API error (${propRes.status})`);
    }

    const propData = await propRes.json();

    document.getElementById('resProposalText').innerText = propData.proposal || 'No proposal text returned.';
    document.getElementById('resSolutionName').innerText = propData.solution_name || 'IBM Solution Blueprint';
    document.getElementById('resStack').innerText = Array.isArray(propData.recommended_ibm_stack) 
      ? propData.recommended_ibm_stack.join(', ') 
      : 'IBM watsonx.ai, watsonx Orchestrate';
    document.getElementById('resOutcomes').innerText = Array.isArray(propData.business_outcomes) 
      ? propData.business_outcomes.join(' | ') 
      : 'Automated pre-sales';

    // 2. Draft Follow-up Email
    spinnerText.innerText = '[2/4] Drafting Customer Follow-up Email...';
    const emailRes = await fetch('/draft-followup-email', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: dealInput, proposal: propData.proposal }),
    });

    if (emailRes.ok) {
      const emailData = await emailRes.json();
      document.getElementById('resEmailSubject').innerText = emailData.subject || '-';
      document.getElementById('resEmailBody').innerText = emailData.email_body || '-';
    }

    // 3. Create Handoff Summary
    spinnerText.innerText = '[3/4] Generating Technical Handoff Summary...';
    const handoffRes = await fetch('/create-handoff-summary', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: dealInput, proposal: propData.proposal }),
    });

    if (handoffRes.ok) {
      const handoffData = await handoffRes.json();
      document.getElementById('resHandoffSummary').innerText = handoffData.summary || '-';

      const stepsUl = document.getElementById('resHandoffSteps');
      stepsUl.innerHTML = Array.isArray(handoffData.next_steps)
        ? handoffData.next_steps.map(s => `<li>${s}</li>`).join('')
        : '<li>Schedule technical discovery session</li>';

      const risksUl = document.getElementById('resHandoffRisks');
      risksUl.innerHTML = Array.isArray(handoffData.risks)
        ? handoffData.risks.map(r => `<li>${r}</li>`).join('')
        : '<li>Verify network security credentials</li>';
    }

    // 4. Create Opportunity Stub
    spinnerText.innerText = '[4/4] Creating CRM Opportunity Payload...';
    const oppRes = await fetch('/create-opportunity-stub', {
      method: 'POST',
      headers,
      body: JSON.stringify({ raw_input: dealInput, proposal: propData.proposal }),
    });

    if (oppRes.ok) {
      const oppData = await oppRes.json();
      document.getElementById('resOppName').innerText = oppData.opportunity_name || '-';
      document.getElementById('resOppAccount').innerText = oppData.account_name || '-';
      document.getElementById('resOppValue').innerText = oppData.estimated_value || '$100,000 USD';
      document.getElementById('resOppNotes').innerText = oppData.notes || '-';
    }

    // Default to Proposal tab view
    switchOutputTab('proposal');

  } catch (err) {
    alert(`Workflow Execution Error: ${err.message}`);
  } finally {
    loader.classList.add('hidden');
  }
}

// Hook into watsonx Assistant instance on load if rendered
window.watsonAssistantChatOptions = window.watsonAssistantChatOptions || {};
const origOnLoad = window.watsonAssistantChatOptions.onLoad;
window.watsonAssistantChatOptions.onLoad = async (instance) => {
  window.watsonAssistantChatInstance = instance;
  if (origOnLoad) await origOnLoad(instance);
};

// Default prompt scenario on page load
window.addEventListener('DOMContentLoaded', () => {
  applyPrompt('retail');
});
