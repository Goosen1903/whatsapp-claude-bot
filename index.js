import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { loadDocuments, searchChunks, getPageScreenshot } from "./rag.js";
import { ensurePDFs } from "./download-pdfs.js";
import "dotenv/config";

const app = express();
app.use(express.json());
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

const conversations = {};
const webConversations = {};

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

app.post("/chat", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: "Missing message or sessionId" });
  if (isRateLimited(sessionId)) return res.status(429).json({ error: "Too many messages. Please wait before sending more." });

  try {
    const searchQuery = await extractSearchKeywords(message);
    const relevantChunks = searchChunks(searchQuery);
    const context = relevantChunks.length > 0
      ? relevantChunks.map((c) => `[From: ${c.source}, page ${c.page}]\n${c.text}`).join("\n\n")
      : "No relevant documents found.";

    if (!webConversations[sessionId]) webConversations[sessionId] = [];
    webConversations[sessionId].push({ role: "user", content: message });
    const history = webConversations[sessionId].slice(-10);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a technical support assistant for Ready Robotics, a reseller of Gausium autonomous cleaning robots (Mira, Omnie, Scrubber 50, and Phantas models).

LANGUAGE RULE (most important rule): Always reply in the exact same language as the user's most recent message. If their latest message is in Norwegian, reply in Norwegian. If English, reply in English. Never switch languages mid-conversation.

ANSWERING:
- Answer using ONLY the information in the context below from our official manuals.
- If the answer is partially in the context, give what you can and say what you don't have.
- If the answer is not in the context at all, say so clearly and advise the user to contact Ready Robotics support: info@readyrobotics.no or call 40282444.
- For step-by-step tasks (setup, maintenance, troubleshooting), use numbered steps.
- Be concise but complete — don't leave out important steps.
- Always end your answer with a source reference on its own line in exactly this format:
  (Source: FILENAME, page PAGE_NUMBER)
  Followed immediately by the direct link on the next line:
  ${PUBLIC_URL}/pdfs/FILENAME#page=PAGE_NUMBER
  Replace FILENAME with the exact filename from the context tag, and PAGE_NUMBER with the page number.

FORMATTING:
- Plain text only, no markdown, no asterisks, no bullet symbols.
- Use numbered steps for procedures.
- Keep replies under 300 words unless a procedure genuinely requires more.

CONTEXT FROM MANUALS:
${context}`,
      messages: history,
    });

    const reply = response.content[0].text;
    webConversations[sessionId].push({ role: "assistant", content: reply });
    res.json({ reply });
  } catch (err) {
    console.error("[CHAT ERROR]", err);
    res.status(500).json({ error: "Failed to process message" });
  }
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
      ? relevantChunks.map((c) => `[From: ${c.source}, page ${c.page}]\n${c.text}`).join("\n\n")
      : "No relevant documents found.";

  if (!conversations[from]) conversations[from] = [];
  conversations[from].push({ role: "user", content: userText });

  const history = conversations[from].slice(-10);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a technical support assistant for Ready Robotics, a reseller of Gausium autonomous cleaning robots (Mira, Omnie, Scrubber 50, and Phantas models).

LANGUAGE RULE (most important rule): Always reply in the exact same language as the user's most recent message. If their latest message is in Norwegian, reply in Norwegian. If English, reply in English. Never switch languages mid-conversation. Ignore the language of previous messages in the conversation history — only match the language of the current message.

ANSWERING:
- Answer using ONLY the information in the context below from our official manuals.
- If the answer is partially in the context, give what you can and say what you don't have.
- If the answer is not in the context at all, say so clearly and advise the user to contact Ready Robotics support: info@readyrobotics.no or call 40282444.
- For step-by-step tasks (setup, maintenance, troubleshooting), use numbered steps.
- Be concise but complete — don't leave out important steps.
- Always end your answer with a source reference on its own line in exactly this format:
  (Source: FILENAME, page PAGE_NUMBER)
  Followed immediately by the direct link on the next line:
  ${publicUrl}/pdfs/FILENAME#page=PAGE_NUMBER
  Replace FILENAME with the exact filename from the context tag, and PAGE_NUMBER with the page number.

FORMATTING:
- Plain text only, no markdown, no asterisks, no bullet symbols.
- Use numbered steps for procedures.
- Keep replies under 300 words unless a procedure genuinely requires more.

CONTEXT FROM MANUALS:
${context}`,
    messages: history,
  });

  const reply = response.content[0].text;
  console.log(`[REPLY] ${reply.slice(0, 100)}...`);
  conversations[from].push({ role: "assistant", content: reply });

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
  await ensurePDFs();
  await loadDocuments();
  console.log(`✅ Bot is running on port ${PORT}`);
});