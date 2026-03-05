import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "public", "data", "changelog.generated.json");
const MAX_ENTRIES = 50;
const MANUAL_LOC_PER_HOUR = 120;

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function runGit(command, fallback = "") {
  try {
    return execSync(command, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
  } catch {
    return fallback;
  }
}

function parsePrNumber() {
  const explicit = process.env.PR_NUMBER || process.env.GITHUB_PR_NUMBER;
  if (explicit) return String(explicit).trim();

  const ref = process.env.GITHUB_REF || "";
  const match = ref.match(/refs\/pull\/(\d+)\//);
  if (match?.[1]) return match[1];
  return "";
}

function buildPrUrl(prNumber) {
  if (process.env.PR_URL) return process.env.PR_URL;
  if (!prNumber) return "";
  const server = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return "";
  return `${server}/${repo}/pull/${prNumber}`;
}

function formatTimestamp(date) {
  const weekday = new Intl.DateTimeFormat("en-ZA", { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
  const time = new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
  return `${weekday}, ${day} ${time}`;
}

function shouldCountAsCode(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const codeExts = new Set([
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".java", ".go", ".rs", ".php", ".html", ".css", ".scss", ".sql", ".sh", ".bat", ".ps1", ".json", ".md", ".yml", ".yaml"
  ]);
  return codeExts.has(ext);
}

function gatherRepoLoc() {
  const files = runGit("git ls-files", "").split("\n").filter(Boolean);
  let total = 0;

  for (const relativePath of files) {
    if (!shouldCountAsCode(relativePath)) continue;
    const fullPath = path.join(repoRoot, relativePath);
    let text = "";
    try {
      text = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    total += text.split(/\r?\n/).length;
  }

  return total;
}

function estimateTime(loc) {
  const manualHours = loc / MANUAL_LOC_PER_HOUR;
  const aiHours = manualHours * 0.01;
  const savedHours = manualHours - aiHours;
  return {
    manualHours,
    aiHours,
    savedHours
  };
}

const now = new Date();
const prNumber = parsePrNumber();
const prTitle =
  process.env.PR_TITLE ||
  process.env.GITHUB_PR_TITLE ||
  runGit("git log -1 --pretty=%s", "Build update");
const prUrl = buildPrUrl(prNumber);
const commitSha = runGit("git rev-parse --short HEAD", "unknown");
const branch = runGit("git rev-parse --abbrev-ref HEAD", "unknown");
const actor = process.env.GITHUB_ACTOR || runGit("git config user.name", "unknown");
const repoLoc = gatherRepoLoc();
const timeEstimate = estimateTime(repoLoc);

const previous = readJsonSafe(outputPath, { entries: [] });
const nextEntry = {
  title: prNumber ? `PR #${prNumber}: ${prTitle}` : prTitle,
  prNumber: prNumber || null,
  prUrl: prUrl || null,
  commitSha,
  branch,
  actor,
  builtAtIso: now.toISOString(),
  builtAtLabel: formatTimestamp(now),
  summary: `Build synced from ${branch}@${commitSha}.`,
  kpi: {
    repoLinesOfCode: repoLoc,
    manualHours: Number(timeEstimate.manualHours.toFixed(2)),
    aiHours: Number(timeEstimate.aiHours.toFixed(2)),
    savedHours: Number(timeEstimate.savedHours.toFixed(2)),
    speedBoost: "99% faster"
  }
};

const deduped = (previous.entries || []).filter((entry) => {
  return !(entry.commitSha === nextEntry.commitSha && entry.title === nextEntry.title);
});

const payload = {
  generatedAtIso: now.toISOString(),
  generatedAtLabel: formatTimestamp(now),
  entries: [nextEntry, ...deduped].slice(0, MAX_ENTRIES)
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Updated changelog at ${outputPath}`);
