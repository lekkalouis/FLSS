import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse/lib/pdf-parse.js');

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const contextDir = path.join(rootDir, 'context_content');
const outputPath = path.join(rootDir, 'public', 'data', 'purchase-order-catalog.generated.json');

const sources = [
  {
    key: 'vip',
    filename: 'VIP.pdf',
    title: 'VIP plastics & packaging',
    uom: 'box',
    icon: '📦'
  },
  {
    key: 'raw_herbs_spices_blends',
    filename: 'raw_herbs_spices_blends.pdf',
    aliases: ['Raw Herbs & Spices & Blends.pdf'],
    title: 'FL raw herbs, spices & blends',
    uom: 'kg',
    icon: '🌿'
  }
];

function normaliseName(name = '') {
  return name.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
}

function mapFlavourHints(name = '', sku = '') {
  const haystack = `${name} ${sku}`.toLowerCase();
  const hints = [];
  const rules = [
    ['original', ['original', 'multi purpose', '-mp', ' mp']],
    ['hot_spicy', ['hot', 'spicy', '-hs']],
    ['curry', ['curry', '-cm']],
    ['worcester', ['worcester', '-ws']],
    ['chutney', ['chutney', '-chut']],
    ['garlic', ['garlic']],
    ['cheese_onion', ['cheese & onion']],
    ['butter', ['butter']],
    ['parmesan', ['parmesan']],
    ['sour_cream_chives', ['sour cream', 'chives']]
  ];

  for (const [hint, patterns] of rules) {
    if (patterns.some((pattern) => haystack.includes(pattern))) hints.push(hint);
  }

  return [...new Set(hints)];
}

function extractVipEntries(text) {
  const entries = [];
  const regex = /\d+\.\s*\[([^\]]+)\]\s*([^\n]+?)\s*(?:\n|$)/g;
  for (const match of text.matchAll(regex)) {
    const sku = match[1].trim();
    const name = normaliseName(match[2]);
    if (!sku || !name) continue;
    entries.push({
      name,
      sku,
      unitOfMeasure: 'box',
      flavourMappingHints: mapFlavourHints(name, sku)
    });
  }
  return dedupe(entries);
}

function extractRawEntries(text) {
  const entries = [];
  const regex = /\d+\s*\[([^\]]+)\]\s*([\s\S]*?)(?=\n\s*\d+\s*\[[^\]]+\]|$)/g;

  for (const match of text.matchAll(regex)) {
    const sku = match[1].trim();
    const block = match[2];
    const endMarkers = ['Herbs &', 'Registered', 'Item Category'];
    let nameBlock = block;
    for (const marker of endMarkers) {
      const idx = nameBlock.indexOf(marker);
      if (idx >= 0) {
        nameBlock = nameBlock.slice(0, idx);
      }
    }
    const name = normaliseName(nameBlock);
    if (!sku || !name) continue;
    entries.push({
      name,
      sku,
      unitOfMeasure: 'kg',
      flavourMappingHints: mapFlavourHints(name, sku)
    });
  }

  return dedupe(entries);
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.sku}|${entry.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readPdfText(filePath) {
  const data = await fs.readFile(filePath);
  const parsed = await pdf(data);
  return parsed.text || '';
}

async function buildCatalog() {
  const warnings = [];
  const groups = [];

  for (const source of sources) {
    const candidateFiles = [source.filename, ...(source.aliases || [])];
    const existingFile = await candidateFiles.reduce(async (foundPromise, candidate) => {
      const found = await foundPromise;
      if (found) return found;
      const candidatePath = path.join(contextDir, candidate);
      try {
        await fs.access(candidatePath);
        return candidate;
      } catch {
        return null;
      }
    }, Promise.resolve(null));

    const filePath = existingFile ? path.join(contextDir, existingFile) : path.join(contextDir, source.filename);
    let entries = [];
    try {
      const text = await readPdfText(filePath);
      entries = source.key === 'vip' ? extractVipEntries(text) : extractRawEntries(text);
      if (!entries.length) {
        warnings.push(`No PO catalog entries parsed from ${existingFile || source.filename}.`);
      }
    } catch (error) {
      warnings.push(`Source PDF missing/unreadable: ${source.filename}. Re-add it under context_content/ and rerun npm run po:catalog:generate.`);
    }

    groups.push({
      title: source.title,
      sourceFile: existingFile || source.filename,
      defaultIcon: source.icon,
      items: entries
    });
  }

  const fallbackMessage = warnings.length
    ? `PO catalog loaded with fallback. ${warnings.join(' ')}`
    : '';

  return {
    generatedAt: new Date().toISOString(),
    sourceDirectory: 'context_content',
    warnings,
    fallbackMessage,
    groups
  };
}

const catalog = await buildCatalog();
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
if (catalog.warnings.length) {
  console.warn(catalog.fallbackMessage);
}
