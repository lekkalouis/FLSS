import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..", "..");

function loadJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

const actionsLibrary = loadJson("metrics/actions.v1.json");
const costModel = loadJson("metrics/cost-model.json");

const actionByCode = new Map(actionsLibrary.actions.map((action) => [action.action_code, action]));

export function getActionsLibrary() {
  return actionsLibrary;
}

export function getCostModel() {
  return costModel;
}

export function findAction(actionCode) {
  return actionByCode.get(actionCode) || null;
}
