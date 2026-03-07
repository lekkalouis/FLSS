import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function extractEnvKeys(text) {
  return [...String(text).matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]);
}

function extractRouteStrings(text) {
  const routes = [];
  const regex = /router\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = regex.exec(String(text)))) {
    routes.push(`${match[1].toUpperCase()} ${match[2]}`);
  }
  return routes;
}

async function startServer() {
  const { app } = createApp();
  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

test("config reference documents every environment key from .env.example", async () => {
  const [envExample, configReference] = await Promise.all([
    read(".env.example"),
    read("docs/config-reference.md")
  ]);

  for (const key of extractEnvKeys(envExample)) {
    assert.ok(
      configReference.includes(`\`${key}\``),
      `docs/config-reference.md is missing ${key}`
    );
  }
});

test("API reference documents every route and root runtime interface", async () => {
  const apiReference = await read("docs/api-reference.md");
  const routeDir = path.join(repoRoot, "src", "routes");
  const files = (await fs.readdir(routeDir)).filter((file) => file.endsWith(".js")).sort();

  for (const file of files) {
    const source = await fs.readFile(path.join(routeDir, file), "utf8");
    for (const route of extractRouteStrings(source)) {
      assert.ok(
        apiReference.includes(route),
        `docs/api-reference.md is missing ${route} from ${file}`
      );
    }
  }

  assert.ok(apiReference.includes("POST /__git_update"), "docs/api-reference.md is missing POST /__git_update");
  assert.ok(apiReference.includes("/ws/controller"), "docs/api-reference.md is missing /ws/controller");
  assert.ok(apiReference.includes("GET /portal"), "docs/api-reference.md is missing GET /portal");
  assert.doesNotMatch(apiReference, /\/customer-accounts\//, "docs/api-reference.md still references removed customer account routes");
});

test("live docs index includes current docs and excludes archived docs", async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/docs`);
    assert.equal(response.status, 200);

    const body = await response.json();
    const slugs = Array.isArray(body.topics) ? body.topics.map((topic) => topic.slug) : [];

    assert.ok(slugs.includes("readme"));
    assert.ok(slugs.includes("api-reference"));
    assert.ok(slugs.includes("config-reference"));
    assert.ok(slugs.includes("operator-manual"));

    assert.ok(!slugs.includes("dispatch-environment-remote-plan"));
    assert.ok(!slugs.includes("product-management"));
    assert.ok(!slugs.includes("raspberry-pi-station-controller-schematic"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("README presents legacy paths as redirects instead of primary tools", async () => {
  const readme = await read("README.md");

  assert.match(readme, /## Compatibility redirects/);
  assert.doesNotMatch(readme, /### Direct standalone tools/);
  assert.doesNotMatch(readme, /^- `\/purchase-orders\.html`\s*$/m);
  assert.doesNotMatch(readme, /^- `\/manufacturing\.html`\s*$/m);
  assert.doesNotMatch(readme, /^- `\/traceability\.html`\s*$/m);

  assert.match(readme, /`\/purchase-orders\.html` -> `\/buy`/);
  assert.match(readme, /`\/manufacturing\.html` -> `\/make`/);
  assert.match(readme, /`\/traceability\.html` -> `\/stock\?section=batches`/);
});
