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
    #rr-chat-bubble {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${PRIMARY}; color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; transition: transform 0.2s;
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
      transition: opacity 0.2s, transform 0.2s;
    }
    #rr-chat-window.rr-hidden { opacity: 0; pointer-events: none; transform: translateY(12px); }
    #rr-chat-header {
      background: ${PRIMARY}; color: #fff; padding: 14px 16px;
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    #rr-chat-header img { height: 28px; filter: brightness(0) invert(1); }
    #rr-chat-header span { font-size: 15px; font-weight: 600; }
    #rr-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px;
    }
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
  `;
  document.head.appendChild(style);

  const bubble = document.createElement("button");
  bubble.id = "rr-chat-bubble";
  bubble.innerHTML = "💬";
  document.body.appendChild(bubble);

  const win = document.createElement("div");
  win.id = "rr-chat-window";
  win.classList.add("rr-hidden");
  win.innerHTML = `
    <div id="rr-chat-header">
      <img src="https://api.readyrobotics.no/logo.png" alt="Ready Robotics" onerror="this.style.display='none'">
      <span>Ready Robotics Support</span>
    </div>
    <div id="rr-chat-messages"></div>
    <div id="rr-chat-input-row">
      <textarea id="rr-chat-input" placeholder="Ask a question..." rows="1"></textarea>
      <button id="rr-chat-send">➤</button>
    </div>
  `;
  document.body.appendChild(win);

  const messages = win.querySelector("#rr-chat-messages");
  const input = win.querySelector("#rr-chat-input");
  const sendBtn = win.querySelector("#rr-chat-send");

  const sessionId = getSessionId();
  const history = loadHistory();

  history.forEach(({ role, text }) => appendMessage(role, text));
  if (history.length === 0) appendMessage("bot", "Hi! I'm the Ready Robotics support assistant. How can I help you today?");

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

  function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = "rr-msg " + role;
    div.textContent = text;
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

    const typing = appendMessage("bot typing", "Typing...");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json();
      typing.remove();
      const reply = data.reply || "Sorry, something went wrong.";
      appendMessage("bot", reply);
      history.push({ role: "bot", text: reply });
      saveHistory(history);
    } catch {
      typing.remove();
      appendMessage("bot", "Sorry, I couldn't reach the server. Please try again.");
    }

    sendBtn.disabled = false;
    input.focus();
  }
})();
