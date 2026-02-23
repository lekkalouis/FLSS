import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "customer-accounts.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

function writeDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, passwordHash, passwordSalt) {
  const incomingHash = crypto.scryptSync(password, passwordSalt, 64);
  const storedHash = Buffer.from(passwordHash, "hex");
  if (incomingHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(incomingHash, storedHash);
}

function publicProfile(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    phone: user.phone || "",
    addressLine1: user.addressLine1 || "",
    addressLine2: user.addressLine2 || "",
    city: user.city || "",
    province: user.province || "",
    postalCode: user.postalCode || "",
    tier: user.tier || "public",
    updatedAt: user.updatedAt || null
  };
}

const activeSessions = new Map();

export function registerCustomer(payload) {
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || "");
  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const db = readDb();
  const existing = db.users.find((user) => user.email === email);
  if (existing) return { error: "An account with this email already exists" };

  const { hash, salt } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hash,
    passwordSalt: salt,
    firstName: String(payload?.firstName || "").trim(),
    lastName: String(payload?.lastName || "").trim(),
    phone: String(payload?.phone || "").trim(),
    addressLine1: "",
    addressLine2: "",
    city: "",
    province: "",
    postalCode: "",
    tier: "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDb(db);
  return { user: publicProfile(user) };
}

export function loginCustomer(payload) {
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || "");
  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const db = readDb();
  const user = db.users.find((item) => item.email === email);
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return { error: "Invalid email or password" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.set(token, user.id);
  return { token, user: publicProfile(user) };
}

export function logoutCustomer(token) {
  if (!token) return;
  activeSessions.delete(token);
}

export function getCustomerFromToken(token) {
  const userId = activeSessions.get(token);
  if (!userId) return null;
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    activeSessions.delete(token);
    return null;
  }
  return user;
}

export function updateCustomerProfile(userId, payload) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) return { error: "Account not found" };

  const fields = ["firstName", "lastName", "phone", "addressLine1", "addressLine2", "city", "province", "postalCode"];
  for (const field of fields) {
    if (payload?.[field] !== undefined) {
      user[field] = String(payload[field] || "").trim();
    }
  }

  user.updatedAt = new Date().toISOString();
  writeDb(db);
  return { user: publicProfile(user) };
}

export function getPublicProfile(user) {
  return publicProfile(user);
}
