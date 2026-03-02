const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const DEFAULT_DATA_DIR = fs.existsSync("/var/data") ? "/var/data" : path.join(ROOT, "data");
const DATA_DIR = path.resolve(String(process.env.DATA_DIR || DEFAULT_DATA_DIR));
const STATE_FILE = path.resolve(String(process.env.STATE_FILE || path.join(DATA_DIR, "shared-state.json")));
const BACKUP_DIR = path.join(path.dirname(STATE_FILE), "state-backups");
const LEDGER_FILE = path.join(path.dirname(STATE_FILE), "request-ledger.ndjson");
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || "").trim();
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const AUTH_SECRET = String(process.env.AUTH_SECRET || "").trim();
const SITE_USERNAME = String(process.env.SITE_USERNAME || "güzel kızım").trim().toLocaleLowerCase("tr-TR");
const SITE_PASSWORD = String(process.env.SITE_PASSWORD || "").trim();
const OWNER_USERNAME = String(process.env.OWNER_USERNAME || "kalpsorumlusu").trim().toLocaleLowerCase("tr-TR");
const OWNER_SITE_PASSWORD = String(process.env.OWNER_SITE_PASSWORD || "").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "1").trim() === "1";
const CORS_ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 6;
const loginAttempts = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function defaultState() {
  return {
    requests: [],
    deletedRequestIds: [],
    customNotifications: [],
    activityTimeline: [],
    loginLogs: [],
    dailyMessages: [],
    partnerPresence: {
      partnerOnline: false,
      updatedAt: null,
    },
    servicePause: {
      active: false,
      reason: "",
      updatedAt: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function ensureDataFolders() {
  if (!fs.existsSync(path.dirname(STATE_FILE))) fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(LEDGER_FILE)) fs.writeFileSync(LEDGER_FILE, "", "utf8");
}

function writeJsonAtomic(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function rotateBackups(limit = 45) {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (files.length <= limit) return;
  const deleteCount = files.length - limit;
  files.slice(0, deleteCount).forEach((name) => {
    fs.rmSync(path.join(BACKUP_DIR, name), { force: true });
  });
}

function createStateBackup(rawJsonText) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `state-${stamp}.json`);
    fs.writeFileSync(backupPath, rawJsonText);
    rotateBackups();
  } catch {
    // yedek alınamazsa ana akışı durdurma
  }
}

function restoreLatestBackupIfAny() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();

    if (!files.length) return false;
    const latest = files[files.length - 1];
    const raw = fs.readFileSync(path.join(BACKUP_DIR, latest), 'utf8');
    JSON.parse(raw);
    writeJsonAtomic(STATE_FILE, JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

function appendLedgerEntry(kind, statePayload) {
  try {
    const entry = {
      kind,
      at: new Date().toISOString(),
      state: statePayload,
    };
    fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(entry)}
`, "utf8");
  } catch {
    // ledger yazılamasa da ana işlem devam etsin
  }
}

function restoreStateFromLedgerIfAny() {
  try {
    if (!fs.existsSync(LEDGER_FILE)) return false;
    const raw = fs.readFileSync(LEDGER_FILE, "utf8").trim();
    if (!raw) return false;

    const lines = raw.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (!parsed || typeof parsed !== "object") continue;
        if (!parsed.state || typeof parsed.state !== "object") continue;
        writeJsonAtomic(STATE_FILE, parsed.state);
        return true;
      } catch {
        // bu satır bozuksa bir öncekini dene
      }
    }

    return false;
  } catch {
    return false;
  }
}

function ensureStateFile() {

  ensureDataFolders();
  if (fs.existsSync(STATE_FILE)) return;

  if (restoreLatestBackupIfAny()) {
    return;
  }

  if (restoreStateFromLedgerIfAny()) {
    return;
  }

  writeJsonAtomic(STATE_FILE, defaultState());
  appendLedgerEntry("state_initialized", defaultState());
}

function readState() {
  ensureStateFile();
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      deletedRequestIds: Array.isArray(parsed.deletedRequestIds)
        ? parsed.deletedRequestIds.map((id) => String(id))
        : [],
      customNotifications: Array.isArray(parsed.customNotifications) ? parsed.customNotifications : [],
      activityTimeline: Array.isArray(parsed.activityTimeline) ? parsed.activityTimeline : [],
      loginLogs: Array.isArray(parsed.loginLogs) ? parsed.loginLogs : [],
      dailyMessages: Array.isArray(parsed.dailyMessages) ? parsed.dailyMessages : [],
      partnerPresence:
        parsed.partnerPresence && typeof parsed.partnerPresence === "object"
          ? parsed.partnerPresence
          : { partnerOnline: false, updatedAt: null },
      servicePause:
        parsed.servicePause && typeof parsed.servicePause === "object"
          ? parsed.servicePause
          : { active: false, reason: "", updatedAt: null },
    };
  } catch {
    if (restoreLatestBackupIfAny() || restoreStateFromLedgerIfAny()) {
      try {
        const raw = fs.readFileSync(STATE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return {
          ...defaultState(),
          ...parsed,
          requests: Array.isArray(parsed.requests) ? parsed.requests : [],
          deletedRequestIds: Array.isArray(parsed.deletedRequestIds)
            ? parsed.deletedRequestIds.map((id) => String(id))
            : [],
          customNotifications: Array.isArray(parsed.customNotifications) ? parsed.customNotifications : [],
          activityTimeline: Array.isArray(parsed.activityTimeline) ? parsed.activityTimeline : [],
          loginLogs: Array.isArray(parsed.loginLogs) ? parsed.loginLogs : [],
          dailyMessages: Array.isArray(parsed.dailyMessages) ? parsed.dailyMessages : [],
          partnerPresence:
            parsed.partnerPresence && typeof parsed.partnerPresence === "object"
              ? parsed.partnerPresence
              : { partnerOnline: false, updatedAt: null },
          servicePause:
            parsed.servicePause && typeof parsed.servicePause === "object"
              ? parsed.servicePause
              : { active: false, reason: "", updatedAt: null },
        };
      } catch {
        return defaultState();
      }
    }
    return defaultState();
  }
}

function writeState(next) {
  ensureStateFile();
  const deletedSet = new Set(
    Array.isArray(next.deletedRequestIds) ? next.deletedRequestIds.map((id) => String(id)) : []
  );
  const sanitizedRequests = Array.isArray(next.requests)
    ? next.requests.filter((item) => !deletedSet.has(String(item.id)))
    : [];

  const safe = {
    ...defaultState(),
    ...next,
    requests: sanitizedRequests,
    deletedRequestIds: [...deletedSet],
    customNotifications: Array.isArray(next.customNotifications) ? next.customNotifications : [],
    activityTimeline: Array.isArray(next.activityTimeline) ? next.activityTimeline : [],
    loginLogs: Array.isArray(next.loginLogs) ? next.loginLogs : [],
    dailyMessages: Array.isArray(next.dailyMessages) ? next.dailyMessages : [],
    partnerPresence:
      next.partnerPresence && typeof next.partnerPresence === "object"
        ? next.partnerPresence
        : { partnerOnline: false, updatedAt: null },
    servicePause:
      next.servicePause && typeof next.servicePause === "object"
        ? {
            active: Boolean(next.servicePause.active),
            reason: String(next.servicePause.reason || "").trim(),
            updatedAt: next.servicePause.updatedAt || new Date().toISOString(),
          }
        : { active: false, reason: "", updatedAt: null },
    updatedAt: new Date().toISOString(),
  };
  const rawSafe = JSON.stringify(safe, null, 2);
  writeJsonAtomic(STATE_FILE, safe);
  createStateBackup(rawSafe);
  appendLedgerEntry("state_written", safe);
  return safe;
}

function getRequestRevision(item) {
  const parsed = Number(item?._rev ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function mergeState(next) {
  const current = readState();
  const incomingRequests = Array.isArray(next.requests) ? next.requests : [];
  const incomingDeleted = Array.isArray(next.deletedRequestIds)
    ? next.deletedRequestIds.map((id) => String(id))
    : [];

  const deletedSet = new Set([...(current.deletedRequestIds || []), ...incomingDeleted]);
  const requestMap = new Map();

  current.requests.forEach((item) => {
    requestMap.set(String(item.id), item);
  });

  incomingRequests.forEach((item) => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    if (deletedSet.has(id)) return;

    const currentItem = requestMap.get(id);
    const incomingRev = getRequestRevision(item);

    if (!currentItem) {
      requestMap.set(id, { ...item, _rev: incomingRev > 0 ? incomingRev : 1 });
      return;
    }

    const currentRev = getRequestRevision(currentItem);

    if (incomingRev > currentRev) {
      requestMap.set(id, { ...item, _rev: incomingRev });
      return;
    }

    if (incomingRev < currentRev) {
      return;
    }

    const currentUpdatedAt = Date.parse(currentItem.updatedAt || currentItem.createdAt || 0) || 0;
    const incomingUpdatedAt = Date.parse(item.updatedAt || item.createdAt || 0) || 0;

    if (incomingUpdatedAt >= currentUpdatedAt) {
      const normalizedRev = incomingRev > 0 ? incomingRev : currentRev > 0 ? currentRev : 1;
      requestMap.set(id, { ...item, _rev: normalizedRev });
    }
  });

  const mergedRequests = [...requestMap.values()].filter((item) => !deletedSet.has(String(item.id)));

  return writeState({
    ...current,
    ...next,
    requests: mergedRequests,
    deletedRequestIds: [...deletedSet],
  });
}

function writePresence(nextPresence) {
  const current = readState();
  const safePresence =
    nextPresence && typeof nextPresence === "object"
      ? {
          partnerOnline: Boolean(nextPresence.partnerOnline),
          updatedAt: nextPresence.updatedAt || new Date().toISOString(),
        }
      : { partnerOnline: false, updatedAt: null };

  return writeState({
    ...current,
    partnerPresence: safePresence,
  });
}

function isOriginAllowed(req, origin) {
  if (!origin) return false;
  if (CORS_ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const requestOrigin = `http://${req.headers.host}`;
    return new URL(origin).origin === new URL(requestOrigin).origin;
  } catch {
    return false;
  }
}

function sendJson(req, res, status, payload, extraHeaders = {}) {
  const origin = req.headers.origin;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
    "Cache-Control": "no-store",
    ...extraHeaders,
  };

  if (origin && isOriginAllowed(req, origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers.Vary = "Origin";
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  if (!raw) return {};
  return raw.split(";").reduce((acc, part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return acc;
    acc[k] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signToken(payload) {
  const crypto = require("crypto");
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const crypto = require("crypto");
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  const provided = Buffer.from(String(sig || ""));
  const calculated = Buffer.from(expected);
  if (provided.length !== calculated.length) return null;
  if (!crypto.timingSafeEqual(provided, calculated)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload || typeof payload !== "object") return null;
    if (!payload.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (TRUST_PROXY && forwardedProto) return forwardedProto.includes("https");
  return Boolean(req.socket && req.socket.encrypted);
}

function buildCookie(req, name, value, maxAgeSec = 60 * 60 * 12, options = {}) {
  const secureFlag = isSecureRequest(req) ? "; Secure" : "";
  const httpOnlyFlag = options.httpOnly === false ? "" : "; HttpOnly";
  const sameSite = options.sameSite || "Lax";
  return `${name}=${encodeURIComponent(value)}; Path=/${httpOnlyFlag}; SameSite=${sameSite}; Max-Age=${maxAgeSec}${secureFlag}`;
}

function buildExpiredCookie(req, name, options = {}) {
  const secureFlag = isSecureRequest(req) ? "; Secure" : "";
  const httpOnlyFlag = options.httpOnly === false ? "" : "; HttpOnly";
  const sameSite = options.sameSite || "Lax";
  return `${name}=; Path=/${httpOnlyFlag}; SameSite=${sameSite}; Max-Age=0${secureFlag}`;
}

function getSiteAuth(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies.kalp_site_session || "");
}

function getAdminAuth(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies.kalp_admin_session || "");
}

function issueCsrfToken() {
  return signToken({ kind: "csrf", exp: Date.now() + 1000 * 60 * 60 * 12 });
}

function getCsrfToken(req) {
  const cookies = parseCookies(req);
  return String(cookies.kalp_csrf || "");
}

function verifyCsrf(req) {
  const csrfCookie = getCsrfToken(req);
  const csrfHeader = String(req.headers["x-csrf-token"] || "").trim();
  if (!csrfCookie || !csrfHeader) return false;
  if (csrfCookie !== csrfHeader) return false;
  const payload = verifyToken(csrfHeader);
  return Boolean(payload && payload.kind === "csrf");
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || "unknown");
}

function rateLimitKey(req, username = "") {
  return `${getClientIp(req)}:${normalizeUsername(username)}`;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function checkRateLimit(req, username = "") {
  const key = rateLimitKey(req, username);
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0, firstAttemptAt: now };

  if (now - current.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 0, firstAttemptAt: now });
    return { limited: false, retryAfterSec: 0 };
  }

  if (current.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((LOGIN_RATE_LIMIT_WINDOW_MS - (now - current.firstAttemptAt)) / 1000);
    return { limited: true, retryAfterSec };
  }

  return { limited: false, retryAfterSec: 0 };
}

function registerLoginFailure(req, username = "") {
  const key = rateLimitKey(req, username);
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || now - current.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  loginAttempts.set(key, { count: current.count + 1, firstAttemptAt: current.firstAttemptAt });
}

function clearLoginFailures(req, username = "") {
  loginAttempts.delete(rateLimitKey(req, username));
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const normalizedRelativePath = path
    .normalize(safePath)
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.(?:[/\\]|$))+/, "");
  const fullPath = path.join(ROOT, normalizedRelativePath);

  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function sendEmail(payload) {
  if (EMAIL_PROVIDER !== "resend" || !RESEND_API_KEY || !EMAIL_FROM) {
    return {
      ok: false,
      status: 501,
      error: "Email provider not configured",
      hint: "Set EMAIL_PROVIDER=resend, RESEND_API_KEY and EMAIL_FROM in Render environment.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let hint = "Resend gönderimi başarısız. Domain doğrulaması ve EMAIL_FROM değerini kontrol et.";

    if (/testing emails/i.test(errorText) || /verify a domain/i.test(errorText)) {
      hint = "Resend hesabı test modunda görünüyor. Kendi doğrulanmış domainini ekleyip EMAIL_FROM'u o domainden yaz.";
    } else if (/from address/i.test(errorText) || /sender/i.test(errorText)) {
      hint = "EMAIL_FROM geçersiz veya doğrulanmamış. Örn: noreply@senindomain.com.tr kullan.";
    } else if (/api key/i.test(errorText) || /unauthorized/i.test(errorText)) {
      hint = "RESEND_API_KEY geçersiz görünüyor. Render Environment'da anahtarı yenileyip kaydet.";
    }

    return {
      ok: false,
      status: 502,
      error: "Failed to send email",
      hint,
      details: errorText,
    };
  }

  return { ok: true, status: 200 };
}

async function sendTelegram(payload) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return {
      ok: false,
      status: 501,
      error: "Telegram provider not configured",
      hint: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render environment.",
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: payload.text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      status: 502,
      error: "Failed to send telegram message",
      details: errorText,
    };
  }

  return { ok: true, status: 200 };
}

function getNotifyStatus() {
  const emailMissing = [];
  if (EMAIL_PROVIDER !== "resend") emailMissing.push("EMAIL_PROVIDER=resend");
  if (!RESEND_API_KEY) emailMissing.push("RESEND_API_KEY");
  if (!EMAIL_FROM) emailMissing.push("EMAIL_FROM");

  const telegramMissing = [];
  if (!TELEGRAM_BOT_TOKEN) telegramMissing.push("TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_CHAT_ID) telegramMissing.push("TELEGRAM_CHAT_ID");

  return {
    ready: emailMissing.length === 0,
    provider: EMAIL_PROVIDER || "not-set",
    from: EMAIL_FROM || "not-set",
    missing: emailMissing,
    telegram: {
      ready: telegramMissing.length === 0,
      missing: telegramMissing,
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return sendJson(req, res, 204, {});
  }

  if (url.pathname === "/api/auth/status" && req.method === "GET") {
    const siteAuth = getSiteAuth(req);
    const adminAuth = getAdminAuth(req);
    const isAuthed = Boolean(siteAuth || adminAuth);
    let csrfToken = getCsrfToken(req);
    const cookieHeaders = [];

    if (isAuthed) {
      const validExisting = verifyToken(csrfToken);
      if (!validExisting || validExisting.kind !== "csrf") {
        csrfToken = issueCsrfToken();
        cookieHeaders.push(buildCookie(req, "kalp_csrf", csrfToken, 60 * 60 * 12, { httpOnly: false }));
      }
    }

    return sendJson(
      req,
      res,
      200,
      {
        siteAuthenticated: Boolean(siteAuth),
        adminAuthenticated: Boolean(adminAuth),
        actor: siteAuth?.actor || null,
        csrfToken: isAuthed ? csrfToken : null,
      },
      cookieHeaders.length ? { "Set-Cookie": cookieHeaders } : {}
    );
  }

  if (url.pathname === "/api/auth/site-login" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const username = normalizeUsername(payload.username || "");
      const password = String(payload.password || "").trim();

      const siteLoginLimit = checkRateLimit(req, username);
      if (siteLoginLimit.limited) {
        return sendJson(req, res, 429, { ok: false, error: "Too many attempts", retryAfterSec: siteLoginLimit.retryAfterSec });
      }

      let actor = "";
      if (SITE_PASSWORD && username === SITE_USERNAME && password === SITE_PASSWORD) {
        actor = "Sevgilin";
      } else if (
        username === OWNER_USERNAME &&
        ((OWNER_SITE_PASSWORD && password === OWNER_SITE_PASSWORD) || (ADMIN_PASSWORD && password === ADMIN_PASSWORD))
      ) {
        actor = "Kalp Sorumlusu";
      }

      if (!actor) {
        registerLoginFailure(req, username);
        return sendJson(req, res, 401, { ok: false, error: "Invalid credentials" });
      }

      clearLoginFailures(req, username);

      const token = signToken({ actor, exp: Date.now() + 1000 * 60 * 60 * 12 });
      const csrfToken = issueCsrfToken();
      return sendJson(
        req,
        res,
        200,
        { ok: true, actor, csrfToken },
        {
          "Set-Cookie": [
            buildCookie(req, "kalp_site_session", token),
            buildCookie(req, "kalp_csrf", csrfToken, 60 * 60 * 12, { httpOnly: false }),
          ],
        }
      );
    } catch {
      return sendJson(req, res, 400, { ok: false, error: "Invalid JSON payload" });
    }
  }

  if (url.pathname === "/api/auth/admin-login" && req.method === "POST") {
    try {
      const siteAuth = getSiteAuth(req);
      if (!siteAuth || siteAuth.actor !== "Kalp Sorumlusu") {
        return sendJson(req, res, 403, { ok: false, error: "Owner site session required" });
      }

      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const password = String(payload.password || "").trim();

      const adminLoginLimit = checkRateLimit(req, "admin");
      if (adminLoginLimit.limited) {
        return sendJson(req, res, 429, { ok: false, error: "Too many attempts", retryAfterSec: adminLoginLimit.retryAfterSec });
      }

      if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
        registerLoginFailure(req, "admin");
        return sendJson(req, res, 401, { ok: false, error: "Invalid admin password" });
      }

      clearLoginFailures(req, "admin");

      const token = signToken({ role: "admin", exp: Date.now() + 1000 * 60 * 60 * 12 });
      const csrfToken = issueCsrfToken();
      return sendJson(
        req,
        res,
        200,
        { ok: true, csrfToken },
        {
          "Set-Cookie": [
            buildCookie(req, "kalp_admin_session", token),
            buildCookie(req, "kalp_csrf", csrfToken, 60 * 60 * 12, { httpOnly: false }),
          ],
        }
      );
    } catch {
      return sendJson(req, res, 400, { ok: false, error: "Invalid JSON payload" });
    }
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    if ((getSiteAuth(req) || getAdminAuth(req)) && !verifyCsrf(req)) {
      return sendJson(req, res, 403, { ok: false, error: "CSRF validation failed" });
    }

    return sendJson(
      req,
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": [
          buildExpiredCookie(req, "kalp_site_session"),
          buildExpiredCookie(req, "kalp_admin_session"),
          buildExpiredCookie(req, "kalp_csrf", { httpOnly: false }),
        ],
      }
    );
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    const siteAuth = getSiteAuth(req);
    if (!siteAuth) {
      return sendJson(req, res, 401, { ok: false, error: "Authentication required" });
    }
    return sendJson(req, res, 200, readState());
  }

  if (url.pathname === "/api/state" && req.method === "PUT") {
    const siteAuth = getSiteAuth(req);
    if (!siteAuth) {
      return sendJson(req, res, 401, { ok: false, error: "Authentication required" });
    }
    if (!verifyCsrf(req)) {
      return sendJson(req, res, 403, { ok: false, error: "CSRF validation failed" });
    }

    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const saved = mergeState(payload);
      return sendJson(req, res, 200, saved);
    } catch (error) {
      return sendJson(req, res, 400, { error: "Invalid JSON payload" });
    }
  }

  if (url.pathname === "/api/presence" && req.method === "PUT") {
    const siteAuth = getSiteAuth(req);
    if (!siteAuth) {
      return sendJson(req, res, 401, { ok: false, error: "Authentication required" });
    }
    if (!verifyCsrf(req)) {
      return sendJson(req, res, 403, { ok: false, error: "CSRF validation failed" });
    }

    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const saved = writePresence(payload.partnerPresence);
      return sendJson(req, res, 200, {
        ok: true,
        partnerPresence: saved.partnerPresence,
      });
    } catch {
      return sendJson(req, res, 400, { ok: false, error: "Invalid JSON payload" });
    }
  }

  if (url.pathname === "/api/notify/status" && req.method === "GET") {
    return sendJson(req, res, 200, getNotifyStatus());
  }

  if (url.pathname === "/api/notify" && req.method === "POST") {
    if (!verifyCsrf(req)) {
      return sendJson(req, res, 403, { ok: false, error: "CSRF validation failed" });
    }

    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};

      if (payload.channel === "email") {
        const adminAuth = getAdminAuth(req);
        if (!adminAuth) {
          return sendJson(req, res, 401, { ok: false, error: "Admin authentication required" });
        }
        if (!payload.to || !payload.subject || !payload.text) {
          return sendJson(req, res, 400, {
            ok: false,
            error: "Invalid payload",
            expected: "{ channel: 'email', to, subject, text }",
          });
        }

        const result = await sendEmail(payload);
        return sendJson(req, res, result.status, result);
      }

      if (payload.channel === "telegram") {
        const siteAuth = getSiteAuth(req);
        if (!siteAuth) {
          return sendJson(req, res, 401, { ok: false, error: "Authentication required" });
        }

        if (!payload.text) {
          return sendJson(req, res, 400, {
            ok: false,
            error: "Invalid payload",
            expected: "{ channel: 'telegram', text }",
          });
        }

        const result = await sendTelegram(payload);
        return sendJson(req, res, result.status, result);
      }

      return sendJson(req, res, 400, {
        ok: false,
        error: "Unsupported channel",
        expected: "channel must be 'email' or 'telegram'",
      });
    } catch {
      return sendJson(req, res, 400, { ok: false, error: "Invalid JSON payload" });
    }
  }

  return serveStatic(req, res, url.pathname);
});

if (!AUTH_SECRET) {
  console.error("AUTH_SECRET environment variable is required for secure session signing.");
  process.exit(1);
}

server.listen(PORT, () => {
  ensureStateFile();
  console.log(`Kalp Postası server running on http://0.0.0.0:${PORT}`);
  console.log(`State file: ${STATE_FILE}`);
  console.log(`Ledger file: ${LEDGER_FILE}`);
});
