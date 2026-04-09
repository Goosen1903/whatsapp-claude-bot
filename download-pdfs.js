import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const DOCS_DIR = "./documents";
const BASE_URL = "https://github.com/Goosen1903/whatsapp-claude-bot/releases/download/v1.0";

// Map of local filename -> GitHub release asset filename (spaces become dots)
const PDFS = [
  ["Phantas Deployment Guide (AIO).pdf", "Phantas.Deployment.Guide.AIO.pdf"],
  ["Phantas S1_FAQ for Service Provider-EN_v1.0_20230418.pdf", "Phantas.S1_FAQ.for.Service.Provider-EN_v1.0_20230418.pdf"],
  ["Phantas V1.3 Maintenance Manual.pdf", "Phantas.V1.3.Maintenance.Manual.pdf"],
  ["Phantas S1_Disassembly Guide-EN_v1.1_20230727.pdf", "Phantas.S1_Disassembly.Guide-EN_v1.1_20230727.pdf"],
  ["Phantas V1.3 User Manual.pdf", "Phantas.V1.3.User.Manual.pdf"],
  ["Gaussian Auto-Door Integration Solution.pdf", "Gaussian.Auto-Door.Integration.Solution.pdf"],
  ["Gausium Auto-door Solution Overview (1).pdf", "Gausium.Auto-door.Solution.Overview.1.pdf"],
  ["SC50 User Manual-Full Version-Final.pdf.pdf", "SC50.User.Manual-Full.Version-Final.pdf.pdf"],
  ["SC50 Charging Dock Deployment Manual.pdf", "SC50.Charging.Dock.Deployment.Manual.pdf"],
  ["Scrubber 50 Deployment Manual-AIO_.pdf", "Scrubber.50.Deployment.Manual-AIO_.pdf"],
  ["Mira.pdf", "Mira.pdf"],
  ["EN_Brochure_Beetle_250424.pdf", "EN_Brochure_Beetle_250424.pdf"],
  ["Beetle V1.0 User Manual.pdf", "Beetle.V1.0.User.Manual.pdf"],
  ["OMNIE Deployment Manual.pdf", "OMNIE.Deployment.Manual.pdf"],
  ["OMNIE Maintenance Manual.pdf", "OMNIE.Maintenance.Manual.pdf"],
  ["OMNIE User Manual.pdf", "OMNIE.User.Manual.pdf"],
];

export async function ensurePDFs() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const missing = PDFS.filter(([local]) => {
    const p = path.join(DOCS_DIR, local);
    if (!fs.existsSync(p)) return true;
    const size = fs.statSync(p).size;
    // LFS pointer files are tiny (~130 bytes) — treat as missing
    if (size < 1000) { fs.unlinkSync(p); return true; }
    return false;
  });
  if (missing.length === 0) {
    console.log("PDFs already present.");
    return;
  }

  console.log(`Downloading ${missing.length} PDF(s)...`);
  for (const [localName, assetName] of missing) {
    const url = `${BASE_URL}/${assetName}`;
    const dest = path.join(DOCS_DIR, localName);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
      console.log(`  ✓ ${localName}`);
    } catch (err) {
      console.error(`  ✗ Failed to download ${localName}: ${err.message}`);
    }
  }
}
