import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
const XLSX = require("xlsx");

const WEB_SOURCES_FILE = "./web-sources.json";

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchWebSource(name, url) {
  // Try direct fetch first (works for static pages)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ReadyRoboticsBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length >= 500) return text;
    }
  } catch (_) {}

  // Fallback: Jina AI reader for JS-rendered pages (free, no API key needed)
  console.log(`  → Direct fetch insufficient for "${name}", trying Jina AI reader...`);
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: { "Accept": "text/plain" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
  const text = await res.text();
  if (text.length < 200) throw new Error("Jina returned insufficient content");
  return text;
}

const IMAGES_DIR = "./public/images";
const PDFS_DIR = "./public/pdfs";
let chunks = [];

function splitIntoChunks(text, size = 150, overlap = 20) {
  const words = text.split(/\s+/);
  const result = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    result.push(words.slice(i, i + size).join(" "));
    if (i + size >= words.length) break;
  }
  return result;
}

function findAllFiles(dir, extensions) {
  let results = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => item.toLowerCase().endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const chunks = [];
  for (const sheetName of wb.SheetNames) {
    // Skip Chinese-only sheets
    if (/[\u4e00-\u9fa5]/.test(sheetName) && !/[a-zA-Z]/.test(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (rows.length < 2) continue;
    const headers = rows[0].map((h) => String(h).trim());
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every((cell) => cell === "" || cell === null)) continue;
      // Build a readable key:value block per row
      const parts = headers
        .map((h, j) => {
          const val = String(row[j] ?? "").trim().replace(/\r\n/g, " ").replace(/\n/g, " ");
          return h && val ? `${h}: ${val}` : null;
        })
        .filter(Boolean);
      if (parts.length > 0) chunks.push(parts.join(" | "));
    }
  }
  return chunks;
}

async function parsePDFPages(filePath) {
  const fileUrl = pathToFileURL(path.resolve(filePath)).href;
  const parser = new PDFParse({ url: fileUrl });
  const data = await parser.getText();
  await parser.destroy();

  const segments = data.text.split(/--\s*\d+\s*of\s*\d+\s*--/);
  return segments
    .map((text, i) => ({ pageIndex: i + 1, text: text.trim() }))
    .filter((p) => p.text.length > 0);
}

// Render a single PDF page as a PNG screenshot, cached to disk.
export async function getPageScreenshot(filePath, pageNum) {
  const baseName = path.basename(filePath, ".pdf").replace(/\s+/g, "_");
  const filename = `${baseName}_page${pageNum}.png`;
  const outPath = path.join(IMAGES_DIR, filename);

  if (fs.existsSync(outPath)) return filename;

  const fileUrl = pathToFileURL(path.resolve(filePath)).href;
  const parser = new PDFParse({ url: fileUrl });
  try {
    const result = await parser.getScreenshot({ partial: [pageNum], scale: 2 });
    await parser.destroy();
    const data = result.pages?.[0]?.data;
    if (!data || data.length === 0) return null;
    fs.writeFileSync(outPath, Buffer.from(data));
    return filename;
  } catch (err) {
    await parser.destroy();
    console.error(`[SCREENSHOT ERROR] ${path.basename(filePath)} page ${pageNum}: ${err.message}`);
    return null;
  }
}

export async function loadDocuments() {
  const dir = "./documents";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(PDFS_DIR, { recursive: true });

  const files = findAllFiles(dir, [".pdf", ".xlsx", ".xls"]);
  console.log(`Loading ${files.length} document(s)...`);
  chunks = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    try {
      if (ext === ".xlsx" || ext === ".xls") {
        const rows = parseExcel(filePath);
        rows.forEach((row) =>
          chunks.push({ text: row, source: fileName, page: 1, filePath })
        );
        console.log(`  ✓ ${fileName} → ${rows.length} rows`);
        continue;
      }

      // Copy PDF to public/pdfs so it can be linked to
      fs.copyFileSync(filePath, path.join(PDFS_DIR, fileName));

      const pages = await parsePDFPages(filePath);
      for (const { pageIndex, text } of pages) {
        splitIntoChunks(text).forEach((chunk) =>
          chunks.push({ text: chunk, source: fileName, page: pageIndex, filePath })
        );
      }
      console.log(`  ✓ ${fileName} → ${pages.length} pages`);
    } catch (err) {
      console.log(`  ✗ Failed to load ${fileName}: ${err.message}`);
    }
  }
  console.log(`Total chunks: ${chunks.length}`);
}

export async function loadWebSources() {
  const cacheDir = "./web-cache";
  if (!fs.existsSync(cacheDir)) {
    console.log("No web-cache directory found, skipping web sources.");
    return;
  }

  const metaFiles = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".meta.json"));
  if (!metaFiles.length) {
    console.log("No cached web sources found. Run: node fetch-web.js");
    return;
  }

  console.log(`Loading ${metaFiles.length} cached web source(s)...`);
  for (const metaFile of metaFiles) {
    const metaPath = path.join(cacheDir, metaFile);
    const txtPath = metaPath.replace(".meta.json", ".txt");
    try {
      const { name, url } = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (!fs.existsSync(txtPath)) throw new Error("Missing .txt file");
      const text = fs.readFileSync(txtPath, "utf8");
      splitIntoChunks(text).forEach((chunk) =>
        chunks.push({ text: `[${name}] ${chunk}`, source: name, page: 1, filePath: txtPath, webUrl: url })
      );
      console.log(`  ✓ ${name} (${Math.round(text.length / 1000)}KB)`);
    } catch (err) {
      console.log(`  ✗ Failed to load ${metaFile}: ${err.message}`);
    }
  }
}

const STOP_WORDS = new Set(["the","and","for","how","do","i","a","an","is","are","to","of","in","on","at","it","this","that","with","what","when","where","why","can","jeg","er","det","en","et","og","på","av","til","med","som","har","ikke","den","de","å","i","om","så","men","fra","eller"]);

export function searchChunks(query, topN = 15) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  if (queryWords.length === 0) return [];

  // Detect robot model in query for boosting
  const modelKeywords = { omnie: "omnie", phantas: "phantas", scrubber: "scrubber", sc50: "scrubber", mira: "mira", beetle: "beetle" };
  const detectedModel = Object.entries(modelKeywords).find(([k]) => query.toLowerCase().includes(k))?.[1];

  const scored = chunks.map((chunk) => {
    const chunkLower = chunk.text.toLowerCase();
    let score = queryWords.reduce(
      (acc, word) => acc + (chunkLower.includes(word) ? 1 : 0),
      0
    );
    // Boost chunks from the detected model's documents
    if (detectedModel && chunk.source.toLowerCase().includes(detectedModel)) {
      score *= 2;
    }
    return { ...chunk, score };
  });

  const relevant = scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  if (relevant.length === 0) return [];

  // Always include all chunks from the top-scoring source document (in page order)
  const topSource = relevant[0].source;
  const topSourceChunks = scored
    .filter(c => c.source === topSource && c.score > 0)
    .sort((a, b) => a.page - b.page);

  // Fill remaining slots with high-scoring chunks from other sources
  const otherChunks = relevant.filter(c => c.source !== topSource).slice(0, topN - topSourceChunks.length);

  return [...topSourceChunks, ...otherChunks];
}
