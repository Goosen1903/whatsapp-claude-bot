import fs from "fs";
import path from "path";

const DOCS_DIR = "./documents";

function findAllFiles(dir, extensions) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const item of fs.readdirSync(dir)) {
    if (item.startsWith(".")) continue;
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(findAllFiles(full, extensions));
    } else if (extensions.some((ext) => item.toLowerCase().endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

export async function ensurePDFs() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const files = findAllFiles(DOCS_DIR, [".pdf", ".xlsx", ".xls"]);
  if (files.length === 0) {
    console.warn("⚠️  No documents found in ./documents — make sure git-lfs files are pulled.");
    return;
  }

  console.log(`Documents found (${files.length} files):`);
  for (const f of files) {
    const size = (fs.statSync(f).size / 1024 / 1024).toFixed(1);
    console.log(`  ✓ ${path.basename(f)} (${size}MB)`);
  }
}
