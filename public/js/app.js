/* ============================================================
   Partner Growth Copilot — Frontend Application Logic
   Sidebar, macOS Company Folders, Auth & Theme Engine
   ============================================================ */

const API_KEY = 'pgc-secret-key-123';
const HEADERS = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };

// -- State --
let currentUser = null;
let userToken = localStorage.getItem('pgc_user_token') || null;
let currentTheme = localStorage.getItem('pgc_theme') || 'dark';
let isAuthRegisterMode = false;
let lastPackageData = null;

const scenarios = {
  retail: 'Customer: Acme Retail; Industry: Retail & E-Commerce; Use case: AI analytics for customer personalization and real-time inventory demand forecasting; Budget: $100,000 USD; Timeline: Q4.',
  manufacturing: 'Customer: Apex Manufacturing; Industry: Industrial & Automotive; Use case: IoT predictive maintenance, downtime reduction, and equipment failure forecasting; Budget: $250,000 USD; Timeline: Q1.',
  healthcare: 'Customer: HealthFirst Care; Industry: Healthcare & Life Sciences; Use case: Virtual agent for patient scheduling, HIPAA compliance, and EHR query automation; Budget: $150,000 USD; Timeline: Immediate.',
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
  applyPrompt('retail');

  document.querySelectorAll('.output-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.querySelectorAll('.mode-chip').forEach(chip => {
    chip.addEventListener('click', () => executeMode(chip.dataset.mode));
  });
});

// ============================================================
// THEME ENGINE (Dark / Light Mode)
// ============================================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeUI();
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('pgc_theme', currentTheme);
  updateThemeUI();

  if (currentUser && userToken) {
    fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { ...HEADERS, 'x-user-id': userToken },
      body: JSON.stringify({ theme: currentTheme }),
    }).catch(() => {});
  }
}

function updateThemeUI() {
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// ============================================================
// EXPANDABLE SIDEBAR & MACOS FOLDER TREE SYSTEM
// ============================================================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  if (window.innerWidth <= 768) {
    if (sidebar.classList.contains('mobile-open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) {
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('mobile-open');
  }
  if (overlay) overlay.classList.add('active');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
}

// Ensure responsive drawer state cleans up cleanly on window resize
window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (window.innerWidth > 768) {
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }
});

function startNewPackage() {
  closeMobileSidebar();
  document.getElementById('dealInput').value = '';
  document.getElementById('workspace').classList.remove('visible');
  document.getElementById('dealInput').focus();
}

async function loadSavedConversations() {
  const container = document.getElementById('companyFoldersList');
  if (!container) return;

  if (!userToken || !currentUser) {
    container.innerHTML = '<div style="padding:12px 8px; font-size:12px; color:var(--text-muted); text-align:left;">Sign in to save and manage deal packages in macOS company folders.</div>';
    window._savedConversations = [];
    return;
  }

  try {
    const res = await fetch('/api/conversations', {
      headers: { ...HEADERS, 'x-user-id': userToken },
    });

    if (!res.ok) return;
    const data = await res.json();

    if (!data.folders || data.folders.length === 0) {
      container.innerHTML = '<div style="padding:12px 8px; font-size:12px; color:var(--text-muted);">No saved deal packages yet.</div>';
      window._savedConversations = [];
      return;
    }

    let html = '';
    data.folders.forEach((folder, idx) => {
      const folderId = `folder_${idx}`;
      html += `
        <div class="macos-folder">
          <div class="folder-header" onclick="toggleFolder('${folderId}')">
            <div class="folder-header-left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>${folder.folderName}</span>
            </div>
            <span class="folder-badge">${folder.count}</span>
          </div>
          <div class="folder-items" id="${folderId}">
            ${folder.conversations.map(conv => `
              <div class="history-item" onclick="loadSavedSession('${conv.id}')">
                <span class="history-title">${conv.title}</span>
                <button class="history-delete-btn" onclick="deleteSession(event, '${conv.id}')" title="Delete">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    window._savedConversations = data.folders.flatMap(f => f.conversations);
  } catch (err) {
    console.warn('[Folders Load Failed]', err);
  }
}

function toggleFolder(folderId) {
  const el = document.getElementById(folderId);
  if (el) el.classList.toggle('hidden');
}

function loadSavedSession(convId) {
  if (!window._savedConversations) return;
  const conv = window._savedConversations.find(c => c.id === convId);
  if (!conv) return;

  closeMobileSidebar();
  document.getElementById('dealInput').value = conv.rawInput;
  lastPackageData = conv.packageData;
  populateResults(conv.packageData);

  const workspace = document.getElementById('workspace');
  workspace.classList.add('visible');
  switchTab('proposal');
  workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteSession(event, convId) {
  event.stopPropagation();
  try {
    await fetch(`/api/conversations/${convId}`, {
      method: 'DELETE',
      headers: { ...HEADERS, 'x-user-id': userToken || 'guest_user' },
    });
    loadSavedConversations();
  } catch (err) {}
}

// ============================================================
// AUTHENTICATION & USER MANAGEMENT
// ============================================================
async function initAuth() {
  if (!userToken) {
    updateUserUI(null);
    loadSavedConversations();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { ...HEADERS, 'x-user-id': userToken },
    });

    if (res.ok) {
      currentUser = await res.json();
      if (currentUser.theme) {
        currentTheme = currentUser.theme;
        initTheme();
      }
      updateUserUI(currentUser);
    } else {
      userToken = null;
      localStorage.removeItem('pgc_user_token');
      updateUserUI(null);
    }
  } catch (err) {
    updateUserUI(null);
  }
  loadSavedConversations();
}

function updateUserUI(user) {
  const avatar = document.getElementById('sidebarAvatar');
  const nameEl = document.getElementById('sidebarUserName');
  const emailEl = document.getElementById('sidebarUserEmail');

  if (user) {
    avatar.textContent = user.name.charAt(0).toUpperCase();
    nameEl.textContent = user.name;
    emailEl.textContent = user.email;
  } else {
    avatar.textContent = 'G';
    nameEl.textContent = 'Guest Account';
    emailEl.textContent = 'Sign in / Register';
  }
}

function openUserModal() {
  if (currentUser) {
    document.getElementById('profName').value = currentUser.name;
    document.getElementById('profEmail').value = currentUser.email;
    document.getElementById('profileModal').classList.add('active');
  } else {
    document.getElementById('authModal').classList.add('active');
  }
}

function closeAuthModal() { document.getElementById('authModal').classList.remove('active'); }
function closeProfileModal() { document.getElementById('profileModal').classList.remove('active'); }

function toggleAuthMode() {
  isAuthRegisterMode = !isAuthRegisterMode;
  document.getElementById('authModalTitle').textContent = isAuthRegisterMode ? 'Create Account' : 'Sign In';
  document.getElementById('nameGroup').style.display = isAuthRegisterMode ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = isAuthRegisterMode ? 'Register Account' : 'Sign In';
  document.getElementById('authSwitch').innerHTML = isAuthRegisterMode
    ? 'Already have an account? <a onclick="toggleAuthMode()">Sign in here</a>'
    : 'Don\'t have an account? <a onclick="toggleAuthMode()">Register here</a>';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  const name = document.getElementById('authName').value.trim();

  const endpoint = isAuthRegisterMode ? '/api/auth/register' : '/api/auth/login';
  const body = isAuthRegisterMode ? { name, email, password } : { email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Auth failed');

    userToken = data.token;
    currentUser = data.user;
    localStorage.setItem('pgc_user_token', userToken);

    updateUserUI(currentUser);
    closeAuthModal();

    // If there is a pending package generated while guest, auto-save to account!
    const pendingStr = sessionStorage.getItem('pgc_pending_package');
    if (pendingStr) {
      try {
        const pending = JSON.parse(pendingStr);
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { ...HEADERS, 'x-user-id': userToken },
          body: JSON.stringify(pending),
        });
        sessionStorage.removeItem('pgc_pending_package');
        const banner = document.getElementById('guestSaveBanner');
        if (banner) banner.style.display = 'none';
      } catch(e) {}
    }

    loadSavedConversations();
  } catch (err) {
    alert(err.message);
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = document.getElementById('profName').value.trim();
  const password = document.getElementById('profPassword').value.trim();

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { ...HEADERS, 'x-user-id': userToken },
      body: JSON.stringify({ name, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Update failed');

    currentUser = data;
    updateUserUI(currentUser);
    closeProfileModal();
    alert('Account updated successfully.');
  } catch (err) {
    alert(err.message);
  }
}

function handleSignOut() {
  currentUser = null;
  userToken = null;
  localStorage.removeItem('pgc_user_token');
  sessionStorage.removeItem('pgc_pending_package');
  const banner = document.getElementById('guestSaveBanner');
  if (banner) banner.style.display = 'none';
  updateUserUI(null);
  closeProfileModal();
  loadSavedConversations();
}

// ============================================================
// WORKFLOW EXECUTION & AUTO-SAVE TO MACOS FOLDERS
// ============================================================
async function executeWorkflow() {
  const dealInput = document.getElementById('dealInput').value.trim();
  if (!dealInput) {
    document.getElementById('dealInput').focus();
    return;
  }

  const workspace = document.getElementById('workspace');
  workspace.classList.add('visible');
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loaderText');
  loader.classList.remove('hidden');
  loaderText.textContent = 'Generating package via watsonx.ai…';

  workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch('/generate-full-opportunity-package', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        raw_input: dealInput,
        industry: detectIndustry(dealInput),
        account_name: extractAccountName(dealInput),
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `API error (${res.status})`);
    }

    const data = await res.json();
    lastPackageData = data;
    populateResults(data);
    switchTab('proposal');

    const pendingPayload = {
      account_name: extractAccountName(dealInput),
      industry: detectIndustry(dealInput),
      raw_input: dealInput,
      packageData: data,
    };

    if (currentUser && userToken) {
      // User signed in: Save directly
      fetch('/api/conversations', {
        method: 'POST',
        headers: { ...HEADERS, 'x-user-id': userToken },
        body: JSON.stringify(pendingPayload),
      }).then(() => loadSavedConversations()).catch(() => {});
    } else {
      // Guest mode: prompt user to create an account & save to session
      sessionStorage.setItem('pgc_pending_package', JSON.stringify(pendingPayload));
      const banner = document.getElementById('guestSaveBanner');
      if (banner) banner.style.display = 'flex';
    }

  } catch (err) {
    loaderText.textContent = `Error: ${err.message}`;
    setTimeout(() => loader.classList.add('hidden'), 3000);
    return;
  }

  loader.classList.add('hidden');
}

// ============================================================
// FORMATTING PARSER & CLEANING HELPERS
// ============================================================
function sanitizeRawText(input) {
  if (!input) return '';
  let str = String(input).trim();
  
  // Strip ```json wrapper or ``` block
  str = str.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Check if string contains JSON syntax like {"subject": ..., "email_body": ...}
  if (str.includes('"email_body"') || (str.startsWith('{') && str.endsWith('}'))) {
    try {
      // RegEx extraction for email_body to prevent nested JSON corruption
      const match = str.match(/"email_body"\s*:\s*"([\s\S]*?)"(?=\s*\}|\s*,\s*")/);
      if (match && match[1]) {
        str = match[1];
      } else {
        const parsed = JSON.parse(str);
        if (parsed.email_body) str = parsed.email_body;
        else if (parsed.proposal) str = parsed.proposal;
        else if (parsed.summary) str = parsed.summary;
      }
    } catch(e) {
      // Fallback regex match if JSON.parse throws
      const match = str.match(/"email_body"\s*:\s*"([\s\S]*?)"/);
      if (match && match[1]) str = match[1];
    }
  }

  return str
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\/g, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function parseMarkdownToHtml(markdownText) {
  if (!markdownText) return '';
  let clean = sanitizeRawText(markdownText);

  // If already rich HTML with paragraph tags, clean up and return
  if (clean.includes('<p>') || clean.includes('<ul>')) {
    return clean
      .replace(/<p>\s*<\/p>/g, '')
      .replace(/\\n/g, '<br>')
      .trim();
  }

  // Convert markdown formatting tags
  clean = clean.replace(/^#+\s*(.*?)$/gm, '<h3>$1</h3>');
  clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  clean = clean.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Split into structural blocks separated by empty lines or line breaks
  const rawBlocks = clean.split(/\n\s*\n/);
  let htmlResult = [];

  for (let block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    let isBulletBlock = lines.every(l => {
      const t = l.trim();
      return t.startsWith('- ') || t.startsWith('* ') || t.startsWith('• ') || /^\d+\.\s/.test(t);
    });

    if (isBulletBlock || (lines.length > 1 && lines[0].trim().startsWith('- '))) {
      htmlResult.push('<ul>');
      for (let l of lines) {
        const itemText = l.trim().replace(/^[-*•\d+.]\s*/, '');
        if (itemText) htmlResult.push(`  <li>${itemText}</li>`);
      }
      htmlResult.push('</ul>');
    } else if (trimmed.startsWith('<h3>')) {
      htmlResult.push(trimmed);
    } else {
      // Formatted paragraph with line breaks inside turned into <br>
      const paraContent = lines.map(l => l.trim()).join('<br>');
      htmlResult.push(`<p>${paraContent}</p>`);
    }
  }

  return htmlResult.join('\n');
}

function applyPrompt(key) {
  if (!scenarios[key]) return;
  document.getElementById('dealInput').value = scenarios[key];
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  const chips = document.querySelectorAll('.chip');
  const idx = { retail: 0, manufacturing: 1, healthcare: 2 }[key];
  if (chips[idx]) chips[idx].classList.add('active');
}

function launchScenario(key) {
  applyPrompt(key);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => executeWorkflow(), 400);
}

function switchTab(tabName) {
  document.querySelectorAll('.output-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.out-pane').forEach(p => p.classList.remove('active'));

  const tab = document.querySelector(`.output-tab[data-tab="${tabName}"]`);
  const pane = document.getElementById(`pane-${tabName}`);
  if (tab) tab.classList.add('active');
  if (pane) pane.classList.add('active');
}

function triggerChatOrScroll() {
  if (window.wxoLoader && typeof window.wxoLoader.open === 'function') {
    window.wxoLoader.open(); return;
  }
  if (window.wxoLoader && typeof window.wxoLoader.openWindow === 'function') {
    window.wxoLoader.openWindow(); return;
  }
  const domLauncher =
    document.querySelector('#wxo-chat-launcher') ||
    document.querySelector('.wxo-chat-launcher') ||
    document.querySelector('button[aria-label*="chat" i]') ||
    document.querySelector('.WACLauncherContainer button');
  if (domLauncher) { domLauncher.click(); return; }
  document.getElementById('dealInput').focus();
}

function detectIndustry(input) {
  const lower = input.toLowerCase();
  if (lower.includes('retail') || lower.includes('e-commerce')) return 'retail';
  if (lower.includes('manufactur') || lower.includes('industrial')) return 'manufacturing';
  if (lower.includes('health') || lower.includes('hospital') || lower.includes('patient')) return 'healthcare';
  return 'general';
}

function extractAccountName(input) {
  const match = input.match(/Customer:\s*([^;]+)/i);
  return match ? match[1].trim() : 'Customer Account';
}

function populateResults(data) {
  if (data.proposal) {
    document.getElementById('resProposalText').innerHTML = parseMarkdownToHtml(data.proposal.proposal) || '<em>No proposal returned.</em>';
    document.getElementById('resSolutionName').innerText = sanitizeRawText(data.proposal.solution_name) || 'IBM Solution Proposal';
    document.getElementById('resStack').innerText = Array.isArray(data.proposal.recommended_ibm_stack)
      ? data.proposal.recommended_ibm_stack.join(' · ')
      : 'IBM watsonx.ai, watsonx Orchestrate';
    document.getElementById('resOutcomes').innerText = Array.isArray(data.proposal.business_outcomes)
      ? data.proposal.business_outcomes.join(' · ')
      : '—';
  }

  if (data.followup_email) {
    const subjectInput = document.getElementById('resEmailSubject');
    if (subjectInput) subjectInput.value = sanitizeRawText(data.followup_email.subject) || 'Follow-up: IBM Solution Overview';
    
    const emailBodyDiv = document.getElementById('resEmailBody');
    if (emailBodyDiv) {
      emailBodyDiv.innerHTML = parseMarkdownToHtml(data.followup_email.email_body) || 'Draft email will appear here.';
    }
  }

  if (data.handoff_summary) {
    document.getElementById('resHandoffSummary').innerHTML = parseMarkdownToHtml(data.handoff_summary.summary) || '—';
    document.getElementById('resHandoffSteps').innerHTML = Array.isArray(data.handoff_summary.next_steps)
      ? data.handoff_summary.next_steps.map(s => `<li>${sanitizeRawText(s)}</li>`).join('')
      : '<li>—</li>';
    document.getElementById('resHandoffRisks').innerHTML = Array.isArray(data.handoff_summary.risks)
      ? data.handoff_summary.risks.map(r => `<li>${sanitizeRawText(r)}</li>`).join('')
      : '<li>—</li>';
  }

  if (data.crm_stub) {
    document.getElementById('resOppName').innerText = sanitizeRawText(data.crm_stub.opportunity_name) || '—';
    document.getElementById('resOppAccount').innerText = sanitizeRawText(data.crm_stub.account_name) || '—';
    document.getElementById('resOppValue').innerText = sanitizeRawText(data.crm_stub.estimated_value) || '—';
    document.getElementById('resOppNotes').innerText = sanitizeRawText(data.crm_stub.notes) || '—';
  }

  if (data.deal_score) {
    const score = data.deal_score.score || 0;
    const scoreNumEl = document.getElementById('resScoreNum');
    scoreNumEl.textContent = score + '/100';
    const label = score >= 80 ? 'Deal Ready — High Probability' : score >= 60 ? 'Promising — Qualified Opportunity' : score >= 40 ? 'Needs Work — Missing Details' : 'Early Stage';
    document.getElementById('resScoreLabel').textContent = label;
    const color = score >= 80 ? 'var(--status-green)' : score >= 60 ? 'var(--ibm-blue)' : score >= 40 ? 'var(--status-amber)' : 'var(--status-red)';
    scoreNumEl.style.color = color;
    const bar = document.getElementById('resScoreBar');
    bar.style.width = score + '%';
    bar.style.background = color;

    document.getElementById('resScoreMissing').innerHTML = Array.isArray(data.deal_score.missing_fields)
      ? data.deal_score.missing_fields.map(f => `<li>${sanitizeRawText(f)}</li>`).join('')
      : '<li>None identified</li>';
    const actions = data.next_best_actions || data.deal_score.next_best_actions || [];
    document.getElementById('resScoreActions').innerHTML = Array.isArray(actions)
      ? actions.map(a => `<li>${sanitizeRawText(a)}</li>`).join('')
      : '<li>Schedule discovery call</li>';
  }
}

function formatEmailText(command, value = null) {
  document.execCommand(command, false, value);
  document.getElementById('resEmailBody').focus();
}

function insertEmailPlaceholder() {
  const editor = document.getElementById('resEmailBody');
  if (editor) {
    // Avoid double signatures
    if (!editor.innerHTML.includes('Senior IBM Client Solutions Architect')) {
      editor.innerHTML += '<p><br>Best regards,<br><strong>[Your Name]</strong><br>Senior IBM Client Solutions Architect<br>Ingram Micro / IBM Partner Ecosystem</p>';
    }
  }
}

function copyEmailToClipboard() {
  const subject = document.getElementById('resEmailSubject').value;
  const emailBodyDiv = document.getElementById('resEmailBody');
  const bodyText = emailBodyDiv ? emailBodyDiv.innerText : '';
  const textToCopy = `Subject: ${subject}\n\n${bodyText}`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    const copyBtns = document.querySelectorAll('.copy-email-btn');
    copyBtns.forEach(btn => {
      btn.innerHTML = '✓ Copied';
      setTimeout(() => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Email';
      }, 2000);
    });
  }).catch(() => {});
}

async function downloadPdf() {
  if (!lastPackageData) {
    alert('Please generate an opportunity package first.');
    return;
  }

  const btn = document.getElementById('pdfBtn');
  const origHTML = btn.innerHTML;
  btn.textContent = 'Generating PDF…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(lastPackageData),
    });

    if (!res.ok) throw new Error(`PDF API HTTP Error (${res.status})`);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      } else {
        throw new Error('No download URL returned');
      }
    } else {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'Partner_Growth_Opportunity_Package.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  } catch (err) {
    console.warn('[PDF Download Fallback Triggered]', err);
    const printWin = window.open('', '_blank');
    if (printWin) {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Partner Growth Copilot — Opportunity Package</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            h1 { color: #0f62fe; }
            h2 { color: #0f172a; border-bottom: 2px solid #0f62fe; padding-bottom: 6px; margin-top: 30px; }
            .section { margin-bottom: 24px; }
          </style>
        </head>
        <body>
          <h1>Partner Growth Copilot</h1>
          <p><strong>IBM Enterprise Pre-Sales Solution Package</strong></p>
          <hr>
          <h2>1. IBM Solution Proposal</h2>
          <p>${parseMarkdownToHtml(lastPackageData.proposal?.proposal || '')}</p>
          <h2>2. Customer Follow-Up Email</h2>
          <p><strong>Subject:</strong> ${lastPackageData.followup_email?.subject || ''}</p>
          <p>${parseMarkdownToHtml(lastPackageData.followup_email?.email_body || '')}</p>
          <h2>3. Technical Handoff Summary</h2>
          <p>${parseMarkdownToHtml(lastPackageData.handoff_summary?.summary || '')}</p>
          <h2>4. CRM Opportunity Stub</h2>
          <p><strong>Opportunity:</strong> ${lastPackageData.crm_stub?.opportunity_name || ''}</p>
          <p><strong>Estimated Value:</strong> ${lastPackageData.crm_stub?.estimated_value || ''}</p>
          <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
      `;
      printWin.document.write(htmlContent);
      printWin.document.close();
    }
  } finally {
    btn.innerHTML = origHTML;
    btn.disabled = false;
  }
}

async function executeMode(mode) {
  const dealInput = document.getElementById('dealInput').value.trim();
  if (!dealInput) {
    document.getElementById('dealInput').focus();
    return;
  }

  document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
  const activeChip = document.querySelector(`.mode-chip[data-mode="${mode}"]`);
  if (activeChip) activeChip.classList.add('active');

  const resultSection = document.getElementById('modeResult');
  const card = document.getElementById('modeResultCard');
  resultSection.classList.add('visible');
  card.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div><span class="loader-text">Analyzing with watsonx.ai specialist mode…</span></div>';

  const endpoint = {
    dealCoach: '/api/deal-coach',
    pilot: '/api/pilot-recommendation',
    redTeam: '/api/red-team',
  }[mode];

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        raw_input: dealInput,
        industry: detectIndustry(dealInput),
      }),
    });

    if (!res.ok) throw new Error(`API error (${res.status})`);
    const data = await res.json();

    if (mode === 'dealCoach') renderDealCoach(card, data);
    else if (mode === 'pilot') renderPilot(card, data);
    else if (mode === 'redTeam') renderRedTeam(card, data);
  } catch (err) {
    card.innerHTML = `<p style="color:var(--status-red);padding:20px">Error: ${err.message}</p>`;
  }
}

function renderDealCoach(el, data) {
  const score = data.readiness_score || 0;
  const color = score >= 80 ? 'var(--status-green)' : score >= 60 ? 'var(--ibm-blue)' : score >= 40 ? 'var(--status-amber)' : 'var(--status-red)';
  el.innerHTML = `
    <div class="pane-header">
      <h4>Deal Coach Strategic Feedback</h4>
      <span class="badge">${data.readiness_label || 'Evaluation Complete'}</span>
    </div>
    <div class="score-display">
      <div class="score-number" style="color:${color}">${score}/100</div>
      <div class="score-bar"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div>
    </div>
    ${data.coaching_notes ? `<div class="coaching-note">${parseMarkdownToHtml(data.coaching_notes)}</div>` : ''}
    <div class="two-col">
      <div class="two-col-item"><h5>Missing Information</h5><ul>${(data.missing_information || []).map(i => `<li>${sanitizeRawText(i)}</li>`).join('')}</ul></div>
      <div class="two-col-item"><h5>Next Best Actions</h5><ul>${(data.next_best_actions || []).map(a => `<li>${sanitizeRawText(a)}</li>`).join('')}</ul></div>
    </div>
  `;
}

function renderPilot(el, data) {
  el.innerHTML = `
    <div class="pane-header">
      <h4>Pilot Strategy Recommendation</h4>
      <span class="badge">${data.pilot_name || 'IBM Viable Pilot'}</span>
    </div>
    <div style="font-size:15px; margin-bottom:20px; line-height:1.6;">${parseMarkdownToHtml(data.smallest_viable_pilot || '')}</div>
    ${data.estimated_scope ? `
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px;">
        <div style="background:var(--bg-inset); padding:12px; border-radius:8px; text-align:center;"><span style="font-size:20px; font-weight:800; color:var(--ibm-blue);">${data.estimated_scope.duration_weeks || '4-6'}</span><br><span style="font-size:11px; color:var(--text-muted);">Weeks</span></div>
        <div style="background:var(--bg-inset); padding:12px; border-radius:8px; text-align:center;"><span style="font-size:20px; font-weight:800; color:var(--ibm-blue);">${data.estimated_scope.team_size || '3'}</span><br><span style="font-size:11px; color:var(--text-muted);">Team Size</span></div>
        <div style="background:var(--bg-inset); padding:12px; border-radius:8px; text-align:center;"><span style="font-size:20px; font-weight:800; color:var(--ibm-blue);">${data.estimated_scope.estimated_cost_usd || '$25K-$50K'}</span><br><span style="font-size:11px; color:var(--text-muted);">Est. Cost</span></div>
      </div>
    ` : ''}
    <div class="two-col">
      <div class="two-col-item"><h5>Recommended IBM Products</h5><ul>${(data.recommended_ibm_products || []).map(p => `<li>${sanitizeRawText(p)}</li>`).join('')}</ul></div>
      <div class="two-col-item"><h5>Measurable Success KPIs</h5><ul>${(data.success_kpis || []).map(k => `<li>${sanitizeRawText(k)}</li>`).join('')}</ul></div>
    </div>
  `;
}

function renderRedTeam(el, data) {
  const objections = (data.likely_objections || []).map(obj => `
    <div style="background:var(--bg-inset); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:10px;">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">${obj.stakeholder || 'Stakeholder'} &middot; ${obj.severity || 'MEDIUM'}</div>
      <div style="font-size:14px; font-weight:700; margin-bottom:6px;">"${sanitizeRawText(obj.objection)}"</div>
      ${obj.suggested_response ? `<div style="font-size:13px; color:var(--text-secondary); border-left:3px solid var(--ibm-blue); padding-left:10px;">${sanitizeRawText(obj.suggested_response)}</div>` : ''}
    </div>
  `).join('');

  el.innerHTML = `
    <div class="pane-header">
      <h4>Red Team Objection & Risk Analysis</h4>
    </div>
    ${objections || '<p style="color:var(--text-muted)">No major objections identified.</p>'}
    <div class="two-col" style="margin-top:16px">
      <div class="two-col-item"><h5>Commercial Risks</h5><ul>${(data.commercial_risks || []).map(r => `<li>${sanitizeRawText(r)}</li>`).join('')}</ul></div>
      <div class="two-col-item"><h5>Technical Risks</h5><ul>${(data.technical_risks || []).map(r => `<li>${sanitizeRawText(r)}</li>`).join('')}</ul></div>
    </div>
  `;
}
