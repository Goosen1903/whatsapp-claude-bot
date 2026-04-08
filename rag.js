import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

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

function findAllPDFs(dir) {
  let results = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findAllPDFs(fullPath));
    } else if (item.endsWith(".pdf")) {
      results.push(fullPath);
    }
  }
  return results;
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

  const files = findAllPDFs(dir);
  console.log(`Loading ${files.length} PDF(s)...`);
  chunks = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    try {
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

export function searchChunks(query, topN = 6) {
  const queryWords = query.toLowerCase().split(/\s+/);
  const scored = chunks.map((chunk) => {
    const chunkLower = chunk.text.toLowerCase();
    const score = queryWords.reduce(
      (acc, word) => acc + (chunkLower.includes(word) ? 1 : 0),
      0
    );
    return { ...chunk, score };
  });
  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
