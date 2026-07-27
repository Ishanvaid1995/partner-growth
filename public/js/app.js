// Global reference for IBM watsonx Assistant web chat instance
window.watsonAssistantChatInstance = null;

// Mobile Side Drawer Toggle
function toggleMobileMenu() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('drawerOverlay');

  if (drawer && overlay) {
    drawer.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

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

/**
 * Bulletproof trigger to open the IBM watsonx Assistant web chat window.
 */
function triggerChatOrScroll() {
  // 1. Try native instance method
  if (window.watsonAssistantChatInstance && typeof window.watsonAssistantChatInstance.openWindow === 'function') {
    window.watsonAssistantChatInstance.openWindow();
    return;
  }

  // 2. Fallback: Search for IBM Web Chat launcher DOM button and click it
  const domLauncher = 
    document.querySelector('#WACLauncher__Button') ||
    document.querySelector('button[aria-label*="chat" i]') ||
    document.querySelector('.WACLauncherContainer button') ||
    document.querySelector('[data-testid="web-chat-launcher"]') ||
    document.querySelector('.WACLauncher__Button');

  if (domLauncher) {
    domLauncher.click();
    return;
  }

  // 3. If still initializing, retry short interval
  let retries = 0;
  const interval = setInterval(() => {
    retries++;
    if (window.watsonAssistantChatInstance && typeof window.watsonAssistantChatInstance.openWindow === 'function') {
      window.watsonAssistantChatInstance.openWindow();
      clearInterval(interval);
    } else {
      const btn = document.querySelector('#WACLauncher__Button') || document.querySelector('button[aria-label*="chat" i]');
      if (btn) {
        btn.click();
        clearInterval(interval);
      } else if (retries >= 10) {
        clearInterval(interval);
        // If not loaded at all, scroll to playground
        const demoSec = document.getElementById('demo');
        if (demoSec) demoSec.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, 200);
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

function copyEmailToClipboard() {
  const subject = document.getElementById('resEmailSubject').innerText;
  const body = document.getElementById('resEmailBody').innerText;
  const fullText = `Subject: ${subject}\n\n${body}`;

  navigator.clipboard.writeText(fullText).then(() => {
    const btnText = document.getElementById('copyBtnText');
    if (btnText) {
      btnText.innerText = 'Copied!';
      setTimeout(() => {
        btnText.innerText = 'Copy Email Text';
      }, 2000);
    }
  }).catch(err => {
    alert('Failed to copy to clipboard');
  });
}

function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/\\n/g, '\n')
    .replace(/^"|"$/g, '')
    .trim();
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

    document.getElementById('resProposalText').innerText = cleanText(propData.proposal) || 'No proposal text returned.';
    document.getElementById('resSolutionName').innerText = cleanText(propData.solution_name) || 'IBM Solution Blueprint';
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
      document.getElementById('resEmailSubject').innerText = cleanText(emailData.subject) || 'Follow-up: IBM Solution Overview';
      document.getElementById('resEmailBody').innerText = cleanText(emailData.email_body) || '-';
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
      document.getElementById('resHandoffSummary').innerText = cleanText(handoffData.summary) || '-';

      const stepsUl = document.getElementById('resHandoffSteps');
      stepsUl.innerHTML = Array.isArray(handoffData.next_steps)
        ? handoffData.next_steps.map(s => `<li>${cleanText(s)}</li>`).join('')
        : '<li>Schedule technical discovery session</li>';

      const risksUl = document.getElementById('resHandoffRisks');
      risksUl.innerHTML = Array.isArray(handoffData.risks)
        ? handoffData.risks.map(r => `<li>${cleanText(r)}</li>`).join('')
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
      document.getElementById('resOppName').innerText = cleanText(oppData.opportunity_name) || '-';
      document.getElementById('resOppAccount').innerText = cleanText(oppData.account_name) || '-';
      document.getElementById('resOppValue').innerText = cleanText(oppData.estimated_value) || '$100,000 USD';
      document.getElementById('resOppNotes').innerText = cleanText(oppData.notes) || '-';
    }

    // Default to Proposal tab view
    switchOutputTab('proposal');

  } catch (err) {
    alert(`Workflow Execution Error: ${err.message}`);
  } finally {
    loader.classList.add('hidden');
  }
}

// Default prompt scenario on page load
window.addEventListener('DOMContentLoaded', () => {
  applyPrompt('retail');
});
