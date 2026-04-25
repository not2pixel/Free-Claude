/* ═══════════════════════════════════════════════════════════
   app.js — OpenClaude · Vanilla JS
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────
const state = {
  conversations: [],      // { id, title, messages[] }
  activeId: null,
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  modelName: 'Llama 3.3 70B Versatile',
  streaming: false,
  abortCtrl: null,
  modelsData: null,       // Loaded from models.json
};

// ── DOM refs ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const dom = {
  sidebar:        $('sidebar'),
  sidebarOverlay: $('sidebarOverlay'),
  sidebarToggle:  $('sidebarToggle'),
  convList:       $('convList'),
  emptyHint:      $('emptyHint'),
  newChatBtn:     $('newChatBtn'),
  modelBtn:       $('modelBtn'),
  modelDropdown:  $('modelDropdown'),
  providerBadge:  $('providerBadge'),
  modelLabel:     $('modelLabel'),
  providerTabs:   document.querySelectorAll('.provider-tab'),
  modelOpts:      document.querySelectorAll('.model-opt'),
  groqModels:     $('groqModels'),
  orModels:       $('openrouterModels'),
  messages:       $('messages'),
  welcome:        $('welcome'),
  input:          $('messageInput'),
  sendBtn:        $('sendBtn'),
  clearBtn:       $('clearBtn'),
  errorBanner:    $('errorBanner'),
  errorText:      $('errorText'),
  errorClose:     $('errorClose'),
  settingsToggle: $('settingsToggle'),
  settingsPanel:  $('settingsPanel'),
  systemPrompt:   $('systemPromptInput'),
  tempInput:      $('tempInput'),
  tempValue:      $('tempValue'),
  maxTokens:      $('maxTokensInput'),
};

// ═══════════════════════════════════════════════════════════
// LOAD MODELS FROM models.json
// ═══════════════════════════════════════════════════════════
async function loadModels() {
  try {
    const response = await fetch('./models.json');
    if (!response.ok) throw new Error(`Failed to load models: ${response.status}`);
    state.modelsData = await response.json();
    
    // Initialize with first provider's default model
    const firstProvider = state.modelsData.providers[0];
    const defaultModelId = firstProvider.default;
    const defaultModel = firstProvider.models.find(m => m.id === defaultModelId);
    
    state.provider = firstProvider.id;
    state.model = defaultModelId;
    state.modelName = defaultModel.name;
    
    return state.modelsData;
  } catch (error) {
    console.error('Error loading models:', error);
    showError('Failed to load model configuration');
    throw error;
  }
}

function getProviderConfig(providerId) {
  return state.modelsData?.providers.find(p => p.id === providerId);
}

function getModelConfig(providerId, modelId) {
  const provider = getProviderConfig(providerId);
  return provider?.models.find(m => m.id === modelId);
}

function getAllModels() {
  return state.modelsData?.providers.flatMap(p => 
    p.models.map(m => ({ ...m, provider: p.id }))
  ) || [];
}

// ═══════════════════════════════════════════════════════════
// MARKDOWN RENDERER (lightweight)
// ═══════════════════════════════════════════════════════════
function renderMarkdown(text) {
  if (!text) return '';

  const escape = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Protect code blocks
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre><code class="lang-${lang || 'text'}">${escape(code.trim())}</code></pre>`
    );
    return `\x00CODE${idx}\x00`;
  });

  // Protect inline code
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escape(code)}</code>`);
    return `\x00INLINE${idx}\x00`;
  });

  // Block-level
  const lines = text.split('\n');
  const out = [];
  let inUl = false, inOl = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    if (/^### (.+)/.test(line))      { closeList(); out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`); continue; }
    if (/^## (.+)/.test(line))       { closeList(); out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`); continue; }
    if (/^# (.+)/.test(line))        { closeList(); out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`); continue; }

    // HR
    if (/^---+$/.test(line.trim()))  { closeList(); out.push('<hr>'); continue; }

    // Blockquote
    if (/^> (.+)/.test(line))        { closeList(); out.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`); continue; }

    // Unordered list
    const ulMatch = line.match(/^\s*[-*+] (.+)/);
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\s*\d+\. (.+)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    closeList();

    // Code block placeholder
    if (line.includes('\x00CODE')) {
      out.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      out.push('<br>');
      continue;
    }

    // Paragraph
    out.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  let html = out.join('\n');

  // Restore
  html = html.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[i]);
  html = html.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlineCodes[i]);

  return html;
}

function inlineFormat(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\x00INLINE(\d+)\x00/g, (_, i) => `<code>${i}</code>`); // handled above
}

// ═══════════════════════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════════════════════
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getActive() {
  return state.conversations.find((c) => c.id === state.activeId) || null;
}

function createConversation() {
  const conv = { id: genId(), title: 'New conversation', messages: [] };
  state.conversations.unshift(conv);
  state.activeId = conv.id;
  renderSidebar();
  renderMessages();
  dom.input.focus();
  return conv;
}

function selectConversation(id) {
  state.activeId = id;
  renderSidebar();
  renderMessages();
  hideError();
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter((c) => c.id !== id);
  if (state.activeId === id) {
    state.activeId = state.conversations[0]?.id || null;
  }
  renderSidebar();
  renderMessages();
}

function pushMessage(role, content) {
  const conv = getActive() || createConversation();
  conv.messages.push({ role, content });
  // Auto-title from first user message
  if (role === 'user' && conv.messages.length === 1) {
    conv.title = content.slice(0, 48) + (content.length > 48 ? '…' : '');
  }
  renderSidebar();
}

// ═══════════════════════════════════════════════════════════
// RENDER — SIDEBAR
// ═══════════════════════════════════════════════════════════
function renderSidebar() {
  const list = dom.convList;
  // Clear dynamic items
  list.querySelectorAll('.conv-item').forEach((el) => el.remove());

  if (state.conversations.length === 0) {
    dom.emptyHint.style.display = '';
    return;
  }
  dom.emptyHint.style.display = 'none';

  state.conversations.forEach((conv) => {
    const btn = document.createElement('button');
    btn.className = 'conv-item' + (conv.id === state.activeId ? ' active' : '');
    btn.innerHTML = `
      <span class="conv-item-title">${escHtml(conv.title)}</span>
      <span class="conv-delete" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>
    `;
    btn.addEventListener('click', () => selectConversation(conv.id));
    btn.querySelector('.conv-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });
    list.appendChild(btn);
  });
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════════════════════
// RENDER — MESSAGES
// ═══════════════════════════════════════════════════════════
function renderMessages() {
  const conv = getActive();
  dom.messages.innerHTML = '';

  if (!conv || conv.messages.length === 0) {
    dom.messages.appendChild(buildWelcome());
    return;
  }

  conv.messages.forEach((msg) => {
    dom.messages.appendChild(buildMessageRow(msg.role, msg.content, false));
  });

  scrollBottom();
}

function buildWelcome() {
  const div = document.createElement('div');
  div.className = 'welcome';
  div.id = 'welcome';
  div.innerHTML = `
    <div class="welcome-logo">
      <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" fill="#c96442" opacity="0.10"/>
        <path d="M17 33L24 14L31 33" stroke="#c96442" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.5 27H28.5" stroke="#c96442" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    </div>
    <h1 class="welcome-title">OpenClaude</h1>
    <p class="welcome-sub">A beautiful AI chat interface powered by Groq &amp; OpenRouter.<br>Select a model above and start a conversation.</p>
    <div class="welcome-chips">
      <button class="chip" data-prompt="Explain how transformers work in neural networks, with a simple analogy">Explain transformers in AI</button>
      <button class="chip" data-prompt="Write a Python function to fetch JSON from an API with retry logic and error handling">Write Python API fetcher</button>
      <button class="chip" data-prompt="What are the key differences between TCP and UDP? Give practical examples of when to use each.">TCP vs UDP explained</button>
      <button class="chip" data-prompt="What are the SOLID principles? Give a brief example for each in TypeScript.">SOLID principles with code</button>
    </div>
  `;
  div.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dom.input.value = chip.dataset.prompt;
      dom.input.dispatchEvent(new Event('input'));
      send();
    });
  });
  return div;
}

function buildMessageRow(role, content, isStreaming) {
  const isUser = role === 'user';
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user' : 'ai'}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${isUser ? 'human' : 'ai'}`;
  avatar.innerHTML = isUser
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 48 48" fill="none"><path d="M17 33L24 14L31 33" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 27H28.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

  const body = document.createElement('div');
  body.className = 'msg-body';

  const roleLabel = document.createElement('div');
  roleLabel.className = 'msg-role';
  roleLabel.textContent = isUser ? 'You' : state.modelName;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (isUser) {
    bubble.textContent = content;
  } else {
    bubble.className += ' prose';
    bubble.innerHTML = renderMarkdown(content) + (isStreaming ? '<span class="cursor"></span>' : '');
  }

  body.appendChild(roleLabel);
  body.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(body);

  return row;
}

function addTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row ai typing-row';
  row.id = 'typingRow';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar ai';
  avatar.innerHTML = `<svg width="15" height="15" viewBox="0 0 48 48" fill="none"><path d="M17 33L24 14L31 33" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 27H28.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';

  row.appendChild(avatar);
  row.appendChild(dots);
  dom.messages.appendChild(row);
  scrollBottom();
  return row;
}

function removeTypingIndicator() {
  $('typingRow')?.remove();
}

function scrollBottom() {
  requestAnimationFrame(() => {
    dom.messages.scrollTop = dom.messages.scrollHeight;
  });
}

// ═══════════════════════════════════════════════════════════
// ERROR
// ═══════════════════════════════════════════════════════════
function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBanner.classList.remove('hidden');
}
function hideError() {
  dom.errorBanner.classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// SEND & STREAM
// ═══════════════════════════════════════════════════════════
async function send() {
  const text = dom.input.value.trim();
  if (!text || state.streaming) return;

  hideError();

  // Ensure conversation exists
  if (!getActive()) createConversation();

  pushMessage('user', text);
  renderMessages();
  dom.input.value = '';
  dom.input.style.height = 'auto';
  dom.sendBtn.disabled = true;

  // Show typing
  addTypingIndicator();
  state.streaming = true;
  state.abortCtrl = new AbortController();

  const conv = getActive();
  const messages = conv.messages.map((m) => ({ role: m.role, content: m.content }));
  const system = dom.systemPrompt.value.trim();
  const temperature = parseFloat(dom.tempInput.value);
  const maxTokens = parseInt(dom.maxTokens.value, 10);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.abortCtrl.signal,
      body: JSON.stringify({
        messages,
        model: state.model,
        provider: state.provider,
        system: system || undefined,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // Start streaming response
    removeTypingIndicator();

    // Add AI message row
    let accumulated = '';
    conv.messages.push({ role: 'assistant', content: '' });
    const msgIdx = conv.messages.length - 1;

    const streamRow = buildMessageRow('assistant', '', true);
    dom.messages.appendChild(streamRow);
    const bubble = streamRow.querySelector('.msg-bubble');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    // Update role label with model name
    streamRow.querySelector('.msg-role').textContent = state.modelName;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }

        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          conv.messages[msgIdx].content = accumulated;
          bubble.innerHTML = renderMarkdown(accumulated) + '<span class="cursor"></span>';
          scrollBottom();
        }
      }
    }

    // Finalize
    bubble.innerHTML = renderMarkdown(accumulated);
    conv.messages[msgIdx].content = accumulated;

    renderSidebar();
  } catch (err) {
    removeTypingIndicator();
    // Remove the empty assistant message if added
    const conv2 = getActive();
    if (conv2 && conv2.messages.at(-1)?.role === 'assistant' && !conv2.messages.at(-1).content) {
      conv2.messages.pop();
    }
    renderMessages();

    if (err.name !== 'AbortError') {
      showError(err.message || 'An unexpected error occurred.');
    }
  } finally {
    state.streaming = false;
    state.abortCtrl = null;
    dom.sendBtn.disabled = !dom.input.value.trim();
    dom.input.focus();
  }
}

// ═══════════════════════════════════════════════════════════
// MODEL SELECTOR
// ═══════════════════════════════════════════════════════════
function updateModelDisplay() {
  const provider = getProviderConfig(state.provider);
  const badge = provider?.label || state.provider;
  const color = provider?.color || '#999';
  
  dom.providerBadge.textContent = badge;
  dom.providerBadge.style.backgroundColor = color;
  dom.modelLabel.textContent = state.modelName;
}

function openDropdown() {
  dom.modelDropdown.classList.add('open');
  dom.modelBtn.setAttribute('aria-expanded', 'true');
}

function closeDropdown() {
  dom.modelDropdown.classList.remove('open');
  dom.modelBtn.setAttribute('aria-expanded', 'false');
}

// ═══════════════════════════════════════════════════════════
// POPULATE MODEL DROPDOWN (from models.json)
// ═══════════════════════════════════════════════════════════
function populateModelDropdown() {
  if (!state.modelsData) return;

  // Clear existing options (keep structure)
  dom.groqModels.innerHTML = '';
  dom.orModels.innerHTML = '';

  state.modelsData.providers.forEach((provider) => {
    const container = provider.id === 'groq' ? dom.groqModels : dom.orModels;
    
    provider.models.forEach((model) => {
      const opt = document.createElement('button');
      opt.className = 'model-opt';
      opt.dataset.provider = provider.id;
      opt.dataset.model = model.id;
      opt.dataset.name = model.name;
      
      // Build tags
      const tagsHtml = model.tags?.length 
        ? `<span class="model-tags">${model.tags.map(t => `<span class="tag">${t}</span>`).join('')}</span>`
        : '';
      
      opt.innerHTML = `
        <div class="model-info">
          <div class="model-name">${model.name}</div>
          <div class="model-ctx">${model.ctx}</div>
        </div>
        ${tagsHtml}
      `;
      
      container.appendChild(opt);
    });
  });

  // Update model option references
  dom.modelOpts = document.querySelectorAll('.model-opt');
  
  // Bind event listeners to all model options
  bindModelOptionListeners();
  
  // Set initial active state
  const initialOpt = document.querySelector(
    `.model-opt[data-provider="${state.provider}"][data-model="${state.model}"]`
  );
  if (initialOpt) initialOpt.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// BIND MODEL OPTION LISTENERS
// ═══════════════════════════════════════════════════════════
function bindModelOptionListeners() {
  dom.modelOpts.forEach((opt) => {
    opt.addEventListener('click', () => {
      const prov = opt.dataset.provider;
      const model = opt.dataset.model;
      const name = opt.dataset.name;

      // Switch provider if needed
      if (prov !== state.provider) {
        state.provider = prov;
        dom.providerTabs.forEach((t) => {
          t.classList.toggle('active', t.dataset.provider === prov);
        });
        dom.groqModels.classList.toggle('hidden', prov !== 'groq');
        dom.orModels.classList.toggle('hidden', prov !== 'openrouter');
      }

      selectModel(prov, model, name);
      dom.modelOpts.forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      closeDropdown();
    });
  });
}

// ═══════════════════════════════════════════════════════════
// SELECT MODEL (helper)
// ═══════════════════════════════════════════════════════════
function selectModel(prov, model, name) {
  state.provider = prov;
  state.model = model;
  state.modelName = name;
  updateModelDisplay();
}

// ═══════════════════════════════════════════════════════════
// BIND PROVIDER TAB LISTENERS
// ═══════════════════════════════════════════════════════════
function bindProviderTabListeners() {
  dom.providerTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const prov = tab.dataset.provider;
      state.provider = prov;

      // Update tab styles
      dom.providerTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Show/hide model lists
      dom.groqModels.classList.toggle('hidden', prov !== 'groq');
      dom.orModels.classList.toggle('hidden', prov !== 'openrouter');

      // Select first model of provider
      const provider = getProviderConfig(prov);
      const defaultModelId = provider.default;
      const defaultModel = provider.models.find(m => m.id === defaultModelId);
      
      selectModel(prov, defaultModelId, defaultModel.name);
      
      dom.modelOpts.forEach((o) => o.classList.remove('active'));
      document.querySelector(
        `.model-opt[data-provider="${prov}"][data-model="${defaultModelId}"]`
      )?.classList.add('active');
      
      updateModelDisplay();
    });
  });
}

// ═══════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════
function init() {
  // New chat
  dom.newChatBtn.addEventListener('click', () => {
    createConversation();
    closeMobileSidebar();
  });

  // Send
  dom.sendBtn.addEventListener('click', send);

  // Input auto-resize + enable send
  dom.input.addEventListener('input', () => {
    dom.input.style.height = 'auto';
    dom.input.style.height = Math.min(dom.input.scrollHeight, 200) + 'px';
    dom.sendBtn.disabled = !dom.input.value.trim() || state.streaming;
  });

  // Enter to send (shift+enter = newline)
  dom.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!dom.sendBtn.disabled) send();
    }
  });

  // Clear chat
  dom.clearBtn.addEventListener('click', () => {
    const conv = getActive();
    if (conv) {
      conv.messages = [];
      renderMessages();
    }
  });

  // Error close
  dom.errorClose.addEventListener('click', hideError);

  // Settings toggle
  dom.settingsToggle.addEventListener('click', () => {
    dom.settingsPanel.classList.toggle('hidden');
  });

  // Temperature display
  dom.tempInput.addEventListener('input', () => {
    dom.tempValue.textContent = dom.tempInput.value;
  });

  // Model dropdown toggle
  dom.modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dom.modelDropdown.classList.contains('open')) closeDropdown();
    else openDropdown();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!dom.modelDropdown.contains(e.target) && !dom.modelBtn.contains(e.target)) {
      closeDropdown();
    }
  });

  // Provider tabs binding (called here and after DOM updates)
  bindProviderTabListeners();

  // Mobile sidebar
  dom.sidebarToggle.addEventListener('click', () => {
    const open = dom.sidebar.classList.toggle('open');
    dom.sidebarOverlay.classList.toggle('visible', open);
  });
  dom.sidebarOverlay.addEventListener('click', closeMobileSidebar);

  function closeMobileSidebar() {
    dom.sidebar.classList.remove('open');
    dom.sidebarOverlay.classList.remove('visible');
  }

  // Initial render
  renderMessages();
  updateModelDisplay();
}

// ── Boot ──
async function boot() {
  try {
    await loadModels();
    populateModelDropdown();
    document.addEventListener('DOMContentLoaded', init);
    // If DOM is already loaded, call init directly
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (error) {
    console.error('Failed to boot application:', error);
  }
}

boot();
