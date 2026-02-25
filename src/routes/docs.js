import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";

import { Router } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..", "..");
const docsDir = path.join(repoRoot, "docs");

const router = Router();

function slugify(fileName) {
  return fileName.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function firstHeading(markdown, fallback) {
  const line = String(markdown || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : fallback;
}

async function buildTopicIndex() {
  const entries = await fs.readdir(docsDir, { withFileTypes: true });
  const markdownEntries = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"));

  const docsTopics = await Promise.all(
    markdownEntries.map(async (entry) => {
      const filePath = path.join(docsDir, entry.name);
      const content = await fs.readFile(filePath, "utf8");
      const slug = slugify(entry.name);
      return {
        slug,
        fileName: entry.name,
        title: firstHeading(content, entry.name.replace(/\.md$/i, "")),
        description: `Source: docs/${entry.name}`
      };
    })
  );

  const readmePath = path.join(repoRoot, "README.md");
  let readmeTopic = null;
  try {
    const content = await fs.readFile(readmePath, "utf8");
    readmeTopic = {
      slug: "readme",
      fileName: "README.md",
      title: firstHeading(content, "README"),
      description: "Source: README.md"
    };
  } catch {
    // README is optional
  }

  const topics = readmeTopic ? [readmeTopic, ...docsTopics] : docsTopics;
  return topics.sort((a, b) => a.title.localeCompare(b.title));
}

async function loadTopicMarkdown(slug) {
  if (slug === "readme") {
    return fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  }

  const entries = await fs.readdir(docsDir, { withFileTypes: true });
  const match = entries.find((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md") && slugify(entry.name) === slug);
  if (!match) return null;
  return fs.readFile(path.join(docsDir, match.name), "utf8");
}

router.get("/docs", async (_req, res) => {
  try {
    const topics = await buildTopicIndex();
    res.json({ topics });
  } catch (error) {
    res.status(500).json({ error: "Failed to load documentation index", details: error.message });
  }
});

router.get("/docs/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: "Invalid docs slug" });
    }

    const markdown = await loadTopicMarkdown(slug);
    if (!markdown) return res.status(404).json({ error: "Documentation topic not found" });

    return res.json({ slug, markdown });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load documentation topic", details: error.message });
  }
});

export default router;
