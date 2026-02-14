import fs from "fs/promises";
import path from "path";

const AUDIT_PATH = path.join(process.cwd(), "data", "stockists-audit.log");

export async function auditStockistEvent(eventType, payload = {}, actor = "system") {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    actor,
    eventType,
    payload
  });
  await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });
  await fs.appendFile(AUDIT_PATH, `${line}\n`, "utf8");
}
