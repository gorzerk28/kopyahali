const STORAGE_KEY = "kalp-postasi-requests";
const CUSTOM_NOTIFICATIONS_KEY = "kalp-postasi-custom-notifications";
const ADMIN_SESSION_KEY = "kalp-postasi-admin-session";
const SITE_SESSION_KEY = "kalp-postasi-site-session";
const PRESENCE_KEY = "kalp-postasi-presence";
const ACTIVITY_TIMELINE_KEY = "kalp-postasi-activity-timeline";
const LOGIN_LOGS_KEY = "kalp-postasi-login-logs";
const DAILY_MESSAGES_KEY = "kalp-postasi-daily-messages";
const OWNER_DEVICE_KEY = "kalp-postasi-owner-device";
const SITE_LOGIN_ACTOR_KEY = "kalp-postasi-site-login-actor";
const SERVICE_PAUSE_KEY = "kalp-postasi-service-pause";

const config = window.APP_CONFIG || {};
const SYNC_MODE = (() => {
  const rawMode = String(config.syncMode || "local").trim().toLowerCase();
  if (["local", "remote", "auto"].includes(rawMode)) return rawMode;
  return "local";
})();

function resolveRemoteStateEndpoint() {
  const configuredBase = String(config.apiBaseUrl || "").trim();

  if (!configuredBase) {
    return `${window.location.origin}/api/state`;
  }

  const normalizedBase = configuredBase.replace(/\/+$/, "");
  return normalizedBase.endsWith("/api/state")
    ? normalizedBase
    : `${normalizedBase}/api/state`;
}

const REMOTE_STATE_ENDPOINT = resolveRemoteStateEndpoint();
const NOTIFY_ENDPOINT = REMOTE_STATE_ENDPOINT.replace(/\/api\/state$/, "/api/notify");
const PRESENCE_ENDPOINT = REMOTE_STATE_ENDPOINT.replace(/\/api\/state$/, "/api/presence");
const AUTH_STATUS_ENDPOINT = REMOTE_STATE_ENDPOINT.replace(/\/api\/state$/, "/api/auth/status");
const AUTH_SITE_LOGIN_ENDPOINT = REMOTE_STATE_ENDPOINT.replace(/\/api\/state$/, "/api/auth/site-login");
const AUTH_ADMIN_LOGIN_ENDPOINT = REMOTE_STATE_ENDPOINT.replace(/\/api\/state$/, "/api/auth/admin-login");
const AUTH_LOGOUT_ENDPOINT = REMOTE_STATE_ENDPOINT.replace(/\/api\/state$/, "/api/auth/logout");
const REMOTE_STATE_IS_SAME_ORIGIN = (() => {
  try {
    return new URL(REMOTE_STATE_ENDPOINT, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
})();
const REMOTE_FETCH_CREDENTIALS = REMOTE_STATE_IS_SAME_ORIGIN ? "same-origin" : "include";
const STATIC_ONLY_HOSTS = ["github.io", "githubusercontent.com"];
const RUNNING_ON_STATIC_ONLY_HOST = STATIC_ONLY_HOSTS.some((host) =>
  window.location.hostname.endsWith(host)
);
const PARTNER_EMAIL = String(config.partnerEmail || "").trim();
let remoteSyncEnabled = SYNC_MODE !== "local";
let hasWarnedRemoteUnavailable = false;
let csrfToken = "";

const DEFAULT_SERVICE_PAUSE_MESSAGE =
  "Kalp Sorumlusu geçici olarak Sinirli Mod’a geçmiştir. Talep hizmeti kısa süreliğine devre dışıdır. Sistem, uygun koşullar oluştuğunda normal çalışma düzenine dönecektir. Sinirli Mod’un devre dışı bırakılması için Kalp Sorumlusu ile nazik bir iletişim önerilir.";

const DEFAULT_DAILY_LOVE_MESSAGES = [
  "Bugün de kalbim seninle aynı ritimde atıyor. 💓",
  "Birlikte olduğumuz her gün, en sevdiğim gün oluyor. 🌸",
  "Küçük bir gülüşün bile bütün günümü aydınlatıyor. ☀️",
  "Sana yazılan her talep aslında sana duyduğum sevginin başka hali. 💌",
  "İyi ki varsın, iyi ki bizim küçük dünyamız var. 🌷",
  "Bugün ne olursa olsun, yanında olmayı seçiyorum. 🤍",
  "Seninle sıradan günler bile kutlama gibi geliyor. ✨",
];

const state = {
  requests: loadRequests(),
  customNotifications: loadCustomNotifications(),
  activityTimeline: loadActivityTimeline(),
  loginLogs: loadLoginLogs(),
  dailyMessages: loadDailyMessages(),
  partnerPresence: loadPartnerPresence(),
  servicePause: loadServicePause(),
  failedSiteAttempts: 0,
};

const adminDrafts = new Map();
let stormFlashTimer = null;
let stormRainInitialized = false;

const body = document.body;
const appShell = document.getElementById("appShell");
const siteLoginForm = document.getElementById("siteLoginForm");
const siteLoginInfo = document.getElementById("siteLoginInfo");
const siteLogoutBtn = document.getElementById("siteLogoutBtn");
const notificationBell = document.getElementById("notificationBell");
const notificationCount = document.getElementById("notificationCount");
const bellInfo = document.getElementById("bellInfo");

const tabs = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".panel");
const requestForm = document.getElementById("requestForm");
const formInfo = document.getElementById("formInfo");
const trackList = document.getElementById("trackList");
const trackNotifications = document.getElementById("trackNotifications");
const adminList = document.getElementById("adminList");
const adminLoginForm = document.getElementById("adminLoginForm");
const loginInfo = document.getElementById("loginInfo");
const adminGate = document.getElementById("adminGate");
const adminContent = document.getElementById("adminContent");
const logoutBtn = document.getElementById("logoutBtn");
const sendNotificationForm = document.getElementById("sendNotificationForm");
const sendNotificationInfo = document.getElementById("sendNotificationInfo");
const sendManualEmailForm = document.getElementById("sendManualEmailForm");
const sendManualEmailInfo = document.getElementById("sendManualEmailInfo");
const partnerPresence = document.getElementById("partnerPresence");
const loveBurstLayer = document.getElementById("loveBurstLayer");
const brandLogoImage = document.getElementById("brandLogoImage");
const gateHeroImage = document.getElementById("gateHeroImage");
const dailyLoveMessage = document.getElementById("dailyLoveMessage");
const loveCalendar = document.getElementById("loveCalendar");
const activityTimeline = document.getElementById("activityTimeline");
const loginLogs = document.getElementById("loginLogs");
const dailyMessageForm = document.getElementById("dailyMessageForm");
const dailyMessageInput = document.getElementById("dailyMessageInput");
const dailyMessageInfo = document.getElementById("dailyMessageInfo");
const dailyMessageResetBtn = document.getElementById("dailyMessageResetBtn");
const mailStatusBadge = document.getElementById("mailStatusBadge");
const mailStatusHint = document.getElementById("mailStatusHint");
const servicePauseBanner = document.getElementById("servicePauseBanner");
const servicePauseMessage = document.getElementById("servicePauseMessage");
const toggleServicePauseBtn = document.getElementById("toggleServicePauseBtn");
const servicePauseAdminInfo = document.getElementById("servicePauseAdminInfo");
const servicePauseMessageForm = document.getElementById("servicePauseMessageForm");
const servicePauseMessageInput = document.getElementById("servicePauseMessageInput");
const servicePauseMessageResetBtn = document.getElementById("servicePauseMessageResetBtn");
const servicePauseMessageInfo = document.getElementById("servicePauseMessageInfo");
const stormScene = document.getElementById("stormScene");
const stormRain = document.getElementById("stormRain");
const stormFlash = document.getElementById("stormFlash");

function setFirstAvailableImage(imgEl, candidates) {
  if (!imgEl) return;

  const tryAt = (index) => {
    if (index >= candidates.length) {
      imgEl.style.display = "none";
      return;
    }

    const test = new Image();
    test.onload = () => {
      imgEl.src = candidates[index];
      imgEl.style.display = "";
    };
    test.onerror = () => tryAt(index + 1);
    test.src = candidates[index];
  };

  tryAt(0);
}

setFirstAvailableImage(brandLogoImage, [
  "assets/logo-kalp-isleri.png",
  "assets/logo.png",
  "assets/logo-2.png",
  "logo-kalp-isleri.png",
  "logo.png",
]);

setFirstAvailableImage(gateHeroImage, [
  "assets/hero-envelope.png",
  "assets/hero.png",
  "assets/envelope.png",
  "hero-envelope.png",
  "hero.png",
]);

function getDayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function renderDailyLoveMessage() {
  if (!dailyLoveMessage) return;

  if (!state.dailyMessages.length) {
    state.dailyMessages = [...DEFAULT_DAILY_LOVE_MESSAGES];
  }

  const index = getDayOfYear() % state.dailyMessages.length;
  dailyLoveMessage.textContent = state.dailyMessages[index];
}

function loadActivityTimeline() {
  const raw = localStorage.getItem(ACTIVITY_TIMELINE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveActivityTimeline() {
  localStorage.setItem(ACTIVITY_TIMELINE_KEY, JSON.stringify(state.activityTimeline));
  queueRemotePush();
}

function loadDailyMessages() {
  const raw = localStorage.getItem(DAILY_MESSAGES_KEY);
  if (!raw) return [...DEFAULT_DAILY_LOVE_MESSAGES];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_DAILY_LOVE_MESSAGES];

    const sanitized = parsed.map((item) => String(item).trim()).filter(Boolean);
    return sanitized.length ? sanitized : [...DEFAULT_DAILY_LOVE_MESSAGES];
  } catch {
    return [...DEFAULT_DAILY_LOVE_MESSAGES];
  }
}

function saveDailyMessages() {
  localStorage.setItem(DAILY_MESSAGES_KEY, JSON.stringify(state.dailyMessages));
  queueRemotePush();
}

function loadLoginLogs() {
  const raw = localStorage.getItem(LOGIN_LOGS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveLoginLogs() {
  localStorage.setItem(LOGIN_LOGS_KEY, JSON.stringify(state.loginLogs));
  queueRemotePush();
}

function addLoginLog(actor, action) {
  const item = {
    id: `l-${Date.now().toString(36)}`,
    actor,
    action,
    createdAt: new Date().toISOString(),
  };

  state.loginLogs.unshift(item);
  state.loginLogs = state.loginLogs.slice(0, 200);
  saveLoginLogs();
  renderLoginLogs();
}

function renderLoginLogs() {
  if (!loginLogs) return;

  loginLogs.innerHTML = "";

  if (!state.loginLogs.length) {
    loginLogs.innerHTML = '<p class="muted">Henüz giriş kaydı yok.</p>';
    return;
  }

  const list = document.createElement("ul");
  list.className = "activity-list";

  state.loginLogs.forEach((item) => {
    const li = document.createElement("li");
    li.className = "activity-item";
    const dateText = new Date(item.createdAt).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    li.innerHTML = `<span class="activity-dot"></span><div><p><strong>${item.actor}</strong> ${item.action}</p><small>${dateText}</small></div>`;
    list.appendChild(li);
  });

  loginLogs.appendChild(list);
}

function renderDailyMessageEditor() {
  if (!dailyMessageInput) return;
  dailyMessageInput.value = state.dailyMessages.join("\n");
}

function addActivity(type, text) {
  const item = {
    id: `a-${Date.now().toString(36)}`,
    type,
    text,
    createdAt: new Date().toISOString(),
  };

  state.activityTimeline.unshift(item);
  state.activityTimeline = state.activityTimeline.slice(0, 30);
  saveActivityTimeline();
  renderActivityTimeline();
}

function renderActivityTimeline() {
  if (!activityTimeline) return;

  activityTimeline.innerHTML = "";

  if (!state.activityTimeline.length) {
    activityTimeline.innerHTML = '<p class="muted">Henüz aktivite yok. İlk hareket burada görünecek 💫</p>';
    return;
  }

  const list = document.createElement("ul");
  list.className = "activity-list";

  state.activityTimeline.forEach((item) => {
    const li = document.createElement("li");
    li.className = "activity-item";
    const dateText = new Date(item.createdAt).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    li.innerHTML = `<span class="activity-dot"></span><div><p>${item.text}</p><small>${dateText}</small></div>`;
    list.appendChild(li);
  });

  activityTimeline.appendChild(list);
}

function renderLoveCalendar() {
  if (!loveCalendar) return;

  loveCalendar.innerHTML = "";

  if (!state.requests.length) {
    loveCalendar.innerHTML = '<p class="muted">Takvim henüz boş. İlk planı ekleyince burada gözükecek 💞</p>';
    return;
  }

  const ordered = [...state.requests]
    .filter((item) => item.targetDate)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 6);

  ordered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "calendar-item";
    card.innerHTML = `
      <p class="calendar-date">${formatDate(item.targetDate)}</p>
      <h4>${item.title}</h4>
      <p class="muted">${item.category} • ${item.status}</p>
    `;
    loveCalendar.appendChild(card);
  });
}

function playCelebrationBurst(mode = "soft") {
  if (!loveBurstLayer) return;

  const count = mode === "big" ? 26 : 14;
  const emojis = mode === "big" ? ["💖", "✨", "🎉", "💘"] : ["💗", "💞", "✨"];

  for (let i = 0; i < count; i += 1) {
    const confetti = document.createElement("span");
    confetti.className = "celebration-heart";
    confetti.textContent = emojis[i % emojis.length];
    confetti.style.left = `${15 + Math.random() * 70}%`;
    confetti.style.top = `${60 + Math.random() * 20}%`;
    confetti.style.animationDelay = `${Math.random() * 180}ms`;
    loveBurstLayer.appendChild(confetti);
    setTimeout(() => confetti.remove(), 1700);
  }
}

function getSerializableState(options = {}) {
  const { deletedRequestIds = [] } = options;

  const payload = {
    requests: state.requests,
    customNotifications: state.customNotifications,
    activityTimeline: state.activityTimeline,
    loginLogs: state.loginLogs,
    dailyMessages: state.dailyMessages,
    partnerPresence: state.partnerPresence,
    servicePause: state.servicePause,
  };

  if (Array.isArray(deletedRequestIds) && deletedRequestIds.length) {
    payload.deletedRequestIds = deletedRequestIds;
  }

  return payload;
}

function isAdminEditorActive() {
  if (!adminList) return false;
  const active = document.activeElement;
  if (!active) return false;
  if (!adminList.contains(active)) return false;
  const tag = (active.tagName || "").toLowerCase();
  return tag === "textarea" || tag === "select" || tag === "input";
}

function mergeRequestsPreferLatest(localRequests, remoteRequests) {
  const local = Array.isArray(localRequests) ? localRequests : [];
  const remote = Array.isArray(remoteRequests) ? remoteRequests : [];
  const byId = new Map();

  const score = (item) => {
    const rev = Number(item?._rev || 0);
    const updated = Date.parse(item?.updatedAt || "") || 0;
    return rev * 1_000_000_000_000 + updated;
  };

  for (const item of local) {
    if (!item?.id) continue;
    byId.set(String(item.id), item);
  }

  for (const item of remote) {
    if (!item?.id) continue;
    const id = String(item.id);
    const existing = byId.get(id);
    if (!existing || score(item) >= score(existing)) {
      byId.set(id, item);
    }
  }

  return Array.from(byId.values());
}

function applyRemoteState(remote) {
  if (!remote || typeof remote !== "object") return;

  state.requests = mergeRequestsPreferLatest(state.requests, remote.requests);
  state.customNotifications = Array.isArray(remote.customNotifications)
    ? remote.customNotifications
    : state.customNotifications;
  state.activityTimeline = Array.isArray(remote.activityTimeline)
    ? remote.activityTimeline
    : state.activityTimeline;
  state.loginLogs = Array.isArray(remote.loginLogs) ? remote.loginLogs : state.loginLogs;
  state.dailyMessages = Array.isArray(remote.dailyMessages) && remote.dailyMessages.length
    ? remote.dailyMessages
    : state.dailyMessages;
  state.partnerPresence = remote.partnerPresence && typeof remote.partnerPresence === "object"
    ? remote.partnerPresence
    : state.partnerPresence;
  state.servicePause = remote.servicePause && typeof remote.servicePause === "object"
    ? {
        active: Boolean(remote.servicePause.active),
        reason: String(remote.servicePause.reason || "").trim(),
        updatedAt: remote.servicePause.updatedAt || null,
      }
    : state.servicePause;

  suppressRemotePush = true;
  saveRequests();
  saveCustomNotifications();
  saveActivityTimeline();
  saveLoginLogs();
  saveDailyMessages();
  savePartnerPresence();
  saveServicePause();
  suppressRemotePush = false;

  renderTrackNotifications();
  renderTrackList();
  if (!isAdminEditorActive()) {
    renderAdminList();
  }
  renderActivityTimeline();
  renderLoginLogs();
  renderDailyLoveMessage();
  renderDailyMessageEditor();
  renderServicePauseUI();
}

function getApiHeaders(extraHeaders = {}, method = "GET") {
  const headers = { ...extraHeaders };
  const normalizedMethod = String(method || "GET").toUpperCase();
  const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod);
  if (needsCsrf && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
}

async function serverLogout() {
  if (!remoteSyncEnabled) return;
  try {
    await fetch(AUTH_LOGOUT_ENDPOINT, {
      method: "POST",
      headers: getApiHeaders({}, "POST"),
      credentials: REMOTE_FETCH_CREDENTIALS,
    });
  } catch {
    // logout isteği başarısız olsa da yerel oturumu kapat
  }
}

async function syncSessionsFromServer() {
  if (!remoteSyncEnabled) return;
  try {
    const response = await fetch(AUTH_STATUS_ENDPOINT, {
      method: "GET",
      credentials: REMOTE_FETCH_CREDENTIALS,
    });
    const payload = await response.json().catch(() => ({}));
    const actor = String(payload.actor || "");
    csrfToken = String(payload.csrfToken || "");

    setSiteSession(Boolean(payload.siteAuthenticated));
    if (payload.siteAuthenticated && actor) {
      sessionStorage.setItem(SITE_LOGIN_ACTOR_KEY, actor);
    }

    setAdminSession(Boolean(payload.adminAuthenticated));

    if (payload.siteAuthenticated || payload.adminAuthenticated) {
      await pullRemoteState();
      renderServicePauseUI();
    }
  } catch {
    csrfToken = "";
    setSiteSession(false);
    setAdminSession(false);
  }
}

let remotePushTimer = null;
let suppressRemotePush = false;
let hasPendingRemoteChanges = false;
let hasHydratedRemoteState = false;
let remoteHydrationPromise = null;

function notifyRemoteUnavailable(reason = "") {
  if (hasWarnedRemoteUnavailable) return;
  hasWarnedRemoteUnavailable = true;
  if (!siteLoginInfo) return;

  if (reason === "static-host") {
    siteLoginInfo.textContent =
      "Bu site şu anda GitHub Pages gibi statik bir ortamda açılmış. Farklı cihaz senkronu için siteyi Render/Turhost Node sunucusunda açmalısın.";
    return;
  }

  if (SYNC_MODE === "auto") {
    if (!siteLoginInfo.textContent) {
      siteLoginInfo.textContent = "Sunucu senkronu bulunamadı, yerel modda devam ediliyor.";
    }
    return;
  }

  if (SYNC_MODE === "remote") {
    siteLoginInfo.textContent =
      "Sunucu bağlantısı yok. Farklı cihaz senkronu için Render servisinin açık olduğundan ve domainin Render'a yönlendiğinden emin ol.";
  }
}

function queueRemotePush() {
  if (suppressRemotePush || !remoteSyncEnabled || !hasHydratedRemoteState) return;
  hasPendingRemoteChanges = true;
  if (remotePushTimer) clearTimeout(remotePushTimer);
  remotePushTimer = setTimeout(pushRemoteState, 250);
}

let presencePushTimer = null;

function queuePresencePush() {
  if (!remoteSyncEnabled || !state.partnerPresence) return;
  if (presencePushTimer) clearTimeout(presencePushTimer);
  presencePushTimer = setTimeout(pushPresenceState, 120);
}

async function pushPresenceState() {
  if (!remoteSyncEnabled || !state.partnerPresence || !hasHydratedRemoteState) return;

  try {
    await fetch(PRESENCE_ENDPOINT, {
      method: "PUT",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "PUT"),
      credentials: REMOTE_FETCH_CREDENTIALS,
      body: JSON.stringify({ partnerPresence: state.partnerPresence }),
    });
  } catch {
    // presence gönderimi başarısızsa UI yerel çalışmaya devam eder.
  }
}

async function syncBeforeMutation() {
  if (!remoteSyncEnabled) return;
  if (!hasHydratedRemoteState) {
    await ensureRemoteHydrated();
  }
  await pullRemoteState();
}

async function pushRemoteState(options = {}) {
  const { force = false, deletedRequestIds = [] } = options;

  if (!remoteSyncEnabled) return;
  if (!hasHydratedRemoteState && !force) return;

  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, {
      method: "PUT",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "PUT"),
      body: JSON.stringify(getSerializableState({ deletedRequestIds })),
      credentials: REMOTE_FETCH_CREDENTIALS,
    });

    if (!response.ok) {
      if (SYNC_MODE === "auto") {
        remoteSyncEnabled = false;
        notifyRemoteUnavailable();
      }
      return;
    }

    hasPendingRemoteChanges = false;
  } catch {
    if (SYNC_MODE === "auto") {
      remoteSyncEnabled = false;
      notifyRemoteUnavailable();
    }
    // Remote API unavailable: continue with local state.
  }
}

async function pullRemoteState() {
  if (!remoteSyncEnabled) return;
  if (hasPendingRemoteChanges) return;

  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, {
      cache: "no-store",
      credentials: REMOTE_FETCH_CREDENTIALS,
    });

    if (!response.ok) {
      if (SYNC_MODE === "auto") {
        remoteSyncEnabled = false;
        notifyRemoteUnavailable();
      }
      return;
    }

    const remote = await response.json();
    applyRemoteState(remote);
    hasHydratedRemoteState = true;
  } catch {
    if (SYNC_MODE === "auto") {
      remoteSyncEnabled = false;
      notifyRemoteUnavailable();
    }
    // Remote API unavailable: continue with local state.
  }
}

async function ensureRemoteHydrated() {
  if (!remoteSyncEnabled || hasHydratedRemoteState) return;
  if (remoteHydrationPromise) {
    await remoteHydrationPromise;
    return;
  }

  remoteHydrationPromise = pullRemoteState();

  try {
    await remoteHydrationPromise;
  } finally {
    remoteHydrationPromise = null;
  }
}

let ownsPartnerPresenceSession = sessionStorage.getItem(SITE_LOGIN_ACTOR_KEY) === "Sevgilin";

function setPartnerPresence(online) {
  state.partnerPresence = {
    partnerOnline: online,
    updatedAt: new Date().toISOString(),
  };

  savePartnerPresence();
  if (remoteSyncEnabled) {
    queuePresencePush();
  }
}

function updatePresenceHeartbeat() {
  const isSiteUnlocked = sessionStorage.getItem(SITE_SESSION_KEY) === "1";
  const loginActor = sessionStorage.getItem(SITE_LOGIN_ACTOR_KEY);
  const isPartnerSession = loginActor === "Sevgilin";

  if (isSiteUnlocked && isPartnerSession) {
    ownsPartnerPresenceSession = true;
    setPartnerPresence(true);
    return;
  }

  if (ownsPartnerPresenceSession) {
    setPartnerPresence(false);
    ownsPartnerPresenceSession = false;
  }
}

function renderPresenceBadge() {
  if (!partnerPresence) return;

  const source = state.partnerPresence || loadPartnerPresence();
  if (!source) {
    partnerPresence.textContent = "Sevgilin çevrimdışı";
    partnerPresence.className = "presence-badge offline";
    return;
  }

  try {
    const updated = source.updatedAt ? new Date(source.updatedAt).getTime() : 0;
    const isOnline = Boolean(source.partnerOnline) && Date.now() - updated < 15000;

    partnerPresence.textContent = isOnline ? "Sevgilin çevrimiçi" : "Sevgilin çevrimdışı";
    partnerPresence.className = `presence-badge ${isOnline ? "online" : "offline"}`;
  } catch {
    partnerPresence.textContent = "Sevgilin çevrimdışı";
    partnerPresence.className = "presence-badge offline";
  }
}

function loadPartnerPresence() {
  const raw = localStorage.getItem(PRESENCE_KEY);
  if (!raw) return { partnerOnline: false, updatedAt: null };

  try {
    return JSON.parse(raw);
  } catch {
    return { partnerOnline: false, updatedAt: null };
  }
}

function savePartnerPresence() {
  localStorage.setItem(PRESENCE_KEY, JSON.stringify(state.partnerPresence));
}

function loadServicePause() {
  const raw = localStorage.getItem(SERVICE_PAUSE_KEY);
  if (!raw) return { active: false, reason: "", updatedAt: null };

  try {
    const parsed = JSON.parse(raw);
    return {
      active: Boolean(parsed.active),
      reason: String(parsed.reason || "").trim(),
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { active: false, reason: "", updatedAt: null };
  }
}

function saveServicePause() {
  localStorage.setItem(SERVICE_PAUSE_KEY, JSON.stringify(state.servicePause));
  queueRemotePush();
}

function getServicePauseMessage() {
  const customReason = String(state.servicePause?.reason || "").trim();
  if (customReason) return customReason;
  return DEFAULT_SERVICE_PAUSE_MESSAGE;
}

function renderServicePauseEditor() {
  if (!servicePauseMessageInput) return;

  const customReason = String(state.servicePause?.reason || "").trim();
  servicePauseMessageInput.value = customReason || DEFAULT_SERVICE_PAUSE_MESSAGE;
}

function ensureStormRain() {
  if (!stormRain || stormRainInitialized) return;
  const dropCount = 100;

  for (let i = 0; i < dropCount; i += 1) {
    const drop = document.createElement("span");
    drop.className = "rain-drop";
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.animationDelay = `${Math.random() * 1.8}s`;
    drop.style.animationDuration = `${0.55 + Math.random() * 0.8}s`;
    stormRain.appendChild(drop);
  }

  stormRainInitialized = true;
}

function startStormFlash() {
  if (!stormFlash || stormFlashTimer) return;

  const loop = () => {
    if (!document.body.classList.contains("is-storm-mode")) {
      stormFlash.classList.remove("active");
      stormFlashTimer = null;
      return;
    }

    const wait = 1600 + Math.random() * 3200;
    stormFlashTimer = setTimeout(() => {
      stormFlash.classList.add("active");
      setTimeout(() => stormFlash.classList.remove("active"), 140);
      loop();
    }, wait);
  };

  loop();
}

function stopStormFlash() {
  if (stormFlashTimer) {
    clearTimeout(stormFlashTimer);
    stormFlashTimer = null;
  }

  if (stormFlash) {
    stormFlash.classList.remove("active");
  }
}

function renderServicePauseUI() {
  if (!servicePauseBanner || !requestForm) return;

  const isPaused = Boolean(state.servicePause?.active);
  const loginActor = sessionStorage.getItem(SITE_LOGIN_ACTOR_KEY);
  const isPartnerView = loginActor === "Sevgilin";
  const enableStormMode = isPaused && isPartnerView;

  requestForm.classList.toggle("hidden", isPaused);
  servicePauseBanner.classList.toggle("hidden", !isPaused);

  document.body.classList.toggle("is-storm-mode", enableStormMode);
  if (stormScene) {
    stormScene.classList.toggle("hidden", !enableStormMode);
  }

  if (enableStormMode) {
    ensureStormRain();
    startStormFlash();
    activateTab("create");
  } else {
    stopStormFlash();
  }

  if (servicePauseMessage) {
    servicePauseMessage.textContent = getServicePauseMessage();
  }

  if (toggleServicePauseBtn) {
    toggleServicePauseBtn.textContent = isPaused ? "Sinirli Modu Kapat" : "Sinirli Modu Aç";
  }

  if (servicePauseAdminInfo) {
    servicePauseAdminInfo.textContent = isPaused
      ? "Sinirli mod aktif: Partner ekranı kısıtlı erişim ekranına geçti."
      : "Sinirli mod kapalı: Partner normal şekilde talep oluşturabilir.";
  }

  renderServicePauseEditor();
}

function playLoveBurst() {
  if (!loveBurstLayer) return;

  const burstCount = 18;
  for (let i = 0; i < burstCount; i += 1) {
    const heart = document.createElement("span");
    heart.className = "love-heart";
    heart.textContent = i % 3 === 0 ? "💖" : i % 3 === 1 ? "💗" : "💘";

    const x = 20 + Math.random() * 60;
    const y = 70 + Math.random() * 12;
    heart.style.left = `${x}%`;
    heart.style.top = `${y}%`;
    heart.style.animationDelay = `${Math.random() * 180}ms`;

    loveBurstLayer.appendChild(heart);
    setTimeout(() => heart.remove(), 1600);
  }
}

function loadRequests() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      ...item,
      partnerNotified: item.partnerNotified ?? true,
    }));
  } catch {
    return [];
  }
}

function loadCustomNotifications() {
  const raw = localStorage.getItem(CUSTOM_NOTIFICATIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      ...item,
      read: item.read ?? false,
    }));
  } catch {
    return [];
  }
}

function saveRequests() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.requests));
  queueRemotePush();
}

function saveCustomNotifications() {
  localStorage.setItem(CUSTOM_NOTIFICATIONS_KEY, JSON.stringify(state.customNotifications));
  queueRemotePush();
}

function formatDate(isoDate) {
  if (!isoDate) return "Belirtilmedi";
  return new Date(isoDate).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function setSiteSession(isActive) {
  sessionStorage.setItem(SITE_SESSION_KEY, isActive ? "1" : "0");

  if (!isActive) {
    sessionStorage.removeItem(SITE_LOGIN_ACTOR_KEY);
  }

  body.classList.toggle("is-locked", !isActive);
  body.classList.toggle("is-unlocked", isActive);
  appShell.setAttribute("aria-hidden", String(!isActive));
  updatePresenceHeartbeat();
  renderPresenceBadge();
  renderServicePauseUI();
}

function activateTab(tabId) {
  tabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

tabs.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

window.addEventListener("storage", () => {
  state.partnerPresence = loadPartnerPresence();
  renderPresenceBadge();
  state.activityTimeline = loadActivityTimeline();
  state.loginLogs = loadLoginLogs();
  state.dailyMessages = loadDailyMessages();
  renderActivityTimeline();
  renderLoginLogs();
  renderDailyLoveMessage();
  renderDailyMessageEditor();
});

siteLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const enteredUsername = String(siteLoginForm.elements.siteUsername.value || "").trim();
  const enteredPassword = String(siteLoginForm.elements.sitePassword.value || "").trim();

  try {
    const response = await fetch(AUTH_SITE_LOGIN_ENDPOINT, {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "POST"),
      credentials: REMOTE_FETCH_CREDENTIALS,
      body: JSON.stringify({ username: enteredUsername, password: enteredPassword }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.actor) {
      const retryAfterSec = Number(payload.retryAfterSec || 0);
      siteLoginInfo.textContent = retryAfterSec > 0
        ? `Çok fazla hatalı deneme. ${retryAfterSec} saniye sonra tekrar dene.`
        : "Kullanıcı adı veya şifre yanlış. Lütfen tekrar deneyin.";
      return;
    }

    csrfToken = String(payload.csrfToken || csrfToken);
    const actor = String(payload.actor);
    if (actor === "Kalp Sorumlusu") {
      localStorage.setItem(OWNER_DEVICE_KEY, "1");
    }

    sessionStorage.setItem(SITE_LOGIN_ACTOR_KEY, actor);
    setSiteSession(true);

    if (actor === "Sevgilin") {
      ownsPartnerPresenceSession = true;
      addActivity("partner", "Sevgilin siteye giriş yaptı.");
    } else {
      addActivity("admin", "Kalp Sorumlusu site girişini yaptı.");
    }

    await pullRemoteState();
    renderServicePauseUI();

    addLoginLog(actor, "siteye giriş yaptı.");
    siteLoginInfo.textContent = "";
    siteLoginForm.reset();
  } catch {
    siteLoginInfo.textContent = "Giriş sırasında bir ağ hatası oluştu. Lütfen tekrar deneyin.";
  }
});

siteLogoutBtn.addEventListener("click", async () => {
  const actor = sessionStorage.getItem(SITE_LOGIN_ACTOR_KEY) || "Site Kullanıcısı";

  if (actor === "Sevgilin") {
    ownsPartnerPresenceSession = true;
  }

  await serverLogout();
  csrfToken = "";
  setAdminSession(false);
  setSiteSession(false);

  if (actor === "Sevgilin") {
    addActivity("partner", "Site kilitlendi / kullanıcı çıkış yaptı.");
  } else {
    addActivity("admin", "Kalp Sorumlusu siteyi kilitledi.");
  }

  addLoginLog(actor, "site çıkışı yaptı / site kilitlendi.");
  sessionStorage.removeItem(SITE_LOGIN_ACTOR_KEY);
  siteLoginForm.reset();
  activateTab("create");
});

function getUnreadRequestNotifications() {
  return state.requests
    .filter((item) => !item.partnerNotified && item.updatedAt !== item.createdAt)
    .map((item) => ({
      type: "request",
      id: item.id,
      updatedAt: item.updatedAt,
      text: `💖 Bir tanem, "${item.title}" talebin cevaplandı. Talep Takip kısmından detayını görebilirsin.`,
    }));
}

function getUnreadCustomNotifications() {
  return state.customNotifications
    .filter((item) => !item.read)
    .map((item) => ({
      type: "custom",
      id: item.id,
      updatedAt: item.createdAt,
      text: `💘 ${item.title}: ${item.message}`,
    }));
}

function getUnreadNotifications() {
  return [...getUnreadRequestNotifications(), ...getUnreadCustomNotifications()];
}

function updateNotificationBell() {
  const unreadCount = getUnreadNotifications().length;
  notificationCount.textContent = String(unreadCount);
  notificationCount.classList.toggle("hidden", unreadCount === 0);
}

notificationBell.addEventListener("click", () => {
  const unreadCount = getUnreadNotifications().length;

  if (unreadCount === 0) {
    bellInfo.textContent = "Şu an yeni bildirim yok 💗";
    return;
  }

  bellInfo.textContent = `${unreadCount} yeni bildirim var 💖`;
  activateTab("track");
  trackNotifications.scrollIntoView({ behavior: "smooth", block: "start" });
});

function createTrackNotification(item) {
  const template = document.getElementById("trackNotificationTemplate");
  const node = template.content.firstElementChild.cloneNode(true);

  node.querySelector('[data-field="notifyText"]').textContent = item.text;

  node.querySelector('[data-role="seenBtn"]').addEventListener("click", () => {
    if (item.type === "request") {
      const target = state.requests.find((req) => req.id === item.id);
      if (!target) return;

      target.partnerNotified = true;
      saveRequests();
    } else {
      const target = state.customNotifications.find((notif) => notif.id === item.id);
      if (!target) return;

      target.read = true;
      saveCustomNotifications();
    }

    bellInfo.textContent = "Bildirim okundu 💞";
    addActivity("partner", "Sevgilin bir bildirimi okudu.");
    renderTrackNotifications();
  });

  return node;
}

function renderTrackNotifications() {
  trackNotifications.innerHTML = "";

  const notifications = getUnreadNotifications().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  updateNotificationBell();

  if (!notifications.length) {
    return;
  }

  notifications.forEach((item) => trackNotifications.appendChild(createTrackNotification(item)));
}

function createTrackCard(item) {
  const template = document.getElementById("trackItemTemplate");
  const node = template.content.firstElementChild.cloneNode(true);

  node.querySelector('[data-field="title"]').textContent = item.title;

  const badge = node.querySelector('[data-field="status"]');
  badge.textContent = item.status;
  badge.dataset.status = item.status;

  node.querySelector('[data-field="meta"]').textContent = `${item.category} • ${item.priority} • Hedef: ${formatDate(
    item.targetDate
  )}`;

  node.querySelector('[data-field="detail"]').textContent = item.detail;
  node.querySelector('[data-field="result"]').textContent =
    item.result || "Henüz sonuç notu eklenmedi. Değerlendirme sonrası burada gözükecek.";

  return node;
}

function renderTrackList() {
  trackList.innerHTML = "";

  if (!state.requests.length) {
    trackList.innerHTML = '<p class="muted">Henüz talep yok. İlk isteğini bırakabilirsin 💖</p>';
    renderLoveCalendar();
    return;
  }

  const ordered = [...state.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  ordered.forEach((item) => trackList.appendChild(createTrackCard(item)));
  renderLoveCalendar();
}

function buildNotificationText(item, status, result) {
  return `💌 Kalp Postası Güncellemesi\nTalep: ${item.title}\nDurum: ${status}\nNot: ${result || "Not eklenmedi"}`;
}

async function renderMailSetupStatus() {
  if (!mailStatusBadge || !mailStatusHint) return;

  if (!PARTNER_EMAIL) {
    mailStatusBadge.textContent = "Hazır Değil";
    mailStatusBadge.classList.add("offline");
    mailStatusBadge.classList.remove("online");
    mailStatusHint.textContent = "1) config.js içinde partnerEmail alanını doldur.";
    return;
  }

  try {
    const response = await fetch(`${NOTIFY_ENDPOINT}/status`, {
      cache: "no-store",
      credentials: REMOTE_FETCH_CREDENTIALS,
    });

    if (!response.ok) throw new Error("status endpoint unavailable");

    const payload = await response.json();

    if (payload.ready) {
      mailStatusBadge.textContent = "Hazır";
      mailStatusBadge.classList.remove("offline");
      mailStatusBadge.classList.add("online");
      mailStatusHint.textContent = `Alıcı: ${PARTNER_EMAIL}`;
      return;
    }

    mailStatusBadge.textContent = "Hazır Değil";
    mailStatusBadge.classList.add("offline");
    mailStatusBadge.classList.remove("online");
    const missing = Array.isArray(payload.missing) ? payload.missing.join(", ") : "Render env ayarları";
    mailStatusHint.textContent = `2) Render Environment'a şunları ekle: ${missing}`;
  } catch {
    mailStatusBadge.textContent = "Kontrol Edilemedi";
    mailStatusBadge.classList.add("offline");
    mailStatusBadge.classList.remove("online");
    mailStatusHint.textContent = "Render backend erişimi yok. Önce sunucu bağlantısını kontrol et.";
  }
}

function buildEmailBody(item, status, result) {
  return [
    "Merhaba bir tanem 💖",
    "",
    `Talebin güncellendi: ${item.title}`,
    `Yeni durum: ${status}`,
    `Sonuç notu: ${result || "Not eklenmedi"}`,
    "",
    "Detayları Talep Takip ekranından görebilirsin.",
  ].join("\n");
}

async function sendEmailNotification(item, status, result) {
  if (!PARTNER_EMAIL) {
    return { ok: false, message: "Önce config.js içinde partnerEmail alanını doldur." };
  }

  try {
    const response = await fetch(NOTIFY_ENDPOINT, {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "POST"),
      credentials: REMOTE_FETCH_CREDENTIALS,
      body: JSON.stringify({
        channel: "email",
        to: PARTNER_EMAIL,
        subject: `Talebin cevaplandı: ${item.title}`,
        text: buildEmailBody(item, status, result),
      }),
    });

    if (response.ok) {
      return { ok: true, message: "Mail gönderildi 💌" };
    }
    const errorPayload = await response.json().catch(() => ({}));
    return {
      ok: false,
      message:
        errorPayload.hint ||
        errorPayload.details ||
        "Otomatik mail gönderilemedi. Render ortam değişkenlerini kontrol et (EMAIL_PROVIDER/RESEND_API_KEY/EMAIL_FROM).",
    };
  } catch {
    return {
      ok: false,
      message: "Sunucuya bağlanılamadı. Otomatik gönderim için Render servisinin ayakta olduğundan emin ol.",
    };
  }
}


async function sendManualEmail(subject, text) {
  if (!PARTNER_EMAIL) {
    return { ok: false, message: "Önce config.js içinde partnerEmail alanını doldur." };
  }

  try {
    const response = await fetch(NOTIFY_ENDPOINT, {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "POST"),
      credentials: REMOTE_FETCH_CREDENTIALS,
      body: JSON.stringify({
        channel: "email",
        to: PARTNER_EMAIL,
        subject,
        text,
      }),
    });

    if (response.ok) {
      return { ok: true, message: "Mail gönderildi 💌" };
    }

    const errorPayload = await response.json().catch(() => ({}));
    return {
      ok: false,
      message:
        errorPayload.hint ||
        errorPayload.details ||
        "Mail gönderilemedi. Render ortam değişkenlerini kontrol et (EMAIL_PROVIDER/RESEND_API_KEY/EMAIL_FROM).",
    };
  } catch {
    return {
      ok: false,
      message: "Sunucuya bağlanılamadı. Render servisinin ayakta olduğundan emin ol.",
    };
  }
}

function buildOwnerTelegramText(request) {
  return [
    "📩 Yeni Talep Oluşturuldu",
    `Başlık: ${request.title}`,
    `Kategori: ${request.category}`,
    `Öncelik: ${request.priority}`,
    `Tarih: ${request.targetDate || "Belirtilmedi"}`,
    "",
    `Detay: ${request.detail || "Detay yok"}`,
  ].join("\n");
}

async function notifyOwnerOnNewRequest(request) {
  try {
    const response = await fetch(NOTIFY_ENDPOINT, {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "POST"),
      credentials: REMOTE_FETCH_CREDENTIALS,
      body: JSON.stringify({
        channel: "telegram",
        text: buildOwnerTelegramText(request),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      console.warn("Telegram bildirimi gönderilemedi:", payload.error || response.status);
      return { ok: false, message: payload.hint || payload.error || "Telegram bildirimi başarısız." };
    }

    return { ok: true, message: "Telegram bildirimi gönderildi." };
  } catch (error) {
    console.warn("Telegram bildirimi hatası:", error);
    return { ok: false, message: "Telegram servisine bağlanılamadı." };
  }
}

function createAdminCard(item) {
  const template = document.getElementById("adminItemTemplate");
  const node = template.content.firstElementChild.cloneNode(true);

  node.querySelector('[data-field="title"]').textContent = item.title;

  const badge = node.querySelector('[data-field="status"]');
  badge.textContent = item.status;
  badge.dataset.status = item.status;

  node.querySelector('[data-field="meta"]').textContent = `#${item.id} • ${item.category} • ${item.priority} • ${formatDate(
    item.targetDate
  )}`;

  node.querySelector('[data-field="detail"]').textContent = item.detail;

  const form = node.querySelector('[data-role="updateForm"]');
  const notifyBtn = node.querySelector('[data-role="notifyBtn"]');
  const mailBtn = node.querySelector('[data-role="mailBtn"]');
  const deleteBtn = node.querySelector('[data-role="deleteBtn"]');
  const notifyInfo = node.querySelector('[data-role="notifyInfo"]');

  const draft = adminDrafts.get(String(item.id));
  form.elements.status.value = draft?.status ?? item.status;
  form.elements.result.value = draft?.result ?? item.result;

  const persistDraft = () => {
    adminDrafts.set(String(item.id), {
      status: form.elements.status.value,
      result: form.elements.result.value,
    });
  };

  form.elements.status.addEventListener("change", persistDraft);
  form.elements.result.addEventListener("input", persistDraft);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Not: kullanıcı formu submit ettiğinde önce form değerlerini alıyoruz.
    // Aksi halde syncBeforeMutation sırasında gelen remote render, formu eski
    // değerle yeniden çizip kullanıcının girdiğini geri alabiliyor.
    const status = form.elements.status.value;
    const result = form.elements.result.value.trim();

    await syncBeforeMutation();

    const target = state.requests.find((req) => req.id === item.id);
    if (!target) return;

    target.status = status;
    target.result = result;
    target.updatedAt = new Date().toISOString();
    target.partnerNotified = false;
    target._rev = Number(target._rev || 0) + 1;

    saveRequests();
    await pushRemoteState({ force: true });
    adminDrafts.delete(String(item.id));
    addActivity("admin", `Talep güncellendi: ${item.title} → ${status}`);

    if (status === "Kabul Edildi" || status === "Tamamlandı") {
      playCelebrationBurst("big");
    }

    renderTrackNotifications();
    renderTrackList();
    renderAdminList();
  });

  notifyBtn.addEventListener("click", async () => {
    const status = form.elements.status.value;
    const result = form.elements.result.value.trim();
    const text = buildNotificationText(item, status, result);

    try {
      await navigator.clipboard.writeText(text);
      notifyInfo.textContent = "Bildirim metni panoya kopyalandı. WhatsApp/Telegram'dan paylaşabilirsin.";
    } catch {
      notifyInfo.textContent = "Panoya kopyalama başarısız. Elle kopyalayarak gönderebilirsin.";
    }
  });

  mailBtn.addEventListener("click", async () => {
    mailBtn.disabled = true;
    const status = form.elements.status.value;
    const result = form.elements.result.value.trim();

    const sendResult = await sendEmailNotification(item, status, result);
    notifyInfo.textContent = sendResult.message;

    addActivity("admin", `Mail bildirimi denendi: ${item.title}`);
    mailBtn.disabled = false;
  });

  deleteBtn.addEventListener("click", async () => {
    const confirmed = confirm(`"${item.title}" talebini kalıcı olarak silmek istiyor musun?`);
    if (!confirmed) return;

    await syncBeforeMutation();

    state.requests = state.requests.filter((req) => req.id !== item.id);
    saveRequests();
    await pushRemoteState({ deletedRequestIds: [item.id] });
    adminDrafts.delete(String(item.id));
    addActivity("admin", `Talep silindi: ${item.title}`);

    renderTrackNotifications();
    renderTrackList();
    renderAdminList();
  });

  return node;
}

function renderAdminList() {
  adminList.innerHTML = "";

  if (!state.requests.length) {
    adminList.innerHTML = '<p class="muted">Yönetilecek talep bulunamadı.</p>';
    return;
  }

  const ordered = [...state.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  ordered.forEach((item) => adminList.appendChild(createAdminCard(item)));
}

sendNotificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await syncBeforeMutation();

  const formData = new FormData(sendNotificationForm);
  const title = formData.get("notifyTitle").toString().trim();
  const message = formData.get("notifyMessage").toString().trim();

  const customNotification = {
    id: `n-${Date.now().toString(36)}`,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  };

  state.customNotifications.push(customNotification);
  saveCustomNotifications();
  await pushRemoteState();
  renderTrackNotifications();

  sendNotificationForm.reset();
  sendNotificationInfo.textContent = "Bildirim gönderildi. Kalp simgesine düştü 💖";
  bellInfo.textContent = "Yeni bir bildirim geldi 💘";
  addActivity("admin", `Özel bildirim gönderildi: ${title}`);
  playCelebrationBurst("soft");
});
if (sendManualEmailForm) {
  sendManualEmailForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(sendManualEmailForm);
    const subject = String(formData.get("mailSubject") || "").trim();
    const text = String(formData.get("mailBody") || "").trim();

    if (!subject || !text) {
      sendManualEmailInfo.textContent = "Başlık ve konu alanı zorunlu.";
      return;
    }

    const result = await sendManualEmail(subject, text);
    sendManualEmailInfo.textContent = result.message;

    if (result.ok) {
      sendManualEmailForm.reset();
      addActivity("admin", `Manuel mail gönderildi: ${subject}`);
      playCelebrationBurst("soft");
    }
  });
}


function createRequestId() {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `r-${timePart}-${randomPart}`;
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(requestForm);
  const request = {
    id: createRequestId(),
    title: formData.get("title").toString().trim(),
    category: formData.get("category").toString(),
    priority: formData.get("priority").toString(),
    detail: formData.get("detail").toString().trim(),
    targetDate: formData.get("targetDate").toString(),
    status: "Beklemede",
    result: "Talebin sevgiyle alındı. En kısa sürede değerlendirilecek 💞",
    partnerNotified: true,
    _rev: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.requests.push(request);
  saveRequests();
  await pushRemoteState({ force: true });

  requestForm.reset();
  formInfo.textContent = "Talebin başarıyla gönderildi! Talep Takip sekmesinden durumu izleyebilirsin.";

  addActivity("partner", `Yeni talep oluşturuldu: ${request.title}`);
  const ownerNotifyResult = await notifyOwnerOnNewRequest(request);
  if (!ownerNotifyResult.ok) {
    bellInfo.textContent = `Yeni talep alındı ancak yönetici bildirimi gönderilemedi (${ownerNotifyResult.message})`;
  }

  renderTrackNotifications();
  renderTrackList();
  renderAdminList();
  playLoveBurst();
  playCelebrationBurst("soft");
  activateTab("track");
});

function setAdminSession(isActive) {
  localStorage.setItem(ADMIN_SESSION_KEY, isActive ? "1" : "0");
  adminGate.classList.toggle("hidden", isActive);
  adminContent.classList.toggle("hidden", !isActive);
  updatePresenceHeartbeat();

  if (isActive) {
    renderMailSetupStatus();
    renderAdminList();
    renderPresenceBadge();
    renderActivityTimeline();
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entered = String(adminLoginForm.elements.password.value || "").trim();

  try {
    const response = await fetch(AUTH_ADMIN_LOGIN_ENDPOINT, {
      method: "POST",
      headers: getApiHeaders({ "Content-Type": "application/json" }, "POST"),
      credentials: REMOTE_FETCH_CREDENTIALS,
      body: JSON.stringify({ password: entered }),
    });

    const payload = await response.json().catch(() => ({}));
    csrfToken = String(payload.csrfToken || csrfToken);
    if (!response.ok || !payload.ok) {
      const retryAfterSec = Number(payload.retryAfterSec || 0);
      loginInfo.textContent = retryAfterSec > 0
        ? `Çok fazla hatalı deneme. ${retryAfterSec} saniye sonra tekrar dene.`
        : "Şifre yanlış. Bu alan sadece Kalp Sorumlusu kullanımına açık.";
      return;
    }

    localStorage.setItem(OWNER_DEVICE_KEY, "1");
    setAdminSession(true);
    addActivity("admin", "Kalp Sorumlusu panele giriş yaptı.");
    addLoginLog("Kalp Sorumlusu", "panele giriş yaptı.");
    loginInfo.textContent = "";
    adminLoginForm.reset();
  } catch {
    loginInfo.textContent = "Panel girişinde ağ hatası oluştu. Lütfen tekrar dene.";
  }
});

logoutBtn.addEventListener("click", async () => {
  await serverLogout();
  csrfToken = "";
  setAdminSession(false);
  addActivity("admin", "Kalp Sorumlusu panelden çıkış yaptı.");
  addLoginLog("Kalp Sorumlusu", "panelden çıkış yaptı.");
  loginInfo.textContent = "Kalp Sorumlusu oturumu kapatıldı.";
});

if (dailyMessageForm) {
  dailyMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const lines = dailyMessageInput.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      dailyMessageInfo.textContent = "En az bir mesaj girmelisin.";
      return;
    }

    state.dailyMessages = lines;
    saveDailyMessages();
    renderDailyLoveMessage();
    renderDailyMessageEditor();
    dailyMessageInfo.textContent = "Günün mesajı listesi güncellendi 💖";
    addActivity("admin", "Günün mesajları güncellendi.");
  });
}

if (dailyMessageResetBtn) {
  dailyMessageResetBtn.addEventListener("click", () => {
    state.dailyMessages = [...DEFAULT_DAILY_LOVE_MESSAGES];
    localStorage.removeItem(DAILY_MESSAGES_KEY);
    renderDailyLoveMessage();
    renderDailyMessageEditor();
    dailyMessageInfo.textContent = "Varsayılan romantik sözlere dönüldü.";
    addActivity("admin", "Günün mesajları varsayılana döndürüldü.");
  });
}

if (toggleServicePauseBtn) {
  toggleServicePauseBtn.addEventListener("click", async () => {
    const nextActive = !Boolean(state.servicePause?.active);

    await syncBeforeMutation();

    state.servicePause = {
      active: nextActive,
      reason: String(state.servicePause?.reason || "").trim(),
      updatedAt: new Date().toISOString(),
    };

    saveServicePause();
    await pushRemoteState();
    renderServicePauseUI();

    addActivity(
      "admin",
      nextActive
        ? "Sinirli mod aktif edildi: talep oluşturma geçici olarak kapatıldı."
        : "Sinirli mod kapatıldı: talep oluşturma yeniden açıldı."
    );
  });
}

if (servicePauseMessageForm) {
  servicePauseMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await syncBeforeMutation();

    const nextMessage = String(servicePauseMessageInput?.value || "").trim();
    if (!nextMessage) {
      if (servicePauseMessageInfo) {
        servicePauseMessageInfo.textContent = "Mesaj boş olamaz. Varsayılan için sıfırla butonunu kullan.";
      }
      return;
    }

    state.servicePause = {
      ...(state.servicePause || {}),
      reason: nextMessage === DEFAULT_SERVICE_PAUSE_MESSAGE ? "" : nextMessage,
      updatedAt: new Date().toISOString(),
      active: Boolean(state.servicePause?.active),
    };

    saveServicePause();
    await pushRemoteState();
    renderServicePauseUI();

    if (servicePauseMessageInfo) {
      servicePauseMessageInfo.textContent = "Sinirli mod mesajı güncellendi.";
    }
    addActivity("admin", "Sinirli mod mesajı güncellendi.");
  });
}

if (servicePauseMessageResetBtn) {
  servicePauseMessageResetBtn.addEventListener("click", async () => {
    await syncBeforeMutation();

    state.servicePause = {
      ...(state.servicePause || {}),
      reason: "",
      updatedAt: new Date().toISOString(),
      active: Boolean(state.servicePause?.active),
    };

    saveServicePause();
    await pushRemoteState();
    renderServicePauseUI();

    if (servicePauseMessageInfo) {
      servicePauseMessageInfo.textContent = "Sinirli mod mesajı varsayılan metne döndürüldü.";
    }
    addActivity("admin", "Sinirli mod mesajı varsayılan metne döndürüldü.");
  });
}

renderDailyLoveMessage();
renderDailyMessageEditor();
renderServicePauseUI();
renderTrackNotifications();
renderTrackList();
renderActivityTimeline();
renderLoginLogs();
renderMailSetupStatus();
setAdminSession(false);
setSiteSession(false);
renderPresenceBadge();
if (remoteSyncEnabled) {
  if (RUNNING_ON_STATIC_ONLY_HOST && REMOTE_STATE_IS_SAME_ORIGIN) {
    remoteSyncEnabled = false;
    notifyRemoteUnavailable("static-host");
  } else {
    pullRemoteState();
    setInterval(pullRemoteState, 2000);

    window.addEventListener("focus", () => {
      pullRemoteState();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        pullRemoteState();
      }
    });
  }
}

syncSessionsFromServer();

setInterval(updatePresenceHeartbeat, 5000);
setInterval(renderPresenceBadge, 5000);
