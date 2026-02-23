import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";

import { Router } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..", "..");
const dataDir = path.join(repoRoot, "data");
const templatesFile = path.join(dataDir, "liquid-templates.json");

const router = Router();

function safeTemplatePayload(template) {
  return {
    id: String(template.id || "").trim(),
    name: String(template.name || "").trim(),
    content: String(template.content || ""),
    updatedAt: String(template.updatedAt || new Date().toISOString())
  };
}

async function loadTemplates() {
  try {
    const raw = await fs.readFile(templatesFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.templates)) return [];
    return parsed.templates
      .map((template) => safeTemplatePayload(template))
      .filter((template) => template.id && template.name);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveTemplates(templates) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    templatesFile,
    `${JSON.stringify({ templates, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

router.get("/liquid-templates", async (_req, res) => {
  try {
    const templates = await loadTemplates();
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: "Failed to load templates", details: error.message });
  }
});

router.post("/liquid-templates", async (req, res) => {
  try {
    const id = String(req.body?.id || "").trim();
    const name = String(req.body?.name || "").trim();
    const content = String(req.body?.content || "");

    if (!name) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const templates = await loadTemplates();
    const templateId = id || `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const updatedTemplate = {
      id: templateId,
      name,
      content,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = templates.findIndex((template) => template.id === templateId);
    if (existingIndex >= 0) {
      templates[existingIndex] = updatedTemplate;
    } else {
      templates.unshift(updatedTemplate);
    }

    await saveTemplates(templates);
    return res.json({ ok: true, template: updatedTemplate });
  } catch (error) {
    return res.status(500).json({ error: "Failed to save template", details: error.message });
  }
});

router.delete("/liquid-templates/:id", async (req, res) => {
  try {
    const templateId = String(req.params.id || "").trim();
    if (!templateId) {
      return res.status(400).json({ error: "Template id is required" });
    }

    const templates = await loadTemplates();
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    if (nextTemplates.length === templates.length) {
      return res.status(404).json({ error: "Template not found" });
    }

    await saveTemplates(nextTemplates);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete template", details: error.message });
  }
});

export default router;
