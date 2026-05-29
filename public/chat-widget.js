(function () {
  const API_URL = "https://api.readyrobotics.no/chat";
  const PRIMARY = "#1B2563";
  const SESSION_KEY = "rr_chat_session";
  const HISTORY_KEY = "rr_chat_history";

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = "web_" + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  }

  function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-50)));
  }

  const style = document.createElement("style");
  style.textContent = `
    #rr-chat-bubble-wrap {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }
    #rr-chat-teaser {
      background: #1e2130; color: #dde1f0;
      padding: 10px 14px; border-radius: 18px 18px 4px 18px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 200px; line-height: 1.4; cursor: pointer;
      animation: rr-teaser-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
      position: relative; border: 1px solid rgba(255,255,255,0.08);
    }
    #rr-teaser-close {
      position: absolute; top: -6px; right: -6px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #2e3347; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;
      font-size: 10px; display: flex; align-items: center; justify-content: center;
      color: #8b92a8; line-height: 1;
    }
    @keyframes rr-teaser-in {
      from { opacity: 0; transform: scale(0.8) translateY(8px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    #rr-chat-bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${PRIMARY}; color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(27,37,99,0.6);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; transition: transform 0.2s, box-shadow 0.2s; flex-shrink: 0;
    }
    #rr-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(27,37,99,0.8); }
    #rr-chat-window {
      position: fixed; bottom: 90px; right: 24px; z-index: 9999;
      width: 360px; max-width: calc(100vw - 48px);
      height: 520px; max-height: calc(100vh - 120px);
      background: #111318; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: opacity 0.2s, transform 0.2s, width 0.3s, height 0.3s, bottom 0.3s, right 0.3s, border-radius 0.3s;
    }
    #rr-chat-window.rr-hidden { opacity: 0; pointer-events: none; transform: translateY(12px); }
    #rr-chat-window.rr-expanded {
      width: calc(100vw - 48px); max-width: 860px;
      height: calc(100vh - 120px); bottom: 90px; right: 24px; border-radius: 16px;
    }
    @media (max-width: 600px) {
      #rr-chat-window.rr-expanded {
        width: 100vw; height: 100vh; bottom: 0; right: 0; border-radius: 0; max-width: 100vw;
      }
    }
    #rr-chat-header {
      background: #0c0e14; color: #dde1f0; padding: 12px 16px;
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-chat-header img { height: 32px; filter: brightness(0) invert(1); flex-shrink: 0; }
    #rr-chat-header-title { display: flex; flex-direction: column; flex: 1; }
    #rr-chat-header-title span {
      font-size: 15px; font-weight: 600; line-height: 1.3; color: #dde1f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-chat-header-title small { font-size: 11px; color: #8b92a8; font-weight: 400; line-height: 1.3; }
    #rr-chat-header-actions { display: flex; align-items: center; gap: 4px; }
    #rr-chat-new, #rr-chat-expand {
      background: none; border: none; color: #8b92a8; cursor: pointer;
      font-size: 16px; padding: 4px 6px; line-height: 1;
      border-radius: 6px; transition: color 0.15s, background 0.15s;
    }
    #rr-chat-new:hover, #rr-chat-expand:hover { color: #dde1f0; background: rgba(255,255,255,0.08); }
    #rr-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    #rr-chat-messages::-webkit-scrollbar { width: 4px; }
    #rr-chat-messages::-webkit-scrollbar-track { background: transparent; }
    #rr-chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
    #rr-model-picker {
      padding: 16px; border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
      background: #0c0e14;
    }
    #rr-model-picker p {
      font-size: 13px; font-weight: 600; color: #dde1f0; margin: 0 0 10px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-model-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
    .rr-model-btn {
      background: #1e2130; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 10px;
      padding: 8px 10px; font-size: 13px; cursor: pointer; text-align: left;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: border-color 0.15s, background 0.15s; color: #dde1f0;
      display: flex; align-items: center; gap: 6px;
    }
    .rr-model-btn:hover { border-color: rgba(76,110,245,0.5); background: #252a3a; }
    .rr-model-btn.selected { border-color: #4c6ef5; background: #252a3a; font-weight: 600; }
    .rr-model-btn.selected::before { content: "✓ "; color: #4c6ef5; }
    #rr-model-confirm {
      width: 100%; background: ${PRIMARY}; color: #fff; border: none;
      border-radius: 10px; padding: 10px; font-size: 14px; font-weight: 600;
      cursor: pointer; font-family: inherit; opacity: 0.35; pointer-events: none;
      transition: opacity 0.2s;
    }
    #rr-model-confirm.active { opacity: 1; pointer-events: auto; }
    #rr-role-picker {
      padding: 16px; border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
      background: #0c0e14; display: none;
    }
    #rr-role-picker p {
      font-size: 13px; font-weight: 600; color: #dde1f0; margin: 0 0 10px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .rr-role-btn {
      background: #1e2130; border: 1.5px solid rgba(255,255,255,0.08); border-radius: 10px;
      padding: 14px 10px; font-size: 13px; cursor: pointer; text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: border-color 0.15s, background 0.15s; color: #dde1f0;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    }
    .rr-role-btn:hover { border-color: rgba(76,110,245,0.5); background: #252a3a; }
    .rr-role-btn .rr-role-icon { font-size: 26px; }
    .rr-role-btn .rr-role-label { font-weight: 600; font-size: 13px; }
    .rr-role-btn .rr-role-sub { font-size: 11px; color: #8b92a8; }
    .rr-msg {
      max-width: 82%; padding: 10px 14px; border-radius: 14px;
      font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    }
    .rr-msg.user {
      background: ${PRIMARY}; color: #fff; align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .rr-msg.bot {
      background: #1e2130; color: #dde1f0; align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .rr-typing-status {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 2px; color: #8b92a8; font-size: 13px; align-self: flex-start;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .rr-typing-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: #4c6ef5; animation: rr-pulse 1.4s ease-in-out infinite;
    }
    @keyframes rr-pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.7); }
      50% { opacity: 1; transform: scale(1); }
    }
    #rr-chat-input-row {
      display: flex; gap: 8px; padding: 12px;
      border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
      background: #0c0e14;
    }
    #rr-chat-input {
      flex: 1; background: #1e2130; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px;
      padding: 8px 14px; font-size: 14px; outline: none; resize: none;
      font-family: inherit; line-height: 1.4; max-height: 100px; overflow-y: auto;
      color: #dde1f0;
    }
    #rr-chat-input::placeholder { color: #5a6070; }
    #rr-chat-input:focus { border-color: rgba(76,110,245,0.5); }
    #rr-chat-send {
      background: ${PRIMARY}; color: #fff; border: none; border-radius: 50%;
      width: 38px; height: 38px; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
      transition: opacity 0.2s;
    }
    #rr-chat-send:disabled { opacity: 0.4; cursor: default; }
    .rr-msg.bot.rr-question {
      background: #1a2040; border: 1.5px solid #4c6ef5; color: #dde1f0; position: relative;
    }
    .rr-question-label {
      display: block; font-size: 11px; font-weight: 700; color: #4c6ef5;
      text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;
    }
    .rr-feedback { display: flex; gap: 5px; margin-top: 8px; }
    .rr-feedback button {
      background: none; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
      width: 28px; height: 24px; font-size: 12px; cursor: pointer; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, border-color 0.15s, color 0.15s; color: #5a6070;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .rr-feedback button:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.2); color: #dde1f0; }
    .rr-feedback button.selected-up { background: rgba(52,168,83,0.12); border-color: rgba(52,168,83,0.4); color: #34a853; }
    .rr-feedback button.selected-down { background: rgba(234,67,53,0.12); border-color: rgba(234,67,53,0.4); color: #ea4335; }
  `;
  document.head.appendChild(style);

  const bubbleWrap = document.createElement("div");
  bubbleWrap.id = "rr-chat-bubble-wrap";
  bubbleWrap.innerHTML = `
    <div id="rr-chat-teaser">
      <button id="rr-teaser-close">✕</button>
      Har du spørsmål om robotene dine? 🤖
    </div>
    <button id="rr-chat-bubble">💬</button>
  `;
  document.body.appendChild(bubbleWrap);
  const bubble = bubbleWrap.querySelector("#rr-chat-bubble");
  const teaser = bubbleWrap.querySelector("#rr-chat-teaser");

  // Hide teaser after 8s or on close
  setTimeout(() => { teaser.style.display = "none"; }, 8000);
  bubbleWrap.querySelector("#rr-teaser-close").addEventListener("click", (e) => {
    e.stopPropagation(); teaser.style.display = "none";
  });
  teaser.addEventListener("click", () => {
    teaser.style.display = "none";
    win.classList.remove("rr-hidden");
    input.focus();
  });

  const win = document.createElement("div");
  win.id = "rr-chat-window";
  win.classList.add("rr-hidden");
  win.innerHTML = `
    <div id="rr-chat-header">
      <img src="https://api.readyrobotics.no/logo.png" alt="Ready Robotics" onerror="this.style.display='none'">
      <div id="rr-chat-header-title">
        <span>Support</span>
        <small>Ready Robotics</small>
      </div>
      <div id="rr-chat-header-actions">
        <button id="rr-chat-new" title="New conversation">↺</button>
        <button id="rr-chat-expand" title="Expand">⤢</button>
      </div>
    </div>
    <div id="rr-chat-messages"></div>
    <div id="rr-model-picker">
      <p>Hvilken robot gjelder det?</p>
      <div id="rr-model-grid">
        <button class="rr-model-btn" data-model="Omnie">Omnie</button>
        <button class="rr-model-btn" data-model="Phantas">Phantas</button>
        <button class="rr-model-btn" data-model="Scrubber 50">Scrubber 50</button>
        <button class="rr-model-btn" data-model="Beetle">Beetle</button>
        <button class="rr-model-btn" data-model="Mira">Mira</button>
        <button class="rr-model-btn" data-model="">Vet ikke</button>
      </div>
      <button id="rr-model-confirm" disabled>Neste →</button>
    </div>
    <div id="rr-role-picker">
      <p>Hvem er du?</p>
      <div id="rr-role-grid">
        <button class="rr-role-btn" data-role="servicetekniker">
          <span class="rr-role-icon">🔧</span>
          <span class="rr-role-label">Servicetekniker</span>
          <span class="rr-role-sub">Reparasjon og teknisk støtte</span>
        </button>
        <button class="rr-role-btn" data-role="renholder">
          <span class="rr-role-icon">🧹</span>
          <span class="rr-role-label">Renholder / Placemaker</span>
          <span class="rr-role-sub">Daglig drift og vedlikehold</span>
        </button>
      </div>
    </div>
    <div id="rr-chat-input-row">
      <textarea id="rr-chat-input" placeholder="Skriv et spørsmål..." rows="1"></textarea>
      <button id="rr-chat-send">➤</button>
    </div>
  `;
  document.body.appendChild(win);

  const messages = win.querySelector("#rr-chat-messages");
  const input = win.querySelector("#rr-chat-input");
  const sendBtn = win.querySelector("#rr-chat-send");
  const expandBtn = win.querySelector("#rr-chat-expand");
  const newChatBtn = win.querySelector("#rr-chat-new");
  const modelPicker = win.querySelector("#rr-model-picker");
  const modelConfirm = win.querySelector("#rr-model-confirm");
  const rolePicker = win.querySelector("#rr-role-picker");
  let selectedModel = null;
  let selectedRole = null;

  win.querySelectorAll(".rr-model-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      win.querySelectorAll(".rr-model-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedModel = btn.dataset.model;
      modelConfirm.classList.add("active");
      modelConfirm.removeAttribute("disabled");
    });
  });

  modelConfirm.addEventListener("click", () => {
    modelPicker.style.display = "none";
    rolePicker.style.display = "";
  });

  win.querySelectorAll(".rr-role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedRole = btn.dataset.role;
      rolePicker.style.display = "none";

      const roleLabel = selectedRole === "servicetekniker" ? "servicetekniker" : "renholder/placemaker";
      const modelPart = selectedModel ? ` for ${selectedModel}` : "";
      const greeting = `Hei! Jeg er Ready Robotics sin supportassistent. Jeg ser du er ${roleLabel}${modelPart} — hva kan jeg hjelpe deg med?`;

      appendMessage("bot", greeting);
      history.push({ role: "assistant", text: greeting });
      saveHistory(history);

      const silentMsg = [
        selectedModel ? `Jeg bruker ${selectedModel}.` : null,
        `Jeg er ${roleLabel}.`,
      ].filter(Boolean).join(" ");

      fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: silentMsg, sessionId, silent: true }),
      }).catch(() => {});

      input.focus();
    });
  });

  expandBtn.addEventListener("click", () => {
    const expanded = win.classList.toggle("rr-expanded");
    expandBtn.textContent = expanded ? "⤡" : "⤢";
    expandBtn.title = expanded ? "Minimize" : "Expand";
    messages.scrollTop = messages.scrollHeight;
  });

  newChatBtn.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SESSION_KEY);
    messages.innerHTML = "";
    history.length = 0;
    selectedModel = null;
    selectedRole = null;
    sessionId = "web_" + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(SESSION_KEY, sessionId);
    win.querySelectorAll(".rr-model-btn").forEach((b) => b.classList.remove("selected"));
    modelConfirm.classList.remove("active");
    modelConfirm.setAttribute("disabled", true);
    rolePicker.style.display = "none";
    modelPicker.style.display = "";
  });

  let sessionId = getSessionId();
  const history = loadHistory();

  if (history.length > 0) {
    modelPicker.style.display = "none";
    history.forEach(({ role, text }) => appendMessage(role, text));
  }

  bubble.addEventListener("click", () => {
    win.classList.toggle("rr-hidden");
    if (!win.classList.contains("rr-hidden")) {
      input.focus();
      messages.scrollTop = messages.scrollHeight;
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener("click", send);

  const FEEDBACK_URL = API_URL.replace("/chat", "/feedback");

  function addFeedback(msgDiv, messageText) {
    const msgId = Date.now().toString(36);
    const row = document.createElement("div");
    row.className = "rr-feedback";
    const up = document.createElement("button");
    const down = document.createElement("button");
    up.textContent = "↑"; down.textContent = "↓";
    function submit(rating, btn) {
      btn.classList.add(rating === "up" ? "selected-up" : "selected-down");
      up.disabled = true; down.disabled = true;
      fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, messageId: msgId, rating, message: messageText }),
      }).catch(() => {});
    }
    up.addEventListener("click", () => submit("up", up, down));
    down.addEventListener("click", () => submit("down", down, up));
    row.appendChild(up); row.appendChild(down);
    msgDiv.appendChild(row);
  }

  function linkify(text) {
    return text.replace(/(https?:\/\/[^\s]+)/g, (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#7c9ff5;text-decoration:underline;word-break:break-all;">${url}</a>`
    );
  }

  function isQuestion(text) {
    const t = text.trim();
    // Ignore lines that are URLs or source references
    if (t.startsWith("http") || t.startsWith("(Source:")) return false;
    return t.endsWith("?") || (t.length < 180 && t.includes("?") && !t.includes("://"));
  }

  function appendMessage(role, text) {
    const div = document.createElement("div");
    const safe = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if (role === "bot") {
      // Check if the last sentence/paragraph is a question
      const parts = text.trim().split(/\n+/);
      const lastPart = parts[parts.length - 1].trim();
      const mainText = parts.slice(0, -1).join("\n");
      const hasFollowUp = isQuestion(lastPart) && parts.length > 1 && mainText.length > 80;

      if (hasFollowUp) {
        // Main content
        const mainSafe = mainText.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        div.className = "rr-msg bot";
        div.innerHTML = linkify(mainSafe);
        addFeedback(div, text);
        messages.appendChild(div);

        // Follow-up question as separate highlighted bubble
        const qDiv = document.createElement("div");
        qDiv.className = "rr-msg bot rr-question";
        const qSafe = lastPart.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        qDiv.innerHTML = `<span class="rr-question-label">Oppfølgingsspørsmål</span>${linkify(qSafe)}`;
        messages.appendChild(qDiv);
        messages.scrollTop = messages.scrollHeight;
        return qDiv;
      } else {
        div.className = "rr-msg bot";
        div.innerHTML = linkify(safe);
        addFeedback(div, text);
      }
    } else {
      div.className = "rr-msg " + role;
      div.textContent = text;
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendBtn.disabled = true;

    appendMessage("user", text);
    history.push({ role: "user", text });

    const statusDiv = document.createElement("div");
    statusDiv.className = "rr-typing-status";
    statusDiv.innerHTML = `<span class="rr-typing-dot"></span><span class="rr-typing-label">Søker i manualer…</span>`;
    messages.appendChild(statusDiv);
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (res.status === 429) {
        statusDiv.remove();
        appendMessage("bot", "Du har sendt for mange meldinger. Vent litt før du prøver igjen.");
        sendBtn.disabled = false;
        input.focus();
        return;
      }

      const streamDiv = document.createElement("div");
      streamDiv.className = "rr-msg bot";
      messages.appendChild(streamDiv);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let buffer = "";
      let hasStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const { text: chunk } = JSON.parse(data);
            if (!hasStarted) {
              hasStarted = true;
              statusDiv.querySelector(".rr-typing-label").textContent = "Skriver svar…";
            }
            fullReply += chunk;
            const safe = fullReply.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            streamDiv.innerHTML = linkify(safe);
            messages.scrollTop = messages.scrollHeight;
          } catch {}
        }
      }

      statusDiv.remove();
      streamDiv.remove();
      appendMessage("bot", fullReply);
      history.push({ role: "bot", text: fullReply });
      saveHistory(history);
    } catch {
      statusDiv.remove();
      appendMessage("bot", "Kunne ikke nå serveren. Prøv igjen.");
    }

    sendBtn.disabled = false;
    input.focus();
  }
})();
