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
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || "").trim();
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();

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

function ensureStateFile() {
  ensureDataFolders();
  if (fs.existsSync(STATE_FILE)) return;

  if (restoreLatestBackupIfAny()) {
    return;
  }

  writeJsonAtomic(STATE_FILE, defaultState());
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
    if (restoreLatestBackupIfAny()) {
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

function sendJson(req, res, status, payload) {
  const origin = req.headers.origin;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers.Vary = "Origin";
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
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

  if (url.pathname === "/api/state" && req.method === "GET") {
    return sendJson(req, res, 200, readState());
  }

  if (url.pathname === "/api/state" && req.method === "PUT") {
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
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};

      if (payload.channel === "email") {
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

server.listen(PORT, () => {
  ensureStateFile();
  console.log(`Kalp Postası server running on http://0.0.0.0:${PORT}`);
  console.log(`State file: ${STATE_FILE}`);
});
