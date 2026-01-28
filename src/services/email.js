import nodemailer from "nodemailer";

import { config } from "../config.js";

let smtpTransport = null;

export function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  smtpTransport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: Number(config.SMTP_PORT || 0) || 587,
    secure: String(config.SMTP_SECURE).toLowerCase() === "true",
    auth: config.SMTP_USER
      ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS
        }
      : undefined
  });
  return smtpTransport;
}
