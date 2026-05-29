import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { loadDocuments, loadWebSources, searchChunks, getPageScreenshot, DATA_DIR } from "./rag.js";
import { ensurePDFs } from "./download-pdfs.js";
import "dotenv/config";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

// Persistent data directory (mount Railway Volume here)
fs.mkdirSync(DATA_DIR, { recursive: true });
const CONVERSATIONS_FILE = path.join(DATA_DIR, "conversations.json");
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.jsonl");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.jsonl");
const ANALYTICS_PASSWORD = process.env.ANALYTICS_PASSWORD || "readyrobotics";
const DIGEST_KEY = process.env.DIGEST_KEY || ANALYTICS_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DIGEST_EMAIL = process.env.DIGEST_EMAIL;

const conversations = {};
const webConversations = {};
const sessionModels = {};
const sessionRoles = {};

// Load persisted conversations on startup
function loadConversations() {
  try {
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, "utf8"));
      Object.assign(conversations, data.whatsapp || {});
      Object.assign(webConversations, data.web || {});
      Object.assign(sessionModels, data.sessionModels || {});
      Object.assign(sessionRoles, data.sessionRoles || {});
      console.log(`Loaded conversations: ${Object.keys(conversations).length} WA, ${Object.keys(webConversations).length} web sessions`);
    }
  } catch (err) {
    console.warn("Could not load conversations:", err.message);
  }
}

let saveTimer;
function saveConversations() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(CONVERSATIONS_FILE, JSON.stringify({ whatsapp: conversations, web: webConversations, sessionModels, sessionRoles }), () => {});
  }, 2000);
}

function logQuery(source, question, answerable) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), source, question, answerable }) + "\n";
  fs.appendFile(ANALYTICS_FILE, entry, () => {});
}

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateLimits = {};

function isRateLimited(sessionId) {
  const now = Date.now();
  if (!rateLimits[sessionId]) rateLimits[sessionId] = [];
  rateLimits[sessionId] = rateLimits[sessionId].filter(t => now - t < RATE_WINDOW_MS);
  if (rateLimits[sessionId].length >= RATE_LIMIT) return true;
  rateLimits[sessionId].push(now);
  return false;
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object !== "whatsapp_business_account") return res.sendStatus(404);

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message || message.type !== "text") return res.sendStatus(200);

  // Respond to WhatsApp immediately to avoid timeout retries
  res.sendStatus(200);

  const userText = message.text.body;
  const from = message.from;

  processMessage(from, userText).catch((err) =>
    console.error(`Failed to process message from ${from}:`, err)
  );
});

app.options("/chat", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

app.options("/feedback", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

app.post("/feedback", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { sessionId, messageId, rating, message } = req.body;
  if (!sessionId || !rating) return res.status(400).json({ error: "Missing fields" });
  const entry = JSON.stringify({ ts: new Date().toISOString(), sessionId, messageId, rating, message }) + "\n";
  fs.appendFile(FEEDBACK_FILE, entry, () => {});
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  const { message, sessionId, silent, image } = req.body;
  if ((!message && !image) || !sessionId) return res.status(400).json({ error: "Missing message or sessionId" });
  if (isRateLimited(sessionId)) return res.status(429).json({ error: "Too many messages. Please wait before sending more." });

  // Silent messages (e.g. model + role selection) — store context and don't reply
  if (silent) {
    const modelMatch = message.match(/Jeg bruker (.+?)\./);
    if (modelMatch) sessionModels[sessionId] = modelMatch[1].trim();
    const roleMatch = message.match(/Jeg er (.+?)\./);
    if (roleMatch) sessionRoles[sessionId] = roleMatch[1].trim();
    return res.json({ silent: true });
  }

  try {
    const searchQuery = message ? await extractSearchKeywords(message) : "robot del komponent vedlikehold feil";
    const relevantChunks = searchChunks(searchQuery);
    const context = relevantChunks.length > 0
      ? relevantChunks.map((c) => c.webUrl
          ? `[From: ${c.source} | Link: ${c.webUrl}]\n${c.text}`
          : `[From: ${c.source}, page ${c.page} | Link: ${PUBLIC_URL}/pdfs/${encodeURIComponent(c.source)}#page=${c.page}]\n${c.text}`
        ).join("\n\n")
      : "No relevant documents found.";

    if (!webConversations[sessionId]) webConversations[sessionId] = [];
    // Store text-only in history (images are not persisted to save memory)
    webConversations[sessionId].push({ role: "user", content: message || "[bilde sendt]" });
    const historySlice = webConversations[sessionId].slice(-6);

    // Build messages array: text-only history + current message (may include image)
    const userContent = image
      ? [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: message || "Hva er dette? Identifiser delen eller problemet på bildet." }
        ]
      : message;
    const history = [
      ...historySlice.slice(0, -1),
      { role: "user", content: userContent }
    ];

    const selectedModel = sessionModels[sessionId];
    const selectedRole = sessionRoles[sessionId];
    const systemPrompt = `You are a friendly and knowledgeable support assistant for Ready Robotics, a Norwegian reseller of Gausium autonomous cleaning robots (Mira, Omnie, Scrubber 50, and Phantas models).
${selectedModel ? `\nSELECTED MODEL: The user has selected "${selectedModel}". Always treat all questions as being about ${selectedModel} unless they explicitly ask about a different model.\n` : ""}${selectedRole === "servicetekniker" ? `\nUSER ROLE: Service technician. Use precise technical language. Include component names, error codes, torque specs, and detailed step-by-step procedures. Assume technical knowledge.\n` : ""}${selectedRole === "renholder" || selectedRole === "renholder/placemaker" ? `\nUSER ROLE: Cleaner/Placemaker (robot operator). Use simple, clear language. Focus on daily operation, cleaning routines, and basic troubleshooting. Avoid unnecessary technical jargon.\n` : ""}
LANGUAGE RULE (most important rule): Always reply in the exact same language as the user's most recent message. If Norwegian, reply in Norwegian. If English, reply in English.

ROBOT MODEL RULE (critical):
- The product range includes: Omnie, Phantas, Scrubber 50 (SC50), Mira, and Beetle. These are distinct robots with different specs and parameters.
- If a selected model is specified above, use it for all questions — do NOT ask which model they are using.
- If no model is selected and the user says "roboten", "maskinen", "the robot" or similar, ask: which model are you using?
- If the user specifies a model (e.g. "Omnie"), answer ONLY using context tagged with that model's manuals. Do NOT include information from other models' manuals unless it explicitly states it applies to all models.
- If the context contains information for the wrong model, ignore it and say you don't have model-specific information.

IMAGE ANALYSIS (applies when the user sends a photo):
- Describe briefly what you see before answering.
- If it shows a robot part: identify it by name, which model it belongs to, and suggest the part number if found in the context.
- If it shows an error code or display screen: read the exact code and provide the solution from context.
- If it shows damage or wear: assess severity and recommend replacement or action.
- Cross-reference what you see with the parts information in the context for the most accurate identification.

TONE AND STYLE:
- Be warm and helpful, like a knowledgeable colleague — not robotic or clinical.
- Acknowledge the user's situation briefly before diving into the answer when it feels natural.
- If the user seems frustrated or stuck, show empathy.
- If a follow-up question would genuinely help, add it at the very end on its own separate line with a blank line before it.
- Do not over-explain or pad answers unnecessarily.

ANSWERING:
- Answer using ONLY the information in the context below from our official manuals.
- If the answer is not in the context, say so naturally and suggest contacting Ready Robotics: info@readyrobotics.no or 40282444.
- For step-by-step tasks, use numbered steps.
- Always end with a source reference on its own line: (Source: SOURCE_NAME, page PAGE_NUMBER)
  Followed by the exact link from the "Link:" field in the context tag. Do not modify or reconstruct the link.

FORMATTING:
- Plain text only, no markdown, no asterisks, no bullet symbols.
- Use numbered steps for procedures.
- Target around 100 words. Always finish your last sentence naturally — never cut off mid-thought. If there is more relevant information than fits, end with a note that the full details are available in the manual link below.

CONTEXT FROM MANUALS:
${context}`;

    // Stream response to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    let reply = "";
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: history,
    });

    stream.on("text", (text) => {
      reply += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write("data: [DONE]\n\n");
    res.end();

    webConversations[sessionId].push({ role: "assistant", content: reply });
    const answerable = !reply.toLowerCase().includes("don't have") && !reply.toLowerCase().includes("ikke har");
    logQuery("web", message, answerable);
    saveConversations();
  } catch (err) {
    console.error("[CHAT ERROR]", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to process message" });
  }
});

app.get("/analytics", (req, res) => {
  if (req.query.password !== ANALYTICS_PASSWORD) return res.status(401).send("Unauthorized");
  if (!fs.existsSync(ANALYTICS_FILE)) return res.send("<h2>No data yet.</h2>");

  const lines = fs.readFileSync(ANALYTICS_FILE, "utf8").trim().split("\n").filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const total = entries.length;
  const unanswered = entries.filter(e => !e.answerable).length;
  const bySource = entries.reduce((acc, e) => { acc[e.source] = (acc[e.source] || 0) + 1; return acc; }, {});
  const recent = entries.slice(-50).reverse();

  res.send(`<!DOCTYPE html><html><head><title>Analytics</title>
  <style>body{font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1a1a1a}
  h1{color:#1B2563}table{width:100%;border-collapse:collapse;margin-top:16px}
  th{background:#1B2563;color:#fff;padding:10px;text-align:left}
  td{padding:8px 10px;border-bottom:1px solid #eee}tr:hover td{background:#f5f5f5}
  .stat{display:inline-block;background:#f1f3f8;border-radius:8px;padding:16px 24px;margin:8px;text-align:center}
  .stat strong{display:block;font-size:28px;color:#1B2563}</style></head>
  <body><h1>Ready Robotics Chat Analytics</h1>
  <div>
    <div class="stat"><strong>${total}</strong>Total questions</div>
    <div class="stat"><strong>${unanswered}</strong>Unanswered</div>
    <div class="stat"><strong>${Object.entries(bySource).map(([k,v])=>`${k}: ${v}`).join(", ")}</strong>By source</div>
  </div>
  <h2>Recent questions</h2>
  <table><tr><th>Time</th><th>Source</th><th>Question</th><th>Answered</th></tr>
  ${recent.map(e => `<tr><td>${new Date(e.ts).toLocaleString("no-NO")}</td><td>${e.source}</td><td>${e.question}</td><td>${e.answerable ? "✅" : "❌"}</td></tr>`).join("")}
  </table></body></html>`);
});

app.get("/digest", async (req, res) => {
  if (req.query.key !== DIGEST_KEY) return res.status(401).send("Unauthorized");

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const readJsonl = (file) => {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  };

  const analytics = readJsonl(ANALYTICS_FILE).filter(e => new Date(e.ts) > weekAgo);
  const feedback = readJsonl(FEEDBACK_FILE).filter(e => new Date(e.ts) > weekAgo);

  const unanswered = analytics.filter(e => !e.answerable);
  const thumbsUp = feedback.filter(e => e.rating === "up").length;
  const thumbsDown = feedback.filter(e => e.rating === "down").length;

  const summary = [
    `Ready Robotics Support Bot — Ukentlig digest`,
    `Periode: siste 7 dager`,
    ``,
    `Meldinger totalt: ${analytics.length}`,
    `Ubesvarte:        ${unanswered.length}`,
    `👍 Positive:      ${thumbsUp}`,
    `👎 Negative:      ${thumbsDown}`,
    ``,
    `Topp ubesvarte spørsmål:`,
    ...unanswered.slice(-15).reverse().map(e => `  • [${e.source}] ${e.question}`),
  ].join("\n");

  if (RESEND_API_KEY && DIGEST_EMAIL) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "bot@readyrobotics.no",
          to: DIGEST_EMAIL,
          subject: `Support bot digest — ${analytics.length} meldinger denne uken`,
          text: summary,
        }),
      });
    } catch (err) {
      console.error("[DIGEST] Email failed:", err.message);
    }
  }

  res.send(`<pre style="font-family:monospace;padding:32px">${summary}</pre>`);
});

async function extractSearchKeywords(text) {
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: `Extract 4-6 technical search keywords in English from this support question about a Gausium cleaning robot (models: Mira, Omnie, Scrubber 50, Phantas). Always include the robot model name if mentioned. Return only the keywords separated by spaces, no explanation:\n\n${text}` }],
  });
  return res.content[0].text.trim();
}

async function sendWhatsAppImage(to, imageUrl, caption = "") {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl, caption },
      }),
    }
  );
  const body = await res.json();
  if (!res.ok) console.error(`[IMG ERROR] ${JSON.stringify(body)}`);
  else console.log(`[IMG SENT] ${imageUrl}`);
}

async function processMessage(from, userText) {
  const publicUrl = PUBLIC_URL;
  console.log(`[MSG] From: ${from} | Text: "${userText}"`);

  const searchQuery = await extractSearchKeywords(userText);
  console.log(`[TRANSLATED] "${searchQuery}"`);

  const relevantChunks = searchChunks(searchQuery);
  console.log(`[SEARCH] Found ${relevantChunks.length} chunks`);

  const context =
    relevantChunks.length > 0
      ? relevantChunks.map((c) => c.webUrl
          ? `[From: ${c.source} | Link: ${c.webUrl}]\n${c.text}`
          : `[From: ${c.source}, page ${c.page} | Link: ${publicUrl}/pdfs/${encodeURIComponent(c.source)}#page=${c.page}]\n${c.text}`
        ).join("\n\n")
      : "No relevant documents found.";

  if (!conversations[from]) conversations[from] = [];
  conversations[from].push({ role: "user", content: userText });

  const history = conversations[from].slice(-6);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a friendly and knowledgeable support assistant for Ready Robotics, a Norwegian reseller of Gausium autonomous cleaning robots (Mira, Omnie, Scrubber 50, and Phantas models).

LANGUAGE RULE (most important rule): Always reply in the exact same language as the user's most recent message. If Norwegian, reply in Norwegian. If English, reply in English. Only match the language of the current message.

ROBOT MODEL RULE (critical):
- The product range includes: Omnie, Phantas, Scrubber 50 (SC50), Mira, and Beetle. These are distinct robots with different specs and parameters.
- If the user has not specified which robot model they are asking about, you MUST ask before answering. Do not guess or answer for multiple models at once.
- If the user says "roboten", "maskinen", "the robot" or similar without naming a model, always ask: which model are you using?
- If the user specifies a model (e.g. "Omnie"), answer ONLY using context tagged with that model's manuals. Do NOT include information from other models' manuals unless it explicitly states it applies to all models.
- If the context contains information for the wrong model, ignore it and say you don't have model-specific information.

TONE AND STYLE:
- Be warm and helpful, like a knowledgeable colleague — not robotic or clinical.
- Acknowledge the user's situation briefly before diving into the answer when it feels natural.
- If the user seems frustrated or stuck, show empathy.
- If a follow-up question would genuinely help, add it at the very end on its own separate line with a blank line before it.
- Do not over-explain or pad answers unnecessarily.

ANSWERING:
- Answer using ONLY the information in the context below from our official manuals.
- If the answer is not in the context, say so naturally and suggest contacting Ready Robotics: info@readyrobotics.no or 40282444.
- For step-by-step tasks, use numbered steps.
- Always end with a source reference on its own line: (Source: SOURCE_NAME, page PAGE_NUMBER)
  Followed by the exact link from the "Link:" field in the context tag. Do not modify or reconstruct the link.

FORMATTING:
- Plain text only, no markdown, no asterisks, no bullet symbols.
- Use numbered steps for procedures.
- Target around 100 words. Always finish your last sentence naturally — never cut off mid-thought. If there is more relevant information than fits, end with a note that the full details are available in the manual link below.

CONTEXT FROM MANUALS:
${context}`,
    messages: history,
  });

  const reply = response.content[0].text;
  console.log(`[REPLY] ${reply.slice(0, 100)}...`);
  conversations[from].push({ role: "assistant", content: reply });
  const answerable = !reply.toLowerCase().includes("don't have") && !reply.toLowerCase().includes("ikke har");
  logQuery("whatsapp", userText, answerable);
  saveConversations();

  const waRes = await fetch(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      }),
    }
  );

  const waBody = await waRes.json();
  if (!waRes.ok) {
    console.error(`[WA ERROR] ${JSON.stringify(waBody)}`);
  } else {
    console.log(`[WA SENT] message_id: ${waBody.messages?.[0]?.id}`);
  }

  // Parse the source citation from the reply to find the right page
  const citationMatch = reply.match(/(?:Source|Kilde)[:\s]+([^,]+),\s*(?:page|side)\s*([\d]+)/i);
  if (citationMatch) {
    const citedSource = citationMatch[1].trim();
    const citedPage = parseInt(citationMatch[2]);
    const chunk = relevantChunks.find(
      (c) => c.source.toLowerCase().includes(citedSource.toLowerCase().split(" ")[0]) && c.page === citedPage
    ) || relevantChunks.find(
      (c) => c.source.toLowerCase().includes(citedSource.toLowerCase().split(" ")[0])
    );
    if (chunk) {
      console.log(`[SCREENSHOT] ${chunk.source} page ${chunk.page}`);
      const filename = await getPageScreenshot(chunk.filePath, chunk.page);
      if (filename) await sendWhatsAppImage(from, `${publicUrl}/images/${filename}`);
      // Also send the next page in case content flows over
      const nextFilename = await getPageScreenshot(chunk.filePath, chunk.page + 1);
      if (nextFilename) await sendWhatsAppImage(from, `${publicUrl}/images/${nextFilename}`);
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  loadConversations();
  await ensurePDFs();
  await loadDocuments();
  await loadWebSources();
  console.log(`✅ Bot is running on port ${PORT}`);
});