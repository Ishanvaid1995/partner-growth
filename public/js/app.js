const API_KEY = 'pgc-secret-key-123';
const HEADERS = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };

let currentUser = null;
let userToken = localStorage.getItem('pgc_user_token') || null;
let currentTheme = localStorage.getItem('pgc_theme') || 'dark';
let isAuthRegisterMode = false;
let isGenerating = false;

let chatHistory = [];
let lastPackageData = null;
let conversationContext = '';
let currentConvId = null;

const SCENARIOS = {
  retail: 'Customer: Acme Retail; Industry: Retail & E-Commerce; Use case: AI analytics for customer personalization and real-time inventory demand forecasting; Budget: $100,000 USD; Timeline: Q4.',
  manufacturing: 'Customer: Apex Manufacturing; Industry: Industrial & Automotive; Use case: IoT predictive maintenance, downtime reduction, and equipment failure forecasting; Budget: $250,000 USD; Timeline: Q1.',
  healthcare: 'Customer: HealthFirst Care; Industry: Healthcare & Life Sciences; Use case: Virtual agent for patient scheduling, HIPAA compliance, and EHR query automation; Budget: $150,000 USD; Timeline: Immediate.',
};

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
});

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

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth <= 768) {
    sidebar.classList.contains('mobile-open') ? closeMobileSidebar() : openMobileSidebar();
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('mobile-open');
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function applyScenario(key) {
  const text = SCENARIOS[key];
  if (!text) return;
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = text;
    autoResizeInput(input);
    input.focus();
  }
}

function startNewChat() {
  chatHistory = [];
  lastPackageData = null;
  conversationContext = '';
  currentConvId = null;

  const messages = document.getElementById('chatMessages');
  if (messages) {
    messages.innerHTML = `
      <div class="welcome-screen" id="welcomeScreen">
        <div class="welcome-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h1 class="welcome-title">Partner Growth Copilot</h1>
        <p class="welcome-sub">Paste a customer deal context to generate an IBM pre-sales proposal. Then ask follow-up questions — risks, architecture, budgets, pilots — in a natural conversation.</p>
        <div class="welcome-chips">
          <button class="welcome-chip" onclick="applyScenario('retail')">
            <span class="chip-icon">🛍️</span>
            <div><div class="chip-title">Retail Analytics</div><div class="chip-desc">AI personalization & demand forecasting</div></div>
          </button>
          <button class="welcome-chip" onclick="applyScenario('manufacturing')">
            <span class="chip-icon">🏭</span>
            <div><div class="chip-title">Manufacturing Maintenance</div><div class="chip-desc">IoT predictive maintenance & downtime reduction</div></div>
          </button>
          <button class="welcome-chip" onclick="applyScenario('healthcare')">
            <span class="chip-icon">🏥</span>
            <div><div class="chip-title">Healthcare AI</div><div class="chip-desc">HIPAA virtual agent & EHR automation</div></div>
          </button>
        </div>
      </div>`;
  }

  const pdfBtn = document.getElementById('pdfBtn');
  if (pdfBtn) pdfBtn.style.display = 'none';

  const input = document.getElementById('chatInput');
  if (input) { input.value = ''; autoResizeInput(input); }

  closeMobileSidebar();
}

function handleChatKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

async function sendChatMessage() {
  if (isGenerating) return;
  const input = document.getElementById('chatInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.remove();

  appendUserBubble(text);
  chatHistory.push({ role: 'user', content: text });

  if (input) { input.value = ''; autoResizeInput(input); }

  const typingId = appendTypingIndicator();
  isGenerating = true;
  setSendDisabled(true);

  try {
    if (!window.chatThreadId) {
      window.chatThreadId = 'thread-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(0, -1),
        conversation_context: conversationContext,
        thread_id: window.chatThreadId
      }),
    });

    removeTypingIndicator(typingId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      appendErrorBubble(err.message || `Error ${res.status} — please try again.`);
      return;
    }

    const data = await res.json();

    if (data.type === 'proposal') {
      lastPackageData = data.package_data;
      conversationContext = buildContext(data.package_data);
      appendProposalCard(data.package_data);
      chatHistory.push({ role: 'assistant', content: `[Proposal generated for: ${data.package_data?.proposal?.solution_name || 'Customer'}]` });

      const pdfBtn = document.getElementById('pdfBtn');
      if (pdfBtn) pdfBtn.style.display = 'inline-flex';

      autoSaveConversation(text, data.package_data);
    } else if (data.type === 'email') {
      appendEmailCard(data.email_data || { subject: 'Executive Follow-Up Email', email_body: data.content });
      chatHistory.push({ role: 'assistant', content: data.content || '' });
    } else {
      appendAssistantBubble(data.assistant_message || data.content || 'Sorry, I could not generate a response.');
      chatHistory.push({ role: 'assistant', content: data.content || '' });
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendErrorBubble('Network error — please check your connection and try again.');
  } finally {
    isGenerating = false;
    setSendDisabled(false);
  }
}

function setSendDisabled(disabled) {
  const btn = document.getElementById('chatSendBtn');
  if (btn) btn.disabled = disabled;
}

function appendUserBubble(text) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  const row = document.createElement('div');
  row.className = 'chat-row chat-row--user';
  row.innerHTML = `<div class="chat-bubble--user">${escapeHtml(text)}</div>`;
  messages.appendChild(row);
  scrollToBottom();
}

function appendTypingIndicator() {
  const messages = document.getElementById('chatMessages');
  if (!messages) return null;
  const id = 'typing_' + Date.now();
  const row = document.createElement('div');
  row.className = 'chat-row chat-row--assistant';
  row.id = id;
  row.innerHTML = `
    <div class="chat-typing">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  messages.appendChild(row);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendAssistantBubble(markdownText) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  const row = document.createElement('div');
  row.className = 'chat-row chat-row--assistant';
  row.innerHTML = `
    <div class="chat-bubble--assistant">
      <div class="assistant-header">
        <div class="assistant-avatar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <span class="assistant-name">Partner Growth Copilot</span>
      </div>
      <div class="formatted-content">${parseMarkdownToHtml(markdownText)}</div>
    </div>`;
  messages.appendChild(row);
  scrollToBottom();
}

function appendProposalCard(pkg) {
  const messages = document.getElementById('chatMessages');
  if (!messages || !pkg) return;

  const proposal = pkg.proposal || {};
  const solutionName = sanitizeText(proposal.solution_name) || 'IBM Solution Proposal';
  const stack = Array.isArray(proposal.recommended_ibm_stack)
    ? proposal.recommended_ibm_stack.join(' · ')
    : 'IBM watsonx.ai, IBM watsonx Orchestrate';
  const outcomes = Array.isArray(proposal.business_outcomes)
    ? proposal.business_outcomes.join(' · ')
    : '—';
  const proposalHtml = parseMarkdownToHtml(
    typeof proposal.proposal === 'string' ? proposal.proposal : (proposal.proposal?.proposal || '')
  );

  const row = document.createElement('div');
  row.className = 'chat-row chat-row--assistant';
  row.innerHTML = `
    <div class="chat-bubble--assistant">
      <div class="assistant-header">
        <div class="assistant-avatar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <span class="assistant-name">Partner Growth Copilot</span>
      </div>

      <div style="font-family:var(--font-heading); font-size:17px; font-weight:800; margin-bottom:14px; color:var(--text-primary);">${escapeHtml(solutionName)}</div>

      <div class="proposal-meta">
        <div class="proposal-meta-item">
          <div class="proposal-meta-label">Recommended IBM Stack</div>
          <div class="proposal-meta-value">${escapeHtml(stack)}</div>
        </div>
        <div class="proposal-meta-item">
          <div class="proposal-meta-label">Target Business Outcomes</div>
          <div class="proposal-meta-value">${escapeHtml(outcomes)}</div>
        </div>
      </div>

      <div class="formatted-content">${proposalHtml}</div>

      <div class="proposal-actions">
        <button class="proposal-action-btn primary" onclick="downloadPdf()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PDF
        </button>
        <button class="proposal-action-btn" onclick="askQuestion('What are the main technical and commercial risks for this deal?')">
          🛡️ Surface Risks
        </button>
        <button class="proposal-action-btn" onclick="askQuestion('What is the recommended pilot strategy and smallest viable scope?')">
          🚀 Pilot Strategy
        </button>
        <button class="proposal-action-btn" onclick="askQuestion('What are the likely objections from the customer and how should I respond?')">
          💬 Handle Objections
        </button>
        <button class="proposal-action-btn" onclick="downloadWord()" style="margin-left:auto;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Word (.docx)
        </button>
      </div>
    </div>`;
  messages.appendChild(row);
  scrollToBottom();
}

function appendEmailCard(emailData) {
  const messages = document.getElementById('chatMessages');
  if (!messages || !emailData) return;

  const subject = sanitizeText(emailData.subject) || 'Executive Follow-Up Email';
  const rawBody = cleanHtmlToMarkdown(emailData.email_body || emailData.content || '');
  const bodyHtml = parseMarkdownToHtml(rawBody);

  const row = document.createElement('div');
  row.className = 'chat-row chat-row--assistant';
  row.innerHTML = `
    <div class="chat-bubble--assistant">
      <div class="assistant-header">
        <div class="assistant-avatar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <span class="assistant-name">Partner Growth Copilot — Executive Follow-Up Email</span>
      </div>

      <div style="background: var(--bg-inset); border: 1px solid var(--border-light); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 14px;">
        <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ibm-blue); margin-bottom: 4px;">Subject</div>
        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${escapeHtml(subject)}</div>
      </div>

      <div class="formatted-content" style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius); border: 1px solid var(--border);">${bodyHtml}</div>

      <div class="proposal-actions">
        <button class="proposal-action-btn primary" onclick="copyEmailText('${safeEncodeString(subject)}', '${safeEncodeString(rawBody)}')">
          📋 Copy Email
        </button>
        <button class="proposal-action-btn" onclick="downloadPdf()">
          Download PDF
        </button>
        <button class="proposal-action-btn" onclick="downloadWord()" style="margin-left:auto;">
          Word (.docx)
        </button>
      </div>
    </div>`;
  messages.appendChild(row);
  scrollToBottom();
}

function safeEncodeString(str) {
  return encodeURIComponent(str || '');
}

function showToast(message) {
  let toast = document.getElementById('pgcToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pgcToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #0f172a;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 24px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      z-index: 9999;
      opacity: 0;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 90vw;
      text-align: center;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${escapeHtml(message)}`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  if (toast.timeoutId) clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2500);
}

function copyEmailText(encodedSubject, encodedBody) {
  const subject = decodeURIComponent(encodedSubject);
  const body = decodeURIComponent(encodedBody);
  const fullText = `Subject: ${subject}\n\n${body}`;
  navigator.clipboard.writeText(fullText).then(() => {
    showToast('Executive email copied to clipboard');
  }).catch(() => {
    showToast('Copied subject: ' + subject);
  });
}

function appendErrorBubble(message) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  const row = document.createElement('div');
  row.className = 'chat-row chat-row--assistant';
  row.innerHTML = `
    <div class="chat-bubble--assistant" style="border-color: rgba(239,68,68,0.3);">
      <div class="assistant-header">
        <div class="assistant-avatar" style="background: #ef4444;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <span class="assistant-name" style="color:#ef4444;">Error</span>
      </div>
      <p style="color: var(--text-secondary); font-size: 14px;">${escapeHtml(message)}</p>
    </div>`;
  messages.appendChild(row);
  scrollToBottom();
}

function askQuestion(text) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = text;
    autoResizeInput(input);
  }
  sendChatMessage();
}

function scrollToBottom() {
  const messages = document.getElementById('chatMessages');
  if (messages) {
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  }
}

function buildContext(pkg) {
  if (!pkg) return '';
  const p = pkg.proposal || {};
  const parts = [];
  if (p.solution_name) parts.push(`Solution: ${p.solution_name}`);
  if (Array.isArray(p.recommended_ibm_stack)) parts.push(`IBM Stack: ${p.recommended_ibm_stack.join(', ')}`);
  if (Array.isArray(p.business_outcomes)) parts.push(`Outcomes: ${p.business_outcomes.join('; ')}`);
  if (typeof p.proposal === 'string') parts.push(p.proposal.slice(0, 800));
  const h = pkg.handoff_summary || {};
  if (Array.isArray(h.risks) && h.risks.length) parts.push(`Risks: ${h.risks.join('; ')}`);
  if (Array.isArray(h.next_steps) && h.next_steps.length) parts.push(`Next Steps: ${h.next_steps.join('; ')}`);
  const s = pkg.deal_score || {};
  if (s.score) parts.push(`Deal Score: ${s.score}/100`);
  return parts.join('\n');
}

function triggerFileDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function getActivePackageData() {
  if (lastPackageData && (lastPackageData.proposal || lastPackageData.raw_input)) {
    return lastPackageData;
  }
  const messages = document.getElementById('chatMessages');
  if (messages) {
    const bubbles = Array.from(messages.querySelectorAll('.formatted-content, .chat-bubble--assistant'));
    if (bubbles.length > 0) {
      const fullText = bubbles.map(b => b.innerText || b.textContent || '').join('\n\n');
      if (fullText.trim().length > 30) {
        lastPackageData = {
          proposal: {
            proposal: fullText
          }
        };
        return lastPackageData;
      }
    }
  }
  return null;
}

async function downloadPdf() {
  const pkg = getActivePackageData();
  if (!pkg) {
    appendErrorBubble('No proposal available. Please generate a package first.');
    return;
  }
  const btn = document.getElementById('pdfBtn');
  if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; }
  try {
    const res = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(pkg),
    });
    const data = await res.json();
    if (data.download_url) {
      triggerFileDownload(data.download_url, data.file_name);
    } else {
      appendErrorBubble('PDF generation failed. Please try again.');
    }
  } catch (err) {
    appendErrorBubble('PDF download error: ' + err.message);
  } finally {
    if (btn) { btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> PDF'; btn.disabled = false; }
  }
}

async function downloadWord() {
  const pkg = getActivePackageData();
  if (!pkg) {
    appendErrorBubble('No proposal available. Please generate a package first.');
    return;
  }
  try {
    const res = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(pkg),
    });
    const data = await res.json();
    if (data.download_url) {
      triggerFileDownload(data.download_url, data.file_name);
    } else {
      appendErrorBubble('Word generation failed. Please try again.');
    }
  } catch (err) {
    appendErrorBubble('Word download error: ' + err.message);
  }
}

function autoSaveConversation(rawInput, pkg) {
  if (!currentUser || !userToken) {
    const banner = document.getElementById('guestSaveBanner');
    if (banner) banner.style.display = 'flex';
    return;
  }
  const accountName = extractAccountName(rawInput);
  const industry = detectIndustry(rawInput);
  fetch('/api/conversations', {
    method: 'POST',
    headers: { ...HEADERS, 'x-user-id': userToken },
    body: JSON.stringify({ account_name: accountName, industry, raw_input: rawInput, packageData: pkg }),
  })
    .then(r => r.json())
    .then(saved => {
      currentConvId = saved.id;
      loadSavedConversations();
    })
    .catch(() => {});
}

async function loadSavedConversations() {
  if (!currentUser || !userToken) {
    renderGuestFolders();
    return;
  }
  try {
    const res = await fetch('/api/conversations', {
      headers: { ...HEADERS, 'x-user-id': userToken },
    });
    const data = await res.json();
    renderFolders(data.folders || []);
  } catch {
    renderGuestFolders();
  }
}

function renderGuestFolders() {
  const el = document.getElementById('companyFoldersList');
  if (el) el.innerHTML = '<div style="padding:12px 8px; font-size:12px; color:var(--text-muted);">Sign in to save deal conversations.</div>';
}

function renderFolders(folders) {
  const el = document.getElementById('companyFoldersList');
  if (!el) return;
  if (!folders.length) {
    el.innerHTML = '<div style="padding:12px 8px; font-size:12px; color:var(--text-muted);">No saved deals yet. Generate a proposal to save it here.</div>';
    return;
  }
  el.innerHTML = folders.map((folder, fi) => `
    <div class="folder-item">
      <div class="folder-header" onclick="toggleFolder(this)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="folder-name">${escapeHtml(folder.folderName)}</span>
        <span class="folder-count">${folder.count}</span>
        <button class="delete-action-btn" title="Delete folder" onclick="deleteFolderGroup('${escapeHtml(folder.folderName)}', event)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div class="folder-children ${fi === 0 ? 'open' : ''}">
        ${(folder.conversations || []).map(conv => {
          const label = conv.packageData?.proposal?.solution_name
            || conv.title
            || conv.accountName
            || 'Deal Package';
          const safeSerialized = encodeURIComponent(JSON.stringify(conv));
          return `
            <div class="folder-child-item ${conv.id === currentConvId ? 'active' : ''}" onclick="loadConversationById('${conv.id}', '${safeSerialized}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label)}</span>
              <button class="delete-action-btn" title="Delete conversation" onclick="deleteConversationItem('${conv.id}', event)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

async function deleteConversationItem(convId, event) {
  if (event) event.stopPropagation();
  if (!userToken) return;
  try {
    const res = await fetch(`/api/conversations/${convId}`, {
      method: 'DELETE',
      headers: { ...HEADERS, 'x-user-id': userToken },
    });
    if (res.ok) {
      if (currentConvId === convId) {
        startNewChat();
      }
      loadSavedConversations();
    }
  } catch (e) {}
}

async function deleteFolderGroup(folderName, event) {
  if (event) event.stopPropagation();
  if (!userToken) return;
  try {
    const encoded = encodeURIComponent(folderName);
    const res = await fetch(`/api/folders/${encoded}`, {
      method: 'DELETE',
      headers: { ...HEADERS, 'x-user-id': userToken },
    });
    if (res.ok) {
      startNewChat();
      loadSavedConversations();
    }
  } catch (e) {}
}

function toggleFolder(headerEl) {
  const children = headerEl.nextElementSibling;
  if (children) children.classList.toggle('open');
}

function loadConversationById(convId, encodedConv) {
  let conv;
  try {
    conv = JSON.parse(decodeURIComponent(encodedConv));
  } catch { return; }
  loadConversation(convId, conv);
}

function loadConversation(convId, convData) {
  const conv = typeof convData === 'string'
    ? (() => { try { return JSON.parse(convData); } catch { return null; } })()
    : convData;
  if (!conv) return;

  currentConvId = convId;
  lastPackageData = conv.packageData || null;
  conversationContext = buildContext(conv.packageData);
  chatHistory = [];

  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  messages.innerHTML = '';

  if (conv.rawInput) {
    appendUserBubble(conv.rawInput);
    chatHistory.push({ role: 'user', content: conv.rawInput });
  }

  if (conv.packageData) {
    appendProposalCard(conv.packageData);
    chatHistory.push({ role: 'assistant', content: `[Proposal: ${conv.packageData?.proposal?.solution_name || 'Package'}]` });
  }

  const pdfBtn = document.getElementById('pdfBtn');
  const wordBtn = document.getElementById('wordBtn');
  if (pdfBtn) pdfBtn.style.display = 'inline-flex';
  if (wordBtn) wordBtn.style.display = 'inline-flex';

  closeMobileSidebar();
}

function cleanHtmlToMarkdown(text) {
  if (!text) return '';
  let str = String(text).trim();

  // Strip unwanted label artifacts like "Body (HTML):" or "Email Body (HTML):" or "Email Body:"
  str = str.replace(/^(?:Email\s*)?Body\s*(?:\(HTML\))?:?\s*$/gmi, '')
           .replace(/^Body\s*\(HTML\):?\s*/gmi, '')
           .replace(/^Email\s*Body:?\s*/gmi, '');

  // If wrapped in ```html ... ``` code fences containing HTML tags, unwrap them
  str = str.replace(/```(?:html|xml)?\s*([\s\S]*?)\s*```/gi, '$1');

  // Convert HTML elements (<p>, <ul>, <ol>, <li>, <br>, <strong>) into clean markdown text
  if (/<(?:p|ul|ol|li|br|h[1-6]|div|span)\b/i.test(str)) {
    str = str.replace(/<p\b[^>]*>/gi, '')
             .replace(/<\/p>/gi, '\n\n')
             .replace(/<ul\b[^>]*>/gi, '\n')
             .replace(/<\/ul>/gi, '\n')
             .replace(/<ol\b[^>]*>/gi, '\n')
             .replace(/<\/ol>/gi, '\n')
             .replace(/<li\b[^>]*>/gi, '- ')
             .replace(/<\/li>/gi, '\n')
             .replace(/<br\s*\/?>/gi, '\n')
             .replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '**$1**')
             .replace(/<b\b[^>]*>(.*?)<\/b>/gi, '**$1**')
             .replace(/<em\b[^>]*>(.*?)<\/em>/gi, '*$1*')
             .replace(/<i\b[^>]*>(.*?)<\/i>/gi, '*$1*')
             .replace(/<[^>]+>/g, '')
             .replace(/\n{3,}/g, '\n\n');
  }

  return str.trim();
}

function parseMarkdownToHtml(markdownText) {
  if (!markdownText) return '';
  let clean = sanitizeText(markdownText);
  clean = cleanHtmlToMarkdown(clean);

  // Strip stray horizontal rules early
  clean = clean.replace(/^(?:---|___|\*\*\*)[ \t]*$/gm, '');

  // 1. Extract triple backtick code blocks to protect them
  const codeBlocks = [];
  clean = clean.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(code);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Remove package metadata lines if they leaked
  clean = clean.replace(/^\{?\s*"proposal"\s*:\s*"/i, '')
               .replace(/^"proposal"\s*:\s*"/i, '')
               .replace(/"\s*\}?\s*$/, '');

  // Render Subject lines as executive Subject Card banners
  clean = clean.replace(
    /^(?:\*\*|\*)?Subject:(?:\*\*|\*)?\s*(.+)$/gmi,
    '<div style="background: var(--bg-inset, #f4f6f8); border: 1px solid var(--border-light, #e0e0e0); border-left: 4px solid var(--ibm-blue, #0f62fe); border-radius: 6px; padding: 10px 14px; margin: 12px 0 14px 0;"><div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ibm-blue, #0f62fe); margin-bottom: 3px;">Subject</div><div style="font-size: 14px; font-weight: 700; color: var(--text-primary, #161616);">$1</div></div>'
  );

  // Convert headers
  clean = clean.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  clean = clean.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  clean = clean.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
  clean = clean.replace(/^(\d+\.\s+[A-Z][^\n]{2,60})$/gm, '<h3>$1</h3>');

  // 2. Parse Markdown Tables robustly line-by-line
  const lines = clean.split('\n');
  const newLines = [];
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (tableRows.length === 0) return;
    
    const dataRows = tableRows.filter(row => !/^\|?[-:\s|]+\|?$/.test(row.trim()));
    
    if (dataRows.length > 0) {
      let tableHtml = '<div class="table-responsive"><table class="md-table">';
      
      dataRows.forEach((row, ri) => {
        const cells = row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (ri === 0) {
          tableHtml += '<thead><tr>';
          cells.forEach(c => tableHtml += `<th>${boldInline(escapeHtml(c))}</th>`);
          tableHtml += '</tr></thead><tbody>';
        } else {
          tableHtml += `<tr class="${ri % 2 === 1 ? 'alt-row' : ''}">`;
          cells.forEach(c => tableHtml += `<td>${boldInline(escapeHtml(c))}</td>`);
          tableHtml += '</tr>';
        }
      });
      tableHtml += '</tbody></table></div>';
      newLines.push(tableHtml);
    }
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      inTable = true;
      tableRows.push(line);
    } else {
      if (inTable) {
        if (line === '' && i + 1 < lines.length && lines[i+1].trim().startsWith('|')) {
          continue;
        }
        flushTable();
      }
      newLines.push(lines[i]);
    }
  }
  if (inTable) flushTable();
  
  clean = newLines.join('\n');

  // Convert Lists
  clean = clean.replace(
    /((?:^[ \t]*[-*•+][ \t]+.+(?:\n|$))+)/gm,
    (match) => {
      const items = match.trim().split('\n')
        .map(l => l.trim().replace(/^[-*•+]\s+/, '').trim())
        .filter(Boolean);
      return '<ul>' + items.map(i => `<li>${boldInline(i)}</li>`).join('') + '</ul>';
    }
  );

  clean = clean.replace(
    /((?:^[ \t]*\d+\.[ \t]+.+(?:\n|$))+)/gm,
    (match) => {
      const items = match.trim().split('\n')
        .map(l => l.trim().replace(/^\d+\.\s+/, '').trim())
        .filter(Boolean);
      return '<ol>' + items.map(i => `<li>${boldInline(i)}</li>`).join('') + '</ol>';
    }
  );

  // Group paragraphs
  const parts = clean.split('\n\n');
  const result = parts.map(block => {
    const t = block.trim();
    if (!t) return '';
    if (/^(__CODE|<h[2-4]|<ul|<ol|<div|<table)/i.test(t)) return t;
    const pLines = t.split('\n').map(l => l.trim()).filter(Boolean);
    return `<p>${boldInline(pLines.join('<br>'))}</p>`;
  });

  let finalHtml = result.filter(Boolean).join('\n');

  // Restore Code Blocks
  codeBlocks.forEach((code, index) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${index}__`, `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
  });

  return finalHtml;
}

function boldInline(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function sanitizeText(input) {
  if (!input) return '';
  let str = typeof input === 'object'
    ? (input.proposal ? (typeof input.proposal === 'string' ? input.proposal : (input.proposal.proposal || '')) : input.email_body || input.summary || JSON.stringify(input))
    : String(input).trim();

  str = str.replace(/^```(?:json|html)\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();

  if (str.includes('"email_body"') || str.includes('"proposal"') || str.includes('"solution_name"') || str.startsWith('{')) {
    try {
      const match = str.match(/"(email_body|proposal)"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"|\s*\}$)/);
      if (match && match[2]) {
        str = match[2];
      } else {
        const parsed = JSON.parse(str);
        if (parsed.proposal) str = typeof parsed.proposal === 'string' ? parsed.proposal : (parsed.proposal.proposal || '');
        else if (parsed.email_body) str = parsed.email_body;
        else if (parsed.summary) str = parsed.summary;
      }
    } catch(e) {
      str = str
        .replace(/",\s*"solution_name"[\s\S]*/i, '')
        .replace(/^\{\s*"(proposal|email_body)"\s*:\s*"/i, '')
        .replace(/",\s*"recommended_ibm_stack"[\s\S]*/i, '')
        .replace(/\s*\}\s*$/, '');
    }
  }

  return str
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/^"|"$/g, '')
    .trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initAuth() {
  if (userToken) {
    fetch('/api/auth/me', {
      headers: { ...HEADERS, 'x-user-id': userToken },
    })
      .then(r => r.json())
      .then(user => {
        if (user && user.id) {
          currentUser = user;
          if (user.theme) {
            currentTheme = user.theme;
            document.documentElement.setAttribute('data-theme', currentTheme);
            updateThemeUI();
          }
          updateUserUI(user);
          loadSavedConversations();
        } else {
          userToken = null;
          localStorage.removeItem('pgc_user_token');
          updateUserUI(null);
        }
      })
      .catch(() => { userToken = null; localStorage.removeItem('pgc_user_token'); updateUserUI(null); });
  } else {
    updateUserUI(null);
  }
}

function updateUserUI(user) {
  const avatar = document.getElementById('sidebarAvatar');
  const name = document.getElementById('sidebarUserName');
  const email = document.getElementById('sidebarUserEmail');
  if (user) {
    if (avatar) avatar.textContent = (user.name || 'U')[0].toUpperCase();
    if (name) name.textContent = user.name || 'Account';
    if (email) email.textContent = user.email || '';
  } else {
    if (avatar) avatar.textContent = 'G';
    if (name) name.textContent = 'Guest Account';
    if (email) email.textContent = 'Sign in / Register';
  }
}

function openAuthModal() { document.getElementById('authModal')?.classList.add('active'); }
function closeAuthModal() { document.getElementById('authModal')?.classList.remove('active'); }
function openUserModal() {
  if (currentUser) {
    const modal = document.getElementById('profileModal');
    if (modal) {
      const pName = document.getElementById('profName');
      const pEmail = document.getElementById('profEmail');
      if (pName) pName.value = currentUser.name || '';
      if (pEmail) pEmail.value = currentUser.email || '';
      modal.classList.add('active');
    }
  } else {
    openAuthModal();
  }
}
function closeProfileModal() { document.getElementById('profileModal')?.classList.remove('active'); }

function toggleAuthMode() {
  isAuthRegisterMode = !isAuthRegisterMode;
  const title = document.getElementById('authModalTitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const nameGroup = document.getElementById('nameGroup');
  const switchEl = document.getElementById('authSwitch');
  if (title) title.textContent = isAuthRegisterMode ? 'Create Account' : 'Sign In';
  if (submitBtn) submitBtn.textContent = isAuthRegisterMode ? 'Create Account' : 'Sign In';
  if (nameGroup) nameGroup.style.display = isAuthRegisterMode ? 'block' : 'none';
  if (switchEl) switchEl.innerHTML = isAuthRegisterMode
    ? 'Already have an account? <a onclick="toggleAuthMode()">Sign in</a>'
    : 'Don\'t have an account? <a onclick="toggleAuthMode()">Register here</a>';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('authSubmitBtn');
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value;
  const name = document.getElementById('authName')?.value.trim();
  if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }
  try {
    const endpoint = isAuthRegisterMode ? '/api/auth/register' : '/api/auth/login';
    const body = isAuthRegisterMode ? { name, email, password } : { email, password };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Authentication failed');
    currentUser = data.user;
    userToken = data.token;
    localStorage.setItem('pgc_user_token', userToken);
    updateUserUI(currentUser);
    closeAuthModal();
    loadSavedConversations();

    const banner = document.getElementById('guestSaveBanner');
    if (banner) banner.style.display = 'none';
    if (lastPackageData) {
      const rawInput = chatHistory.find(h => h.role === 'user')?.content || '';
      autoSaveConversation(rawInput, lastPackageData);
    }
  } catch(err) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color:#ef4444; font-size:13px; margin-top:8px; text-align:center;';
    errDiv.textContent = err.message;
    const form = document.getElementById('authForm');
    if (form) { const existing = form.querySelector('.auth-err'); if (existing) existing.remove(); errDiv.className = 'auth-err'; form.appendChild(errDiv); }
  } finally {
    if (btn) { btn.textContent = isAuthRegisterMode ? 'Create Account' : 'Sign In'; btn.disabled = false; }
  }
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  try {
    const name = document.getElementById('profName')?.value.trim();
    const password = document.getElementById('profPassword')?.value;
    const updates = { name };
    if (password) updates.password = password;
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { ...HEADERS, 'x-user-id': userToken },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Update failed');
    currentUser = { ...currentUser, ...data.user };
    updateUserUI(currentUser);
    closeProfileModal();
  } catch(err) {
    alert(err.message);
  } finally {
    if (btn) { btn.textContent = 'Save Changes'; btn.disabled = false; }
  }
}

function handleSignOut() {
  currentUser = null;
  userToken = null;
  localStorage.removeItem('pgc_user_token');
  updateUserUI(null);
  closeProfileModal();
  renderGuestFolders();
}

function detectIndustry(input) {
  const lower = input.toLowerCase();
  if (lower.includes('retail') || lower.includes('e-commerce')) return 'retail';
  if (lower.includes('manufactur') || lower.includes('industrial')) return 'manufacturing';
  if (lower.includes('health') || lower.includes('hospital') || lower.includes('patient')) return 'healthcare';
  return 'general';
}

function extractAccountName(input) {
  const match = input.match(/Customer\s*:\s*([^;,\n]+)/i);
  return match ? match[1].trim() : 'Customer Account';
}
