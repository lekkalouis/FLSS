import crypto from "crypto";
import fs from "fs";
import { execFile } from "child_process";
import path from "path";

import { config } from "./src/config.js";
import { createApp } from "./src/app.js";

const DEPLOY_BRANCH = "1.9";
const DEPLOY_REF = `refs/heads/${DEPLOY_BRANCH}`;
const PID_FILE = path.resolve("flss.pid");
const UPDATE_SCRIPT = path.resolve("update.bat");

const { app, allowAllOrigins, allowedOrigins } = createApp();

fs.writeFileSync(PID_FILE, String(process.pid));

function isValidGithubSignature(req, secret) {
  const signature = req.get("x-hub-signature-256");
  if (!signature || !Buffer.isBuffer(req.rawBody)) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex")}`;
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

app.post("/__git_update", (req, res) => {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: "GITHUB_WEBHOOK_SECRET is not configured" });
  }

  if (!isValidGithubSignature(req, webhookSecret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  if (req.body?.ref !== DEPLOY_REF) {
    return res.status(200).json({ ok: true, ignored: true, reason: "non-deploy branch" });
  }

  execFile("cmd.exe", ["/c", UPDATE_SCRIPT], { windowsHide: true }, (error, stdout, stderr) => {
    if (error) {
      console.error("Deploy script failed:", error);
      if (stdout) console.error(stdout);
      if (stderr) console.error(stderr);
      return;
    }

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });

  return res.status(200).json({ ok: true });
});

app.listen(config.PORT, config.HOST, () => {
  const hostLabel = config.HOST === "0.0.0.0" ? "all interfaces" : config.HOST;
  console.log(`Scan Station server listening on http://${hostLabel}:${config.PORT}`);
  if (config.HOST === "localhost" || config.HOST === "127.0.0.1") {
    console.warn("Warning: HOST is loopback-only; other devices on your LAN cannot connect.");
  }
  console.log(`Allowed origins: ${allowAllOrigins ? "*" : [...allowedOrigins].join(", ")}`);
  console.log("PP_BASE_URL:", config.PP_BASE_URL || "(NOT SET)");
  console.log(
    "Shopify configured:",
    Boolean(config.SHOPIFY_STORE && config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET)
  );
});
