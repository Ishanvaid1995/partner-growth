// Global references for chat instances
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
 * Bulletproof trigger to open the IBM chat assistant window.
 */
function triggerChatOrScroll() {
  // 1. Try watsonx Assistant instance method
  if (window.watsonAssistantChatInstance && typeof window.watsonAssistantChatInstance.openWindow === 'function') {
    window.watsonAssistantChatInstance.openWindow();
    return;
  }

  // 2. Try wxoLoader API
  if (window.wxoLoader && typeof window.wxoLoader.open === 'function') {
    window.wxoLoader.open();
    return;
  }
  if (window.wxoLoader && typeof window.wxoLoader.openWindow === 'function') {
    window.wxoLoader.openWindow();
    return;
  }

  // 3. Search DOM launcher elements
  const domLauncher = 
    document.querySelector('#WACLauncher__Button') ||
    document.querySelector('.WACLauncherContainer button') ||
    document.querySelector('[data-testid="web-chat-launcher"]') ||
    document.querySelector('#wxo-chat-launcher') ||
    document.querySelector('#wxoChatLauncher') ||
    document.querySelector('.wxo-chat-launcher') ||
    document.querySelector('button[aria-label*="chat" i]');

  if (domLauncher) {
    domLauncher.click();
    return;
  }

  // 4. Fallback: Scroll to interactive demo playground
  const demoSec = document.getElementById('demo');
  if (demoSec) {
    demoSec.scrollIntoView({ behavior: 'smooth' });
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
      'x-api-key': apiKey || 'pgc-secret-key-123',
    };

    // 1. Generate Full Opportunity Package in 1 streamlined call
    spinnerText.innerText = 'Executing watsonx Orchestrate Pre-Sales Agent Workflow...';
    const res = await fetch('/generate-full-opportunity-package', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        raw_input: dealInput,
        industry: 'retail',
        account_name: 'Acme Retail',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || err.error || `API error (${res.status})`);
    }

    const data = await res.json();

    // 1. Proposal
    if (data.proposal) {
      document.getElementById('resProposalText').innerText = cleanText(data.proposal.proposal) || 'No proposal text returned.';
      document.getElementById('resSolutionName').innerText = cleanText(data.proposal.solution_name) || 'IBM Solution Blueprint';
      document.getElementById('resStack').innerText = Array.isArray(data.proposal.recommended_ibm_stack) 
        ? data.proposal.recommended_ibm_stack.join(', ') 
        : 'IBM watsonx.ai, watsonx Orchestrate';
      document.getElementById('resOutcomes').innerText = Array.isArray(data.proposal.business_outcomes) 
        ? data.proposal.business_outcomes.join(' | ') 
        : 'Automated pre-sales';
    }

    // 2. Email
    if (data.followup_email) {
      document.getElementById('resEmailSubject').innerText = cleanText(data.followup_email.subject) || 'Follow-up: IBM Solution Overview';
      document.getElementById('resEmailBody').innerText = cleanText(data.followup_email.email_body) || '-';
    }

    // 3. Technical Handoff
    if (data.handoff_summary) {
      document.getElementById('resHandoffSummary').innerText = cleanText(data.handoff_summary.summary) || '-';

      const stepsUl = document.getElementById('resHandoffSteps');
      stepsUl.innerHTML = Array.isArray(data.handoff_summary.next_steps)
        ? data.handoff_summary.next_steps.map(s => `<li>${cleanText(s)}</li>`).join('')
        : '<li>Schedule technical discovery session</li>';

      const risksUl = document.getElementById('resHandoffRisks');
      risksUl.innerHTML = Array.isArray(data.handoff_summary.risks)
        ? data.handoff_summary.risks.map(r => `<li>${cleanText(r)}</li>`).join('')
        : '<li>Verify network security credentials</li>';
    }

    // 4. CRM Stub
    if (data.crm_stub) {
      document.getElementById('resOppName').innerText = cleanText(data.crm_stub.opportunity_name) || '-';
      document.getElementById('resOppAccount').innerText = cleanText(data.crm_stub.account_name) || '-';
      document.getElementById('resOppValue').innerText = cleanText(data.crm_stub.estimated_value) || '$100,000 USD';
      document.getElementById('resOppNotes').innerText = cleanText(data.crm_stub.notes) || '-';
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
