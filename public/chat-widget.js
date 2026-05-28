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
      background: #fff; color: #1a1a1a;
      padding: 10px 14px; border-radius: 18px 18px 4px 18px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 200px; line-height: 1.4; cursor: pointer;
      animation: rr-teaser-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
      position: relative;
    }
    #rr-teaser-close {
      position: absolute; top: -6px; right: -6px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #ccc; border: none; cursor: pointer;
      font-size: 10px; display: flex; align-items: center; justify-content: center;
      color: #555; line-height: 1;
    }
    @keyframes rr-teaser-in {
      from { opacity: 0; transform: scale(0.8) translateY(8px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    #rr-chat-bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${PRIMARY}; color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; transition: transform 0.2s; flex-shrink: 0;
    }
    #rr-chat-bubble:hover { transform: scale(1.08); }
    #rr-chat-window {
      position: fixed; bottom: 90px; right: 24px; z-index: 9999;
      width: 360px; max-width: calc(100vw - 48px);
      height: 520px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: opacity 0.2s, transform 0.2s, width 0.3s, height 0.3s, bottom 0.3s, right 0.3s, border-radius 0.3s;
    }
    #rr-chat-window.rr-hidden { opacity: 0; pointer-events: none; transform: translateY(12px); }
    #rr-chat-window.rr-expanded {
      width: calc(100vw - 48px); max-width: 860px;
      height: calc(100vh - 120px); bottom: 90px; right: 24px;
      border-radius: 16px;
    }
    @media (max-width: 600px) {
      #rr-chat-window.rr-expanded {
        width: 100vw; height: 100vh; bottom: 0; right: 0; border-radius: 0;
        max-width: 100vw;
      }
    }
    #rr-chat-header {
      background: ${PRIMARY}; color: #fff; padding: 12px 16px;
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-chat-header img { height: 32px; filter: brightness(0) invert(1); flex-shrink: 0; }
    #rr-chat-header-title {
      display: flex; flex-direction: column; flex: 1;
    }
    #rr-chat-header-title span {
      font-size: 15px; font-weight: 600; line-height: 1.3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-chat-header-title small {
      font-size: 11px; opacity: 0.75; font-weight: 400; line-height: 1.3;
    }
    #rr-chat-header-actions { display: flex; align-items: center; gap: 4px; }
    #rr-chat-new, #rr-chat-expand {
      background: none; border: none; color: #fff; cursor: pointer;
      font-size: 16px; padding: 4px 6px; opacity: 0.8; line-height: 1;
      border-radius: 6px; transition: opacity 0.15s, background 0.15s;
    }
    #rr-chat-new:hover, #rr-chat-expand:hover { opacity: 1; background: rgba(255,255,255,0.15); }
    #rr-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px;
    }
    #rr-model-picker {
      padding: 16px; border-top: 1px solid #eee; flex-shrink: 0;
      background: #f8f9fc;
    }
    #rr-model-picker p {
      font-size: 13px; font-weight: 600; color: #333; margin: 0 0 10px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #rr-model-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;
    }
    .rr-model-btn {
      background: #fff; border: 1.5px solid #ddd; border-radius: 10px;
      padding: 8px 10px; font-size: 13px; cursor: pointer; text-align: left;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: border-color 0.15s, background 0.15s; color: #1a1a1a;
      display: flex; align-items: center; gap: 6px;
    }
    .rr-model-btn:hover { border-color: ${PRIMARY}; background: #f0f2fa; }
    .rr-model-btn.selected { border-color: ${PRIMARY}; background: #e8ecf8; font-weight: 600; }
    .rr-model-btn.selected::before { content: "✓ "; color: ${PRIMARY}; }
    #rr-model-confirm {
      width: 100%; background: ${PRIMARY}; color: #fff; border: none;
      border-radius: 10px; padding: 10px; font-size: 14px; font-weight: 600;
      cursor: pointer; font-family: inherit; opacity: 0.4; pointer-events: none;
      transition: opacity 0.2s;
    }
    #rr-model-confirm.active { opacity: 1; pointer-events: auto; }
    .rr-msg {
      max-width: 82%; padding: 10px 14px; border-radius: 14px;
      font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    }
    .rr-msg.user {
      background: ${PRIMARY}; color: #fff; align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .rr-msg.bot {
      background: #f1f3f8; color: #1a1a1a; align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .rr-msg.typing { color: #888; font-style: italic; }
    #rr-chat-input-row {
      display: flex; gap: 8px; padding: 12px; border-top: 1px solid #eee; flex-shrink: 0;
    }
    #rr-chat-input {
      flex: 1; border: 1px solid #ddd; border-radius: 20px;
      padding: 8px 14px; font-size: 14px; outline: none; resize: none;
      font-family: inherit; line-height: 1.4; max-height: 100px; overflow-y: auto;
    }
    #rr-chat-input:focus { border-color: ${PRIMARY}; }
    #rr-chat-send {
      background: ${PRIMARY}; color: #fff; border: none; border-radius: 50%;
      width: 38px; height: 38px; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    #rr-chat-send:disabled { opacity: 0.5; cursor: default; }
    .rr-msg.bot.rr-question {
      background: #EEF0FA; border: 1.5px solid ${PRIMARY}; color: #1a1a1a;
      position: relative;
    }
    .rr-question-label {
      display: block; font-size: 11px; font-weight: 700; color: ${PRIMARY};
      text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;
    }
    .rr-feedback {
      display: flex; gap: 6px; margin-top: 6px;
    }
    .rr-feedback button {
      background: none; border: 1px solid #ddd; border-radius: 20px;
      padding: 2px 8px; font-size: 13px; cursor: pointer;
      transition: background 0.15s, border-color 0.15s; color: #666;
    }
    .rr-feedback button:hover { background: #f0f2fa; border-color: ${PRIMARY}; }
    .rr-feedback button.selected-up { background: #e6f4ea; border-color: #34a853; color: #34a853; }
    .rr-feedback button.selected-down { background: #fce8e6; border-color: #ea4335; color: #ea4335; }
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
      <button id="rr-model-confirm" disabled>Start samtale →</button>
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
  let selectedModel = null;

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
    const greeting = selectedModel
      ? `Hei! Jeg er Ready Robotics sin supportassistent. Jeg ser du har valgt ${selectedModel} — hva kan jeg hjelpe deg med?`
      : "Hei! Jeg er Ready Robotics sin supportassistent. Hvordan kan jeg hjelpe deg i dag?";
    appendMessage("bot", greeting);
    if (selectedModel) {
      history.push({ role: "assistant", text: greeting });
      saveHistory(history);
      // Send model selection silently to server so it's in server-side history
      if (selectedModel) {
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Jeg bruker ${selectedModel}.`, sessionId, silent: true }),
        }).catch(() => {});
        history.push({ role: "user", text: `Jeg bruker ${selectedModel}.` });
      }
    }
    input.focus();
  });

  expandBtn.addEventListener("click", () => {
    const expanded = win.classList.toggle("rr-expanded");
    expandBtn.textContent = expanded ? "⤡" : "⤢";
    expandBtn.title = expanded ? "Minimize" : "Expand";
    messages.scrollTop = messages.scrollHeight;
  });

  newChatBtn.addEventListener("click", () => {
    if (!confirm("Start en ny samtale? Historikken slettes.")) return;
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SESSION_KEY);
    messages.innerHTML = "";
    history.length = 0;
    selectedModel = null;
    sessionId = "web_" + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(SESSION_KEY, sessionId);
    win.querySelectorAll(".rr-model-btn").forEach((b) => b.classList.remove("selected"));
    modelConfirm.classList.remove("active");
    modelConfirm.setAttribute("disabled", true);
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
    up.textContent = "👍"; down.textContent = "👎";
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
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;word-break:break-all;">${url}</a>`
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

    const typing = appendMessage("bot typing", "...");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (res.status === 429) {
        typing.remove();
        appendMessage("bot", "Du har sendt for mange meldinger. Vent litt før du prøver igjen.");
        sendBtn.disabled = false;
        input.focus();
        return;
      }

      // Handle streaming response
      typing.remove();
      const streamDiv = document.createElement("div");
      streamDiv.className = "rr-msg bot";
      messages.appendChild(streamDiv);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let buffer = "";

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
            fullReply += chunk;
            const safe = fullReply.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            streamDiv.innerHTML = linkify(safe);
            messages.scrollTop = messages.scrollHeight;
          } catch {}
        }
      }

      // After streaming, re-render with follow-up question detection
      streamDiv.remove();
      appendMessage("bot", fullReply);
      history.push({ role: "bot", text: fullReply });
      saveHistory(history);
    } catch {
      typing.remove();
      appendMessage("bot", "Kunne ikke nå serveren. Prøv igjen.");
    }

    sendBtn.disabled = false;
    input.focus();
  }
})();
