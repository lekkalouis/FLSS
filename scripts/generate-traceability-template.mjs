import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { buildTraceabilityTemplateBuffer } from "../src/services/traceability.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.join(__dirname, "..", "public", "data", "traceability_sample_data.xlsx");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buildTraceabilityTemplateBuffer());

console.log(`Generated ${outPath}`);
