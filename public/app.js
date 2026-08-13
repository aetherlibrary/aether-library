// Aether Library frontend. Talks only to the local backend API over relative
// paths (Electron/Tauri-friendly). No API keys ever reach the browser; the
// settings form is write-only.

// The book on the council table (session entry point) — a static button in
// index.html, the keyboard-focus surface and the fixed CLICK REGION (not a
// pointer-hit target — see the pointer-events:none rule in style.css and the
// delegated click listener below, both added to fix a real bug: this button
// used to sit pointer-events:auto at the SAME z-index as every Scene Object,
// tied and DOM-order-winning against core_book_01's own <img>, which silently
// ate that Prop's `:hover` (Player Interaction) any time the book was placed
// at/near this fixed spot — collision was never involved). One named constant
// so every lookup of this literal id agrees.
const BOOK_HOTSPOT_ELEMENT_ID = "book-hotspot";

const els = {
  question: document.getElementById("question"),
  composer: document.getElementById("composer"),
  attachmentList: document.getElementById("attachment-list"),
  attachBtn: document.getElementById("attach-btn"),
  attachInput: document.getElementById("attach-input"),
  run: document.getElementById("run-council"),
  librarianStatus: document.getElementById("librarian-status"),
  libraryActivity: {
    panel: document.getElementById("library-activity"),
    icon: document.getElementById("library-activity-icon"),
    titleLabel: document.getElementById("library-activity-title-label"),
    body: document.getElementById("library-activity-body"),
  },
  modeToggle: document.getElementById("mode-toggle"),
  useVaultToggle: document.getElementById("use-vault-toggle"),
  useVaultWrap: document.getElementById("use-vault-wrap"),
  scholarPicker: document.getElementById("scholar-picker"),
  sessionLockIcon: document.getElementById("session-lock-icon"),
  header: {
    section: document.getElementById("session-header"),
    question: document.getElementById("sh-question"),
    attachments: document.getElementById("sh-attachments"),
    id: document.getElementById("sh-id"),
    mode: document.getElementById("sh-mode"),
    status: document.getElementById("sh-status"),
    vault: document.getElementById("sh-vault"),
    count: document.getElementById("sh-count"),
    save: document.getElementById("save-vault"),
    reset: document.getElementById("reset-session"),
    msg: document.getElementById("session-msg"),
  },
  conversation: document.getElementById("conversation"),
  tabs: document.getElementById("tabs"),
  tabContent: document.getElementById("tab-content"),
  copyAnswer: document.getElementById("copy-answer"),
  discussionWorkspace: document.getElementById("discussion-workspace"),
  discussionEmpty: document.getElementById("discussion-empty"),
  // The two lines inside the empty state. Both are filled from the locale —
  // index.html ships them EMPTY so no English is baked into the markup.
  discussionWelcome: document.getElementById("discussion-welcome"),
  discussionHint: document.getElementById("discussion-hint"),
  sessionError: {
    section: document.getElementById("session-error"),
    title: document.getElementById("session-error-title"),
    message: document.getElementById("session-error-message"),
  },
  sessionLost: {
    section: document.getElementById("session-lost"),
    title: document.getElementById("session-lost-title"),
    message: document.getElementById("session-lost-message"),
    continueBtn: document.getElementById("session-lost-continue"),
    resetBtn: document.getElementById("session-lost-reset"),
    status: document.getElementById("session-lost-status"),
  },
  councilPrecheckError: {
    section: document.getElementById("council-precheck-error"),
    title: document.getElementById("council-precheck-error-title"),
    list: document.getElementById("council-precheck-error-list"),
    footer: document.getElementById("council-precheck-error-footer"),
    retry: document.getElementById("council-precheck-retry"),
    openSettings: document.getElementById("council-precheck-open-settings"),
  },
  workspaceDivider: document.getElementById("workspace-divider"),
  interactionWorkspace: document.getElementById("interaction-workspace"),
  sessionSummary: {
    section: document.getElementById("session-summary"),
    toggle: document.getElementById("session-summary-toggle"),
    caret: document.getElementById("session-summary-caret"),
    label: document.getElementById("session-summary-label"),
  },
  chat: {
    quickActionsWrap: document.getElementById("quick-actions-wrap"),
    quickActionsToggle: document.getElementById("quick-actions-toggle"),
    quickActionsCaret: document.getElementById("quick-actions-caret"),
    quickActions: document.getElementById("quick-actions"),
    log: document.getElementById("chat-log"),
  },
  obsidianExport: {
    row: document.getElementById("obsidian-export-row"),
    button: document.getElementById("export-obsidian"),
    autoChk: document.getElementById("auto-export-chk"),
  },
  // First-run AI setup guidance (see the section near maybeShowAiSetupHint).
  aiSetupHint: {
    wrap: document.getElementById("ai-setup-hint"),
    text: document.getElementById("ai-setup-hint-text"),
    dismiss: document.getElementById("ai-setup-hint-dismiss"),
  },
  // Second setup stage — see the same section. Its own element so each hint
  // sits statically beside the control it is about.
  vaultSetupHint: {
    wrap: document.getElementById("vault-setup-hint"),
    text: document.getElementById("vault-setup-hint-text"),
    dismiss: document.getElementById("vault-setup-hint-dismiss"),
  },
  aiSetup: {
    dialog: document.getElementById("ai-setup-dialog"),
    later: document.getElementById("ai-setup-later"),
    openSettings: document.getElementById("ai-setup-open-settings"),
  },
  settings: {
    dialog: document.getElementById("settings-dialog"),
    form: document.getElementById("settings-form"),
    open: document.getElementById("open-settings"),
    cancel: document.getElementById("settings-cancel"),
    save: document.getElementById("settings-save"),
    error: document.getElementById("settings-error"),
    councilAutoChk: document.getElementById("council-check-settings-auto-chk"),
    councilManualCheckBtn: document.getElementById("council-check-manual-btn"),
    councilManualCheckResult: document.getElementById("council-check-manual-result"),
  },
  // AI Config: a SEPARATE top-level modal. It shares Settings' state (`sx`) and
  // its single save path — only the presentation is split.
  aiConfig: {
    dialog: document.getElementById("ai-config-dialog"),
    form: document.getElementById("ai-config-form"),
    open: document.getElementById("open-ai-config"),
    cancel: document.getElementById("ai-config-cancel"),
    save: document.getElementById("ai-config-save"),
    error: document.getElementById("ai-config-error"),
  },
  display: {
    windowMode: document.getElementById("display-window-mode"),
    alwaysOnTop: document.getElementById("display-always-on-top"),
    note: document.getElementById("display-unavailable-note"),
  },
  libraryView: document.getElementById("library-view"),
  archives: {
    open: document.getElementById("open-archives"),
    view: document.getElementById("archives-view"),
    back: document.getElementById("archives-back"),
    search: document.getElementById("archives-search"),
    list: document.getElementById("archives-list"),
    listView: document.getElementById("archives-list-view"),
    detailView: document.getElementById("archive-detail-view"),
    detailBack: document.getElementById("archive-detail-back"),
    detailContent: document.getElementById("archive-detail-content"),
    removeDialog: document.getElementById("archive-remove-dialog"),
    removeCancel: document.getElementById("archive-remove-cancel"),
    removeConfirm: document.getElementById("archive-remove-confirm"),
  },
  resetConfirm: {
    dialog: document.getElementById("reset-confirm-dialog"),
    cancel: document.getElementById("reset-confirm-cancel"),
    confirm: document.getElementById("reset-confirm-confirm"),
  },
  failureDecision: {
    dialog: document.getElementById("failure-decision-dialog"),
    title: document.getElementById("failure-decision-title"),
    body: document.getElementById("failure-decision-body"),
    reason: document.getElementById("failure-decision-reason"),
    stop: document.getElementById("failure-decision-stop"),
    continue: document.getElementById("failure-decision-continue"),
  },
  modelFailureWarning: {
    dialog: document.getElementById("model-failure-warning-dialog"),
    list: document.getElementById("model-failure-warning-list"),
    cancel: document.getElementById("model-failure-warning-cancel"),
    continue: document.getElementById("model-failure-warning-continue"),
  },
  councilCheck: {
    dialog: document.getElementById("council-check-dialog"),
    autoChk: document.getElementById("council-check-auto-chk"),
    skip: document.getElementById("council-check-skip"),
    run: document.getElementById("council-check-run"),
  },
  attachmentPreview: {
    dialog: document.getElementById("attachment-preview-dialog"),
    title: document.getElementById("attachment-preview-title"),
    body: document.getElementById("attachment-preview-body"),
    close: document.getElementById("attachment-preview-close"),
  },
  settingsSessionWarning: {
    dialog: document.getElementById("settings-session-warning-dialog"),
    title: document.getElementById("settings-session-warning-title"),
    body1: document.getElementById("settings-session-warning-body1"),
    body2: document.getElementById("settings-session-warning-body2"),
    body3: document.getElementById("settings-session-warning-body3"),
    cancel: document.getElementById("settings-session-warning-cancel"),
    confirm: document.getElementById("settings-session-warning-confirm"),
  },
  start: {
    menu: document.getElementById("start-menu"),
    enter: document.getElementById("start-enter"),
    connect: document.getElementById("start-connect"),
    settings: document.getElementById("start-settings"),
  },
  shell: document.getElementById("app-shell"),
  mainLayout: document.getElementById("library-view"),
  libraryPanel: document.getElementById("library-panel"),
  chatPanel: document.getElementById("chat-panel"),
  appSplitDivider: document.getElementById("app-split-divider"),
  libFullscreen: document.getElementById("lib-fullscreen"),
  chatFullscreen: document.getElementById("chat-fullscreen"),
  bookHotspot: document.getElementById(BOOK_HOTSPOT_ELEMENT_ID),
  modeModal: {
    dialog: document.getElementById("mode-modal"),
    council: document.getElementById("mode-council"),
    single: document.getElementById("mode-single"),
    // AI status section (Batch A) — read-only, never triggers a check.
    aiTitle: document.getElementById("mode-ai-status-title"),
    aiList: document.getElementById("mode-ai-list"),
    aiCheck: document.getElementById("mode-ai-check"),
  },
  more: {
    control: document.getElementById("more-control"),
    toggle: document.getElementById("more-toggle"),
    caret: document.getElementById("more-caret"),
    menu: document.getElementById("more-menu"),
    tutorial: document.getElementById("more-tutorial"),
    learn: document.getElementById("more-learn"),
    report: document.getElementById("more-report"),
    website: document.getElementById("more-website"),
    github: document.getElementById("more-github"),
    discord: document.getElementById("more-discord"),
    support: document.getElementById("more-support"),
    about: document.getElementById("more-about"),
  },
  learn: {
    dialog: document.getElementById("learn-dialog"),
    title: document.getElementById("learn-title"),
    nav: document.getElementById("learn-nav"),
    content: document.getElementById("learn-content"),
    close: document.getElementById("learn-close"),
  },
  about: {
    dialog: document.getElementById("about-dialog"),
    title: document.getElementById("about-title"),
    version: document.getElementById("about-version"),
    description: document.getElementById("about-description"),
    website: document.getElementById("about-website"),
    attribution: document.getElementById("about-attribution"),
    close: document.getElementById("about-close"),
  },
  tutorial: {
    overlay: document.getElementById("tutorial-overlay"),
    ring: document.getElementById("tutorial-ring"),
    callout: document.getElementById("tutorial-callout"),
    stepCount: document.getElementById("tutorial-step-count"),
    heading: document.getElementById("tutorial-heading"),
    body: document.getElementById("tutorial-body"),
    image: document.getElementById("tutorial-image"),
    skip: document.getElementById("tutorial-skip"),
    back: document.getElementById("tutorial-back"),
    next: document.getElementById("tutorial-next"),
  },
  productStatus: {
    dialog: document.getElementById("product-status-dialog"),
    openBtn: document.getElementById("open-product-status"),
    closeBtn: document.getElementById("product-status-close"),
    title: document.getElementById("product-status-title"),
    providersTitle: document.getElementById("ps-providers-title"),
    councilTitle: document.getElementById("ps-council-title"),
    checkTitle: document.getElementById("ps-check-title"),
    vaultTitle: document.getElementById("ps-vault-title"),
    providers: document.getElementById("ps-providers"),
    council: document.getElementById("ps-council"),
    check: document.getElementById("ps-check"),
    vault: document.getElementById("ps-vault"),
    note: document.getElementById("ps-note"),
  },
  vault: {
    control: document.getElementById("vault-control"),
    connectBtn: document.getElementById("vault-connect-btn"),
    split: document.getElementById("vault-split"),
    openBtn: document.getElementById("vault-open-btn"),
    menuToggle: document.getElementById("vault-menu-toggle"),
    menu: document.getElementById("vault-menu"),
    menuOpen: document.getElementById("vault-menu-open"),
    menuCopy: document.getElementById("vault-menu-copy"),
    menuChange: document.getElementById("vault-menu-change"),
    menuRefresh: document.getElementById("vault-menu-refresh"),
    obsidianState: document.getElementById("obsidian-integration-state"),
    obsidianDetail: document.getElementById("vault-menu-obsidian-detail"),
    obsidianPath: document.getElementById("vault-menu-obsidian-path"),
    obsidianEnable: document.getElementById("vault-menu-obsidian-enable"),
    obsidianChange: document.getElementById("vault-menu-obsidian-change"),
    obsidianDisable: document.getElementById("vault-menu-obsidian-disable"),
    menuPath: document.getElementById("vault-menu-path"),
    confirmDialog: document.getElementById("vault-confirm-dialog"),
    confirmCurrent: document.getElementById("vault-confirm-current"),
    confirmNew: document.getElementById("vault-confirm-new"),
    confirmError: document.getElementById("vault-confirm-error"),
    confirmCancel: document.getElementById("vault-confirm-cancel"),
    confirmUse: document.getElementById("vault-confirm-use"),
  },
};

// Client-side deadlines are a safety net alongside the backend's own
// three-phase per-provider timeouts (src/providers/timeouts.js: connect /
// inactivity / hard task, up to 600s for file analysis). The run stream is
// governed by INACTIVITY, not one fixed deadline: the server heartbeats
// every 15s, so 60s of silence means the connection is dead — while a
// healthy 10-minute PDF analysis keeps streaming pings and is never cut off.
// RUN_HARD_TIMEOUT_MS is the absolute ceiling (a server hung WHILE
// heartbeating); CHAT_API_TIMEOUT_MS covers single-response calls that may
// legitimately run one full file-analysis task (follow-up chat, scholar
// retry, ruling regeneration).
const DEFAULT_API_TIMEOUT_MS = 70_000;
const RUN_STREAM_INACTIVITY_MS = 60_000;
const RUN_HARD_TIMEOUT_MS = 1_500_000;
const CHAT_API_TIMEOUT_MS = 660_000;
// Timeout reason codes (mirrors src/providers/timeouts.js + client-side
// classification). NEVER evidence that a model is unavailable — these are
// excluded from the 24-hour bad-model memory.
const TIMEOUT_ERROR_CODES = new Set([
  "timeout",
  "connection_timeout",
  "inactivity_timeout",
  "hard_task_timeout",
  "user_cancelled",
]);

async function api(path, options = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, { ...options, signal: controller.signal });
  } catch (err) {
    const wrapped = new Error(err.message);
    wrapped.code = err.name === "AbortError" ? "timeout" : "network";
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `${res.status} ${res.statusText}`);
    // Structured fields from the error payload (e.g. notObsidian) ride along.
    err.data = data;
    err.httpStatus = res.status;
    // "timeout"/"network" from the server for a fetch-layer failure that
    // never became a real provider HTTP response (src/providers/errors.js) —
    // absent for a normal API error, which already has a clear message.
    err.code = data.code || null;
    throw err;
  }
  return data;
}

// Status-based category for a provider/API error — a short localized label
// prefixed onto the raw message so the underlying detail is never lost (per
// "preserve backend status/code/message"), just given a translated heading a
// non-English-reading user can scan at a glance. Verified against the real
// Google API rather than assumed: Google returns 400 (not 401) for an
// invalid key, with "API key not valid"/API_KEY_INVALID in the message — the
// message-pattern check below is what catches that; a provider that does
// return a plain 401 (OpenAI, Anthropic, …) is still caught by the status
// check. 403/404/429/5xx are standard REST semantics, confirmed for 404
// directly against the live API (see the Gemini 2.5 Pro investigation).
function providerErrorCategory(err) {
  const status = err?.httpStatus ?? err?.status;
  const message = err?.message || "";
  if (status === 401 || /api key not valid|invalid api key|api_key_invalid/i.test(message)) return "errorAuthInvalid";
  if (status === 403) return "errorAccessDenied";
  if (status === 404) return "errorEndpointUnavailable";
  if (status === 429) return "errorQuotaExceeded";
  if (status >= 500 && status <= 599) return "errorProviderServer";
  return null;
}

// Translates a caught error into a localized, user-facing message. Errors
// classified by `.code` (client-side timeout/network/abort, or the same
// codes forwarded from the server for a fetch-layer provider failure that
// never got a real response) get a clear, translated message. An error that
// DID get a real provider HTTP response is prefixed with a localized status
// category (see providerErrorCategory) but keeps the original detail — never
// silently collapsed into one generic "network error" for every kind of
// failure.
function friendlyErrorMessage(err) {
  if (err?.code === "run_in_progress") return str("errorRunInProgress");
  if (err?.code === "connection_timeout") return str("errorConnectionTimeout");
  if (err?.code === "inactivity_timeout") return str("errorInactivityTimeout");
  if (err?.code === "hard_task_timeout") return str("errorHardTaskTimeout");
  if (err?.code === "timeout") return str("errorTimeout");
  if (err?.code === "network") return str("errorNetwork");
  if (err?.code === "abort" || err?.name === "AbortError") return str("errorAborted");
  const category = providerErrorCategory(err);
  if (category) return `${str(category)} (${err.message})`;
  return err?.message || String(err);
}

// Classifies a scholar/judge/chat failure as "this specific model is gone"
// (not found, deprecated, unsupported, or access-denied) vs. something else.
// 401 (bad key — every model would fail) and 429/5xx (rate limit / transient
// provider trouble) are deliberately excluded: those say nothing about
// whether THIS model is unavailable, so marking it unavailable would be
// wrong and could hide a model that works fine once the real problem clears.
// The 429/5xx short-circuit is checked BEFORE the keyword match on purpose:
// a bare 503's statusText is conventionally the literal string "Service
// Unavailable", which would otherwise false-positive on the "unavailable"
// keyword below despite being exactly the transient case this must exclude.
function looksLikeUnavailableModel(status, message) {
  if (status === 429 || (status >= 500 && status <= 599)) return false;
  if ([403, 404, 410].includes(status)) return true;
  return /not found|does not exist|no longer available|deprecated|decommissioned|unsupported model|unknown model|invalid model|unavailable/i.test(
    message || ""
  );
}

// Models confirmed unavailable by a REAL generation-class request (Council
// run, Mentor run, or follow-up chat) with the CURRENT provider API key —
// persisted to localStorage (survives a reload — a 24-hour memory that reset
// every page load would defeat the point) as
// { [providerId]: { [modelId]: { failedAt, failureType } } }. Deliberately
// separate from modelCache (the curated+live model LIST) and modelInfoCache
// (badge metadata): a countTokens-based probe or a fresh Refresh Model List
// proves nothing about this, so neither is allowed to silently clear it
// (confirmed live: Google's countTokens returns 200 for gemini-2.5-pro while
// generateContent 404s — "no longer available to new users" — so the
// list/probe genuinely cannot detect this class of failure).
//
// A record is a 24-hour WARNING WINDOW, not a removal: the model stays
// selectable and stays in the curated catalog the whole time (see
// isRuntimeUnavailable() below vs. the pre-send confirmation in
// startSessionRun(), which are two different consumers of the same record —
// one softly excludes it from ⭐ Recommended, the other asks before spending
// an attempt on it). Cleared by clearRuntimeUnavailable(): a later real
// success for that exact model, the provider's API key changing (see
// saveSettings()), or simply aging out past 24 hours (checked lazily on
// read — see isRuntimeUnavailable()).
const FAILURE_MEMORY_KEY = "aether.modelFailureMemory";
const FAILURE_MEMORY_WINDOW_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------ draft autosave
// Batch C. Mirrors src/services/composerDrafts.js (this file is a plain
// global script and cannot import it) — that module is the source of truth
// and carries the full rationale; the tests assert both stay in step.
//
// There is ONE #question textarea in this application. Whether it is the
// main question composer or the follow-up composer is decided entirely by
// sessionConfigLocked, so a single input listener routes each keystroke to
// the right draft. Nothing but that unsent text is ever persisted, and no
// code path here performs a network request.
const DRAFT_KEYS = {
  main: "aether.draft.main",
  followUps: "aether.draft.followups",
};
const FOLLOW_UP_DRAFT_LIMIT = 20;
const DRAFT_DEBOUNCE_MS = 300;

function isBlankDraft(text) {
  return typeof text !== "string" || text.trim() === "";
}

// Every storage touch is wrapped: disabled/full/throwing storage must
// degrade to "no drafts are remembered", never to a composer that cannot be
// typed in or a Send that cannot fire.
function draftGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

function draftSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function draftRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Blank-checked on read for the same reason as readFollowUpDraft below.
function readMainDraft() {
  const text = draftGet(DRAFT_KEYS.main);
  return isBlankDraft(text) ? "" : text;
}

// A blank draft is REMOVED, never stored as "" — an empty composer must not
// leave a meaningless entry behind.
function writeMainDraft(text) {
  if (isBlankDraft(text)) return draftRemove(DRAFT_KEYS.main);
  return draftSet(DRAFT_KEYS.main, text);
}

function clearMainDraft() {
  return draftRemove(DRAFT_KEYS.main);
}

function readFollowUpMap() {
  const raw = draftGet(DRAFT_KEYS.followUps);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {}; // corrupt entry — fail open, exactly like loadFailureMemory()
  }
}

function writeFollowUpMap(map) {
  const entries = Object.entries(map)
    .filter(([id, entry]) => id && entry && typeof entry.text === "string" && !isBlankDraft(entry.text))
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, FOLLOW_UP_DRAFT_LIMIT);
  if (entries.length === 0) return draftRemove(DRAFT_KEYS.followUps);
  return draftSet(DRAFT_KEYS.followUps, JSON.stringify(Object.fromEntries(entries)));
}

// The follow-up draft's scope. The server-installed Session id is the only
// stable Session identity this frontend has — and chatReady() already
// refuses to enable the follow-up composer without one (`if (!s || !s.id)
// return false`), so a follow-up literally cannot be typed before this
// exists. No parallel identity is invented for it.
function activeSessionDraftId() {
  const id = sessionState?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

// Blank-checked on READ as well as on write: the write path already refuses
// to store a blank draft, but a hand-edited or truncated entry could still
// hold one — and restoreComposerDraft() only asks "is there text?", so a
// stored "   " would silently push whitespace into an empty composer.
function readFollowUpDraft(sessionId) {
  if (!sessionId) return "";
  const entry = readFollowUpMap()[sessionId];
  if (!entry || isBlankDraft(entry.text)) return "";
  return entry.text;
}

function writeFollowUpDraft(sessionId, text) {
  if (!sessionId) return false; // no stable identity — persist nothing at all
  const map = readFollowUpMap();
  if (isBlankDraft(text)) delete map[sessionId];
  else map[sessionId] = { text, at: Date.now() };
  return writeFollowUpMap(map);
}

function clearFollowUpDraft(sessionId) {
  if (!sessionId) return false;
  const map = readFollowUpMap();
  if (!(sessionId in map)) return true;
  delete map[sessionId];
  return writeFollowUpMap(map);
}

// Clears a Session's follow-up draft only if it still holds exactly the text
// that was accepted. A Quick Question chip sends without touching the
// composer, so a half-written follow-up sitting there is not that send's to
// discard — the texts differ, and it survives.
function clearFollowUpDraftIfUnchanged(sessionId, sentText) {
  if (!sessionId) return false;
  if (readFollowUpDraft(sessionId).trim() !== String(sentText ?? "").trim()) return false;
  return clearFollowUpDraft(sessionId);
}

// Which draft the composer's current contents belong to. Locked means a
// Session owns the composer and every keystroke is a follow-up for THAT
// Session; unlocked means it is the main question composer.
function persistComposerDraft() {
  const text = els.question.value;
  if (sessionConfigLocked) writeFollowUpDraft(activeSessionDraftId(), text);
  else writeMainDraft(text);
}

// A small debounce keeps a fast typist from writing on every keystroke. The
// pending write is flushed the instant the page is hidden or unloaded, so a
// refresh inside the debounce window still keeps the last characters typed.
let draftSaveTimer = null;

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(persistComposerDraft, DRAFT_DEBOUNCE_MS);
}

function flushDraftSave() {
  if (draftSaveTimer === null) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  persistComposerDraft();
}

// Any programmatic write to els.question.value (a send, a Reset, a restored
// question after a total failure) fires no `input` event, so the store is
// re-synced explicitly at those points rather than left holding stale text.
function cancelPendingDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
}

// Bootstrap restore. Deliberately silent: no banner, no confirmation, no
// dialog — the text is simply there again. Runs after restoreSession(), so
// sessionConfigLocked/sessionState already reflect whichever composer this
// page load actually has, and it never overwrites text that is somehow
// already present.
function restoreComposerDraft() {
  if (els.question.value) return;
  const text = sessionConfigLocked ? readFollowUpDraft(activeSessionDraftId()) : readMainDraft();
  if (text) els.question.value = text;
}

function loadFailureMemory() {
  try {
    const raw = localStorage.getItem(FAILURE_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // corrupt/blocked storage — fail open, never throw
  }
}

// Prunes every globally-expired record before writing, so storage stays
// bounded without needing a separate cleanup pass — expiry is otherwise only
// ever checked lazily, per-model, on read.
function saveFailureMemory(mem) {
  const now = Date.now();
  const pruned = {};
  for (const [providerId, models] of Object.entries(mem)) {
    for (const [modelId, record] of Object.entries(models || {})) {
      if (record && now - record.failedAt < FAILURE_MEMORY_WINDOW_MS) {
        (pruned[providerId] ??= {})[modelId] = record;
      }
    }
  }
  try {
    localStorage.setItem(FAILURE_MEMORY_KEY, JSON.stringify(pruned));
  } catch {
    // Storage full/blocked (private browsing) — the warning/recommendation
    // features just degrade to "nothing on record," never a hard failure.
  }
}

// True only while a failure record exists AND is still inside the 24-hour
// warning window — an expired record silently stops counting, exactly like
// it was never there (requirement: "after 24 hours ... may participate in
// recommendation again unless there is a newer failure record").
function isRuntimeUnavailable(providerId, modelId) {
  const record = loadFailureMemory()[providerId]?.[modelId];
  return Boolean(record && Date.now() - record.failedAt < FAILURE_MEMORY_WINDOW_MS);
}

// Records a confirmed-unavailable model (see looksLikeUnavailableModel) and
// refreshes any open Settings dropdown to reflect it immediately, without
// ever auto-switching the session to a different model.
function markModelUnavailable(providerId, modelId) {
  if (!providerId || !modelId) return;
  const mem = loadFailureMemory();
  (mem[providerId] ??= {})[modelId] = { failedAt: Date.now(), failureType: "model_unavailable" };
  saveFailureMemory(mem);
  if (els.settings.dialog.open && sx) repopulateModelsForProvider(providerId);
}

// A model that actually completes a real request is proof it works with the
// current key — clear any stale unavailable flag left over from an earlier
// failure (also covers "the user explicitly retried and it worked").
function clearRuntimeUnavailable(providerId, modelId) {
  if (!providerId || !modelId) return;
  const mem = loadFailureMemory();
  if (!mem[providerId] || !(modelId in mem[providerId])) return;
  delete mem[providerId][modelId];
  saveFailureMemory(mem);
  if (els.settings.dialog.open && sx) repopulateModelsForProvider(providerId);
}

// Drops every failure record for a provider — used when its API key changes
// (see saveSettings()): a new credential invalidates account-specific
// findings from the old one, so every model deserves a fresh evaluation.
function clearProviderFailures(providerId) {
  const mem = loadFailureMemory();
  if (!mem[providerId]) return;
  delete mem[providerId];
  saveFailureMemory(mem);
}

// ------------------------------------------------------- markdown rendering
// Minimal, dependency-free renderer for model output. All input is
// HTML-escaped first; only headings, lists, code, and bold are recognized.

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split(/\r?\n/);
  const out = [];
  let list = null;
  let code = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (code !== null) {
        out.push(`<pre><code>${code.join("\n")}</code></pre>`);
        code = null;
      } else {
        closeList();
        code = [];
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }

    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }

    const heading = t.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inlineMd(bullet[1])}</li>`);
      continue;
    }

    const numbered = t.match(/^\d+[.、)]\s*(.*)$/);
    if (numbered) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inlineMd(numbered[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineMd(t)}</p>`);
  }
  if (code !== null) out.push(`<pre><code>${code.join("\n")}</code></pre>`);
  closeList();
  return out.join("");
}

function setPanel(el, text, state) {
  el.classList.remove("state-ok", "state-error", "state-loading");
  if (state) el.classList.add(`state-${state}`);
  if (state === "ok") {
    el.innerHTML = renderMarkdown(text || "—");
  } else {
    el.textContent = text || "—";
  }
}

// ---------------------------------------------------------------- status

let currentConfig = null;
let vaultState = { path: "", exists: false, configured: false };

// Application theme: one data-theme attribute on <html> selects the token
// block in style.css. "dark" is the default brown & gold interface; unknown
// values fall back to it so a stale config can never blank the UI.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

// ------------------------------------------------------------ Scene theme
// The Workspace (#chat-panel) takes its palette from the ACTIVE SCENE. The
// Scene owns a complete theme snapshot (see src/services/worldContent.js);
// this applies it as inline CSS custom properties on <html>, which outrank
// the stylesheet's :root blocks. If it never runs — no Scene theme, an old
// config, a failed load — style.css's own Classic values still render the
// app exactly as before, so this can only ever add a palette, never remove
// one.
//
// SCOPE: only the --ws-* vocabulary, which only #chat-panel consumes (plus
// the two documented cross-scope uses of --ws-gold: the split divider and
// the tutorial ring). The library panel, start menu, dialogs and scene
// artwork are deliberately NOT themed.
//
// MIRRORED CONSTANTS: this file is a plain script and cannot import the
// service, so the token map and the Classic palette are duplicated here.
// test/sceneTheme.test.js asserts both copies against the service, so a
// change on one side fails the suite rather than drifting silently.
const WS_THEME_TOKENS = {
  surface: "--ws-bg",
  surfaceRaised: "--ws-panel",
  surfaceCard: "--ws-card",
  surfaceInset: "--ws-deep",
  frame: "--ws-frame",
  text: "--ws-text",
  textMuted: "--ws-muted",
  border: "--ws-border",
  borderStrong: "--ws-border-strong",
  accent: "--ws-accent",
  accentText: "--ws-accent-ink",
  accentSoft: "--ws-accent-soft",
  highlight: "--ws-gold",
  success: "--ws-ok",
  warning: "--ws-warn",
  scrollbar: "--ws-scrollbar",
  scrollbarTrack: "--ws-scrollbar-track",
};

const WS_THEME_MODES = ["dark", "light"];

const CLASSIC_WS_THEME = {
  dark: {
    surface: "#221a12", surfaceRaised: "#2a2016", surfaceCard: "#34281a", surfaceInset: "#1a140d",
    frame: "#120d08", text: "#f0e8d8", textMuted: "#a6957a",
    border: "#c4944a38", borderStrong: "#c4944a73",
    accent: "#c0954c", accentText: "#251807", accentSoft: "#c0954c24",
    highlight: "#e5b968", success: "#8caf6f", warning: "#d8a24d",
    scrollbar: "#4d3c26", scrollbarTrack: "#1c150e",
  },
  light: {
    surface: "#f0ddb2", surfaceRaised: "#e6cd97", surfaceCard: "#dbba82", surfaceInset: "#f7ecd2",
    frame: "#5a4022", text: "#38260f", textMuted: "#7d6440",
    border: "#5a402259", borderStrong: "#5a40228c",
    accent: "#8a5a22", accentText: "#f7ecd2", accentSoft: "#8a5a2224",
    highlight: "#a06f1f", success: "#4c7a3f", warning: "#a2572c",
    scrollbar: "#c9ad74", scrollbarTrack: "#e6cd97",
  },
};

// Literal hex only — the same rule the service enforces. Nothing that could
// be read as a CSS expression (var(), url(), rgb(), calc(), a named color)
// can survive, so no authored string ever reaches the CSSOM as CSS text.
const WS_HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function sanitizeThemeColorValue(value) {
  if (typeof value !== "string") return "";
  const v = value.trim().toLowerCase();
  return WS_HEX_COLOR_RE.test(v) ? v : "";
}

function expandThemeHex(hex) {
  if (hex.length !== 4 && hex.length !== 5) return hex;
  return `#${[...hex.slice(1)].map((c) => c + c).join("")}`;
}

// The hover wash is the accent at 14% — identical in both Classic modes, so
// it derives rather than being authored twice.
function deriveAccentSoftValue(accent) {
  const base = expandThemeHex(sanitizeThemeColorValue(accent));
  return base ? `${base.slice(0, 7)}24` : "";
}

// One mode's 17 values, every one guaranteed to be literal hex: an invalid
// or missing token falls back to the Classic value for the SAME mode, so
// dark never borrows from light.
function resolveThemeModeValues(theme, mode) {
  const fallback = CLASSIC_WS_THEME[mode] || CLASSIC_WS_THEME.dark;
  const raw = (theme && typeof theme === "object" && theme[mode]) || {};
  const out = {};
  for (const token of Object.keys(WS_THEME_TOKENS)) {
    out[token] = sanitizeThemeColorValue(raw[token]) || fallback[token];
  }
  // Treated as derived when absent, malformed, or indistinguishable from a
  // derivation — including the Classic value every existing Scene stores, so
  // re-tinting the accent never leaves the old hover wash behind. A value
  // matching neither derivation was chosen deliberately and is applied as-is.
  const authoredSoft = sanitizeThemeColorValue(raw.accentSoft);
  const looksDerived =
    !authoredSoft ||
    authoredSoft === deriveAccentSoftValue(out.accent) ||
    authoredSoft === deriveAccentSoftValue(fallback.accent);
  if (looksDerived) out.accentSoft = deriveAccentSoftValue(out.accent) || fallback.accentSoft;
  return out;
}

// The user's own appearance choice always wins. A Scene's defaultMode seeds
// the look for someone who has never picked one; it must never flip a
// preference that was explicitly saved (Settings → General → Theme).
function resolveSceneThemeMode(cfg) {
  if (cfg?.themeIsUserSet && WS_THEME_MODES.includes(cfg.theme)) return cfg.theme;
  const sceneDefault = cfg?.sceneTheme?.defaultMode;
  if (WS_THEME_MODES.includes(sceneDefault)) return sceneDefault;
  return WS_THEME_MODES.includes(cfg?.theme) ? cfg.theme : "dark";
}

// THE application point. Writes only the whitelisted --ws-* properties, only
// sanitized hex, one setProperty per token — never a style block, never
// innerHTML, never a CSS string. Touches nothing but the custom properties:
// no session, no vault, no settings, no layout, no AI state.
function applySceneTheme(sceneWorldTheme, selectedMode) {
  const mode = WS_THEME_MODES.includes(selectedMode) ? selectedMode : "dark";
  const values = resolveThemeModeValues(sceneWorldTheme, mode);
  const root = document.documentElement.style;
  for (const [token, cssVar] of Object.entries(WS_THEME_TOKENS)) {
    root.setProperty(cssVar, values[token]);
  }
  // data-theme keeps its existing meaning (the stylesheet block, plus any
  // component keyed off the attribute); the inline properties layer on top.
  applyTheme(mode);
  return mode;
}

// ----------------------------------------------------------- contrast (F8)
// WCAG 2.1, with real alpha compositing so a translucent token is judged
// against what is actually behind it. Advisory only — the F8 editor shows
// these, and nothing here blocks a save.
function parseThemeHex(value) {
  const hex = expandThemeHex(sanitizeThemeColorValue(value));
  if (!hex) return null;
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return { r: n(1), g: n(3), b: n(5), a: hex.length === 9 ? n(7) / 255 : 1 };
}

function themeRelativeLuminance({ r, g, b }) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function themeContrastRatio(foreground, background) {
  const fg = parseThemeHex(foreground);
  const bg = parseThemeHex(background);
  if (!fg || !bg) return 0;
  const composited =
    fg.a >= 1
      ? fg
      : {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        };
  const a = themeRelativeLuminance(composited);
  const b = themeRelativeLuminance(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// Every place a token is used AS INK on another token. `large` marks pairs
// whose real use is large or non-body text, where 3:1 applies instead of 4.5.
const WS_CONTRAST_PAIRS = [
  { fg: "text", bg: "surface", label: "Text on Surface" },
  { fg: "text", bg: "surfaceRaised", label: "Text on Raised Surface" },
  { fg: "text", bg: "surfaceCard", label: "Text on Card Surface" },
  { fg: "text", bg: "surfaceInset", label: "Text on Inset Surface" },
  { fg: "textMuted", bg: "surface", label: "Muted Text on Surface" },
  { fg: "textMuted", bg: "surfaceCard", label: "Muted Text on Card Surface" },
  { fg: "accentText", bg: "accent", label: "Accent Text on Accent" },
  { fg: "accentText", bg: "highlight", label: "Accent Text on Highlight" },
  { fg: "highlight", bg: "surface", label: "Highlight on Surface", large: true },
  { fg: "highlight", bg: "surfaceCard", label: "Highlight on Card Surface", large: true },
  { fg: "accent", bg: "surface", label: "Accent on Surface", large: true },
  { fg: "success", bg: "surface", label: "Success on Surface", large: true },
  { fg: "warning", bg: "surface", label: "Warning on Surface", large: true },
];

function themeContrastReport(theme, mode) {
  const resolved = WS_THEME_MODES.includes(mode) ? mode : "dark";
  const values = resolveThemeModeValues(theme, resolved);
  const failingTokens = new Set();
  const pairs = WS_CONTRAST_PAIRS.map((pair) => {
    const ratio = themeContrastRatio(values[pair.fg], values[pair.bg]);
    const threshold = pair.large ? 3 : 4.5;
    const pass = ratio >= threshold;
    if (!pass) {
      failingTokens.add(pair.fg);
      failingTokens.add(pair.bg);
    }
    return { ...pair, ratio: Math.round(ratio * 100) / 100, threshold, pass };
  });
  return { mode: resolved, pairs, failing: pairs.filter((p) => !p.pass).length, failingTokens };
}

// The F8 Theme editor's whole runtime surface. Exposed rather than
// duplicated in devtools/, so preview, validation and contrast all use the
// SAME code the shipping app uses — the editor cannot show something the
// runtime would render differently.
window.__sceneTheme = {
  apply: applySceneTheme,
  classic: (mode) => ({ ...(CLASSIC_WS_THEME[mode] || CLASSIC_WS_THEME.dark) }),
  sanitizeColor: sanitizeThemeColorValue,
  contrast: themeContrastReport,
  modes: () => [...WS_THEME_MODES],
  // The mode the running app is currently showing, so the editor can preview
  // a different one without disturbing it.
  currentMode: () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
};

// Rewrites every static UI string from the active locale pack (the HTML
// carries English defaults for the moment before config arrives). Runs on
// every config (re)load, so changing the Interface Language re-localizes the
// whole application instantly — no restart. Anything rendered dynamically
// reads str() at render time instead.
function localizeStaticUI() {
  document.documentElement.lang = currentConfig?.interfaceLanguage || "en";

  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = str(key);
  };

  // Start menu + library nav (subtitle/copyright are brand statements —
  // identical in every locale, but still sourced from the packs)
  setText("start-subtitle", "startSubtitle");
  setText("start-copyright", "startCopyright");
  setText("start-enter", "enterLibrary");
  setText("start-connect", "connectVault");
  setText("start-settings", "settings");
  setText("open-settings", "settings");
  // AI Config is a top-level destination, localized like any other nav button.
  setText("open-ai-config", "aiConfig");
  setText("ai-config-title", "aiConfig");
  setText("display-title", "display");
  setText("display-unavailable-note", "displayUnavailable");
  {
    // The label element also contains the <select>, so its text node is set
    // directly rather than through setText (which replaces all children).
    const wmLabel = document.getElementById("display-window-mode-label");
    if (wmLabel && wmLabel.firstChild) wmLabel.firstChild.nodeValue = str("windowMode");
    const wm = document.getElementById("display-window-mode");
    if (wm) {
      const labels = {
        windowed: str("windowModeWindowed"),
        fullscreen: str("windowModeFullscreen"),
        borderless: str("windowModeBorderless"),
      };
      for (const opt of wm.options) if (labels[opt.value]) opt.textContent = labels[opt.value];
    }
    // The checkbox label text lives in its own <span>, so setText is safe here.
    setText("display-always-on-top-text", "alwaysOnTop");
  }
  setText("ai-setup-hint-text", "aiSetupHint");
  setText("vault-setup-hint-text", "vaultSetupHint");
  setText("ai-setup-title", "aiSetupTitle");
  setText("ai-setup-body1", "aiSetupBody1");
  setText("ai-setup-body2", "aiSetupBody2");
  setText("ai-setup-later", "aiSetupLater");
  setText("ai-setup-open-settings", "aiSetupOpenSettings");
  if (els.aiSetupHint.dismiss) els.aiSetupHint.dismiss.setAttribute("aria-label", str("aiSetupHintDismiss"));
  // Both hints share the one dismiss label — the action is identical.
  if (els.vaultSetupHint.dismiss) els.vaultSetupHint.dismiss.setAttribute("aria-label", str("aiSetupHintDismiss"));
  setText("open-archives", "archives");

  // Vault control + menu ("Vault" itself is world terminology, untranslated;
  // the Obsidian On/Off state text is state-dependent — see renderVaultControl)
  setText("vault-connect-btn", "connectVault");
  setText("vault-open-btn", "vaultButton");
  els.vault.menuToggle.setAttribute("aria-label", str("vaultMenuAria"));
  setText("vault-menu-open", "openVault");
  setText("vault-menu-copy", "copyVaultPath");
  setText("vault-menu-change", "changeVaultLocation");
  setText("vault-menu-refresh", "refresh");
  setText("vault-menu-current-label", "currentVault");
  setText("obsidian-integration-label", "obsidianIntegration");
  setText("vault-menu-obsidian-label", "obsidianVaultLabel");
  setText("vault-menu-obsidian-enable", "enableObsidian");
  setText("vault-menu-obsidian-change", "changeObsidian");
  setText("vault-menu-obsidian-disable", "disableObsidian");
  setText("auto-export-text", "autoExportLabel");

  // Fullscreen toggles + the book on the table
  els.libFullscreen.title = str("fullscreenLibrary");
  els.chatFullscreen.title = str("fullscreenChat");
  els.bookHotspot.title = str("bookHotspot");
  els.bookHotspot.setAttribute("aria-label", str("bookHotspot"));

  // Mode selection dialog ("Traveler" is world terminology, untranslated)
  setText("mode-welcome", "modeModalWelcome");
  setText("mode-choose", "modeModalChoose");
  setText("mode-council", "modeCouncil");
  setText("mode-single", "modeMentor");

  // Session header labels + actions
  setText("sh-label-session", "shSession");
  setText("sh-label-mode", "modeLabel");
  setText("sh-label-status", "status");
  setText("sh-label-vault", "shVault");
  setText("sh-label-scholars", "shScholars");
  setText("reset-session", "reset");

  // Composer + chat
  setText("mode-label", "modeLabel");
  els.modeToggle.setAttribute("aria-label", str("modeToggleAria"));
  setText("use-vault-label", "useVaultLabel");
  updateUseVaultHint();
  setText("quick-actions-toggle-label", "quickQuestions");
  applyQuickActionsExpanded(quickActionsExpanded); // refresh the toggle's localized aria-label/title only
  els.workspaceDivider.setAttribute("aria-label", str("resizeWorkspaceDivider"));
  els.workspaceDivider.title = str("resizeWorkspaceDivider");
  setText("session-summary-label", "sessionSummary");
  setSessionSummaryExpanded(sessionSummaryExpanded); // refresh the toggle's localized aria-label/title only
  setText("library-activity-title-label", "libraryActivity");
  for (const btn of els.modeToggle.querySelectorAll(".mode-btn")) {
    btn.textContent = btn.dataset.mode === "single" ? str("modeMentor") : str("modeCouncil");
  }
  // The persistent input's placeholder depends on whether a Session is
  // already underway — mirrors lockSessionConfig()/unlockSessionConfig().
  els.question.placeholder = sessionConfigLocked
    ? str(continuePlaceholderKey())
    : str(selectedMode === "single" ? "askPlaceholderMentor" : "askPlaceholderCouncil");
  applyRunButtonLabel(); // respects a live Stop/Stopping label
  els.attachBtn.title = str("attachTooltip");
  els.attachBtn.setAttribute("aria-label", str("attachTooltip"));

  // Archives screen
  setText("archives-title", "archives");
  setText("archives-subtitle", "archivesSubtitle");
  setText("archives-back", "backToLibrary");
  setText("archive-detail-back", "backToArchives");
  els.archives.search.placeholder = str("searchArchives");

  // Vault confirmation dialog
  setText("vault-confirm-title", "changeVaultTitle");
  setText("vault-confirm-current-label", "currentVault");
  setText("vault-confirm-new-label", "newVault");
  setText("vault-confirm-cancel", "cancel");
  setText("vault-confirm-use", "useThisFolder");

  // Remove-from-Archives confirmation dialog
  setText("archive-remove-title", "removeConfirmTitle");
  setText("archive-remove-body1", "removeConfirmBody1");
  setText("archive-remove-body2", "removeConfirmBody2");
  setText("archive-remove-cancel", "cancel");
  setText("archive-remove-confirm", "removeConfirmAction");

  // Reset confirmation dialog (unsaved sessions only)
  setText("reset-confirm-title", "resetConfirmTitle");
  setText("reset-confirm-body1", "resetConfirmBody1");
  setText("reset-confirm-body2", "resetConfirmBody2");
  setText("reset-confirm-cancel", "cancel");
  setText("reset-confirm-confirm", "reset");

  // Model-failure pre-send warning dialog (the list items are (re)built
  // fresh each time confirmModelFailureWarning() opens the dialog, from the
  // localized affected-model list at that moment).
  setText("model-failure-warning-title", "modelFailureWarningTitle");
  setText("model-failure-warning-message", "modelFailureWarningMessage");
  setText("model-failure-warning-question", "modelFailureWarningQuestion");
  setText("model-failure-warning-cancel", "cancel");
  setText("model-failure-warning-continue", "continueAnyway");

  // Council Model Check dialog (checkbox's checked state is set separately —
  // see openCouncilCheckDialog()/openSettings() — this only localizes text).
  setText("council-check-title", "councilCheckTitle");
  setText("council-check-recommended", "councilCheckRecommended");
  setText("council-check-body", "councilCheckBody");
  setText("council-check-help", "councilCheckHelp");
  setText("council-check-cost", "councilCheckCost");
  setText("council-check-skip-note", "councilCheckSkipNote");
  setText("council-check-auto-text", "councilCheckAutoLabel");
  setText("council-check-settings-note", "councilCheckSettingsNote");
  setText("council-check-skip", "councilCheckSkip");
  setText("council-check-run", "councilCheckRun");
  // Council Pre-check failure block (the per-participant list is rebuilt
  // fresh each time showCouncilPrecheckError() renders it).
  setText("council-precheck-error-title", "councilCheckErrorTitle");
  setText("council-precheck-error-footer", "councilCheckErrorFooter");
  setText("council-precheck-retry", "councilCheckRetry");
  setText("council-precheck-open-settings", "councilCheckOpenSettings");
  // Settings → Council Model Check section
  setText("council-check-settings-title", "councilCheckTitle");
  setText("council-check-settings-auto-text", "councilCheckSettingsAutoLabel");
  setText("council-check-settings-desc", "councilCheckSettingsDesc");
  setText("council-check-settings-cost", "councilCheckSettingsCost");
  // The manual button's own label only — its in-flight/result text is set
  // dynamically at click time (runManualCouncilCheck()), never here.
  if (!councilManualCheckInFlight) setText("council-check-manual-btn", "councilCheckManualBtn");

  // Product Status (Batch A) — the entry-point button in the Grand Sage
  // section. The dialog's own labels are set by renderProductStatus() on
  // every open, so they follow a language switch without needing entries
  // here (nothing inside it is visible until that render runs).
  setText("open-product-status", "productStatusOpen");

  // Batch B: MORE menu. The dropdown's own entries are static elements, so
  // they are localized here; Learn/About/Tutorial contents are (re)rendered
  // on open, so they follow a language switch without needing entries here.
  setText("more-toggle", "moreMenu");
  setText("more-tutorial", "moreTutorial");
  setText("more-learn", "moreLearn");
  setText("more-report", "moreReportIssue");
  setText("more-website", "moreWebsite");
  setText("more-discord", "moreDiscord");
  setText("more-github", "moreGithub");
  setText("more-support", "moreSupport");
  setText("more-about", "moreAbout");
  syncMoreMenuLinks();

  // Settings mid-Session change confirmation (body1/2/3 are (re)filled per
  // saved/unsaved state each time confirmSettingsSessionChange() opens it).
  setText("settings-session-warning-title", "settingsSessionWarningTitle");
  setText("settings-session-warning-cancel", "cancel");
  setText("settings-session-warning-confirm", "resetAndApply");

  // Attachment preview dialog (title/body are filled per attachment each
  // time openAttachmentPreview() opens it).
  setText("attachment-preview-close", "close");

  // Idle state (only when no Session is rendered — never clobber answers).
  if (!sessionState) {
    els.header.save.textContent = str("saveToVault");
  }
  refreshDiscussionEmptyText();
  setText("session-error-title", "sessionErrorTitle");
  setText("session-error-message", "sessionErrorMessage");
  // Interface language changes control text (Mode/Council/Mentor, Scholar
  // names, Reset/Send, Quick Questions...), which can change the interaction
  // workspace's true minimum height — recalculate the divider floor once
  // the new text has actually reflowed.
  recalcWorkspaceSplit();
}

// DEV ONLY: injects the F8 Scene Editor (devtools/scene-editor.js) when the
// server reports dev tools enabled. In production the flag is false AND the
// /dev files don't exist, so no editor code — and no F8 listener — ever
// reaches the page. The editor is a plain script sharing app.js globals
// (SCENE_OBJECTS, els, currentConfig); everything else about it lives in
// devtools/, outside the shipped app.
function maybeLoadSceneEditor() {
  if (!currentConfig?.devTools || document.getElementById("scene-editor-script")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/dev/scene-editor.css";
  document.head.appendChild(link);
  const s = document.createElement("script");
  s.id = "scene-editor-script";
  s.src = "/dev/scene-editor.js";
  document.body.appendChild(s);
}

// Localized UI strings for the dev-only Author Preview, so its mock Workspace
// carries the SAME labels the real one does rather than a second English
// copy. Read-only: the preview can look strings up, never write them.
window.__aetherStrings = { str, strT };

// Lets Author Preview re-evaluate the production split when it hides or
// restores the editor — the divider's own visibility is derived state
// (appSplitActive), not something the preview should set by hand.
window.__aetherSplit = { refresh: () => applyAppSplitWidth() };

async function loadStatus() {
  try {
    const previousInterfaceLanguage = currentConfig?.interfaceLanguage;
    const [cfg, vault] = await Promise.all([api("/api/config"), api("/api/vault/status")]);
    currentConfig = cfg;
    vaultState = vault;
    // Runtime hot-switch for character dialogue (never Default Reply Language —
    // see handleInterfaceLanguageChanged): this is the only place
    // currentConfig.interfaceLanguage is ever assigned, whether from the
    // initial page load or a Settings save, so it's the one correct
    // detection point. Never fires on the very first load.
    if (hasInterfaceLanguageChanged(previousInterfaceLanguage, cfg.interfaceLanguage)) {
      handleInterfaceLanguageChanged();
    }
    // The Scene owns the Workspace palette; the user owns dark/light. This
    // sets data-theme too, so it replaces the bare applyTheme() call.
    applySceneTheme(cfg.sceneTheme, resolveSceneThemeMode(cfg));
    // Config just changed — a provider may have appeared (or this may be the
    // first load after the Tutorial). Derived, so it cannot go stale. Both
    // stages refresh together: satisfying stage 1 is what reveals stage 2.
    refreshSetupGuidance();
    renderVaultControl();
    maybeLoadSceneEditor();
    maybeExposeRuntimeDebugHook();
    exposeAppVersionToEditor();

    // Guarantee a stable identity shape so any consumer can read
    // identity.scholars without an undefined access (the backend normally
    // provides it; this only fills gaps, never overrides real values).
    cfg.identity = cfg.identity && typeof cfg.identity === "object" ? cfg.identity : {};
    if (!cfg.identity.scholars || typeof cfg.identity.scholars !== "object") cfg.identity.scholars = {};

    buildScholarPicker(cfg);
    localizeStaticUI();

    // A language change must re-localize live surfaces immediately: the active
    // Session's header/badges and chat affordances, and the Archives screen if
    // it is open. (Answers and tab names keep their Session identity snapshot.)
    if (sessionState) {
      renderSessionHeader();
      configureChatForMode(sessionState.mode);
      updateChatAvailability();
      updateCopyButton();
    }
    if (!els.archives.view.hidden) renderArchivesList(archivesCache, els.archives.search.value);

    const anyKey = Object.values(cfg.providers || {}).some((p) => p.configured);
    if (!anyKey) {
      els.librarianStatus.textContent = str("noProviderConfigured");
    }
  } catch (err) {
    console.error("[vault] failed to load status:", err);
  }
}

// Character name for a slot, preferring the active session's snapshot so a
// restored session keeps the names it ran with even if the interface language
// changed since.
function personaFor(slot) {
  return (
    sessionState?.identity?.scholars?.[slot] ||
    currentConfig?.identity?.scholars?.[slot] ||
    strT("scholarSlotLabel", { n: slot })
  );
}

function judgePersonaName() {
  return sessionState?.identity?.judge || currentConfig?.identity?.judge || str("summaryTab");
}

// ---------------------------------------------------- mode + scholar picker
// The player picks a conversation mode and which fixed Scholar slots take
// part. Council allows 1–3 enabled Scholars; Single allows exactly one.

let selectedMode = "council";
const selectedSlots = new Set();

// Legacy default provider per slot, mirroring the backend, for the fallback.
const DEFAULT_SLOT_PROVIDERS = { 1: "openai", 2: "anthropic", 3: "google" };

// Guarantees a usable scholar-slots array. The backend normalizes and always
// sends one, but if a stale/partial response ever omits it, we synthesize a
// safe three-slot default here so the picker and Settings still render instead
// of throwing "cfg.scholarSlots is not iterable".
function scholarSlotsFrom(cfg) {
  if (cfg && Array.isArray(cfg.scholarSlots) && cfg.scholarSlots.length) return cfg.scholarSlots;
  const providers = (cfg && cfg.providers) || {};
  const ids = Object.keys(providers);
  return [1, 2, 3].map((n) => {
    const provider = providers[DEFAULT_SLOT_PROVIDERS[n]] ? DEFAULT_SLOT_PROVIDERS[n] : ids[0] || DEFAULT_SLOT_PROVIDERS[n];
    const p = providers[provider];
    return {
      slot: n,
      slotId: `scholar${n}`,
      enabled: true,
      provider,
      model: (p && p.model) || "",
      configured: Boolean(p && p.configured),
    };
  });
}

// Scholar dossier metadata shown in the card hover panel is display-only and
// fully localized: specialties come from the locale pack
// (strings.scholarSpecialties), and the official English titles
// (config.identityTitles — "The Architect" …) are shown in every language.
// Future dossier fields (level, xp, responseCount, judgeScore, lastUsed)
// render as additional .chip-hover-row entries without touching the card face.

// Mirrors src/services/npcInteraction.js (no-import constraint). THE single
// definition of "this Scholar slot can take part", used both by the picker
// below and by the Omega click, so the two can never disagree about which
// Scholars a Council may start with.
function isScholarSlotReady(slot, provider) {
  if (!slot) return false;
  const providerEnabled =
    slot.providerEnabled ??
    (provider && provider.enabled !== undefined ? Boolean(provider.enabled) : Boolean(slot.configured));
  return Boolean(slot.ready ?? (providerEnabled && slot.configured));
}

function isCouncilEligibleSlot(slot, provider) {
  return isScholarSlotReady(slot, provider) && slot.enabled !== false;
}

function councilEligibleSlots() {
  const cfg = currentConfig;
  const providers = (cfg && cfg.providers) || {};
  return scholarSlotsFrom(cfg)
    .filter((s) => isCouncilEligibleSlot(s, providers[s?.provider]))
    .map((s) => Number(s.slot))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

// Mirrors src/services/scholarSelection.js (no-import constraint). Active
// selection is the PLAYER'S choice: a rebuild may only drop slots that can no
// longer run, never add ones the player didn't pick. `reset: true` (Reset
// only) discards the previous choice and takes the defaults.
function narrowToSingle(slots) {
  const list = [...slots].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return list.length ? [list[0]] : [];
}

function resolveScholarSelection({ mode, previous = [], ready = [], eligible = [], reset = false }) {
  const readySet = new Set(ready.filter((n) => Number.isFinite(n)));
  const defaults = eligible.filter((n) => readySet.has(n));
  let next = reset ? [] : previous.filter((n) => readySet.has(n));
  if (next.length === 0) next = [...defaults];
  if (next.length === 0 && readySet.size > 0) next = [Math.min(...readySet)];
  if (mode === "single") next = narrowToSingle(next);
  return [...new Set(next)].sort((a, b) => a - b);
}

// `reset: true` is passed ONLY by unlockSessionConfig() (Reset), where
// returning to defaults is the intent. Every other rebuild — notably
// loadStatus() after a Settings save or a Model Pre-check — preserves what
// the player selected.
function buildScholarPicker(cfg, { reset = false } = {}) {
  const previousSelection = [...selectedSlots];
  const readySlots = [];
  const eligibleSlots = [];
  els.scholarPicker.innerHTML = "";
  selectedSlots.clear();

  for (const slot of scholarSlotsFrom(cfg)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "scholar-chip";
    chip.dataset.slot = String(slot.slot);
    const provider = cfg.providers[slot.provider];
    // A slot is startable only when its provider is enabled AND has a key. Use
    // the backend's restored enable state; if that field is absent (partial
    // config) fall back to the provider's configured state, never to false.
    const providerEnabled =
      slot.providerEnabled ??
      (provider && provider.enabled !== undefined ? Boolean(provider.enabled) : Boolean(slot.configured));
    const ready = isScholarSlotReady(slot, provider);
    // Vendor display name from the configured provider ("OpenAI / GPT" →
    // "OpenAI") — always the live Settings values, never hardcoded.
    const vendor = provider ? (provider.label || "").split(" / ")[0] || provider.short : slot.provider;
    let tagText;
    if (!providerEnabled) tagText = str("chipDisabled");
    else if (!slot.configured) tagText = str("chipNoKey");
    else tagText = `${vendor} · ${slot.model}`;
    const name = cfg.identity?.scholars?.[slot.slot] || strT("scholarSlotLabel", { n: slot.slot });
    // Compact card face: check indicator + codename (uppercased in CSS) +
    // vendor·model. The hover panel carries the dossier — the localized name
    // ("The Architect"; CJK identity names stand alone) with the official
    // English title underneath when they differ, then provider, model,
    // status, specialty.
    const fullName = /^[A-Za-z]/.test(name) ? `The ${name}` : name;
    const enName = cfg.identityTitles?.scholars?.[slot.slot];
    const enTitle = enName && enName !== name ? `The ${enName}` : "";
    const specialty = cfg.strings?.scholarSpecialties?.[slot.slot] || "";
    const status = !providerEnabled
      ? str("statusProviderDisabled")
      : !slot.configured
        ? str("chipStatusNoKey")
        : str("chipStatusReady");
    chip.innerHTML =
      `<span class="chip-check" aria-hidden="true"></span>` +
      `<span class="chip-name">${name}</span>` +
      `<span class="chip-tag">${tagText}</span>` +
      `<span class="chip-hover" aria-hidden="true">` +
        `<span class="chip-hover-title">${fullName}</span>` +
        (enTitle ? `<span class="chip-hover-en">${enTitle}</span>` : "") +
        `<span class="chip-hover-row"><b>${str("provider")}</b><span>${vendor}</span></span>` +
        `<span class="chip-hover-row"><b>${str("model")}</b><span>${slot.model || "—"}</span></span>` +
        `<span class="chip-hover-row"><b>${str("status")}</b><span>${status}</span></span>` +
        (specialty ? `<span class="chip-hover-row"><b>${str("specialty")}</b><span>${specialty}</span></span>` : "") +
      `</span>`;
    if (!ready) {
      chip.disabled = true;
      chip.title = !providerEnabled ? str("chipTitleDisabled") : str("chipTitleNoKey");
    } else {
      // Readiness/eligibility are collected, never applied as selection here
      // — that decision belongs to resolveScholarSelection() below, once
      // every slot is known.
      readySlots.push(slot.slot);
      // Council's DEFAULT set (see applyCouncilEligibleSelection, which
      // reuses the same predicate) — used only when there is no prior choice.
      if (isCouncilEligibleSlot(slot, provider)) eligibleSlots.push(slot.slot);
    }
    chip.setAttribute("aria-pressed", chip.classList.contains("is-on") ? "true" : "false");
    chip.addEventListener("click", () => toggleScholar(slot.slot));
    const hoverEl = chip.querySelector(".chip-hover");
    chip.addEventListener("mouseenter", () => showChipHover(chip, hoverEl));
    chip.addEventListener("mouseleave", hideChipHover);
    chip.addEventListener("focus", () => showChipHover(chip, hoverEl));
    chip.addEventListener("blur", hideChipHover);
    els.scholarPicker.appendChild(chip);
  }
  // The player's selection, honoured across this rebuild. Mentor's
  // exactly-one rule is applied here too, so a Settings save can no longer
  // leave Mentor mode showing three selected Scholars until the next
  // setMode() happens to narrow it.
  for (const slot of resolveScholarSelection({
    mode: selectedMode,
    previous: previousSelection,
    ready: readySlots,
    eligible: eligibleSlots,
    reset,
  })) {
    selectedSlots.add(slot);
  }
  // syncScholarChips() is the single place chip visuals are derived from
  // selectedSlots, so the cards and the state cannot disagree.
  syncScholarChips();
  // Defensive: this rebuild can run WHILE a Session is already locked (e.g.
  // Settings saved a change that didn't need the reset-and-apply gate, which
  // still refreshes config via loadStatus() -> buildScholarPicker()). Without
  // this, the freshly built chips would come back fully interactive mid-
  // Session even though sessionConfigLocked never changed.
  applyScholarPickerLock();
}

// ------------------------------------------------------- Scholar hover card
// position: fixed (see style.css) means the dossier is never clipped by
// #interaction-workspace's own scroll, the discussion workspace, the
// divider, or #chat-panel's overflow:hidden — but it also means CSS alone
// can no longer anchor it, so this computes viewport-relative coordinates
// and flips above<->below / clamps left<->right so it always stays fully
// on screen, regardless of which edge the card is near.
let activeChipHover = null;

function positionChipHover(chip, hoverEl) {
  const margin = 8;
  const gap = 8;
  const chipRect = chip.getBoundingClientRect();
  // Reset any previous placement before measuring the popup's own natural
  // size — it's always laid out (position: fixed, just invisible via
  // opacity/visibility) so this is a safe, flicker-free read.
  hoverEl.style.left = "0px";
  hoverEl.style.top = "0px";
  const hoverRect = hoverEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceAbove = chipRect.top;
  const spaceBelow = vh - chipRect.bottom;
  const placeAbove = spaceAbove >= hoverRect.height + gap || spaceAbove >= spaceBelow;

  let top;
  if (placeAbove) {
    top = Math.max(margin, chipRect.top - hoverRect.height - gap);
  } else {
    top = chipRect.bottom + gap;
    if (top + hoverRect.height > vh - margin) top = Math.max(margin, vh - margin - hoverRect.height);
  }

  let left = chipRect.left;
  if (left + hoverRect.width > vw - margin) left = vw - margin - hoverRect.width;
  if (left < margin) left = margin;

  hoverEl.style.top = `${top}px`;
  hoverEl.style.left = `${left}px`;
  hoverEl.dataset.placement = placeAbove ? "above" : "below";
}

function showChipHover(chip, hoverEl) {
  positionChipHover(chip, hoverEl);
  hoverEl.classList.add("is-visible");
  activeChipHover = hoverEl;
}

function hideChipHover() {
  if (activeChipHover) activeChipHover.classList.remove("is-visible");
  activeChipHover = null;
}

// A stale position (computed for the card's spot at hover-start) would
// otherwise float free of the card once the page scrolls or the viewport
// resizes — simplest correct fix is to just close it; the next hover
// re-measures fresh. capture: true because scroll doesn't bubble.
window.addEventListener("scroll", hideChipHover, true);
window.addEventListener("resize", hideChipHover);

function toggleScholar(slot) {
  const chip = els.scholarPicker.querySelector(`.scholar-chip[data-slot="${slot}"]`);
  if (!chip || chip.disabled) return;

  if (selectedMode === "single") {
    // Radio behavior: exactly one Scholar.
    selectedSlots.clear();
    selectedSlots.add(slot);
  } else {
    // Checkbox behavior, but never drop to zero enabled Scholars.
    if (selectedSlots.has(slot)) {
      if (selectedSlots.size > 1) selectedSlots.delete(slot);
    } else {
      selectedSlots.add(slot);
    }
  }
  syncScholarChips();
  // A Scholar being selected/deselected can change how many chips wrap onto
  // how many rows (see .scholar-picker), which changes .ask-controls'
  // measured height — reclamp so the divider floor stays accurate (see
  // measureInteractionFloor()) instead of trusting a now-stale measurement.
  reclampWorkspaceSplit();
}

function syncScholarChips() {
  for (const chip of els.scholarPicker.querySelectorAll(".scholar-chip")) {
    const on = selectedSlots.has(Number(chip.dataset.slot));
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function setMode(mode) {
  selectedMode = mode === "single" ? "single" : "council";
  for (const btn of els.modeToggle.querySelectorAll(".mode-btn")) {
    const active = btn.dataset.mode === selectedMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", active ? "true" : "false");
    // Defensive, same reasoning as buildScholarPicker()'s applyScholarPickerLock()
    // call: setMode() can run while still locked (e.g. restoreSession()).
    btn.disabled = sessionConfigLocked;
    btn.title = sessionConfigLocked ? str("sessionLockedHint") : "";
  }
  els.scholarPicker.classList.toggle("single-mode", selectedMode === "single");

  // Single mode keeps at most one Scholar selected.
  if (selectedMode === "single" && selectedSlots.size > 1) {
    const first = Math.min(...selectedSlots);
    selectedSlots.clear();
    selectedSlots.add(first);
  }
  syncScholarChips();
  // While a Symposium is already underway (sessionConfigLocked), Mode/Scholar
  // edits here only prepare the *next* run — the persistent input's Send
  // label/placeholder must keep reflecting the ongoing follow-up, not this
  // picker change (see lockSessionConfig()).
  if (!sessionConfigLocked) {
    applyRunButtonLabel(); // respects a live Stop/Stopping label
    // The composer invites differently per mode: Council presents a question
    // to the council, Mentor asks one Scholar directly.
    els.question.placeholder = str(selectedMode === "single" ? "askPlaceholderMentor" : "askPlaceholderCouncil");
  }
  // Switching Mode toggles .single-mode on the Scholar picker (radio-style
  // layout vs. checkbox grid) and can change which/how many chips are
  // selected — either can change .ask-controls' measured height, so the
  // divider floor needs a fresh measurement (see measureInteractionFloor()).
  reclampWorkspaceSplit();
}

// The "Use Vault" Session option's hover text follows its live state:
// locked (a Session is underway) shows the same unlock hint as Mode/Scholar;
// otherwise checked/unchecked each explain what the NEXT run will do.
function updateUseVaultHint() {
  const hint = sessionConfigLocked
    ? str("sessionLockedHint")
    : str(els.useVaultToggle.checked ? "useVaultOnHint" : "useVaultOffHint");
  els.useVaultWrap.title = hint;
  els.useVaultToggle.setAttribute("aria-label", `${str("useVaultLabel")} — ${hint}`);
}

// ------------------------------------------- composer / session materials
// Everything the user attaches to the next Session: pasted screenshots,
// uploaded files, dropped files, and URLs. Materials are temporary — they
// travel with the run request and are never written to the Vault.

// Supported attachment kinds, keyed by file extension. Adding a future format
// (docx, pptx, xlsx, …) = one extension here + one extractor entry in the
// backend registry (src/services/materials.js). No other logic changes.
const ATTACHMENT_KINDS = [
  { kind: "image", icon: "🖼", exts: ["png", "jpg", "jpeg", "webp", "gif"] },
  { kind: "document", icon: "📄", exts: ["pdf", "md", "txt"] },
  // Code files: same document pipeline, fenced in the prompt so formatting
  // survives verbatim. The backend registry carries the matching extractors.
  {
    kind: "document",
    icon: "💻",
    exts: ["py", "js", "ts", "tsx", "jsx", "cpp", "h", "cs", "java", "go", "rs",
           "json", "yaml", "yml", "xml", "html", "css", "sql"],
  },
];
const URL_ICON = "🌐";
// "Continue Discussion" (Archives detail action) — a previous-discussion
// material is never produced by ATTACHMENT_KINDS' file-extension lookup
// (it comes from archiveContinuationText(), not a user-picked file), so it
// gets its own icon constant here, the same way URL_ICON does for webpages.
const ARCHIVE_ICON = "↩";
const MAX_ATTACHMENTS = 8;

let sessionMaterials = []; // { id, kind, name, status: loading|ready|error, icon, ... }
let materialIdSeq = 0;

function attachmentDefFor(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const byExt = ATTACHMENT_KINDS.find((d) => d.exts.includes(ext));
  if (byExt) return byExt;
  // Pasted screenshots arrive as generic clipboard files: trust the MIME type.
  if ((file.type || "").startsWith("image/")) return ATTACHMENT_KINDS[0];
  return null;
}

function acceptAttribute() {
  return ATTACHMENT_KINDS.flatMap((d) => d.exts.map((e) => `.${e}`)).join(",");
}

function renderAttachments() {
  els.attachmentList.innerHTML = "";
  els.attachmentList.hidden = sessionMaterials.length === 0;
  for (const m of sessionMaterials) {
    const chip = document.createElement("span");
    chip.className = `attachment-chip is-${m.status}${m.kind === "archive" ? " is-archive" : ""}`;
    const label = document.createElement("span");
    label.className = "chip-label";
    // A previous-discussion chip's label is a LOCALIZED template (unlike
    // every other kind's ready-state label, which is language-agnostic
    // content — a filename or a page title) — computed fresh here, every
    // render, from the archive's own raw title, rather than baked in once
    // at attach time, so an Interface Language switch updates it too (see
    // handleInterfaceLanguageChanged()'s renderAttachments() call).
    const chipText = m.kind === "archive" ? strT("previousDiscussionLabel", { title: m.title }) : m.label;
    label.textContent = `${m.icon} ${chipText}`;
    label.title = m.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", strT("removeAttachment", { name: m.name }));
    remove.addEventListener("click", () => removeAttachment(m.id));
    chip.append(label, remove);
    els.attachmentList.appendChild(chip);
  }
  // Showing/hiding/growing this row changes the composer's real rendered
  // height (see measureInteractionFloor()) exactly like the Scholar picker
  // or Quick Questions expanding do — reclamp the split the same way those
  // call sites already do, on every add, remove, clear, and restore-after-
  // failure (all of them funnel through this one function).
  reclampWorkspaceSplit();
}

function removeAttachment(id) {
  sessionMaterials = sessionMaterials.filter((m) => m.id !== id);
  renderAttachments();
}

function clearAttachments() {
  sessionMaterials = [];
  renderAttachments();
}

function anyAttachmentLoading() {
  return sessionMaterials.some((m) => m.status === "loading");
}

function pushMaterial(material) {
  if (sessionMaterials.length >= MAX_ATTACHMENTS) return null;
  const entry = { id: ++materialIdSeq, ...material };
  sessionMaterials.push(entry);
  renderAttachments();
  return entry;
}

function settleMaterial(entry, patch) {
  if (!sessionMaterials.includes(entry)) return; // removed while loading
  Object.assign(entry, patch);
  renderAttachments();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function addFileAttachment(file) {
  const def = attachmentDefFor(file);
  if (!def) {
    els.librarianStatus.textContent = str("attachmentUnsupported").replace("{name}", file.name);
    return;
  }
  const entry = pushMaterial({
    kind: def.kind,
    icon: def.icon,
    name: file.name,
    label: strT("statusUploadingFile", { name: file.name }),
    status: "loading",
  });
  if (!entry) return;

  try {
    const data = await readFileAsBase64(file);
    if (def.kind === "image") {
      settleMaterial(entry, {
        status: "ready",
        label: file.name,
        mediaType: file.type || "image/png",
        data,
      });
    } else {
      // Documents are extracted server-side so every format shares one path.
      // The chip narrates the phase change: uploading (local read above) →
      // extracting (server-side text extraction). Extraction happens ONCE
      // here — the run and any Scholar retries reuse the extracted text.
      settleMaterial(entry, { label: strT("statusExtractingDocument", { name: file.name }) });
      const extracted = await api("/api/materials/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data }),
      });
      settleMaterial(entry, {
        status: "ready",
        label: file.name,
        text: extracted.text,
        language: extracted.language || null,
      });
    }
  } catch (err) {
    settleMaterial(entry, { status: "error", label: `${file.name} — ${err.message}` });
  }
}

async function addUrlAttachment(url) {
  const entry = pushMaterial({
    kind: "webpage",
    icon: URL_ICON,
    name: url,
    label: str("attachmentFetchingUrl"),
    status: "loading",
  });
  if (!entry) return;
  try {
    const page = await api("/api/materials/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    settleMaterial(entry, {
      status: "ready",
      label: page.title || url,
      title: page.title,
      url: page.url,
      text: page.text,
    });
  } catch (err) {
    settleMaterial(entry, { status: "error", label: `${url} — ${err.message}` });
  }
}

// The run request's unified materials list (ready materials only).
function materialsPayload() {
  return sessionMaterials
    .filter((m) => m.status === "ready")
    .map((m) =>
      m.kind === "image"
        ? { kind: "image", name: m.name, mediaType: m.mediaType, data: m.data }
        : m.kind === "webpage"
          ? { kind: "webpage", name: m.title || m.url, url: m.url, text: m.text }
          : m.kind === "archive"
            ? { kind: "archive", name: m.name, text: m.text }
            : { kind: "document", name: m.name, text: m.text, language: m.language || null }
    );
}

// Archive Discussion Threads lineage: derived fresh from whatever archive-
// kind material is still attached, at submit time — never tracked as its own
// piece of state. Removing the previous-discussion chip (removeAttachment())
// therefore also removes the lineage automatically, with nothing left over
// for Reset to have to clean up. At most one: continueDiscussion() replaces
// rather than accumulates archive-kind materials, so this can never be
// ambiguous. Returns null when no previous-discussion chip is attached (a
// brand-new session, or one where the chip was removed before submitting).
function continuationLineage() {
  const source = sessionMaterials.find((m) => m.kind === "archive" && m.status === "ready");
  if (!source) return null;
  return { sourceSessionId: source.sourceSessionId, sourceThreadId: source.sourceThreadId };
}

// Client-side mirror of the server's materialsMetadata() (src/services/
// materials.js): the persisted per-turn shape {kind, name, url?, preview?},
// including the same image-size cap, so a just-sent follow-up renders its
// chips identically to one restored after a reload.
const MAX_PREVIEW_IMAGE_BASE64_CHARS = 2_000_000;
function turnMetadataFromMaterials(materials) {
  return materials.map((m) => {
    let preview = null;
    if (m.kind === "image" && typeof m.data === "string" && m.data.length <= MAX_PREVIEW_IMAGE_BASE64_CHARS) {
      preview = { mediaType: m.mediaType, data: m.data };
    } else if ((m.kind === "document" || m.kind === "webpage" || m.kind === "archive") && m.text) {
      preview = { text: m.text, ...(m.kind === "document" && m.language ? { language: m.language } : {}) };
    }
    return { kind: m.kind, name: m.name, ...(m.url ? { url: m.url } : {}), ...(preview ? { preview } : {}) };
  });
}

function initComposer() {
  els.attachInput.accept = acceptAttribute();
  els.attachBtn.addEventListener("click", () => els.attachInput.click());
  els.attachInput.addEventListener("change", () => {
    for (const file of els.attachInput.files) addFileAttachment(file);
    els.attachInput.value = "";
  });

  // Ctrl+V: clipboard images become attachments; a pasted bare URL becomes a
  // webpage attachment instead of composer text.
  els.question.addEventListener("paste", (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const files = [...dt.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length > 0) {
      e.preventDefault();
      for (const file of files) addFileAttachment(file);
      return;
    }
    const text = (dt.getData("text/plain") || "").trim();
    if (/^https?:\/\/\S+$/.test(text)) {
      e.preventDefault();
      addUrlAttachment(text);
    }
  });

  // Drag & drop anywhere on the composer.
  els.composer.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.composer.classList.add("drag-over");
  });
  els.composer.addEventListener("dragleave", () => els.composer.classList.remove("drag-over"));
  els.composer.addEventListener("drop", (e) => {
    e.preventDefault();
    els.composer.classList.remove("drag-over");
    for (const file of e.dataTransfer?.files || []) addFileAttachment(file);
  });
}

// ------------------------------------------------------------- the session
// One active Session at a time. sessionState mirrors the backend Session and
// drives the header, tabs, and chat. Starting a run replaces it; Reset clears
// it. The tabAnswers map holds what each tab renders.

let sessionState = null;
let tabAnswers = {}; // tabId -> { kind: "summary"|"scholar", slot?, status, text, error }
let activeTab = null;
let chatBusy = false;
// Latched when the server is known to have lost the Session this page shows —
// the third term in chatReady(), and the one whose absence left a dead
// follow-up composer enabled. Declared HERE, beside the state it qualifies,
// rather than next to the recovery block further down: chatReady() reads it,
// and a `let` initialised after its first reader would be a temporal-dead-zone
// ReferenceError. Cleared only by Reset or a new run — see hideSessionLost().
let sessionLost = false;

// ------------------------------------------------------- run progress stage
// Which stage the in-flight run has reached, advanced by the stream events in
// handleEvent(): "preparing" (submitted, context package being built) →
// "scholars" (librarian resolved, Scholars answering) → "judge" (every
// Scholar settled, the Grand Sage is synthesizing; council only). null when
// no run is in flight. Drives the localized progress message the Grand Sage
// panel / empty state shows while an entry is still "loading" — the user's
// question itself must NEVER stand in for a pending answer.
let runStage = null;
let runScholarsExpected = 0;
let runScholarsSettled = 0;
// When the run entered the "judge" stage — after LONG_ANALYSIS_MS in it, the
// progress message upgrades to "Long analysis in progress…" (see the ticker
// below renderActiveTab()).
let judgeStageSince = null;
const LONG_ANALYSIS_MS = 90_000;
// True from validation in startSessionRun() until its finally — blocks a
// duplicate submission racing in before the Session lock takes over.
let runInFlight = false;

// ------------------------------------------------------- runtime run controls
// The ONE persistent composer button is Send when idle and Stop while a run
// is working — so its label/appearance is driven by a mode rather than being
// written directly, and every place that re-localizes the composer re-applies
// the CURRENT mode instead of forcing "Send" back on top of a live Stop.
//
//   send     — idle (or a follow-up chat, which Stop does not govern)
//   stop     — a run is in flight; the button is red and cancels it
//   stopping — cancellation requested; disabled until the run settles
const RUN_BUTTON_MODES = ["send", "stop", "stopping"];
let runButtonMode = "send";
// The run this page is currently showing controls for — the id the failure
// decision is submitted against, so a decision can never be applied to a
// newer run than the one the player was actually looking at.
let currentRunId = null;
// One in-flight POST /api/session/stop at a time: a click-storm on Stop must
// produce exactly one request (the mode flip to "stopping" already disables
// the button, this guards the programmatic paths too).
let stopRequestInFlight = false;
// Names of the Scholars the failure gate reported for THIS run, kept so the
// terminal message can say which model the discussion continued without.
let lastFailureNames = null;

function setRunButtonMode(mode) {
  runButtonMode = RUN_BUTTON_MODES.includes(mode) ? mode : "send";
  applyRunButtonLabel();
}

// Re-applies the button's label/appearance for the current mode. Called by
// setRunButtonMode and by every language/picker refresh that used to write
// str("send") directly (which would otherwise wipe a live Stop label).
function applyRunButtonLabel() {
  els.run.classList.toggle("is-stop", runButtonMode !== "send");
  if (runButtonMode === "stop") {
    els.run.textContent = str("stopGeneration");
    els.run.disabled = false; // Stop must always be pressable while it shows
    els.run.title = str("stopGenerationHint");
  } else if (runButtonMode === "stopping") {
    els.run.textContent = str("stopping");
    els.run.disabled = true;
    els.run.title = "";
  } else {
    els.run.textContent = sessionConfigLocked && chatBusy ? str("sending") : str("send");
    els.run.title = "";
  }
}

// Stop Generation. Idempotent from the client's side too: the mode flips to
// "stopping" immediately (so the button can't be pressed again) and only one
// request is ever in flight. Never touches the discussion content — Stop is
// not Reset.
async function requestStopRun() {
  if (stopRequestInFlight || runButtonMode !== "stop") return;
  stopRequestInFlight = true;
  setRunButtonMode("stopping");
  // Stopping while the failure gate is open closes it: the server treats a
  // Stop as the decision, so leaving the modal up would invite a second one.
  closeFailureDecision();
  try {
    await api("/api/session/stop", { method: "POST" });
  } catch (err) {
    // The run settles on its own regardless; a failed stop request must never
    // strand the UI in "Stopping…".
    console.debug("[run] stop request failed", err);
  } finally {
    stopRequestInFlight = false;
  }
}

// True while Settings → Council Model Check's manual "Check Models Now" is
// in flight — guards against a duplicate click starting a second parallel
// check (see runManualCouncilCheck()).
let councilManualCheckInFlight = false;

// The localized message for a pending Grand Sage panel / the discussion empty
// state. Mentor (single) mode has no council stages, so it keeps the plain
// "waiting" text.
function runProgressMessage() {
  if (sessionState?.mode !== "council") return str("waiting");
  if (runStage === "judge") {
    return judgeStageSince && Date.now() - judgeStageSince > LONG_ANALYSIS_MS
      ? str("statusLongAnalysis")
      : str("progressJudge");
  }
  if (runStage === "scholars") return str("progressScholars");
  if (runStage === "preparing") return str("progressPreparing");
  return str("waiting");
}

// Re-renders every surface that shows the progress message, called on each
// stage transition. Only "loading" entries re-render — never a real answer.
function refreshRunProgressUI() {
  refreshDiscussionEmptyText();
  if (tabAnswers[activeTab]?.status === "loading") renderActiveTab();
}

// English fallback only — the displayed set comes from the backend's localized
// string pack (config.strings.judgeQuickActions).
const JUDGE_QUICK_ACTIONS = [
  { icon: "🏆", text: "Who gave the best answer?" },
  { icon: "⚖", text: "Compare all scholars" },
  { icon: "🧠", text: "Explain for beginners" },
  { icon: "📚", text: "Merge the best ideas" },
  { icon: "🔍", text: "Challenge your own conclusion" },
  { icon: "⭐", text: "Rate each scholar" },
  { icon: "📖", text: "What did each scholar contribute?" },
  { icon: "🎯", text: "Which answer is the most accurate?" },
  { icon: "💡", text: "Which explanation is easiest to understand?" },
  { icon: "🔬", text: "What evidence supports your conclusion?" },
];

function judgeQuickActions() {
  const localized = currentConfig?.strings?.judgeQuickActions;
  return Array.isArray(localized) && localized.length ? localized : JUDGE_QUICK_ACTIONS;
}

// Builds the tab bar for a run. Council: Summary + one tab per participating
// Scholar. Single: only the one Scholar tab (no Summary).
function buildTabs(mode, slots) {
  els.tabs.innerHTML = "";
  tabAnswers = {};
  activeTab = null;

  const tabDefs = [];
  if (mode === "council") {
    tabDefs.push({ id: "summary", label: judgePersonaName(), kind: "summary" });
  }
  for (const slot of slots) {
    tabDefs.push({ id: `scholar${slot}`, label: personaFor(slot), kind: "scholar", slot });
  }

  for (const def of tabDefs) {
    // stage: null → "receiving" (first tokens) → "long" (ticker, 90s+);
    // loadingSince feeds the long-analysis upgrade for THIS entry.
    tabAnswers[def.id] = { kind: def.kind, slot: def.slot, status: "loading", stage: null, loadingSince: Date.now(), text: "", error: null };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.dataset.tab = def.id;
    btn.setAttribute("role", "tab");
    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = def.label;
    const status = document.createElement("span");
    status.className = "tab-status";
    status.setAttribute("aria-hidden", "true");
    btn.append(label, status);
    btn.addEventListener("click", () => activateTab(def.id));
    els.tabs.appendChild(btn);
  }

  syncTabStatuses();
  activateTab(tabDefs[0].id);
}

// Reflects each tab's own run state on its button (glyph + tooltip) so a
// single failed or still-thinking Scholar is visible without opening its
// tab. Reads only tabAnswers — call after any entry's status changes.
// "stopped" is its own state, never "error": a Scholar the user cancelled
// did not fail (see scholarDisplayState in src/services/runPresentation.js).
const TAB_STATUS_GLYPHS = { loading: "⏳", ok: "✓", error: "⚠", stopped: "⏹" };
function syncTabStatuses() {
  for (const btn of els.tabs.querySelectorAll(".tab")) {
    const entry = tabAnswers[btn.dataset.tab];
    const glyph = btn.querySelector(".tab-status");
    if (!entry || !glyph) continue;
    glyph.textContent = TAB_STATUS_GLYPHS[entry.status] || "";
    glyph.classList.toggle("is-loading", entry.status === "loading");
    btn.title =
      entry.status === "ok"
        ? str("statusTabCompleted")
        : entry.status === "error"
          ? str("statusTabFailed")
          : entry.status === "stopped"
            ? str("statusTabStopped")
            : entry.kind === "summary"
            ? str("statusTabWaiting")
            : str("statusTabThinking");
  }
}

function activateTab(tabId) {
  if (!tabAnswers[tabId]) return;
  activeTab = tabId;
  for (const btn of els.tabs.querySelectorAll(".tab")) {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  }
  // Session Summary auto-collapses after the first follow-up (see
  // sendChat()) by setting .answer-wrap to display:none — that hides
  // #tab-content for EVERY tab, not just Grand Sage's, since it's the one
  // rendering surface all tabs share. Selecting a tab is an explicit request
  // to view it, so it must re-expand; otherwise a Scholar tab keeps updating
  // activeTab/renderActiveTab() correctly underneath while looking dead
  // because its content pane is invisible.
  if (!sessionSummaryExpanded) setSessionSummaryExpanded(true);
  renderActiveTab();
  // A SECOND, independent way the same content can be correctly rendered yet
  // invisible: sendChat() parks #discussion-workspace's scroll position at
  // the bottom after every follow-up (to show the newest reply), and never
  // moves it back. Once enough follow-ups accumulate real scroll overflow,
  // that leaves #session-summary/#tab-content sitting entirely ABOVE the
  // visible viewport — confirmed live (getBoundingClientRect().top went
  // negative after a few follow-up rounds) — while #chat-log fills the
  // whole visible area, so the screen appears to "stay on the Grand Sage
  // conversation" no matter which tab is clicked, even though activeTab and
  // #tab-content's innerHTML are both already correct underneath. Selecting
  // a tab must always scroll its content into view, not just render it.
  els.sessionSummary.section.scrollIntoView({ block: "start" });
}

// Future portrait interaction hook: clicking a Scholar portrait will call this
// to jump to that Scholar's tab. Portraits are not implemented yet.
function switchToScholarTab(slot) {
  activateTab(`scholar${slot}`);
}

function renderActiveTab() {
  const entry = tabAnswers[activeTab];
  if (!entry) {
    setPanel(els.tabContent, "—");
    updateCopyButton();
    return;
  }
  if (entry.status === "ok") {
    setPanel(els.tabContent, entry.text, "ok");
    // A Scholar retry landed after this ruling was written: offer to
    // regenerate it from the updated answers (requirement: retry reruns only
    // the Scholar; the ruling is regenerated separately, on request).
    if (entry.kind === "summary" && sessionState?.judgeStale) appendRegenerateRulingAction();
  } else if (entry.status === "error") {
    setPanel(els.tabContent, `⚠ ${entry.error}`, "error");
    // A failed Scholar never invalidates the Council session: the panel offers
    // per-scholar recovery while every completed answer stays intact.
    appendScholarRetryActions(entry);
  } else if (entry.status === "stopped") {
    // The user stopped this run. Deliberately NO retry/change-model actions:
    // nothing suggests the model was at fault, because it was not.
    setPanel(els.tabContent, str("scholarStopped"));
  }
  // Pending: a localized progress state, NEVER any echo of the question.
  // The Grand Sage panel follows the run's stage; a Scholar tab reports its
  // own request phase (waiting → receiving → long analysis).
  else if (entry.kind === "summary") setPanel(els.tabContent, runProgressMessage(), "loading");
  else setPanel(els.tabContent, scholarLoadingText(entry), "loading");
  updateCopyButton();
}

function scholarLoadingText(entry) {
  if (entry.stage === "long") return str("statusLongAnalysis");
  if (entry.stage === "receiving") return str("statusReceivingResponse");
  return str("statusWaitingProvider");
}

// Upgrades any request that has been running LONG_ANALYSIS_MS+ to the "long
// analysis" message — purely presentational; the real deadlines live in the
// server's timeout profiles. One cheap always-on ticker instead of per-run
// timer lifecycles.
setInterval(() => {
  let repaintActive = false;
  for (const [id, entry] of Object.entries(tabAnswers)) {
    if (
      entry.kind === "scholar" &&
      entry.status === "loading" &&
      entry.stage !== "long" &&
      entry.loadingSince &&
      Date.now() - entry.loadingSince > LONG_ANALYSIS_MS
    ) {
      entry.stage = "long";
      if (id === activeTab) repaintActive = true;
    }
  }
  if (runStage === "judge" && judgeStageSince && Date.now() - judgeStageSince > LONG_ANALYSIS_MS) {
    refreshDiscussionEmptyText();
    if (tabAnswers[activeTab]?.kind === "summary" && tabAnswers[activeTab].status === "loading") repaintActive = true;
  }
  if (repaintActive) renderActiveTab();
}, 10_000);

// ------------------------------------------------- failed-scholar recovery
// One failed/timed-out Scholar never invalidates the run: every completed
// answer is preserved, the Judge already ruled with whoever answered, and
// the failed Scholar's own tab offers [Retry] [Change model & retry]
// [Continue with available Scholars]. Retry re-runs ONLY that Scholar
// (POST /api/session/scholar/:slot/retry — the server reuses the session's
// cached context package, so materials are never re-parsed or re-sent).

function retryActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "retry-action-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// Appended below the error text in a failed Scholar tab. Only offered while
// the failed Session is still the active one (a restored/archived record
// has no run to retry into).
function appendScholarRetryActions(entry) {
  if (entry.kind !== "scholar" || !sessionState?.id || entry.retryBusy) return;
  const row = document.createElement("div");
  row.className = "scholar-retry-actions";
  row.appendChild(retryActionButton(str("retryScholarAction"), () => startScholarRetry(entry, {})));
  row.appendChild(retryActionButton(str("retryChangeModelAction"), () => toggleChangeModelForm(entry, row)));
  if (sessionState.mode === "council" && tabAnswers.summary) {
    // "Continue with available Scholars": the run already did — this simply
    // returns to the ruling built from whoever answered.
    row.appendChild(retryActionButton(str("continueAvailableAction"), () => activateTab("summary")));
  }
  els.tabContent.appendChild(row);
}

// Inline provider+model picker for "Change model & retry". Providers come
// from the live config (configured ones only); models from the same curated
// GET /api/models/:provider list Settings uses.
async function toggleChangeModelForm(entry, row) {
  const existing = row.querySelector(".retry-model-form");
  if (existing) {
    existing.remove();
    return;
  }
  const form = document.createElement("span");
  form.className = "retry-model-form";
  const provSel = document.createElement("select");
  for (const [id, p] of Object.entries(currentConfig?.providers || {})) {
    if (!p.configured || !p.enabled) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = p.label || id;
    provSel.appendChild(opt);
  }
  const failed = sessionState?.scholars?.[`scholar${entry.slot}`];
  if (failed?.provider && [...provSel.options].some((o) => o.value === failed.provider)) {
    provSel.value = failed.provider;
  }
  const modelSel = document.createElement("select");
  const fillModels = async () => {
    modelSel.innerHTML = "";
    const loading = document.createElement("option");
    loading.textContent = "…";
    modelSel.appendChild(loading);
    try {
      const data = await api(`/api/models/${encodeURIComponent(provSel.value)}`);
      modelSel.innerHTML = "";
      for (const id of data.models || []) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        modelSel.appendChild(opt);
      }
      const preferred = failed?.provider === provSel.value ? failed.model : currentConfig?.providers?.[provSel.value]?.model;
      if (preferred && [...modelSel.options].some((o) => o.value === preferred)) modelSel.value = preferred;
    } catch (err) {
      modelSel.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = `⚠ ${friendlyErrorMessage(err)}`;
      modelSel.appendChild(opt);
    }
  };
  provSel.addEventListener("change", fillModels);
  const go = retryActionButton(str("retryChangeModelGo"), () => {
    if (!provSel.value || !modelSel.value) return;
    startScholarRetry(entry, { provider: provSel.value, model: modelSel.value });
  });
  form.append(provSel, modelSel, go);
  row.appendChild(form);
  await fillModels();
}

// Re-runs exactly one Scholar. The tab flips back to the live loading
// states (waiting → receiving via the long-analysis ticker only, since a
// retry is a single JSON response, not a stream) and lands as ok/error
// through the same updateScholarTab() path as a live run.
async function startScholarRetry(entry, overrides) {
  const key = `scholar${entry.slot}`;
  entry.retryBusy = true;
  Object.assign(entry, { status: "loading", stage: null, loadingSince: Date.now(), error: null });
  syncTabStatuses();
  if (activeTab === key) renderActiveTab();
  console.debug("[council] retrying scholar", { key, overrides });
  try {
    const data = await api(
      `/api/session/scholar/${entry.slot}/retry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides || {}),
      },
      CHAT_API_TIMEOUT_MS
    );
    entry.retryBusy = false;
    if (sessionState) sessionState.scholars[key] = data.scholar;
    updateScholarTab(key, data.scholar);
    if (data.scholar.status === "ok") {
      // The session may have just become usable for the first time (total
      // failure recovered) — restore the locked follow-up composer state.
      if (!sessionConfigLocked) lockSessionConfig();
      updateChatAvailability();
      renderSessionHeader();
      // The existing ruling predates this answer: offer regeneration.
      if (sessionState?.mode === "council" && sessionState.judge?.status === "ok") {
        sessionState.judgeStale = true;
        if (activeTab === "summary") renderActiveTab();
      }
    }
  } catch (err) {
    entry.retryBusy = false;
    console.error("[council] scholar retry failed:", err);
    Object.assign(entry, {
      status: "error",
      error: strT("retryFailedMsg", { error: friendlyErrorMessage(err) }),
    });
    syncTabStatuses();
    if (activeTab === key) renderActiveTab();
  }
}

// "Regenerate the ruling" on the summary tab, offered once a retried Scholar
// changed the answer set the current ruling was built from. Re-runs ONLY the
// Judge; Scholar answers are never touched.
function appendRegenerateRulingAction() {
  const row = document.createElement("div");
  row.className = "summary-regen-row";
  const note = document.createElement("span");
  note.className = "summary-regen-note";
  note.textContent = str("rulingStaleNotice");
  row.append(note, retryActionButton(str("regenerateRulingAction"), regenerateRuling));
  els.tabContent.appendChild(row);
}

async function regenerateRuling() {
  const entry = tabAnswers.summary;
  if (!entry || entry.status === "loading" || !sessionState) return;
  const previous = { status: entry.status, text: entry.text, error: entry.error };
  sessionState.judgeStale = false;
  runStage = "judge";
  judgeStageSince = Date.now();
  Object.assign(entry, { status: "loading", stage: null, loadingSince: Date.now() });
  syncTabStatuses();
  if (activeTab === "summary") renderActiveTab();
  try {
    const data = await api("/api/session/judge/regenerate", { method: "POST" }, CHAT_API_TIMEOUT_MS);
    if (sessionState) sessionState.judge = data.judge;
    updateSummaryTab(data.judge);
  } catch (err) {
    console.error("[council] ruling regeneration failed:", err);
    // Keep the previous ruling rather than replacing it with an error —
    // regeneration is optional; failing it must not destroy a valid ruling.
    Object.assign(entry, previous);
    if (sessionState) sessionState.judgeStale = true;
    syncTabStatuses();
    if (activeTab === "summary") renderActiveTab();
    setHeaderMsg(`⚠ ${friendlyErrorMessage(err)}`);
  } finally {
    runStage = null;
    judgeStageSince = null;
  }
}

// ------------------------------------------------------- copy raw markdown
// Copies the stored raw Markdown (never the rendered HTML) of the active
// answer tab or a chat reply.

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// Icon-only control: two overlapping sheets; a checkmark while flashing
// success. The localized label lives in the hover tooltip (title/aria-label).
const COPY_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function dressCopyButton(btn) {
  btn.innerHTML = COPY_ICON_SVG;
  btn.title = str("copy");
  btn.setAttribute("aria-label", str("copy"));
}

function flashCopied(btn) {
  btn.innerHTML = CHECK_ICON_SVG;
  btn.classList.add("is-copied");
  btn.title = str("copied");
  btn.disabled = true;
  setTimeout(() => {
    btn.classList.remove("is-copied");
    btn.disabled = false;
    dressCopyButton(btn);
  }, 1000);
}

// The panel button lives outside #tab-content (setPanel wipes its contents),
// shown only when the active tab holds a successful answer.
function updateCopyButton() {
  const entry = tabAnswers[activeTab];
  const available = Boolean(entry && entry.status === "ok" && entry.text);
  els.copyAnswer.hidden = !available;
  if (available && !els.copyAnswer.disabled) dressCopyButton(els.copyAnswer);
}

// Adds the small copy control to one assistant chat bubble, closing over the
// raw reply text.
function addBubbleCopy(bubble, rawText) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chat-copy";
  dressCopyButton(btn);
  btn.addEventListener("click", async () => {
    if (await copyTextToClipboard(rawText)) flashCopied(btn);
  });
  bubble.appendChild(btn);
}

// Localized headline for a classified timeout failure — the raw provider
// message rides along in parentheses so no detail is lost.
const TIMEOUT_CODE_STRINGS = {
  connection_timeout: "errorConnectionTimeout",
  inactivity_timeout: "errorInactivityTimeout",
  hard_task_timeout: "errorHardTaskTimeout",
  timeout: "errorTimeout",
};
function classifiedFailureText(result) {
  const key = TIMEOUT_CODE_STRINGS[result?.errorCode];
  return key ? `${str(key)} (${result.error})` : result.error || result.status;
}

function updateScholarTab(key, scholar) {
  const entry = tabAnswers[key];
  if (!entry) return;
  if (scholar.status === "ok") {
    Object.assign(entry, { status: "ok", text: scholar.answer, error: null });
    clearRuntimeUnavailable(scholar.provider, scholar.model);
  } else if (scholarDisplayState(scholar) === "stopped") {
    // User cancellation: never an error, and never evidence about the model —
    // it must not reach the unavailable-model memory or the retry affordances.
    Object.assign(entry, { status: "stopped", text: null, error: null });
  } else {
    let error = classifiedFailureText(scholar);
    // A timeout — even a hard one during a 600s file analysis — is NOT
    // evidence the model itself is unavailable: it never enters the 24-hour
    // bad-model memory. Only real provider responses can mark a model.
    if (!TIMEOUT_ERROR_CODES.has(scholar.errorCode) && looksLikeUnavailableModel(scholar.errorStatus, scholar.error)) {
      markModelUnavailable(scholar.provider, scholar.model);
      error = `${error} ${str("modelRemovedHint")}`;
    }
    Object.assign(entry, { status: "error", error });
  }
  if (activeTab === key) renderActiveTab();
  syncTabStatuses();
  maybeRevealSessionSummary();
}

function updateSummaryTab(judge) {
  const entry = tabAnswers.summary;
  if (!entry) return;
  if (judge && judge.status === "ok") {
    Object.assign(entry, { status: "ok", text: judge.answer, error: null });
    clearRuntimeUnavailable(judge.provider, judge.model);
  } else {
    let error = (judge && classifiedFailureText(judge)) || str("noRuling");
    // Same rule as the Scholars: a classified timeout never marks the model
    // unavailable (see updateScholarTab).
    if (judge && !TIMEOUT_ERROR_CODES.has(judge.errorCode) && looksLikeUnavailableModel(judge.errorStatus, judge.error)) {
      markModelUnavailable(judge.provider, judge.model);
      error = `${error} ${str("modelRemovedHint")}`;
    }
    Object.assign(entry, { status: "error", error });
  }
  if (activeTab === "summary") renderActiveTab();
  syncTabStatuses();
  maybeRevealSessionSummary();
}

// ---------------------------------------------------------- session header

// #session-msg is single-line + ellipsis-truncated (see .sh-save-msg,
// style.css) since a saved file's full path has no upper bound on length —
// this keeps the underlying text reachable as a native tooltip regardless of
// how much of it is visibly cut off.
function setHeaderMsg(text) {
  els.header.msg.textContent = text;
  els.header.msg.title = text;
}

function renderSessionHeader() {
  const s = sessionState;
  if (!s) return;
  const meta = s.metadata || {};
  els.header.question.textContent = s.question || "";
  // The INITIAL question's own attachments (never the follow-ups' — those
  // render on their chat turns). Rebuilt on every header render so language
  // changes refresh the chip tooltips too.
  els.header.attachments.innerHTML = "";
  const initialRow = renderTurnAttachments(s.attachments);
  els.header.attachments.hidden = !initialRow;
  if (initialRow) els.header.attachments.append(...initialRow.children);
  els.header.id.textContent = s.id || (s.status === "error" ? "—" : str("sessionStarting"));
  els.header.mode.textContent = modeLabel(meta.mode || s.mode);
  // Badge values display localized; class names keep the raw backend state.
  const status = meta.status || s.status || "active";
  els.header.status.textContent = currentConfig?.strings?.sessionStatusValues?.[status] || status;
  els.header.status.className = `badge status-${status}`;
  const vaultState = meta.vaultState || s.vault?.state || "unsaved";
  els.header.vault.textContent = currentConfig?.strings?.vaultStateValues?.[vaultState] || vaultState;
  els.header.vault.className = `badge vault-${vaultState}`;
  els.header.count.textContent = String(meta.scholarCount ?? Object.keys(s.scholars || {}).length);

  const saved = vaultState === "saved";
  els.header.save.textContent = saved ? str("saved") : str("saveToVault");
  // Hidden (not just disabled) until there's something worth saving — Save
  // to Vault must never appear before the Session has a valid answer.
  const hasAnswer = sessionHasValidAnswer();
  els.header.save.hidden = !hasAnswer;
  els.header.save.disabled = !hasAnswer;
  els.header.section.hidden = false;
  renderObsidianExportRow();
}

// -------------------------------------------------------------- session chat

// `attachments` (optional, user turns only) is the persisted per-turn
// metadata ({kind, name, url?, preview?}) — rendered as compact chips above
// the message text so the player can always see (and re-open) what a turn
// submitted. See renderTurnAttachments().
function appendChatBubble(role, text, attachments) {
  const bubble = document.createElement("div");
  bubble.className = `chat-msg chat-${role}`;
  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(text);
    addBubbleCopy(bubble, text);
  } else {
    bubble.textContent = text;
    prependTurnAttachments(bubble, attachments);
  }
  els.chat.log.appendChild(bubble);
  els.chat.log.hidden = false;
  els.chat.log.scrollTop = els.chat.log.scrollHeight;
  return bubble;
}

// ------------------------------------------------- turn attachment chips
// Compact, clickable chips for the attachments one user turn submitted —
// rendered from the PERSISTED per-turn metadata (sessionState.chat[n]
// .attachments / sessionState.attachments), never from temporary File
// objects, so they survive reloads, tab switches, and Archives. All text is
// set via textContent (never innerHTML), so filenames render escaped.

// Icon by kind, with documents split by extension the same way the composer
// splits them (ATTACHMENT_KINDS): code 💻, plain text/Markdown 📃, PDF and
// anything else 📄. The icon never stands alone — the filename is always the
// chip's visible text and its accessible label.
const CODE_FILE_EXTS = ATTACHMENT_KINDS[2].exts;
function turnAttachmentIcon(a) {
  if (a.kind === "image") return "🖼";
  if (a.kind === "webpage") return URL_ICON;
  if (a.kind === "archive") return ARCHIVE_ICON;
  const ext = (String(a.name || "").split(".").pop() || "").toLowerCase();
  if (CODE_FILE_EXTS.includes(ext)) return "💻";
  if (ext === "md" || ext === "txt") return "📃";
  return "📄";
}

// Builds the chip row for one turn's attachments, or null when there are
// none. Chips wrap within the bubble (flex-wrap, see style.css) and never
// widen it — long filenames ellipsize.
function renderTurnAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;
  const row = document.createElement("div");
  row.className = "turn-attachments";
  for (const a of attachments) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "turn-attachment-chip";
    const label = strT("attachmentChipLabel", { name: a.name || "" });
    chip.title = label;
    chip.setAttribute("aria-label", label);
    const icon = document.createElement("span");
    icon.className = "turn-attachment-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = turnAttachmentIcon(a);
    const name = document.createElement("span");
    name.className = "turn-attachment-name";
    name.textContent = a.name || "";
    chip.append(icon, name);
    chip.addEventListener("click", () => openAttachmentPreview(a));
    row.appendChild(chip);
  }
  return row;
}

function prependTurnAttachments(bubble, attachments) {
  const row = renderTurnAttachments(attachments);
  if (row) bubble.prepend(row);
}

// Read-only preview of one persisted attachment: the submitted image, or the
// same capped extracted text the model saw. A record without preview data
// (an older Archive, or an image above the persistence size cap) degrades to
// a clear "included as Session context" message — never a crash, never a
// hidden turn.
function openAttachmentPreview(a) {
  const d = els.attachmentPreview;
  d.title.textContent = a.name || "";
  d.body.innerHTML = "";

  const preview = a.preview || null;
  if (a.kind === "image" && preview?.data) {
    const img = document.createElement("img");
    img.className = "attachment-preview-image";
    img.alt = a.name || "";
    img.src = `data:${preview.mediaType || "image/png"};base64,${preview.data}`;
    d.body.appendChild(img);
  } else if (a.kind === "webpage") {
    // Never auto-navigate: the URL renders as a plain link the player may
    // choose to open. The page title (when persisted) is the chip name.
    if (a.url) {
      const p = document.createElement("p");
      const link = document.createElement("a");
      link.href = a.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = a.url;
      p.appendChild(link);
      d.body.appendChild(p);
    }
    if (preview?.text) d.body.appendChild(previewTextBlock(preview.text, null));
    else if (!a.url) d.body.appendChild(previewFallback(a));
  } else if (preview?.text) {
    d.body.appendChild(previewTextBlock(preview.text, preview.language || null));
  } else {
    d.body.appendChild(previewFallback(a));
  }

  d.dialog.showModal();
}

function previewTextBlock(text, language) {
  const pre = document.createElement("pre");
  pre.className = language ? "attachment-preview-text is-code" : "attachment-preview-text";
  pre.textContent = text;
  return pre;
}

function previewFallback(a) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = strT("attachmentNoPreview", { kind: a.kind || "" });
  return p;
}

// A Session holds a valid answer once any Scholar answered successfully.
function sessionHasValidAnswer() {
  return Object.values(sessionState?.scholars || {}).some((s) => s.status === "ok" && s.answer);
}

// Chat opens only on a server-installed Session (it has an id) with something
// to discuss: a valid Judge ruling in Council mode, the Scholar's answer in
// Single mode. Until then the input stays disabled.
//
// `sessionLost` is the third condition, and the one whose absence was the bug:
// the active Session is memory-only on the server, so a restart destroys it
// while this page still renders the discussion. Without this term chatReady()
// kept answering "yes" from the local mirror alone and left a dead composer
// enabled — see services/sessionRecovery.js, which this mirrors.
function chatReady() {
  const s = sessionState;
  if (!s || !s.id) return false;
  if (sessionLost) return false;
  if (s.mode === "council") return s.judge?.status === "ok" && Boolean(s.judge.answer);
  return sessionHasValidAnswer();
}

// Governs the persistent input/Send button ONLY once a Session is underway
// (sessionConfigLocked) — before that, startSessionRun() owns their
// disabled state directly (see the top/bottom of that function). Once
// locked, availability follows chatReady(): there's nothing to continue
// until a valid answer exists, and nothing new can be sent while a reply
// is already in flight.
function updateChatAvailability() {
  if (!sessionConfigLocked) return;
  // While a run is working the button is Stop, which must stay pressable and
  // must not be re-labelled by follow-up availability rules.
  if (runButtonMode !== "send") return;
  const enabled = chatReady() && !chatBusy;
  els.run.disabled = !enabled;
  els.question.disabled = !enabled;
  for (const btn of els.chat.quickActions.querySelectorAll("button")) btn.disabled = !enabled;
}

function setChatBusy(busy) {
  chatBusy = busy;
  // Follow-up chat is not governed by Stop, but it shares the one button —
  // go through the mode-aware label so a live Stop is never overwritten.
  if (sessionConfigLocked) applyRunButtonLabel();
  updateChatAvailability();
}

// `options.fromComposer` marks a send whose text came OUT of the composer (a
// typed Send, not a Quick Question chip), so a refusal can put it back. Bound
// in the body rather than destructured in the signature: several source
// assertions locate this function by taking the first `{` after its name as
// the body, and a destructuring pattern there would defeat them.
async function sendChat(message, options) {
  const fromComposer = Boolean(options?.fromComposer);
  const text = (message || "").trim();
  if (!text || chatBusy || !chatReady()) return;
  // Confirm the server still has this Session BEFORE showing the user's
  // bubble. The active Session is memory-only, so a restart since the run
  // would otherwise turn this into a 409 error bubble under a composer that
  // still looks usable. A failed check is not proof of loss (see
  // verifyActiveSession) — only a definite "gone" stops the send.
  const liveness = await verifyActiveSession();
  if (liveness.known && !liveness.alive) {
    // Hand the text back before closing the composer: the user typed it, the
    // send never happened, and it must not vanish because we refused it.
    if (fromComposer && !els.question.value.trim()) els.question.value = text;
    await handleSessionLost();
    return;
  }
  // Whose draft this send could retire, captured before any await. The
  // draft itself is NOT cleared here — a request that fails must leave it
  // intact (see the success branch below).
  const draftSessionId = activeSessionDraftId();

  // Every follow-up (typed Send or a Quick Question chip) continues the one
  // Grand Sage conversation in Council mode, regardless of which Scholar tab
  // the player was reading — snap the view back to Grand Sage so the reply
  // lands where it's visible. Single/Mentor mode has no Grand Sage tab.
  if (sessionState.mode === "council" && activeTab !== "summary") activateTab("summary");

  // As soon as the FIRST follow-up begins, Session Summary collapses itself
  // to keep the interface clean — the original ruling stays intact and the
  // player can still re-expand it manually at any time.
  if (sessionState.chat.length === 0) setSessionSummaryExpanded(false);

  // Whatever is currently attached belongs to THIS follow-up turn only — the
  // same materials wire shape (and the same server-side validation) as the
  // initial question, just sent with a chat message instead of a run.
  const materials = materialsPayload();
  setChatBusy(true);
  const userBubble = appendChatBubble("user", text);
  const speaker = sessionState.mode === "single" ? personaOfSingle() : judgePersonaName();
  const pending = appendChatBubble("pending", strT("considering", { name: speaker }));
  try {
    // Follow-ups can legitimately run one full file-analysis task server-side
    // (see the timeout profiles) — the client deadline is a safety net, not
    // the effective limit.
    const data = await api(
      "/api/session/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, materials }),
      },
      CHAT_API_TIMEOUT_MS
    );
    pending.className = "chat-msg chat-assistant";
    pending.innerHTML = renderMarkdown(data.reply);
    addBubbleCopy(pending, data.reply);
    const target = currentChatProviderModel();
    if (target) clearRuntimeUnavailable(target.provider, target.model);
    sessionState.chat = sessionState.chat || [];
    // Mirror the server's own turn shape (see materialsMetadata() in
    // src/services/materials.js): kind/name/url plus the restorable preview,
    // attributed to this one user turn — never merged into
    // sessionState.attachments, which stays the original question's record.
    const attachmentsMeta = turnMetadataFromMaterials(materials);
    sessionState.chat.push(
      { role: "user", text, ...(attachmentsMeta.length ? { attachments: attachmentsMeta } : {}) },
      { role: "assistant", text: data.reply }
    );
    // The submission succeeded: the turn now owns its attachments — show
    // their chips on the bubble (a failed send shows none; the composer
    // keeps the originals for retry instead).
    prependTurnAttachments(userBubble, attachmentsMeta);
    // A follow-up is new content the last Vault save doesn't have yet — drop
    // back to "unsaved" so the header badge/Save button tell the player
    // there's something new to save, instead of silently staying "Saved"
    // while the Vault file falls behind the live conversation.
    if (sessionState.vault?.state === "saved") sessionState.vault.state = "unsaved";
    if (sessionState.metadata?.vaultState === "saved") {
      sessionState.metadata = { ...sessionState.metadata, vaultState: "unsaved" };
    }
    // The follow-up consumed its attached materials, same as a successful
    // run — a failed send below (catch) leaves them in place for retry.
    clearAttachments();
    // …and the same is now true of its draft. This is the ONE point at
    // which the application has confirmed the follow-up was accepted: the
    // reply is in hand and the turn is recorded. A failure lands in the
    // catch below without ever reaching here, so the draft survives for
    // retry. Scoped to this Session's id, so no other Session's draft can
    // be touched, and skipped entirely if the composer no longer holds the
    // text that was sent (a Quick Question chip never had it to begin with).
    clearFollowUpDraftIfUnchanged(draftSessionId, text);
    renderSessionHeader();
  } catch (err) {
    pending.className = "chat-msg chat-error";
    let message = friendlyErrorMessage(err);
    // The Session went away between the pre-send check and this request (or
    // the check itself could not reach the server). Same destination as every
    // other discovery path, so the composer closes here too instead of
    // inviting another dead send.
    if (isSessionLostError(err)) {
      pending.textContent = `⚠ ${str("sessionGone")}`;
      await handleSessionLost();
      return;
    }
    // A classified timeout is never "this model is gone" — see the same
    // guard in updateScholarTab()/updateSummaryTab().
    if (!TIMEOUT_ERROR_CODES.has(err.code) && looksLikeUnavailableModel(err.httpStatus, err.message)) {
      const target = currentChatProviderModel();
      if (target) markModelUnavailable(target.provider, target.model);
      message = `${message} ${str("modelRemovedHint")}`;
    }
    pending.textContent = `⚠ ${message}`;
  } finally {
    // #chat-log no longer scrolls on its own — #discussion-workspace is the
    // one scrollable region for the whole Session Summary + Conversation.
    els.discussionWorkspace.scrollTop = els.discussionWorkspace.scrollHeight;
    setChatBusy(false);
    els.question.focus();
  }
}

function personaOfSingle() {
  const first = Object.values(sessionState?.scholars || {}).find((s) => s.status === "ok");
  return first?.persona || str("scholarFallback");
}

// The provider+model currently answering follow-ups: the Judge's (Council)
// or the one participating Scholar's (Single) — used to classify/mark a
// chat failure as "this model is gone" (see looksLikeUnavailableModel()).
function currentChatProviderModel() {
  if (!sessionState) return null;
  if (sessionState.mode === "council") {
    return sessionState.judge ? { provider: sessionState.judge.provider, model: sessionState.judge.model } : null;
  }
  const s = Object.values(sessionState.scholars || {}).find((x) => x.status === "ok");
  return s ? { provider: s.provider, model: s.model } : null;
}

// Quick actions are Judge-oriented, so only Council mode shows the
// disclosure at all; whether its chip list is expanded or collapsed is a
// separate, independent state (see initQuickActionsToggle below). Selecting
// a chip bypasses the input entirely: it's appended straight into the
// Conversation thread and sent immediately, exactly like a manually typed
// follow-up — then the disclosure collapses itself again.
function configureChatForMode(mode) {
  els.chat.quickActions.innerHTML = "";
  if (mode === "council") {
    for (const action of judgeQuickActions()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quick-action";
      btn.textContent = `${action.icon} ${action.text}`;
      btn.addEventListener("click", () => {
        applyQuickActionsExpanded(false);
        persistQuickActionsExpanded();
        sendChat(action.text);
      });
      els.chat.quickActions.appendChild(btn);
    }
    els.chat.quickActionsWrap.hidden = false;
    applyQuickActionsExpanded(quickActionsExpanded); // sync the freshly (re)built chip list to the current expand state
  } else {
    els.chat.quickActionsWrap.hidden = true;
  }
}

// --------------------------------------------------- Quick Questions toggle
// Collapsed by default; the user's choice persists for the current browser
// session (survives a reload of this tab, not a full restart) via
// sessionStorage — "if practical" per spec, not a hard requirement.
const QUICK_ACTIONS_STORAGE_KEY = "aether.quickActionsExpanded";
let quickActionsExpanded = sessionStorage.getItem(QUICK_ACTIONS_STORAGE_KEY) === "true";

// Applies (without persisting) the expand/collapse state to the DOM: the
// chip list's visibility, the caret glyph, and the localized accessibility
// label — called both on user toggle and whenever the active language or
// chip list changes, so the control never shows stale text.
function applyQuickActionsExpanded(expanded) {
  quickActionsExpanded = expanded;
  els.chat.quickActions.hidden = !expanded;
  els.chat.quickActionsToggle.setAttribute("aria-expanded", String(expanded));
  const label = expanded ? str("quickQuestionsCollapse") : str("quickQuestionsExpand");
  els.chat.quickActionsToggle.title = label;
  els.chat.quickActionsToggle.setAttribute("aria-label", label);
  els.chat.quickActionsCaret.textContent = expanded ? "▴" : "▾";
  // The chip list's hidden toggle above already reflowed synchronously —
  // reclamp now so an expansion that needs more room nudges the divider up
  // immediately (never overlapping the input/Reset/Send), and a collapse
  // restores the previous ratio.
  reclampWorkspaceSplit();
}

function persistQuickActionsExpanded() {
  try {
    sessionStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, String(quickActionsExpanded));
  } catch {
    // Private-browsing storage denial: the toggle still works, just resets on reload.
  }
}

function toggleQuickActions() {
  applyQuickActionsExpanded(!quickActionsExpanded);
  persistQuickActionsExpanded();
}

// --------------------------------------------------- Session Summary toggle
// Expanded by default whenever a new Session begins; auto-collapses the
// moment the FIRST follow-up is sent (see sendChat()) so the interface
// stays clean once the conversation is underway. The user may re-expand it
// manually at any time — collapsing only hides the answer box via CSS
// (.session-summary.is-collapsed), it never discards the original ruling.
let sessionSummaryExpanded = true;

function setSessionSummaryExpanded(expanded) {
  sessionSummaryExpanded = expanded;
  els.sessionSummary.section.classList.toggle("is-collapsed", !expanded);
  els.sessionSummary.toggle.setAttribute("aria-expanded", String(expanded));
  els.sessionSummary.caret.textContent = expanded ? "▼" : "▶";
  const label = expanded ? str("sessionSummaryCollapse") : str("sessionSummaryExpand");
  els.sessionSummary.toggle.title = label;
  els.sessionSummary.toggle.setAttribute("aria-label", label);
}

// --------------------------------------------- pre-session / empty state
// Before a Session has a real answer, Session Summary does not exist at all
// — #discussion-empty is the only thing in the discussion workspace, and
// #conversation carries .pre-session so the interaction workspace docks to
// its natural bottom size instead of stretching into the middle of the
// panel (see the CSS for .conversation.pre-session). The moment ANY tab
// (Scholar or Judge) resolves successfully for the first time, Session
// Summary is created/shown for good — Reset is the only way back to this
// state (see performReset()).
let sessionSummaryCreated = false;

// Empty-state text depends on whether a Session is currently in flight:
// the initial invite before any question, or a waiting/considering message
// once the first question has been sent but nothing has answered yet.
function refreshDiscussionEmptyText() {
  if (els.discussionEmpty.hidden) return;
  if (sessionState) {
    // A run is in flight: ONE progress line, exactly as before. The greeting
    // belongs to the idle state only, so it is hidden rather than left to sit
    // above a "considering…" message.
    els.discussionWelcome.hidden = true;
    els.discussionHint.textContent = runProgressMessage();
    return;
  }
  els.discussionWelcome.hidden = false;
  els.discussionWelcome.textContent = str("councilWelcome");
  els.discussionHint.textContent = str("bookPrompt");
}

// Fatal-run-failure state: shown instead of "waiting" when a run finishes
// with NOTHING usable at all (see the !anyTabOk branch in startSessionRun())
// — maybeRevealSessionSummary() below never fires in that case, so nothing
// else would ever clear the "請稍候…" placeholder. A partial failure (some
// Scholars ok) never calls this — that stays a per-tab error only.
function showSessionError() {
  els.sessionError.title.textContent = str("sessionErrorTitle");
  els.sessionError.message.textContent = str("sessionErrorMessage");
  els.sessionError.section.hidden = false;
}

// The user stopped the run before anything usable arrived. Reuses the same
// panel as showSessionError() but says what actually happened — the model
// wasn't unavailable, and telling the player to pick a different one would be
// wrong. Deliberately carries no provider-failure guidance.
function showSessionStopped() {
  els.sessionError.title.textContent = str("generationStoppedTitle");
  els.sessionError.message.textContent = str("generationStoppedBody");
  els.sessionError.section.hidden = false;
}

function hideSessionError() {
  els.sessionError.section.hidden = true;
}

// ------------------------------------------------------- session recovery
// Mirrors src/services/sessionRecovery.js (no-import constraint); that module
// is the tested source of truth for the decision itself, and its header
// records WHY restoration is unsupported and continuation is the recovery.
//
// Short version: the server's active Session is memory-only (sessionEngine.js
// keeps it in a module variable with no TTL), so a process restart destroys it
// while this page still shows the discussion. Nothing informed the page, so
// the follow-up composer stayed enabled and every Send failed with 409
// "No active session". This block is what notices, and what it converts into.

// `sessionLost` itself is declared with sessionState near the top of this file
// (a `let` must exist before chatReady() first reads it). It is latched here
// and cleared only by Reset or by starting a new run — never optimistically,
// because nothing a restarted server does can bring the old Session back.

// Per-tab pointer to the last displayed Session: an id plus whether it reached
// the Vault. NEVER a copy of the Session — this must not become a second
// source of session content. sessionStorage (not localStorage) so it dies with
// the tab, the same scope QUICK_ACTIONS_STORAGE_KEY uses.
const LAST_SESSION_KEY = "aether.lastSession";

function rememberSessionPointer() {
  const pointer = sessionState?.id ? { id: sessionState.id, saved: sessionState.vault?.state === "saved" } : null;
  try {
    if (pointer) sessionStorage.setItem(LAST_SESSION_KEY, JSON.stringify(pointer));
    else sessionStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    /* storage blocked — continuation-after-reload is simply not offered */
  }
}

function readSessionPointer() {
  try {
    const raw = sessionStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const pointer = JSON.parse(raw);
    return pointer?.id ? pointer : null;
  } catch {
    return null;
  }
}

function forgetSessionPointer() {
  try {
    sessionStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    /* nothing to forget */
  }
}

// Only a Session that reached the Vault has an Archive to continue from — an
// unsaved one left no trace on the server at all.
function pointerIsContinuable(pointer) {
  return Boolean(pointer?.id && pointer.saved);
}

// A 409 alone does NOT mean the Session is gone: the run-safety gate answers
// 409 too, with code "run_in_progress", which means the opposite. Both terms
// are required.
function isSessionLostError(err) {
  if (err?.code === "run_in_progress") return false;
  if (err?.httpStatus !== 409) return false;
  return /no active session/i.test(String(err?.message || ""));
}

// Ask the server whether it still has THIS page's Session. A failed request is
// never treated as proof of loss — an unreachable server is a different
// problem, and locking the composer over a transient blip would be wrong.
async function verifyActiveSession() {
  if (!sessionState?.id) return { known: false, alive: false };
  const data = await api("/api/session").catch(() => null);
  if (!data) return { known: false, alive: false };
  // A restarted server that has since run a DIFFERENT session is still lost
  // from here: a follow-up would otherwise append to a stranger's discussion.
  const alive = Boolean(data.active) && (!data.session?.id || data.session.id === sessionState.id);
  return { known: true, alive };
}

async function archiveExistsFor(sessionId) {
  if (!sessionId) return false;
  const data = await api(`/api/archives/${encodeURIComponent(sessionId)}`).catch(() => null);
  return Boolean(data?.archive);
}

function hideSessionLost() {
  sessionLost = false;
  els.sessionLost.section.hidden = true;
  els.sessionLost.status.textContent = "";
  els.sessionLost.status.className = "archive-sync-msg";
}

// THE one transition into the lost state. Everything that can discover the
// loss (the visibility re-check, the pre-send check, and any 409 that says so)
// funnels through here, so the UI can only ever have one lost-state shape.
//
// The discussion itself is deliberately left on screen: for an unsaved Session
// this page holds the only remaining copy, and clearing it would destroy the
// user's content to tidy up our own state.
async function handleSessionLost({ sessionId = sessionState?.id, saved = sessionState?.vault?.state === "saved" } = {}) {
  if (sessionLost) return;
  sessionLost = true;
  // One call closes the composer, the Send button and every Quick Question
  // chip, because all three already follow chatReady() through here.
  updateChatAvailability();
  setHeaderMsg("");
  renderSessionHeader();
  await showSessionLost({ sessionId, saved });
}

// Renders the panel and wires its recovery action. `saved` is only a hint —
// the Archive is confirmed before continuation is offered, so a pointer that
// disagrees with the server can never produce a button that 404s.
async function showSessionLost({ sessionId, saved }) {
  const t = els.sessionLost;
  t.title.textContent = str("sessionLostTitle");
  t.section.hidden = false;
  t.continueBtn.hidden = true;
  t.continueBtn.textContent = str("sessionLostContinue");
  t.resetBtn.textContent = str("sessionLostReset");
  t.message.textContent = str("sessionLostChecking");

  const continuable = saved && (await archiveExistsFor(sessionId));
  t.message.textContent = str(continuable ? "sessionLostSaved" : "sessionLostUnsaved");
  if (!continuable) return;

  t.continueBtn.hidden = false;
  // Reuses the EXISTING Continue Discussion flow verbatim — it fetches the
  // archive's markdown, clears the stale Session, and attaches it as the
  // `kind: "archive"` material with its thread lineage. No new session model
  // and no second continuation path: this is the same thing the Archives
  // dialog's own button does, reached from a different place.
  t.continueBtn.onclick = () => continueDiscussion({ id: sessionId }, t.continueBtn, t.status);
}

// Re-check on returning to the tab. This is the "left the window open for a
// long time" case: the tab was hidden while the server restarted, and without
// this the first sign of trouble would be a failed Send.
function initSessionLivenessWatch() {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    if (!sessionConfigLocked || sessionLost || runInFlight || chatBusy) return;
    const { known, alive } = await verifyActiveSession();
    if (known && !alive) await handleSessionLost();
  });
}

// Mirrors src/services/runPresentation.js (no-import constraint) — the
// canonical outcome priority: user cancellation > provider failure >
// insufficient results > completion.
function presentRunOutcome({ outcome, anyAnswerOk = false }) {
  if (outcome === "stopped") {
    return { kind: "stopped", status: "stopped", showProviderFailureGuidance: false, messageKey: "generationStopped" };
  }
  if (outcome === "insufficient_results" || !anyAnswerOk) {
    return { kind: "insufficient", status: "error", showProviderFailureGuidance: true, messageKey: "noUsableResponses" };
  }
  if (outcome === "continued_with_failures") {
    return { kind: "continued_with_failures", status: "active", showProviderFailureGuidance: false, messageKey: "continuedWithout" };
  }
  return { kind: "completed", status: "active", showProviderFailureGuidance: false, messageKey: null };
}

// A cancelled Scholar never got the chance to answer — it is "stopped", not
// "failed", and must never be rendered with failure treatment.
function scholarDisplayState(scholar) {
  if (!scholar) return "unknown";
  if (scholar.status === "cancelled") return "stopped";
  if (scholar.status === "ok") return "ok";
  return "failed";
}

function maybeRevealSessionSummary() {
  if (sessionSummaryCreated) return;
  if (!Object.values(tabAnswers).some((e) => e.status === "ok")) return;
  sessionSummaryCreated = true;
  // A successful Scholar RETRY can arrive after a total failure already
  // showed the fatal error state — the recovered session replaces it.
  hideSessionError();
  els.sessionSummary.section.hidden = false;
  els.discussionEmpty.hidden = true;
  els.conversation.classList.remove("pre-session");
  recalcWorkspaceSplit();
}

// ------------------------------------------------- workspace split divider
// Full-width divider between the TOP discussion workspace (Session Summary
// + Conversation, ONE scrollable region) and the BOTTOM interaction
// workspace — Mode, Scholar cards, the persistent input, Quick Questions,
// AND the Reset/Send row: everything below the divider is one unit, and the
// Reset/Send row is its bottom boundary, never a separate detached strip.
// A single VS Code/Obsidian-style splitter, drag-only, vertical-only.
//
// #interaction-workspace (flex: 1 1 auto) is the ONLY thing that ever
// claims leftover vertical space — it always stretches to the panel's
// bottom edge, and within it the input specifically grows/shrinks to
// absorb that space (see style.css) so Reset/Send stay pinned at the true
// bottom with no dead space. #discussion-workspace (flex: 0 1 auto) is
// content-sized by default and only shrinks (scrolling internally) if
// there isn't room — it never takes more than it needs. Dragging the
// divider overrides that default: #discussion-workspace takes an explicit
// pixel height instead, and #interaction-workspace keeps absorbing
// whatever remains, exactly like a real split pane. Resizing the browser
// window reflows both automatically either way.
//
// Performance: pointermove never touches layout — it only records the
// pointer's latest position and schedules ONE requestAnimationFrame
// callback (coalescing any faster-than-frame events) that writes the new
// height. Transitions are suspended for the duration via .is-resizing (see
// style.css) so no animation fights the constant height writes.
//
// Ratio, not raw pixels: the only persisted state is splitRatio, the
// fraction of #conversation's live height given to the top workspace. Raw
// pixel heights dragged in one layout mode (e.g. Chat Fullscreen, which has
// very different available space) are never blindly reused in another —
// every recalculation re-derives pixels from the CURRENT #conversation
// bounding box (computeSplitBounds()), which is the single source of truth
// for available space. No code anywhere reads window.innerHeight or assumes
// a fixed resolution.
const DISCUSSION_MIN_PX = 140; // top workspace's own floor — a small, fixed, content-independent minimum
// Deliberate slack added to every measured interaction floor. getBoundingClientRect()
// reads here are already sub-pixel accurate, but the browser's actual layout
// pass can still round fractionally differently from this JS arithmetic by a
// pixel or two — this is what previously let #interaction-workspace's
// overflow-y: auto trigger a stray scrollbar even at the "correct" computed
// minimum. Better to clamp the divider a couple of px higher than strictly
// necessary than to ever allow that: see measureInteractionFloor().
const INTERACTION_FLOOR_SAFETY_PX = 2;
let splitRatio = null; // null = no manual split yet; natural CSS flex proportions apply
let cancelWorkspaceDrag = () => {};
let cancelAppSplitDrag = () => {}; // see initAppSplitDivider() below

// The bottom workspace's floor is measured, not hardcoded: the natural
// (non-grown) heights of Mode/Scholar cards, Quick Questions (in its
// current collapsed/expanded state), and Reset/Send, plus the composer's
// own floor (its padding/border plus the textarea's CSS min-height, read
// live so it always matches style.css). This is what lets Quick Questions
// expanding push the divider up automatically: a bigger measured floor here
// directly shrinks the top workspace's allowed maximum below.
function measureInteractionFloor() {
  const iw = els.interactionWorkspace;
  const iwCS = getComputedStyle(iw);
  const gap = parseFloat(iwCS.rowGap || iwCS.gap) || 0;
  const rows = [iw.querySelector(".ask-controls"), iw.querySelector(".ask-row")];
  if (!els.chat.quickActionsWrap.hidden) rows.push(els.chat.quickActionsWrap);
  let sum = rows.reduce((total, el) => total + (el ? el.getBoundingClientRect().height : 0), 0);

  // Composer's own floor: padding/border, the textarea's CSS min-height
  // (its floor when squeezed), and the toolbar's natural height. The
  // toolbar is flex: 0 0 auto, so its live rect always reflects
  // Reset/Send/attach at their real size regardless of how squeezed the
  // textarea above it currently is. Every value here is already border-box
  // (global `* { box-sizing: border-box }`, style.css), so CSS min-height
  // already includes the textarea's own padding/border — no separate
  // accounting needed for that.
  const composerCS = getComputedStyle(els.composer);
  const toolbar = els.composer.querySelector(".composer-toolbar");
  // The attachment chip row is a real sibling inside the SAME composer frame
  // (see index.html) — when it's showing, its live rendered height (plus its
  // own border/margin) is part of the composer's true height just like the
  // toolbar's is. Reading it live means adding/removing/clearing/restoring
  // attachments is measured exactly like any other composer-height change,
  // instead of only becoming correct once something else (e.g. dragging the
  // divider) happens to force a recalculation.
  const attachmentList = els.attachmentList;
  const attachmentFloor =
    attachmentList && !attachmentList.hidden
      ? attachmentList.getBoundingClientRect().height + parseFloat(getComputedStyle(attachmentList).marginBottom || 0)
      : 0;
  const composerFloor =
    parseFloat(composerCS.paddingTop) +
    parseFloat(composerCS.paddingBottom) +
    parseFloat(composerCS.borderTopWidth) +
    parseFloat(composerCS.borderBottomWidth) +
    attachmentFloor +
    (parseFloat(getComputedStyle(els.question).minHeight) || 0) +
    (toolbar ? toolbar.getBoundingClientRect().height + parseFloat(getComputedStyle(toolbar).marginTop) : 0);
  sum += composerFloor;
  // #interaction-workspace's own top border + padding sit above the first
  // row (.ask-controls) and were previously uncounted, undershooting the
  // true floor by that amount.
  sum += parseFloat(iwCS.borderTopWidth) + parseFloat(iwCS.paddingTop);
  sum += gap * rows.length; // one gap per row above the composer, composer counted separately
  // Round UP (never down) and add a fixed safety margin — see Math.ceil()
  // + INTERACTION_FLOOR_SAFETY_PX above. Rendering a floor even 1px short
  // is exactly what turns #interaction-workspace's overflow: hidden into a
  // spot where content would be clipped instead of visible.
  return Math.ceil(sum) + INTERACTION_FLOOR_SAFETY_PX;
}

// The only layout reads needed to clamp a drag or re-apply the saved ratio
// — #conversation's OWN live clientHeight/bounding box is the source of
// truth (never the full browser window, never a stale fullscreen number).
function computeSplitBounds() {
  const available = els.conversation.getBoundingClientRect().height;
  const dividerHeight = els.workspaceDivider.getBoundingClientRect().height;
  const gap = parseFloat(getComputedStyle(els.conversation).rowGap || getComputedStyle(els.conversation).gap) || 0;
  const usable = available - dividerHeight - gap * 2;
  const interactionFloor = measureInteractionFloor();
  // The bottom's measured floor always wins: forcing maxTopPx back up to
  // DISCUSSION_MIN_PX here (as a previous version of this function did)
  // let the divider drag top past the point where the interaction
  // workspace still had room for its own controls, squeezing the composer
  // toolbar below its floor (clipped +/Reset/Send, a stray scrollbar).
  // DISCUSSION_MIN_PX only wins when there's genuinely enough room for both.
  const maxTopPx = Math.max(0, usable - interactionFloor);
  const minTopPx = Math.min(DISCUSSION_MIN_PX, maxTopPx);
  return { available: usable, minTopPx, maxTopPx };
}

// Clears any stale inline height/flex left by a previous drag so a layout-
// mode change never blindly reuses pixels sized for a different container.
function clearWorkspaceInlineStyles() {
  els.discussionWorkspace.style.height = "";
  els.discussionWorkspace.style.flex = "";
  els.discussionWorkspace.classList.remove("is-resizing");
  els.workspaceDivider.classList.remove("is-dragging");
}

// Re-derives and applies the top workspace's pixel height from the saved
// RATIO against #conversation's current bounds — safe to call after any
// resize, since it always reads live geometry rather than trusting old
// pixels, and works identically before or after Session Summary exists (the
// divider is draggable pre-session too).
//
// Before the user has ever dragged the divider, the default CSS flex
// proportions usually reflow correctly on their own — EXCEPT that pure CSS
// flex-shrink has no floor: if the bottom workspace's own content (the
// composer, e.g. an attachment chip row growing it) needs more room than
// what's left over, nothing stops it from being squeezed below its own
// children's natural height, which is exactly what let the composer's
// toolbar render outside the composer's box before any drag ever happened.
// So even with no manual ratio, this still clamps the top workspace down
// to computeSplitBounds()'s measured maxTopPx whenever the natural size
// would leave the bottom workspace short of its own floor.
function applySplitRatio() {
  if (splitRatio === null) {
    // Clear any previous non-drag clamp this branch applied itself before
    // measuring — otherwise a stale inline height contaminates the "does it
    // fit naturally now" read below (e.g. after an attachment is removed).
    els.discussionWorkspace.style.height = "";
    els.discussionWorkspace.style.flex = "";
    const naturalTopPx = els.discussionWorkspace.getBoundingClientRect().height;
    const { maxTopPx } = computeSplitBounds();
    if (naturalTopPx <= maxTopPx) return; // fits naturally — leave CSS flex alone
    els.discussionWorkspace.style.flex = "0 0 auto";
    els.discussionWorkspace.style.height = `${maxTopPx}px`;
    return;
  }
  const { available, minTopPx, maxTopPx } = computeSplitBounds();
  const topPx = Math.min(maxTopPx, Math.max(minTopPx, splitRatio * available));
  els.discussionWorkspace.style.flex = "0 0 auto";
  els.discussionWorkspace.style.height = `${topPx}px`;
}

// Full recalculation for a layout-mode change (fullscreen enter/exit): drop
// any stale inline dimensions, then re-measure and re-apply on the next
// frame once the mode-change class toggle has actually taken effect in the
// DOM/layout.
function recalcWorkspaceSplit() {
  clearWorkspaceInlineStyles();
  requestAnimationFrame(applySplitRatio);
}

function initWorkspaceDivider() {
  const top = els.discussionWorkspace;
  const handle = els.workspaceDivider;

  let dragging = false;
  let pointerId = null;
  let startY = 0;
  let startHeight = 0;
  let minPx = DISCUSSION_MIN_PX;
  let maxPx = Infinity;
  let pendingHeight = null;
  let rafId = null;

  function flush() {
    rafId = null;
    if (pendingHeight === null) return;
    top.style.height = `${pendingHeight}px`;
    pendingHeight = null;
  }

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (pointerId !== null && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    pointerId = null;
    handle.classList.remove("is-dragging");
    top.classList.remove("is-resizing");
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      flush(); // land on the exact final position, no dropped last frame
    }
    // Persist the final on-screen split as a RATIO of the current available
    // height — never a raw pixel number — so it survives layout-mode changes.
    const { available } = computeSplitBounds();
    if (available > 0) splitRatio = Math.min(1, Math.max(0, top.getBoundingClientRect().height / available));
    // The FIRST manual drag (pre-session or not) switches both workspaces
    // out of the pre-session bottom-docked defaults and into the normal
    // "top is content-sized, bottom absorbs the rest" split model — see
    // .conversation.pre-session.split-adjusted in style.css. Reset clears it.
    els.conversation.classList.add("split-adjusted");
  };
  cancelWorkspaceDrag = endDrag;

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    startY = event.clientY;
    // Lock in the top workspace's CURRENT rendered height as the drag's
    // starting point — a seamless handoff from flex-fill (or a previously
    // saved ratio) to a fixed size, with zero visual jump.
    startHeight = top.getBoundingClientRect().height;
    const bounds = computeSplitBounds();
    minPx = bounds.minTopPx;
    maxPx = bounds.maxTopPx;
    top.classList.add("is-resizing");
    top.style.flex = "0 0 auto";
    top.style.height = `${startHeight}px`;
    handle.classList.add("is-dragging");
    dragging = true;
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    pendingHeight = Math.min(maxPx, Math.max(minPx, startHeight + delta));
    if (rafId === null) rafId = requestAnimationFrame(flush);
  });

  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  // A drag must always terminate cleanly even if the pointer leaves the
  // window, the tab loses focus, or the browser resizes mid-drag.
  window.addEventListener("blur", endDrag);
  window.addEventListener("resize", endDrag);

  // #conversation is the single source of truth for available space: any
  // resize of it (browser resize, library panel resize, layout-mode change
  // that isn't already routed through recalcWorkspaceSplit()) re-applies the
  // saved ratio against the fresh bounds. Skipped mid-drag so it never
  // fights the pointer.
  new ResizeObserver(() => {
    if (!dragging) applySplitRatio();
  }).observe(els.conversation);
}

// Re-clamps the saved ratio against the CURRENT measured floor without
// clearing/re-deriving anything — used when Quick Questions expands or
// collapses. A bigger measured floor (expanded) shrinks the top workspace's
// allowed maximum, so applySplitRatio() clamps the top down and the divider
// visually moves up just enough to make room; collapsing shrinks the floor
// back down and the previous ratio is restored automatically.
function reclampWorkspaceSplit() {
  applySplitRatio();
}

// -------------------------------------------------------- app split divider
// Draggable production boundary between #library-panel and #chat-panel —
// an independent counterpart to the F8 Scene Editor's own
// #se-resize-divider (devtools/scene-editor.js/.css): same zero-footprint
// negative-margin technique (see .app-split-divider, style.css) and
// pointer-capture drag language, but its own DOM element, own state, and
// own clamp math. This code never reads or writes anything F8 owns
// (state.panelWidthPx, #scene-editor-inspector) and vice versa — the two
// stay out of each other's way purely via appSplitActive() below, which
// steps aside whenever body.scene-editor-active is set.
//
// Session-only, on purpose: `chatPanelWidthPx` lives only in this module's
// memory, never written to localStorage/settings/scene config/any JSON
// file. A refresh naturally forgets it and the default CSS flex ratio
// (library-panel 3 : chat-panel 1, ≈1440/480 at the normal 1920px layout)
// renders again with zero migration/reset code needed.
let chatPanelWidthPx = null;

// The right panel's session floor — MEASURED the first time it's needed,
// never hardcoded to 480. At the normal 1920px layout this settles at
// ~480px (today's 3:1 flex ratio), but on a narrower row-mode viewport the
// EXISTING responsive flex math may already render it smaller; using
// whatever is actually on screen means "can't shrink below default"
// derives a safe minimum for the CURRENT viewport instead of blindly
// forcing 480px somewhere that would break the layout. Deliberately NOT
// measured at module-init time — #app-shell is `hidden` until the player
// enters the library, and a hidden element's bounding rect is always zero,
// so the only safe moment to measure is lazily, at the first real drag
// (see initAppSplitDivider's pointerdown handler) — by then the shell is
// guaranteed visible. Fixed for the rest of the session once captured: a
// later browser resize must not silently redefine what "default" means out
// from under an already-dragged split.
let chatPanelDefaultWidthPx = null;

function measureChatPanelDefaultWidth() {
  if (chatPanelDefaultWidthPx == null) {
    chatPanelDefaultWidthPx = els.chatPanel.getBoundingClientRect().width;
  }
  return chatPanelDefaultWidthPx;
}

// The scene's own floor, and the ONLY thing bounding how far the right
// panel may grow. #chat-panel's CSS `max-width: 560px` is deliberately NOT
// reused as that ceiling anymore: it is a *default-layout* guard (keep the
// workspace from ballooning on an ultrawide monitor when nobody has
// touched the split), and treating it as the DRAG ceiling capped the
// rendered width at 560px — with the minimum equal to the ~487px default,
// that left ~73px of total travel and zero rightward travel, which is
// precisely why the separator read as "cannot resize at all". While
// resized, body.app-split-resized lifts that CSS cap (style.css) and this
// clamp becomes authoritative instead.
//
// 640px is a deliberately conservative scene floor: comfortably below the
// 900px viewport breakpoint where the app abandons side-by-side layout
// entirely (see the responsive block, style.css), and wide enough that the
// 16:9 cover-fit scene still reads as a scene rather than a sliver.
//
// Same value and same formula as src/services/appSplitLayout.js's
// MIN_SCENE_WIDTH_PX / clampRightPanelWidth — mirrored inline here because
// this file is a plain global-scope script and can't import an ES module
// (identical convention to effectiveFrameDelayMs/animationPlayback.js and
// sanitizeAnimationBehavior/animationBehavior.js above). That module is
// where this math is actually unit-tested.
const MIN_SCENE_WIDTH_PX = 640;

// min = the layout's own default right-panel width (measured, never
// hardcoded — see measureChatPanelDefaultWidth); max = whatever is left
// after the scene keeps its floor. Math.max guards a pathological narrow
// viewport where those two would invert: dragging degrades to a no-op
// rather than corrupting the layout.
function clampChatPanelWidth(px) {
  const min = measureChatPanelDefaultWidth();
  const container = els.mainLayout.getBoundingClientRect().width;
  const dividerWidth = els.appSplitDivider.getBoundingClientRect().width || 0;
  const max = Math.max(min, container - dividerWidth - MIN_SCENE_WIDTH_PX);
  return Math.min(max, Math.max(min, px));
}

// True only when there are genuinely two side-by-side panels to resize —
// checked against LIVE layout state (computed flex-direction, both panels'
// actual computed display) rather than a hardcoded list of mode class
// names, so this stays correct automatically if a future layout mode is
// ever added without touching this function. Covers, without naming them
// individually: in-app fullscreen (lib-full hides #chat-panel, chat-full
// hides #library-panel — EITHER one collapsing means there's only one
// panel left, not two to split), the ≤900px stacked responsive breakpoint
// (flex-direction becomes column), and F8 (which owns the boundary itself
// while active). Both panels are checked — checking only one (an earlier
// version of this function did) misses exactly one of the two fullscreen
// directions.
function appSplitActive() {
  // F8 replaces the Workspace with the editor panel, so the production
  // divider has nothing to divide — EXCEPT during Author Preview (F9),
  // which hides the editor and puts the normal two-panel layout back. The
  // editor session is still open behind it, so the class alone cannot
  // answer this.
  if (
    document.body.classList.contains("scene-editor-active") &&
    !document.body.classList.contains("author-preview-active")
  ) {
    return false;
  }
  if (getComputedStyle(els.mainLayout).flexDirection !== "row") return false;
  if (getComputedStyle(els.chatPanel).display === "none") return false;
  if (getComputedStyle(els.libraryPanel).display === "none") return false;
  return true;
}

// Applies (or clears) the session's custom split and syncs the divider's
// visibility — safe to call unconditionally at any time (drag move, drag
// end, window resize, fullscreen toggle).
//
// ONE source of truth: the --app-split-right-width custom property, read by
// exactly one CSS rule (body.app-split-resized #chat-panel, style.css).
// Nothing here writes a left width, a right width, and a separator position
// separately — the library panel's existing `flex: 3 1 0` absorbs whatever
// is left over, and the divider sits between them in normal flow, so both
// are DERIVED from this single value rather than tracked in parallel.
//
// No drag yet (chatPanelWidthPx == null), or no two-panel layout right now:
// the class comes off and the untouched default CSS ratio renders — which
// is exactly what makes "refresh resets to default" free, with no reset
// code and no persistence anywhere.
function applyAppSplitWidth() {
  const active = appSplitActive();
  els.appSplitDivider.classList.toggle("is-inactive", !active);
  const resized = active && chatPanelWidthPx != null;
  document.body.classList.toggle("app-split-resized", resized);
  if (!resized) {
    document.documentElement.style.removeProperty("--app-split-right-width");
    return;
  }
  document.documentElement.style.setProperty("--app-split-right-width", `${clampChatPanelWidth(chatPanelWidthPx)}px`);
}

// Downscales assets/ui/separator_vertical.png (native 256×256) onto a small
// canvas and installs the result as a CSS custom-cursor value on :root —
// see .app-split-divider's own comment (style.css) for why: the browser
// renders a `cursor: url(...)` image at its OWN native pixel size (CSS
// cannot resize it), so using the 256px source directly would either paint
// a giant icon or get silently rejected by browsers that cap cursor
// dimensions — neither is "the PNG as a normal-sized cursor." 32×32 is the
// traditional universally-safe custom-cursor size (also Windows' own
// standard cursor size). imageSmoothingEnabled = false forces
// nearest-neighbor scaling, matching image-rendering:pixelated used
// everywhere else in this file for pixel art, so the shrunk cursor stays
// crisp/blocky rather than blurry. The hotspot (16,16 — dead center of the
// 32×32 result) puts the source glyph's own center vertical bar exactly at
// the cursor's hotspot, so it visually aligns with the separator line
// itself rather than some corner of the icon. Async by nature (image load);
// .app-split-divider/body.app-split-dragging both read the CSS variable
// with an `ew-resize` fallback for the brief window before this resolves,
// or if it fails entirely (e.g. a blocked/missing asset) — never a hard
// dependency for the divider to be otherwise fully functional.
function buildAppSplitCursor() {
  const CURSOR_SIZE = 32;
  const HOTSPOT = CURSOR_SIZE / 2;
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CURSOR_SIZE;
      canvas.height = CURSOR_SIZE;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, CURSOR_SIZE, CURSOR_SIZE);
      const dataUrl = canvas.toDataURL("image/png");
      document.documentElement.style.setProperty("--app-split-cursor", `url("${dataUrl}") ${HOTSPOT} ${HOTSPOT}, ew-resize`);
    } catch {
      /* canvas/data-URL failure — CSS's own ew-resize fallback stands */
    }
  };
  img.src = "assets/ui/separator_vertical.png";
}

function initAppSplitDivider() {
  buildAppSplitCursor();

  const handle = els.appSplitDivider;

  let dragging = false;
  let pointerId = null;

  // Absolute pointer->width mapping, deliberately NOT a start-delta
  // accumulation: the right panel's width is simply "everything from the
  // pointer to the container's right edge", re-derived from live geometry
  // on every move. That makes the separator track the cursor exactly, with
  // no drift, and — importantly — self-correct after a clamp: with delta
  // math, dragging 400px past the minimum and back again leaves the split
  // 400px out of sync with the cursor, because the clamped pixels were
  // still accumulated. Half the divider's own width is subtracted so the
  // visible line stays centered under the cursor rather than trailing it.
  const widthForPointer = (clientX) => {
    const container = els.mainLayout.getBoundingClientRect();
    const dividerWidth = handle.getBoundingClientRect().width || 0;
    return clampChatPanelWidth(container.right - clientX - dividerWidth / 2);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (pointerId !== null) {
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        /* capture was never actually established — nothing to release */
      }
    }
    pointerId = null;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("app-split-dragging");
  };
  cancelAppSplitDrag = endDrag;

  handle.addEventListener("pointerdown", (event) => {
    if (!appSplitActive()) return;
    event.preventDefault();
    // Best-effort: capture keeps events targeted at `handle` even off its
    // own 16px box in browsers where it behaves as spec'd, and stops other
    // elements (e.g. a Prop's :hover) from reacting mid-drag. It is NOT
    // load-bearing for the drag to function, though — see the window-level
    // pointermove/up/cancel listeners below, which is why this is wrapped
    // rather than left to throw: a capture failure here must never abort
    // the rest of this handler (dragging never turning true is exactly
    // what silently broke dragging in an earlier version of this code).
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* proceed uncaptured — window-level listeners still drive the drag */
    }
    pointerId = event.pointerId;
    // Capture the pre-drag default width BEFORE the first move writes a
    // custom one — this is the minimum every later clamp is measured
    // against, and it must be the untouched CSS-ratio value.
    measureChatPanelDefaultWidth();
    handle.classList.add("is-dragging");
    document.body.classList.add("app-split-dragging");
    dragging = true;
  });

  // Deliberately on `window`, not `handle`: the 16px hit area is narrow
  // enough that a normal-speed real drag routinely samples pointer
  // positions well outside it between events, and this must keep resizing
  // regardless of whether setPointerCapture above actually took hold in
  // this browser/runtime — "continue receiving pointermove even if the
  // pointer leaves the separator bounds" is the explicit requirement, and
  // making that depend entirely on capture succeeding is exactly what left
  // dragging non-functional before. `dragging`/`pointerId` (closure state,
  // set only by OUR OWN pointerdown above) is what actually scopes this to
  // an active drag — a window-wide listener is safe precisely because it's
  // a no-op whenever dragging is false.
  window.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    // Dragging LEFT moves the pointer away from the container's right edge,
    // so `containerRight - pointerX` grows and the right panel widens;
    // dragging RIGHT shrinks it back down to the minimum. See
    // widthForPointer() above for why this is absolute rather than delta.
    chatPanelWidthPx = widthForPointer(event.clientX);
    applyAppSplitWidth();
  });

  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  // A drag must always terminate cleanly even if the pointer leaves the
  // window or the tab loses focus — same defensive pattern as
  // initWorkspaceDivider().
  window.addEventListener("blur", endDrag);

  window.addEventListener("resize", applyAppSplitWidth);

  applyAppSplitWidth();
}

// ------------------------------------------------------- session lock
// `sessionConfigLocked` distinguishes "Send starts a new Symposium" from
// "Send continues this one" (see handleSend()) and drives the persistent
// input's placeholder. Once a Session begins, its configuration is fixed
// until Reset: Mode, the Scholar picker, and (in the Settings dialog)
// Provider/Model selections must never silently change mid-conversation, so
// while this is true the Mode toggle and Scholar cards are also visually
// locked (disabled, muted, a lock icon beside the Mode label) — visible so
// the player can still inspect the running Session's configuration, never
// hidden. They stay locked until Reset, which is the only path back to an
// editable picker.
let sessionConfigLocked = false;

// The locked (follow-up) placeholder must reflect the ACTIVE session's own
// mode (sessionState.mode) — never selectedMode, which the player may have
// already changed in the picker to prepare the *next* Symposium while this
// one is still locked. Mentor (single) has no Grand Sage at all, so it must
// never show the Council placeholder that names one.
function continuePlaceholderKey() {
  return sessionState?.mode === "single" ? "continuePlaceholderMentor" : "continuePlaceholder";
}

// Disables every Scholar card while sessionConfigLocked is true, regardless
// of its own ready/not-ready state — called both right after locking and
// defensively at the end of every buildScholarPicker() rebuild (a Settings
// save that doesn't need the reset-and-apply gate still refreshes the picker
// via loadStatus() while a Session may still be active).
function applyScholarPickerLock() {
  if (!sessionConfigLocked) return;
  for (const chip of els.scholarPicker.querySelectorAll(".scholar-chip")) {
    chip.disabled = true;
    chip.title = str("sessionLockedHint");
  }
}

function lockSessionConfig() {
  sessionConfigLocked = true;
  els.question.placeholder = str(continuePlaceholderKey());
  els.sessionLockIcon.hidden = false;
  els.sessionLockIcon.title = str("sessionLockedHint");
  for (const btn of els.modeToggle.querySelectorAll(".mode-btn")) {
    btn.disabled = true;
    btn.title = str("sessionLockedHint");
  }
  // "Use Vault" is Session-level too: the retrieval strategy must never
  // change halfway through a Session — same lock, same unlock (Reset).
  els.useVaultToggle.disabled = true;
  updateUseVaultHint();
  applyScholarPickerLock();
}

// Reset-only: rebuilds the Scholar picker from scratch (guaranteed-correct
// ready/ selected state, same as page load) and restores Mode's normal
// interaction and placeholder.
function unlockSessionConfig() {
  sessionConfigLocked = false;
  // updateChatAvailability() only governs Send/the input WHILE locked (see
  // its own doc comment) — it no-ops the instant sessionConfigLocked flips
  // false above, so it can never be the thing that re-enables them. Unlocking
  // is the one moment that must unconditionally clear whatever disabled
  // state the last in-flight run/chat left behind (busy, a failed answer,
  // Reset pressed mid-flight, …); a fresh Session always starts interactive.
  els.question.disabled = false;
  els.run.disabled = false;
  els.sessionLockIcon.hidden = true;
  els.useVaultToggle.disabled = false;
  updateUseVaultHint();
  // Reset is the ONE rebuild that deliberately returns to the default
  // selection instead of preserving the previous Session's choice.
  if (currentConfig) buildScholarPicker(currentConfig, { reset: true });
  setMode(selectedMode); // restores the mode-specific placeholder + resyncs the toggle/picker UI, and clears the mode buttons' locked disabled/title state
}

// --------------------------------------------------------- run / save / reset

function showConversation(mode, slots) {
  buildTabs(mode, slots);
  configureChatForMode(mode);
  els.chat.log.innerHTML = "";
  els.chat.log.hidden = true;
  updateChatAvailability();
}

function beginSession(question, mode, slots) {
  runStage = "preparing";
  runScholarsExpected = slots.length;
  runScholarsSettled = 0;
  judgeStageSince = null;
  console.debug("[council] run started", { mode, slots, questionChars: question.length });
  // A new run is the other way out of the lost state: whatever the server had
  // (or didn't) before this point stops mattering the moment it installs a
  // new Session. Cleared here, before anything renders, so the recovery panel
  // can never sit above a live discussion.
  hideSessionLost();
  sessionState = {
    id: null,
    question,
    mode,
    status: "active",
    scholars: {},
    judge: null,
    chat: [],
    vault: { state: "unsaved" },
    identity: currentConfig?.identity,
    metadata: { mode, status: "active", scholarCount: slots.length, vaultState: "unsaved" },
  };
  lockSessionConfig();
  setSessionSummaryExpanded(true); // every new Session starts with the ruling expanded
  showConversation(mode, slots);
  renderSessionHeader();
  setHeaderMsg("");
  // A retry after a previous fatal failure (see the !anyTabOk branch in
  // startSessionRun()) must start clean: back to the plain "waiting" empty
  // state, not the leftover error box from last time. Same for a Council
  // Pre-check failure — the real Council is legitimately starting now, so
  // any stale precheck error from an earlier aborted attempt must go too.
  hideSessionError();
  hideCouncilPrecheckError();
  els.discussionEmpty.hidden = false;
  // Session Summary itself stays hidden until the first successful answer
  // (see maybeRevealSessionSummary()) — the empty state just switches its
  // text from the initial invite to a waiting message.
  refreshDiscussionEmptyText();
}

function handleEvent(evt) {
  switch (evt.type) {
    case "ping":
      // Server heartbeat — its arrival already reset the stream inactivity
      // timer in runViaStream(); nothing to render.
      break;
    case "scholar_status": {
      // First tokens from one Scholar: it moved from "waiting for the
      // provider" to "receiving the response".
      const entry = tabAnswers[evt.data.key];
      if (entry && entry.status === "loading" && entry.stage !== "long") {
        entry.stage = evt.data.stage;
        if (activeTab === evt.data.key) renderActiveTab();
      }
      break;
    }
    case "librarian": {
      // Context package resolved — the Scholars are answering now. This is
      // also the exact point every participating Scholar's askScholar() call
      // genuinely starts concurrently server-side (see council.js) — the
      // real "Scholar begins thinking" moment.
      console.debug("[council] stage: scholars", evt.data);
      runStage = "scholars";
      renderLibrarian(evt.data);
      refreshRunProgressUI();
      // Part 3/4 — each Scholar reacts on its own staggered 1-3s delay
      // (never simultaneously), and its visible line may randomly come from
      // EITHER the scholar_thinking OR vault_gathering pool whenever a
      // search actually ran this turn (evt.data.skipped is false) — a fast
      // Vault query can resolve before a dedicated vault_gathering bubble
      // would ever be seen on its own, so its lines fold into this window
      // instead. Both Markdown states/sections stay fully separate on disk.
      const researchState = evt.data.skipped ? "scholar_thinking" : ["scholar_thinking", "vault_gathering"];
      scheduleStaggeredRoleSpeech(participatingScholarRoleIds(), researchState, { current_question: sessionState?.question });
      break;
    }
    case "scholar": {
      console.debug("[council] scholar settled", { key: evt.data.key, status: evt.data.status });
      if (sessionState) sessionState.scholars[evt.data.key] = evt.data;
      updateScholarTab(evt.data.key, evt.data);
      // The full answer just became visible in the right-side UI (this
      // pipeline never streams partial text — see Part 1 trace) — "this
      // Scholar is now speaking." A failed Scholar produced no real answer,
      // so it gets no reaction. Preserved exactly: immediate, individual,
      // never staggered — the natural asynchronous completion timing IS the
      // stagger (Part 5).
      if (evt.data.status === "ok") {
        const roleId = scholarRoleIdForKey(evt.data.key);
        if (roleId) triggerScholarSpeech(roleId, "scholar_answering", { current_question: sessionState?.question });
      }
      runScholarsSettled += 1;
      // Every Scholar settled: in council mode the Grand Sage synthesizes
      // next. The Grand Sage is the PRIMARY speaker for this phase, but the
      // state does not mean "only the Grand Sage may speak" (Part 6) —
      // Scholars are also eligible, just at a lower, staggered probability,
      // reacting to their OWN grand_sage_gathering lines.
      if (sessionState?.mode === "council" && runScholarsSettled >= runScholarsExpected) {
        console.debug("[council] stage: judge");
        runStage = "judge";
        judgeStageSince = Date.now();
        refreshRunProgressUI();
        const ctx = { current_question: sessionState?.question };
        triggerSageSpeech("grand_sage_gathering", ctx);
        scheduleStaggeredRoleSpeech(participatingScholarRoleIds(), "grand_sage_gathering", ctx, {
          probability: GRAND_SAGE_GATHERING_SCHOLAR_REACTION_PROBABILITY,
          minMs: GRAND_SAGE_GATHERING_SCHOLAR_DELAY_MIN_MS,
          maxMs: GRAND_SAGE_GATHERING_SCHOLAR_DELAY_MAX_MS,
        });
      }
      break;
    }
    case "judge":
      console.debug("[council] judge settled", { status: evt.data?.status });
      if (sessionState) sessionState.judge = evt.data;
      updateSummaryTab(evt.data);
      // The ruling just became visible atomically; a failed/skipped ruling
      // gets no reaction. This moment belongs to grand_sage_answering (Part
      // 7), NOT an immediate jump to post_answering: the Grand Sage gets
      // priority (a short ~0.3-0.8s delay, still effectively "first"), any
      // Scholar reactions are optional, staggered, and lower-probability,
      // landing noticeably later (~2-5s) — never simultaneous with the Sage
      // or with each other.
      if (evt.data?.status === "ok") {
        const ctx = { current_question: sessionState?.question };
        scheduleRoleSpeech(SPEECH_SAGE_ROLE_ID, "grand_sage_answering", ctx, randomBetween(GRAND_SAGE_ANSWERING_SAGE_DELAY_MIN_MS, GRAND_SAGE_ANSWERING_SAGE_DELAY_MAX_MS));
        scheduleStaggeredRoleSpeech(participatingScholarRoleIds(), "grand_sage_answering", ctx, {
          probability: GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY,
          minMs: GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MIN_MS,
          maxMs: GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MAX_MS,
        });
      }
      break;
    // The run has PAUSED: a Scholar failed terminally and the Grand Sage is
    // held until the player decides. Send stays unavailable (the button is
    // still Stop), the discussion keeps everything it already has, and the
    // decision panel is the only way forward.
    case "failure_gate":
      console.debug("[council] failure gate", evt.data);
      lastFailureNames = failureScholarNames(evt.data?.scholars).join(str("nameSeparator") || ", ");
      els.librarianStatus.textContent = str("awaitingDecision");
      openFailureDecision(evt.data?.runId, evt.data?.scholars);
      break;
    // The decision was applied server-side. For "continue" the Sage is now
    // working, so the normal progress UI comes back; for "stop" the run is
    // unwinding and the finally block below owns the rest.
    case "failure_decision":
      console.debug("[council] failure decision", evt.data);
      closeFailureDecision();
      if (evt.data?.decision === "continue") {
        runStage = "judge";
        judgeStageSince = Date.now();
        refreshRunProgressUI();
      }
      break;
    case "session":
      // Full Session with id + metadata: adopt it as the source of truth.
      console.debug("[council] session installed", { id: evt.data?.id });
      sessionState = { ...evt.data };
      renderSessionHeader();
      updateChatAvailability();
      break;
    case "error":
      throw new Error(evt.data.error || "Session run failed.");
  }
}

// Doesn't go through api() — this is a raw streaming fetch, not a JSON
// request/response — so it carries its own two-phase deadline, mirroring the
// server's timeout architecture: an INACTIVITY timer reset by every received
// chunk (the server heartbeats every 15s, so 60s of silence = the connection
// is dead) plus one hard ceiling. A run is never aborted merely because time
// passed while events are still flowing — that is exactly what let a healthy
// long analysis be cut off at a fixed deadline before.
async function runViaStream(question, options) {
  const controller = new AbortController();
  let timeoutCode = null;
  const abortWith = (code) => {
    if (!timeoutCode) {
      timeoutCode = code;
      controller.abort();
    }
  };
  const hardTimer = setTimeout(() => abortWith("hard_task_timeout"), RUN_HARD_TIMEOUT_MS);
  let inactivityTimer = setTimeout(() => abortWith("inactivity_timeout"), RUN_STREAM_INACTIVITY_MS);
  const sawActivity = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => abortWith("inactivity_timeout"), RUN_STREAM_INACTIVITY_MS);
  };
  try {
    const res = await fetch("/api/session/run/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, ...options }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const e = new Error(data.error || `${res.status} ${res.statusText}`);
      // Same code propagation api() does — carries "run_in_progress" (Run
      // Safety: the server already has a run in flight) so the caller can
      // tell a rejected duplicate apart from a genuine stream failure.
      e.code = data.code || null;
      e.httpStatus = res.status;
      throw e;
    }
    if (!res.body) throw new Error("Streaming not supported by this environment.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sawActivity(); // any bytes — events or heartbeat pings — prove life
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handleEvent(JSON.parse(line));
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      const code = timeoutCode || "timeout";
      const e = new Error(
        code === "hard_task_timeout"
          ? "Session run reached the maximum processing time."
          : "Session run timed out: no server activity."
      );
      e.code = code;
      throw e;
    }
    if (err instanceof TypeError) {
      const e = new Error(err.message);
      e.code = "network";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(hardTimer);
    clearTimeout(inactivityTimer);
  }
}

async function runViaSingleShot(question, options) {
  const session = await api(
    "/api/session/run",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, ...options }),
    },
    RUN_HARD_TIMEOUT_MS
  );
  const answeredRoles = [];
  for (const [key, scholar] of Object.entries(session.scholars || {})) {
    updateScholarTab(key, scholar);
    // Fallback path only (streaming failed before anything resolved) — the
    // whole run lands atomically with no intermediate events at all, so
    // there is no genuine scholar_thinking/vault_gathering moment here (Part
    // 1: "do not create fake delays just to manufacture a state"). This is
    // the earliest, and only, real "the answer is now visible" moment.
    if (scholar.status === "ok") {
      const roleId = scholarRoleIdForKey(key);
      if (roleId) answeredRoles.push(roleId);
    }
  }
  // Unlike the streaming path, every Scholar here genuinely settled at the
  // SAME instant (one atomic response) — there is no natural stagger to
  // preserve, so this is exactly the "multiple characters react at the same
  // time" case Part 3 asks to avoid; stagger it the same way.
  scheduleStaggeredRoleSpeech(answeredRoles, "scholar_answering", { current_question: session.question });
  if (session.judge) updateSummaryTab(session.judge);
  if (session.judge?.status === "ok") {
    const ctx = { current_question: session.question };
    scheduleRoleSpeech(SPEECH_SAGE_ROLE_ID, "grand_sage_answering", ctx, randomBetween(GRAND_SAGE_ANSWERING_SAGE_DELAY_MIN_MS, GRAND_SAGE_ANSWERING_SAGE_DELAY_MAX_MS));
    scheduleStaggeredRoleSpeech(answeredRoles, "grand_sage_answering", ctx, {
      probability: GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY,
      minMs: GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MIN_MS,
      maxMs: GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MAX_MS,
    });
  }
  sessionState = { ...session };
  // A fresh Session from a completed run: point the tab at it, so a reload
  // after a server restart can offer it as a continuation once it is saved.
  rememberSessionPointer();
  renderSessionHeader();
  updateChatAvailability();
}

// Fallback note title when the backend sent no title: the filename without
// its folders and extension. Never show paths or ".md" to the player.
function noteTitleFrom(source) {
  const base = String(source || "").split("/").pop() || "";
  return base.replace(/\.[^.]+$/, "");
}

// ---------------------------------------------------------- Library Activity
// A generic, in-world notification (bottom-right of the library scene) for
// background activity — Librarian retrieval today, future Scholar/Grand
// Sage/Historian/NPC activity later. It lives inside #library-panel, so it's
// automatically hidden in Chat Fullscreen (the whole panel is) — that mode
// falls back to the plain-text #librarian-status line in the conversation
// panel instead, exactly as before this feature existed.
const LIBRARY_ACTIVITY_MAX_TITLES = 3;
const LIBRARY_ACTIVITY_VISIBLE_MS = 6000;
let libraryActivityHideTimer = null;

// icon: emoji shown next to the (always generic) panel title.
// lines: pre-built, already-localized body lines (joined with \n via CSS
// white-space:pre-line, matching the existing #librarian-status pattern).
function showLibraryActivity(icon, lines) {
  els.libraryActivity.icon.textContent = icon;
  els.libraryActivity.body.textContent = lines.join("\n");
  els.libraryActivity.panel.classList.add("is-visible");
  clearTimeout(libraryActivityHideTimer);
  libraryActivityHideTimer = setTimeout(() => {
    els.libraryActivity.panel.classList.remove("is-visible");
  }, LIBRARY_ACTIVITY_VISIBLE_MS);
}

function hideLibraryActivity() {
  clearTimeout(libraryActivityHideTimer);
  els.libraryActivity.panel.classList.remove("is-visible");
}

// Tracks whether the librarian "found"/"none" event has arrived for the
// current search, so a run that ends without one (e.g. an early error) can
// resolve the "searching..." placeholder instead of leaving it stuck.
let libraryActivityResolved = true;

function librarySearchStarted() {
  libraryActivityResolved = false;
  showLibraryActivity("📖", [str("libraryActivitySearching")]);
  // Chat Fullscreen hides the library world entirely, so it keeps the
  // original plain-text retrieval status in the conversation panel instead.
  if (document.body.classList.contains("chat-full")) {
    els.librarianStatus.textContent = str("librarianSearching");
  }
}

// The Vault is part of the Aether world: the Librarian brings back books.
// Only the note count and clean document titles are ever shown — no paths,
// folders, filenames, or token counts.
function renderLibrarian(lib) {
  if (!lib) return;
  libraryActivityResolved = true;
  // Use Vault was off for this run: no search happened, so neither the
  // "found N" nor the misleading "no relevant notes found" presentation
  // applies — there is simply no library activity to show.
  if (lib.skipped) {
    hideLibraryActivity();
    return;
  }
  const sources = lib.sources || [];
  const titles = sources.map((src, i) => (lib.titles && lib.titles[i]) || noteTitleFrom(src));

  if (sources.length === 0) {
    showLibraryActivity("📚", [str("librarianNone")]);
  } else {
    const visible = titles.slice(0, LIBRARY_ACTIVITY_MAX_TITLES);
    const extra = titles.length - visible.length;
    const lines = [strT("libraryActivityFound", { count: sources.length }), ...visible.map((t) => `• ${t}`)];
    if (extra > 0) lines.push(strT("libraryActivityMore", { count: extra }));
    showLibraryActivity("📚", lines);
  }

  // Chat Fullscreen fallback — the EXISTING retrieval presentation, unchanged.
  if (document.body.classList.contains("chat-full")) {
    if (sources.length === 0) {
      els.librarianStatus.textContent = str("librarianNone");
    } else {
      const message =
        sources.length === 1
          ? str("librarianFoundOne")
          : str("librarianFound").replace("{count}", String(sources.length));
      els.librarianStatus.textContent = [message, ...titles.map((t) => `• ${t}`)].join("\n");
    }
  }
}

// The provider+model pairs a run is actually about to use: every selected
// Scholar slot, plus the Judge in Council mode (a recently-failed Judge
// model is just as much a reason to warn before spending an attempt).
// Sourced from currentConfig.scholarSlots/judgeProvider/judgeModel — the
// same normalized assignment data the picker itself is built from.
function selectedModelsForRun(mode, slots) {
  const models = [];
  for (const slot of slots) {
    const def = (currentConfig?.scholarSlots || []).find((s) => s.slot === slot);
    if (def?.provider && def?.model) models.push({ provider: def.provider, model: def.model });
  }
  if (mode === "council" && currentConfig?.judgeProvider && currentConfig?.judgeModel) {
    models.push({ provider: currentConfig.judgeProvider, model: currentConfig.judgeModel });
  }
  return models;
}

// De-duplicated model ids (across the given provider+model pairs) that
// currently have a failure record inside the 24-hour warning window.
function recentlyFailedModelsIn(models) {
  const seen = new Set();
  const failed = [];
  for (const { provider, model } of models) {
    const key = `${provider}:${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isRuntimeUnavailable(provider, model)) failed.push(model);
  }
  return failed;
}

// Resolves once the player picks Cancel (false) or Continue anyway (true).
// ESC / backdrop-dismiss (the dialog's native "close" without either button)
// counts as Cancel — the default must always be "don't spend the attempt."
// ------------------------------------------------- provider failure gate (UI)
// The server has parked the run: a Scholar failed terminally and the Grand
// Sage will not convene until the player authorizes it. This panel is the
// only way forward, so it is never dismissible by Escape/backdrop — the two
// buttons (or Stop on the composer) are the only exits.

// Product-level failure category -> a concise, localized reason. Raw provider
// text is deliberately never shown: the server sends only the category (see
// publicRunState in services/council.js).
const FAILURE_REASON_KEYS = {
  TIMEOUT: "failureReasonTimeout",
  MODEL_UNAVAILABLE: "failureReasonUnavailable",
  RATE_LIMITED: "failureReasonRateLimit",
  AUTH_ERROR: "failureReasonAuth",
  BILLING_ERROR: "failureReasonBilling",
  PROVIDER_ERROR: "failureReasonProvider",
};

let failureDecisionOpen = false;
let failureDecisionSubmitting = false;

function failureScholarNames(scholars) {
  return (scholars || []).map((s) => s.persona).filter(Boolean);
}

function closeFailureDecision() {
  if (!failureDecisionOpen) return;
  failureDecisionOpen = false;
  if (els.failureDecision.dialog.open) els.failureDecision.dialog.close();
}

// Opens (or re-opens, after a refresh) the decision panel for `runId`.
// Submitting is one-shot: both buttons disable on the first click so a double
// submit is impossible, and the panel closes only once the server has
// accepted the decision (or told us the run has moved on).
function openFailureDecision(runId, scholars) {
  if (failureDecisionOpen) return;
  failureDecisionOpen = true;
  failureDecisionSubmitting = false;
  currentRunId = runId;

  const names = failureScholarNames(scholars);
  const nameList = names.join(str("nameSeparator") || ", ");
  els.failureDecision.title.textContent = strT("failureGateTitle", { name: nameList });
  els.failureDecision.body.textContent = strT("failureGateQuestion", { name: nameList });
  // One concise reason when a single Scholar failed; with several, the
  // per-model reasons would be noise in a yes/no decision.
  const category = scholars?.length === 1 ? scholars[0].category : null;
  const reasonKey = category ? FAILURE_REASON_KEYS[category] : null;
  els.failureDecision.reason.textContent = reasonKey ? str(reasonKey) : "";
  els.failureDecision.reason.hidden = !reasonKey;
  els.failureDecision.continue.textContent = strT("failureGateContinue", { name: nameList });
  els.failureDecision.stop.textContent = str("failureGateStop");
  els.failureDecision.continue.disabled = false;
  els.failureDecision.stop.disabled = false;

  els.failureDecision.continue.onclick = () => submitFailureDecision(runId, "continue");
  els.failureDecision.stop.onclick = () => submitFailureDecision(runId, "stop");
  // `cancel` fires on Escape — the run is parked, so there is no safe
  // default to apply; the panel simply stays.
  els.failureDecision.dialog.oncancel = (event) => event.preventDefault();
  if (!els.failureDecision.dialog.open) els.failureDecision.dialog.showModal();
}

async function submitFailureDecision(runId, decision) {
  if (failureDecisionSubmitting) return;
  failureDecisionSubmitting = true;
  els.failureDecision.continue.disabled = true;
  els.failureDecision.stop.disabled = true;
  // Choosing Stop here is a stop: the composer must say so immediately,
  // exactly as if the Stop button had been pressed.
  if (decision === "stop") setRunButtonMode("stopping");
  try {
    await api("/api/session/failure-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, decision }),
    });
    closeFailureDecision();
    if (decision === "continue") {
      // Back to active progress: the Sage is running now.
      setRunButtonMode("stop");
      els.librarianStatus.textContent = "";
    }
  } catch (err) {
    // A stale decision (the run already ended, or a newer one started) is not
    // an error worth a dialog — the panel just closes and the normal
    // restore path takes over.
    console.debug("[run] failure decision rejected", err);
    closeFailureDecision();
    if (err?.code !== "stale_decision") setHeaderMsg(`⚠ ${friendlyErrorMessage(err)}`);
  } finally {
    failureDecisionSubmitting = false;
  }
}

function confirmModelFailureWarning(modelIds) {
  els.modelFailureWarning.list.innerHTML = modelIds.map((id) => `<li>${escapeHtml(id)}</li>`).join("");
  return new Promise((resolve) => {
    let decided = false;
    const finish = (result) => {
      if (decided) return;
      decided = true;
      resolve(result);
    };
    els.modelFailureWarning.cancel.onclick = () => {
      finish(false);
      els.modelFailureWarning.dialog.close();
    };
    els.modelFailureWarning.continue.onclick = () => {
      finish(true);
      els.modelFailureWarning.dialog.close();
    };
    els.modelFailureWarning.dialog.addEventListener("close", () => finish(false), { once: true });
    els.modelFailureWarning.dialog.showModal();
  });
}

// ------------------------------------------------- Council Model Pre-check
// Intercepts Send for Council mode ONLY (never Mentor — §1) before any real
// Session begins, per the Council Model Pre-check spec. See
// src/services/council.js's precheckCouncil() for the actual check and
// src/config.js for councilAutoCheck/councilAckSignature/keyFingerprint.

// The "meaningful identity" of a Council configuration (§2): provider +
// model for every Scholar slot THIS run will actually use (the same `slots`
// startSessionRun() already resolved — not every slot 1-3 regardless of
// whether it's enabled/selected) plus the Grand Sage, each combined with
// that provider's non-secret keyFingerprint so a relevant API key change is
// caught too, without the frontend ever seeing the key itself. Pure,
// order-independent (slots sorted), opaque text — safe to persist/compare.
function councilConfigSignature(slots) {
  if (!currentConfig) return "";
  const fp = (providerId) => currentConfig.providers?.[providerId]?.keyFingerprint || "";
  const parts = [...slots].sort((a, b) => a - b).map((slot) => {
    const s = (currentConfig.scholarSlots || []).find((x) => x.slot === slot);
    return `s${slot}:${s?.provider || ""}:${s?.model || ""}:${fp(s?.provider)}`;
  });
  parts.push(
    `judge:${currentConfig.judgeProvider || ""}:${currentConfig.judgeModel || ""}:${fp(currentConfig.judgeProvider)}`
  );
  return parts.join("|");
}

// Resolves { choice: "check" | "skip", autoCheck } or null (dismissed via
// ESC/backdrop — treated as "do nothing", matching
// confirmModelFailureWarning()'s own safe-default convention: an unresolved
// dialog never causes an action). The checkbox reflects — and, on either
// button, reports back — the SAME councilAutoCheck preference Settings
// shows; neither button is hidden or visually weakened relative to the
// other (§4 "This is a recommendation, not forced behavior").
function confirmCouncilCheckDialog() {
  const c = els.councilCheck;
  c.autoChk.checked = Boolean(currentConfig?.councilAutoCheck);
  return new Promise((resolve) => {
    let decided = false;
    const finish = (result) => {
      if (decided) return;
      decided = true;
      resolve(result);
    };
    c.skip.onclick = () => {
      finish({ choice: "skip", autoCheck: c.autoChk.checked });
      c.dialog.close();
    };
    c.run.onclick = () => {
      finish({ choice: "check", autoCheck: c.autoChk.checked });
      c.dialog.close();
    };
    c.dialog.addEventListener("close", () => finish(null), { once: true });
    c.dialog.showModal();
  });
}

// POST /api/council/precheck — a minimal, non-generating availability check
// for the given Scholar slots + the Grand Sage (precheckCouncil() in
// council.js). Never creates or touches a Session.
// `overrides` (optional — see server.js's parsePrecheckOverrides()): checks
// an EXPLICIT participant configuration instead of the saved runtime
// config — used only by Settings' manual "Check Models Now" (see
// currentSettingsFormOverrides() below). The Send-flow gate always calls
// this with no second argument; JSON.stringify drops an undefined value
// entirely, so its wire payload is byte-for-byte unchanged by this option
// existing at all.
async function runCouncilPrecheck(slots, overrides) {
  return api("/api/council/precheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scholars: slots, overrides }),
  });
}

// Silently writes the Council Model Check preference/acknowledgment through
// the SAME settings/.env.local path as every other setting (settings.js) —
// never a separate client-only preference store (§6/§15). Reuses
// loadStatus() to refresh currentConfig afterwards, exactly like the
// Settings dialog's own save already does. A failure here never blocks the
// Council run that's already proceeding — worst case, the notice simply
// reappears next time, the safe direction to fail in.
async function persistCouncilAck({ autoCheck, ackSignature } = {}) {
  const payload = {};
  if (autoCheck !== undefined) payload.councilAutoCheck = autoCheck ? "true" : "false";
  if (ackSignature) payload.councilAckSignature = ackSignature;
  if (Object.keys(payload).length === 0) return;
  try {
    await api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await loadStatus();
  } catch (err) {
    console.debug("[council-check] failed to persist preference:", err.message);
  }
}

// Normalizes classifyProviderError()'s categories (src/providers/errors.js)
// into the localized, human-readable explanation shown per failed
// participant (§10) — billing kept deliberately distinct from a generic
// "unavailable" (§10's special case), never collapsed together.
const COUNCIL_ERROR_CATEGORY_KEYS = {
  MODEL_UNAVAILABLE: "councilErrorModelUnavailable",
  AUTH_ERROR: "councilErrorAuth",
  BILLING_ERROR: "councilErrorBilling",
  RATE_LIMITED: "councilErrorRateLimited",
  TIMEOUT: "councilErrorTimeout",
  PROVIDER_ERROR: "councilErrorProvider",
};

// Persistent Council-level failure (§9) — shown INSTEAD of starting a real
// Council; never only a toast, never auto-dismissed. Only the FAILED
// participants are listed. Mandatory Grand-Sage-tab routing (§9B): switches
// any leftover tab bar from a PREVIOUS Session to its Grand Sage/Summary
// tab (that tab's own real content is never touched — this block is the
// closest thing to "the Grand Sage tab" that exists before a NEW Session
// begins, since no tab bar exists yet at pre-check time).
// One failed-participant row (role, provider · model, localized category
// message) — shared by the Send-flow's #council-precheck-error block and
// Settings' manual "Check Models Now" result panel, so the two surfaces
// never duplicate this rendering.
function buildCouncilPrecheckRow(r) {
  const row = document.createElement("div");
  row.className = "council-precheck-row";
  const role = document.createElement("div");
  role.className = "council-precheck-row-role";
  role.textContent = r.persona || r.role;
  const model = document.createElement("div");
  model.className = "council-precheck-row-model";
  model.textContent = r.model ? `${r.label || r.provider} · ${r.model}` : r.label || r.provider;
  const message = document.createElement("div");
  message.className = "council-precheck-row-message";
  message.textContent = str(COUNCIL_ERROR_CATEGORY_KEYS[r.category] || "councilErrorProvider");
  row.append(role, model, message);
  return row;
}

function showCouncilPrecheckError(results) {
  hideSessionError(); // the two failure surfaces are mutually exclusive
  const e = els.councilPrecheckError;
  e.list.innerHTML = "";
  for (const r of results.filter((r) => !r.ok)) {
    e.list.appendChild(buildCouncilPrecheckRow(r));
  }
  e.section.hidden = false;
  if (tabAnswers.summary) activateTab("summary");
  e.section.scrollIntoView({ block: "center" });
}

function hideCouncilPrecheckError() {
  els.councilPrecheckError.section.hidden = true;
}

// ---------------------------------------- Settings manual "Check Models Now"
// Lets the player test the CURRENTLY SAVED Grand Sage + Scholar
// configuration on demand, independent of councilAutoCheck, without ever
// showing the first-time notice or starting a Session. Reuses
// runCouncilPrecheck() exactly — the same POST /api/council/precheck the
// Send-flow gate calls — so there is only ever one pre-check implementation.
// Results render inline in #council-check-manual-result, never routed to
// the Grand-Sage-tab #council-precheck-error block (that surface exists
// only for the Send-flow gate).

function showManualCouncilCheckSuccess() {
  const e = els.settings.councilManualCheckResult;
  e.className = "council-check-manual-result is-ok";
  e.textContent = str("councilCheckManualSuccess");
  e.hidden = false;
}

function showManualCouncilCheckFailure(results) {
  const e = els.settings.councilManualCheckResult;
  e.className = "council-check-manual-result is-fail";
  e.innerHTML = "";
  for (const r of results.filter((r) => !r.ok)) {
    e.appendChild(buildCouncilPrecheckRow(r));
  }
  e.hidden = false;
}

// Reads the Settings form's CURRENT selections directly off the live `sx`
// DOM refs — including any change the player made but has not saved yet.
// This is the whole fix for the "manual check silently tested the saved
// configuration instead of what's visibly selected" bug: the button must
// validate exactly what's on screen, never config.scholarSlots/judgeProvider
// straight from the server (that's what the Send-flow gate is for).
function currentSettingsFormOverrides() {
  return {
    judgeProvider: sx.judge.providerSel.value,
    judgeModel: sx.judge.modelSel.value,
    scholarSlots: [1, 2, 3].map((n) => ({
      slot: n,
      provider: sx.scholars[n].providerSel.value,
      model: sx.scholars[n].modelSel.value,
      enabled: sx.scholars[n].enabledChk.checked,
    })),
  };
}

// True only when the form's current values are IDENTICAL to the saved/
// runtime configuration (currentConfig) — i.e. nothing unsaved. A
// successful manual check may acknowledge (persist councilAckSignature for)
// the saved configuration ONLY when this holds; otherwise the check tested
// unsaved configuration B while the saved one is still A, and acknowledging
// A would be wrong (see the IMPORTANT ACKNOWLEDGMENT RULE this fixes).
function formOverridesMatchSavedConfig(overrides) {
  if (!currentConfig) return false;
  if (overrides.judgeProvider !== currentConfig.judgeProvider) return false;
  if ((overrides.judgeModel || "") !== (currentConfig.judgeModel || "")) return false;
  for (const s of overrides.scholarSlots) {
    const saved = (currentConfig.scholarSlots || []).find((cs) => cs.slot === s.slot);
    if (!saved) return false;
    if (s.provider !== saved.provider) return false;
    if (s.model !== saved.model) return false;
    if (Boolean(s.enabled) !== Boolean(saved.enabled)) return false;
  }
  return true;
}

async function runManualCouncilCheck() {
  if (councilManualCheckInFlight) return; // duplicate clicks never start a parallel check
  councilManualCheckInFlight = true;
  const btn = els.settings.councilManualCheckBtn;
  const resultEl = els.settings.councilManualCheckResult;
  btn.disabled = true;
  btn.textContent = str("councilCheckChecking");
  resultEl.hidden = true;
  resultEl.innerHTML = "";
  try {
    // The exact configuration currently VISIBLE in the form — including any
    // unsaved change — never the saved runtime config. Settings is never
    // saved as a side effect of this (no saveSettings()/POST /api/settings
    // call here at all), and config.scholarSlots/judgeProvider/judgeModel
    // are never read server-side for this call either (see precheckCouncil()).
    const overrides = currentSettingsFormOverrides();
    let result;
    try {
      result = await runCouncilPrecheck(undefined, overrides);
    } catch (err) {
      showManualCouncilCheckFailure([
        { role: "precheck", persona: str("councilCheckTitle"), provider: "", label: "", model: "", ok: false, category: "PROVIDER_ERROR" },
      ]);
      return;
    }
    if (result.ok) {
      showManualCouncilCheckSuccess();
      // A successful check acknowledges exactly the configuration it
      // tested — the SAME semantics as Check & Start / Start Without
      // Checking (never a separate mechanism) — but ONLY when that tested
      // configuration is exactly what's already saved: acknowledging the
      // SAVED configuration after actually testing a different, unsaved one
      // would be wrong (see formOverridesMatchSavedConfig()'s own comment).
      // autoCheck is intentionally omitted from this call either way, so
      // councilAutoCheck is never touched by the manual button.
      if (formOverridesMatchSavedConfig(overrides)) {
        const checkedSlots = result.results
          .filter((r) => r.role.startsWith("scholar"))
          .map((r) => Number(r.role.replace("scholar", "")));
        await persistCouncilAck({ ackSignature: councilConfigSignature(checkedSlots) });
        // Batch A status: a manual check of the SAVED configuration is a
        // real, precise outcome for this page load. Recorded against the
        // whole-Council signature the status views use. Deliberately not
        // recorded when the form holds unsaved overrides — that result
        // describes a configuration the product isn't actually running.
        noteModelCheckObserved(fullCouncilSignature(), "passed");
      }
    } else {
      if (formOverridesMatchSavedConfig(overrides)) {
        noteModelCheckObserved(fullCouncilSignature(), "failed");
      }
      showManualCouncilCheckFailure(result.results);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = str("councilCheckManualBtn");
    councilManualCheckInFlight = false;
  }
}

// Runs the actual minimal check and decides whether the real Council may
// start. A FAILED check's configuration is deliberately never acknowledged
// (no ackSignature persisted) — the notice/auto-check must catch the SAME
// still-broken configuration again next time rather than silently letting a
// real Council run start with a known-broken participant (§8 Atomic Council
// start is the whole point of this feature).
async function runPrecheckAndProceed(slots, signature, { autoCheck } = {}) {
  hideCouncilPrecheckError();
  let result;
  try {
    result = await runCouncilPrecheck(slots);
  } catch (err) {
    // The pre-check ENDPOINT itself failed (network/timeout reaching our own
    // server) — never silently let the real Council start unchecked. No
    // real per-participant results exist yet, so this is one synthetic row
    // naming the check itself rather than any specific role.
    showCouncilPrecheckError([
      { role: "precheck", persona: str("councilCheckTitle"), provider: "", label: "", model: "", ok: false, category: "PROVIDER_ERROR" },
    ]);
    return false;
  }
  if (result.ok) {
    // Record the PRECISE outcome for this page load (Batch A status): the
    // persisted ackSignature alone can't distinguish this pass from an
    // informed skip once reloaded, so the status UIs prefer this while it
    // still describes the current configuration.
    noteModelCheckObserved(signature, "passed");
    await persistCouncilAck({ autoCheck, ackSignature: signature });
    return true;
  }
  noteModelCheckObserved(signature, "failed");
  showCouncilPrecheckError(result.results);
  return false;
}

// The gate itself — called from startSessionRun() before beginSession(),
// Council mode only. Returns true to let Send proceed, false to abort it
// entirely (nothing mutated yet at this point — question/composer stay
// untouched, exactly like the recentlyFailed gate right after this one).
async function runCouncilConfigGate(slots) {
  const signature = councilConfigSignature(slots);

  if (currentConfig?.councilAutoCheck) {
    // Already authorized: every Council Send silently pre-checks, no modal,
    // regardless of whether the configuration changed (§5 — automatic
    // checking continues across a model change without another modal).
    return runPrecheckAndProceed(slots, signature);
  }

  // Not authorized: only interrupt Send when this exact configuration was
  // never acknowledged (first Council use) or has changed since it was (§3
  // Cases A/B/C). An unchanged, already-acknowledged configuration never
  // shows the notice again — this feature must never interrupt normal flow.
  if (currentConfig?.councilAckSignature && currentConfig.councilAckSignature === signature) {
    return true;
  }

  const decision = await confirmCouncilCheckDialog();
  if (!decision) return false; // dismissed — safest default, do nothing

  if (decision.choice === "skip") {
    // An explicit, informed choice to skip IS an acknowledgment of this
    // configuration (§5) — never re-asked until it changes again.
    await persistCouncilAck({ autoCheck: decision.autoCheck, ackSignature: signature });
    return true;
  }
  return runPrecheckAndProceed(slots, signature, { autoCheck: decision.autoCheck });
}

// ------------------------------------------------- AI / Product Status (A)
// Read-only status for the Core Book modal and the Product Status view.
// Mirrors src/services/productStatus.js (this file is a plain global-scope
// script and can't import an ES module — same convention as
// animationPlayback/animationBehavior/appSplitLayout); that module is where
// this logic is actually unit-tested.
//
// Nothing here performs a network request. Both UIs render purely from
// `currentConfig` (already fetched) and `vaultState` (already fetched), so
// opening either one can never consume the player's API credit or trigger
// the Council Model Pre-check.

const MODEL_CHECK = {
  NOT_CHECKED: "not_checked",
  PASSED: "passed",
  ACKNOWLEDGED: "acknowledged",
  NEEDS_RECHECK: "needs_recheck",
  FAILED: "failed",
};

// The outcome of a check THIS page load actually observed, if any:
// { signature, result: "passed" | "failed" }. Deliberately session-scoped —
// the backend persists no pass/fail record and no timestamp, so this is the
// only place a precise outcome can honestly live. Cleared implicitly by a
// reload, which is correct: after a reload we genuinely no longer know.
let observedModelCheck = null;

function noteModelCheckObserved(signature, result) {
  if (!signature) return;
  observedModelCheck = { signature, result };
}

// All three Scholar slots + the Judge — the configuration the Product Status
// view describes. (The send-time gate signs only the slots a given run uses;
// this is the whole-Council view, which is why it can differ.)
function fullCouncilSignature() {
  return councilConfigSignature([1, 2, 3]);
}

function modelCheckStatus({ ackSignature = "", currentSignature = "", observed = null } = {}) {
  if (observed && observed.signature && observed.signature === currentSignature) {
    if (observed.result === "failed") return { state: MODEL_CHECK.FAILED, fromSession: true };
    if (observed.result === "passed") return { state: MODEL_CHECK.PASSED, fromSession: true };
  }
  if (!ackSignature) return { state: MODEL_CHECK.NOT_CHECKED, fromSession: false };
  if (!currentSignature || ackSignature !== currentSignature) {
    return { state: MODEL_CHECK.NEEDS_RECHECK, fromSession: false };
  }
  return { state: MODEL_CHECK.ACKNOWLEDGED, fromSession: false };
}

const MODEL_CHECK_STRING_KEYS = {
  [MODEL_CHECK.NOT_CHECKED]: "modelCheckNotChecked",
  [MODEL_CHECK.PASSED]: "modelCheckPassed",
  [MODEL_CHECK.ACKNOWLEDGED]: "modelCheckAcknowledged",
  [MODEL_CHECK.NEEDS_RECHECK]: "modelCheckNeedsRecheck",
  [MODEL_CHECK.FAILED]: "modelCheckFailed",
};

function currentModelCheckStatus() {
  return modelCheckStatus({
    ackSignature: currentConfig?.councilAckSignature || "",
    currentSignature: fullCouncilSignature(),
    observed: observedModelCheck,
  });
}

// Providers in their canonical PROVIDER_DEFS order, as publicConfig sends
// them. `configured` = credentials exist, NOT "passed the model check".
function providerStatusList() {
  const providers = currentConfig?.providers || {};
  return Object.entries(providers).map(([id, p]) => ({
    id,
    label: p?.label || id,
    configured: Boolean(p?.configured),
    enabled: Boolean(p?.enabled),
  }));
}

function providerStateLabel(p) {
  if (!p.configured) return { text: str("statusNotConfigured"), cls: "ai-off" };
  // Keyed but switched off in Settings — "configured" is still true, and
  // saying otherwise would misreport the credential state.
  if (!p.enabled) return { text: str("statusDisabled"), cls: "ai-off" };
  return { text: str("statusConfigured"), cls: "ai-on" };
}

function row(listEl, keyText, valText, valCls) {
  const li = document.createElement("li");
  const k = document.createElement("span");
  k.className = "ps-key";
  k.textContent = keyText;
  const v = document.createElement("span");
  v.className = `ps-val${valCls ? ` ${valCls}` : ""}`;
  v.textContent = valText;
  li.append(k, v);
  listEl.appendChild(li);
}

// Core Book modal's compact section. Called on every open so it always
// reflects the CURRENT config (a Settings change between opens shows up)
// without ever re-fetching or re-checking anything.
function renderCoreBookAiStatus() {
  const m = els.modeModal;
  if (!m.aiList) return;
  m.aiTitle.textContent = str("aiStatusTitle");
  m.aiList.innerHTML = "";
  for (const p of providerStatusList()) {
    const state = providerStateLabel(p);
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "ai-name";
    name.textContent = p.label;
    const val = document.createElement("span");
    val.className = state.cls;
    val.textContent = state.text;
    li.append(name, val);
    m.aiList.appendChild(li);
  }
  const check = currentModelCheckStatus();
  m.aiCheck.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = `${str("modelCheckLabel")}: `;
  const value = document.createElement("span");
  value.textContent = str(MODEL_CHECK_STRING_KEYS[check.state]);
  if (check.state === MODEL_CHECK.FAILED || check.state === MODEL_CHECK.NEEDS_RECHECK) {
    value.className = "ai-warn";
  }
  m.aiCheck.append(label, value);
}

function vaultStateLabel() {
  if (!vaultState.configured) return { text: str("productStatusVaultNone"), cls: "ai-off" };
  if (!vaultState.exists) return { text: str("productStatusVaultMissing"), cls: "ai-warn" };
  return { text: str("productStatusVaultConnected"), cls: "ai-on" };
}

function renderProductStatus() {
  const ps = els.productStatus;
  if (!ps.dialog) return;
  ps.title.textContent = str("productStatusTitle");
  ps.providersTitle.textContent = str("productStatusProviders");
  ps.councilTitle.textContent = str("productStatusCouncil");
  ps.checkTitle.textContent = str("productStatusModelCheck");
  ps.vaultTitle.textContent = str("productStatusVault");
  ps.note.textContent = str("productStatusReadOnly");
  ps.closeBtn.textContent = str("productStatusClose");

  ps.providers.innerHTML = "";
  for (const p of providerStatusList()) {
    const state = providerStateLabel(p);
    row(ps.providers, p.label, state.text, state.cls);
  }

  // Council — Grand Sage first, then the three Scholar slots. A slot shows
  // its own provider/model even when several slots share one provider:
  // Council never requires three distinct providers.
  ps.council.innerHTML = "";
  const providers = currentConfig?.providers || {};
  const judgeProvider = currentConfig?.judgeProvider || "";
  const judgeLabel = providers[judgeProvider]?.label || judgeProvider || "—";
  const judgeModel = currentConfig?.judgeModel || providers[judgeProvider]?.model || "—";
  row(
    ps.council,
    str("productStatusGrandSage"),
    `${judgeLabel} · ${judgeModel}`,
    providers[judgeProvider]?.configured ? "" : "ai-off"
  );
  for (const s of currentConfig?.scholarSlots || []) {
    const name = currentConfig?.identity?.scholars?.[s.slot] || strT("productStatusScholarSlot", { n: s.slot });
    const label = providers[s.provider]?.label || s.provider || "—";
    const off = s.enabled === false ? ` (${str("productStatusSlotOff")})` : "";
    row(ps.council, name, `${label} · ${s.model || "—"}${off}`, s.ready ? "" : "ai-off");
  }

  // Model check — the derived state plus the two honest caveats: whether
  // automatic checking is on, and that no last-check time is recorded.
  ps.check.innerHTML = "";
  const check = currentModelCheckStatus();
  row(
    ps.check,
    str("modelCheckLabel"),
    str(MODEL_CHECK_STRING_KEYS[check.state]),
    check.state === MODEL_CHECK.FAILED || check.state === MODEL_CHECK.NEEDS_RECHECK ? "ai-warn" : ""
  );
  const auto = document.createElement("li");
  const autoText = document.createElement("span");
  autoText.className = "ps-key";
  autoText.textContent = currentConfig?.councilAutoCheck
    ? str("productStatusAutoCheckOn")
    : str("productStatusAutoCheckOff");
  auto.appendChild(autoText);
  ps.check.appendChild(auto);
  const noTime = document.createElement("li");
  const noTimeText = document.createElement("span");
  noTimeText.className = "ps-key";
  noTimeText.textContent = str("productStatusNoLastCheck");
  noTime.appendChild(noTimeText);
  ps.check.appendChild(noTime);

  ps.vault.innerHTML = "";
  const v = vaultStateLabel();
  row(ps.vault, str("productStatusVault"), v.text, v.cls);
  if (vaultState.path) row(ps.vault, "", vaultState.path, "");
}

function openProductStatus() {
  renderProductStatus();
  els.productStatus.dialog.showModal();
}

async function startSessionRun() {
  if (runInFlight) return; // a run is already underway — never double-submit
  const question = els.question.value.trim();
  if (!question) {
    els.question.focus();
    return;
  }
  const slots = [...selectedSlots].sort((a, b) => a - b);
  if (slots.length === 0) {
    els.librarianStatus.textContent = str("needScholar");
    return;
  }
  if (anyAttachmentLoading()) {
    els.librarianStatus.textContent = str("attachmentsLoading");
    return;
  }

  // Council Model Check (§1: Council mode only, never Mentor). Checked here,
  // before ANYTHING is mutated, so an abort (dismissed notice, or a real
  // pre-check failure) leaves the question and composer completely
  // untouched — same "nothing spent yet" guarantee as the recentlyFailed
  // gate right after it. Send is disabled for the duration so a slow modal
  // decision or network round-trip can't be double-submitted.
  if (selectedMode === "council") {
    els.run.disabled = true;
    const proceed = await runCouncilConfigGate(slots);
    els.run.disabled = false;
    if (!proceed) return;
  }

  // Ask before spending an attempt on a model recently confirmed unavailable
  // — never silently blocked or switched, just a confirmation. Checked here,
  // before ANYTHING is mutated, so Cancel leaves the question and composer
  // completely untouched.
  const recentlyFailed = recentlyFailedModelsIn(selectedModelsForRun(selectedMode, slots));
  if (recentlyFailed.length > 0) {
    const proceed = await confirmModelFailureWarning(recentlyFailed);
    if (!proceed) return;
  }

  const useVault = els.useVaultToggle.checked;
  const options = {
    mode: selectedMode,
    scholars: slots,
    materials: materialsPayload(),
    useVault,
    continuation: continuationLineage(),
  };

  runInFlight = true;
  els.question.value = "";
  // Every gate above returns without reaching this line: an empty question,
  // no Scholar selected, attachments still loading, a dismissed or failed
  // Council Model Check, a declined recently-failed-model warning. Reaching
  // here is the application confirming the run genuinely starts — the one
  // point at which the main draft has been consumed. A pending debounced
  // write is cancelled first so it cannot re-save the just-sent text.
  cancelPendingDraftSave();
  clearMainDraft();
  // The composer button becomes Stop for the whole run — deliberately NOT
  // disabled: cancelling is the one thing that must stay available while a
  // run is working.
  setRunButtonMode("stop");
  // With Use Vault off there is no search to announce — the librarian event
  // still arrives (skipped: true) and renderLibrarian() resolves it quietly.
  if (useVault) librarySearchStarted();
  beginSession(question, selectedMode, slots);
  // Omega's walk to core_book_wait runs in PARALLEL with the AI pipeline
  // below — fire-and-forget, never awaited, never blocks the request.
  onCoreBookQuestionSubmitted();
  // Idle Controller: an active session owns every Character Bubble now —
  // PRE/POST idle scheduling stops immediately, any visible idle Bubble is
  // cleared, and the speech generation bumps. Deliberately called BEFORE
  // emitQuestionSubmittedSpeech below, so that reaction is scheduled under
  // the NEW generation rather than immediately invalidated by it.
  idleEnterActive();
  // Speech Bridge: staggered pre_thinking reaction, fire-and-forget, never
  // awaited, never blocks the request.
  emitQuestionSubmittedSpeech(question, selectedMode);

  try {
    try {
      await runViaStream(question, options);
    } catch (err) {
      // A rejected duplicate (Run Safety) is not a broken stream — the plain
      // endpoint would reject it identically. Surface it as-is instead of
      // spending a second request to be told the same thing.
      if (err?.code === "run_in_progress") throw err;
      // Retry once via the plain endpoint if streaming failed before any tab
      // resolved.
      const anyResolved = Object.values(tabAnswers).some((t) => t.status !== "loading");
      if (!anyResolved) await runViaSingleShot(question, options);
      else throw err;
    }
    // The Session consumed the attached materials; a failed run keeps them so
    // the player can retry without re-attaching.
    clearAttachments();
  } catch (err) {
    console.debug("[council] run failed", err);
    setHeaderMsg(`⚠ ${friendlyErrorMessage(err)}`);
  } finally {
    // The run is over, however it ended: no stage message may survive it, and
    // every still-"loading" entry becomes a terminal error — the UI must
    // never stay "in progress" forever.
    runInFlight = false;
    runStage = null;
    judgeStageSince = null;
    // Terminal: the button goes back to Send, and no decision panel may
    // outlive the run it belonged to.
    currentRunId = null;
    closeFailureDecision();
    setRunButtonMode("send");
    console.debug("[council] run settled");
    // Omega's presentation phase (see tryAdvanceInteraction) only proceeds
    // once both this AND Omega's own arrival are ready. Fires on success OR
    // failure — Omega must never wait forever on a failed run.
    onCoreBookAiSettled();
    for (const entry of Object.values(tabAnswers)) {
      if (entry.status !== "loading") continue;
      // A run the user stopped leaves its unfinished tabs "stopped", not
      // "failed" — see the canonical outcome priority above.
      if (sessionState?.outcome === "stopped") Object.assign(entry, { status: "stopped", error: null });
      else Object.assign(entry, { status: "error", error: str("noAnswer") });
    }
    syncTabStatuses();
    renderActiveTab();
    // The run is over: never leave the "searching" placeholder up if the
    // librarian event never arrived (e.g. the run failed before it fired).
    if (!libraryActivityResolved) renderLibrarian({ sources: [] });
    // Nothing at all came out of this run — every Scholar (and the Judge, in
    // Council mode) failed, or the run never even reached a session id. This
    // is the ONLY condition that shows the fatal session-level error (see
    // showSessionError()) and flips the Session status badge to "error" — a
    // PARTIAL failure (some Scholars ok) still has real content and must
    // stay a per-tab error only; Session Summary reveals it normally via
    // maybeRevealSessionSummary(), which otherwise never fires and would
    // leave "請稍候…"/"waiting" and the "active" status badge stuck forever.
    const anyTabOk = Object.values(tabAnswers).some((entry) => entry.status === "ok");
    // Part 12/18 — the overall cycle completed successfully (produced real
    // content); a total failure must never look like a successful
    // conversation, so POST THINKING only begins when anyTabOk is true —
    // reusing the SAME success signal the run already computes for itself,
    // no separate error/cancel handling needed.
    //
    // Conversation Bridge fix (Part 7/8): post_answering no longer fires
    // immediately for every participating Role here — that was the actual
    // bug ("four characters immediately produce dialogue... transitions
    // straight into post_answering"), stomping on grand_sage_answering's own
    // reaction (still in flight or just shown) the instant the run settled.
    // post_answering is now a purely AMBIENT state: idleEnterPost starts its
    // own randomized 8-20s-delayed, low-frequency, one-at-a-time scheduler
    // (maybeTriggerPostIdle) — nothing shows here, immediately, at all.
    if (anyTabOk) {
      // Idle Controller: a session with real content enters POST THINKING
      // (Part 5) — the exact Roles that just participated, for up to
      // POST_IDLE_DURATION_MS, then automatically back to PRE THINKING.
      const postRoleIds = participatingScholarRoleIds();
      if (sageParticipates(sessionState?.mode)) postRoleIds.push(SPEECH_SAGE_ROLE_ID);
      idleEnterPost(postRoleIds);
    } else {
      // A total failure produced no real completed session to retain
      // context from — go straight back to normal idle, never through POST.
      idleEnterPre();
    }
    // Canonical outcome priority — see presentRunOutcome() below and
    // src/services/runPresentation.js. A run the USER stopped must never be
    // rendered as a provider failure: no "Model unavailable" panel, no
    // "choose another model" guidance, no error badge.
    const presentation = presentRunOutcome({
      outcome: sessionState?.outcome,
      // A run that never reached a session id failed outright, whatever its
      // tabs say.
      anyAnswerOk: anyTabOk && Boolean(sessionState?.id),
    });
    if (presentation.showProviderFailureGuidance) {
      els.discussionEmpty.hidden = true;
      showSessionError();
    } else if (presentation.kind === "stopped") {
      // Nothing arrived before the stop: replace the "waiting" placeholder
      // with the stopped notice rather than the model-failure panel.
      els.discussionEmpty.hidden = true;
      showSessionStopped();
    }
    if (sessionState && presentation.status !== "active") {
      sessionState.status = presentation.status;
      sessionState.metadata = { ...sessionState.metadata, status: presentation.status };
      renderSessionHeader();
    }
    applyRunButtonLabel();
    if (presentation.messageKey === "continuedWithout" && lastFailureNames) {
      setHeaderMsg(strT("continuedWithout", { name: lastFailureNames }));
    } else if (presentation.messageKey === "noUsableResponses") {
      setHeaderMsg(`⚠ ${str(presentation.messageKey)}`);
    } else if (presentation.messageKey) {
      setHeaderMsg(str(presentation.messageKey));
    }
    lastFailureNames = null;
    if (chatReady()) {
      // Authoritative now that the Session is locked: disables Send/the
      // input again if there's still nothing valid to continue (e.g. every
      // Scholar failed), instead of unconditionally re-enabling them.
      updateChatAvailability();
    } else {
      // Nothing usable came out of this run (total failure, or every
      // Scholar/Judge failed) — there is nothing to continue via follow-up,
      // so staying "locked" would strand the composer with no way forward
      // except Reset. Unlock back to "start a new Symposium" and restore the
      // question so the player can retry immediately via the normal Send
      // flow, with the same input they already typed.
      unlockSessionConfig();
      els.question.value = question;
      // The composer is the main one again and holds the question, so the
      // draft must too — a programmatic value write fires no `input` event,
      // and a refresh at this moment would otherwise lose a question the
      // player can still see on screen.
      writeMainDraft(question);
    }
  }
}

// Dispatches the ONE persistent Send button: starts the Session on the
// first submission, continues it (Judge Chat / Scholar Chat) afterward.
function handleSend() {
  // While a run is working the SAME button is Stop — dispatched before every
  // other branch so it can never be confused with sending anything.
  if (runButtonMode === "stop") {
    requestStopRun();
    return;
  }
  if (runButtonMode === "stopping") return; // already cancelling; nothing to do
  if (!sessionConfigLocked) {
    startSessionRun();
    return;
  }
  if (chatBusy || !chatReady()) return;
  const text = els.question.value.trim();
  if (!text) {
    els.question.focus();
    return;
  }
  els.question.value = "";
  // The composer is emptied here, but the DRAFT is not: sendChat() retires
  // it only once the reply confirms the follow-up was accepted. Cancelling
  // the pending debounced write just stops it overwriting the draft with
  // the now-empty composer.
  cancelPendingDraftSave();
  // fromComposer: this text came OUT of the input above, so if the send is
  // refused (a lost Session) it has to go back in. A Quick Question chip
  // never passes this — its text was never in the composer to restore.
  sendChat(text, { fromComposer: true });
}

async function saveToVault() {
  if (!sessionState) return;
  // A Vault is optional until this moment. Saying so HERE, in the user's own
  // language, is better than letting the request fail and surfacing the
  // server's English error — the adapter still refuses the write either way
  // (localVaultAdapter.saveSession), so this only changes what the user is
  // told, never whether an unsaved discussion can reach disk.
  if (!vaultState.configured) {
    setHeaderMsg(`⚠ ${str("vaultRequiredToSave")}`);
    return;
  }
  els.header.save.disabled = true;
  setHeaderMsg(str("saving"));
  try {
    const data = await api("/api/session/save", { method: "POST" });
    sessionState = { ...data.session };
    // Now archived under this same id (POST /api/session/save upserts the
    // Archive), so the pointer becomes continuable — this is what lets a
    // reload after a restart offer the discussion back.
    rememberSessionPointer();
    renderSessionHeader();
    // Auto-export failure never touches the native save: report both facts.
    setHeaderMsg(
      data.obsidianExportError
        ? `⚠ ${str("obsidianExportFailedMsg")}`
        : strT("savedToPath", { path: sessionState.vault?.path || "Vault" })
    );
  } catch (err) {
    let message = err.message;
    // "No active session" while the tab renders one: the server lost its
    // in-memory Session (it restarted since this run). Confirm before blaming
    // the save itself, then take the SAME recovery path every other discovery
    // point uses, so a failed save leaves the composer closed and the
    // continuation offer on screen rather than only a header warning.
    if (/no active session/i.test(message)) {
      const check = await api("/api/session").catch(() => null);
      if (check && !check.active) {
        setHeaderMsg(`⚠ ${str("sessionGone")}`);
        // This Session never reached the Vault (the save is what just
        // failed), so there is no Archive to continue from.
        await handleSessionLost({ sessionId: sessionState?.id, saved: false });
        return;
      }
    }
    setHeaderMsg(`⚠ ${message}`);
    renderSessionHeader();
  }
}

// The actual reset — unchanged from before the confirmation step existed.
async function performReset() {
  // Read the discarded Session's identity before sessionState is dropped
  // below — after that there is nothing left to scope its draft to.
  const discardedSessionId = activeSessionDraftId();
  try {
    await api("/api/session/reset", { method: "POST" });
  } catch {
    // Even if the call fails, clear the UI — the player asked to discard.
  }
  sessionState = null;
  tabAnswers = {};
  activeTab = null;
  els.chat.quickActionsWrap.hidden = true;
  els.header.section.hidden = true;
  els.chat.log.innerHTML = "";
  els.chat.log.hidden = true;
  els.tabs.innerHTML = "";
  updateCopyButton();
  setSessionSummaryExpanded(true);
  setHeaderMsg("");
  // Reset completely REMOVES Session Summary again, not merely collapses
  // it, and returns the layout to the pre-session bottom-docked default
  // ratio — the divider itself stays visible and draggable throughout (it
  // is never hidden), so this clears the split state, not the control.
  sessionSummaryCreated = false;
  els.sessionSummary.section.hidden = true;
  els.discussionEmpty.hidden = false;
  hideSessionError();
  // Reset is one of only two ways out of the lost state (the other is a new
  // run): the discarded Session's pointer goes with it, so a later reload
  // cannot offer a discussion the player has explicitly thrown away.
  hideSessionLost();
  forgetSessionPointer();
  els.conversation.classList.add("pre-session");
  els.conversation.classList.remove("split-adjusted");
  splitRatio = null;
  clearWorkspaceInlineStyles();
  refreshDiscussionEmptyText();
  els.header.save.hidden = true;
  els.header.save.disabled = true;
  els.header.save.textContent = str("saveToVault");
  renderObsidianExportRow();
  unlockSessionConfig();
  // The Librarian's retrieval summary, the question, and every attached
  // material belong to the discarded Session: return the launcher to its
  // fresh-launch state.
  els.question.value = "";
  // Reset is the explicit "discard this composition" flow, so both drafts it
  // could possibly own go with it: the main draft the emptied composer just
  // held, and the discarded Session's own follow-up draft, which can never
  // be returned to once the Session is gone.
  cancelPendingDraftSave();
  clearMainDraft();
  clearFollowUpDraft(discardedSessionId);
  els.librarianStatus.textContent = "";
  hideLibraryActivity();
  clearAttachments();
  updateChatAvailability();
  // Reset is a REAL state transition back to a fresh idle conversation
  // runtime (Conversation Bridge fix), not only a UI/session data reset —
  // see resetIdleController for the exact root cause this addresses (Reset
  // previously never touched idleController AT ALL: a Reset pressed during
  // "post" mode left it stuck there for up to POST_IDLE_DURATION_MS, during
  // which hover was silently blocked — "even hover speech stops working").
  resetIdleController();
}

// The idle/Speech Bridge half of Reset: bumps the speech generation so no
// in-flight staggered reaction, auto-hide timer, or idle callback belonging
// to the discarded session can land afterward; hides every Role's Bubble
// immediately (mirrors idleEnterActive's own "the new state owns every
// Bubble now" clear); clears hover + its text cache so a stale DOM/hover
// state can never block the FIRST hover after Reset; and returns the
// controller to a genuinely fresh "pre" with idle scheduling eligible
// immediately (Reset is itself real user activity).
function resetIdleController() {
  bumpSpeechGeneration();
  for (const roleId of IDLE_ROLE_IDS) {
    const occ = resolveRuntimeRoleOccupant(roleId);
    if (occ.ok) hideCharacterBubble(occ.sceneObject.id);
  }
  idleController.hoverRoleId = null;
  cancelClickedDialogue();
  npcClickState.suppressedHoverRoleId = null;
  idleController.hoverThoughtCache = new Map();
  idleController.postFirstEligibleAt = 0;
  idleController.lastActivityAt = Date.now();
  idleEnterPre();
}

// Interface Language can change at runtime (Settings → Save, no page
// refresh — see loadStatus()'s call site below). currentSpeechLocale()
// already reads currentConfig.interfaceLanguage fresh on every call, and
// resolveRoleSpeechEntries's fetch is never memoized, so this is NOT a
// stale-locale-resolver bug — the resolver was already correct. What was
// actually stale:
//   1. idleController.hoverThoughtCache — a hover thought is cached
//      verbatim (by design, for a stable 30-60s hover lifetime) and shown
//      on every re-hover during that window without re-resolving; a cached
//      line from before the switch is text in the OLD language.
//   2. A Speech document fetch already in flight at the exact moment the
//      language changed captured the OLD locale before this ran; if it
//      lands after the switch it would otherwise still display.
// Unlike resetIdleController() above, this must NOT touch mode,
// postRoleIds/postUntil/postFirstEligibleAt, preDialogueTimestamps,
// hoverRoleId, or lastActivityAt — an Interface Language change must never
// interrupt an active Session or the current idle phase (pre/post), only
// make everything FROM THIS POINT ON resolve in the new language. Nothing
// needs to be explicitly re-triggered: the idle tick loop keeps running
// regardless, and every trigger path re-resolves the locale at fire time.
function handleInterfaceLanguageChanged() {
  // Closes race #2: every callback already guarded by the speech
  // generation (triggerRoleSpeech, the staggered dispatchers, and the Idle
  // Controller's own async paths) will find itself stale and skip touching
  // a Bubble, rather than landing late in the old language.
  bumpSpeechGeneration();
  // Closes #1, plus the two "avoid immediate repeat" trackers — their
  // stored text can never match a new-language entry anyway, but clearing
  // them keeps no language-tagged state lying around.
  idleController.hoverThoughtCache = new Map();
  idleController.lastPreDialogueTextByRole = new Map();
  idleController.lastPreThoughtTextByRole = new Map();
  // A previous-discussion attachment chip's label is localized text (unlike
  // every other attachment kind's ready-state label, which is
  // language-agnostic content — a filename or page title) — re-render so it
  // picks up the new language immediately, matching every other always-live
  // UI surface this function's caller (loadStatus()) already re-localizes.
  renderAttachments();
}

// Public entry point (wired to the Reset button): confirms first, but ONLY
// when there's actually unsaved content at risk — an in-app dialog (not
// window.confirm, which can't carry custom button labels), matching the
// style already used for Archive removal / Vault location changes. A
// session already saved to Vault, or no session at all, resets immediately
// exactly as before; the confirmation never changes what reset itself does.
function resetSession() {
  const hasUnsavedContent = Boolean(sessionState) && sessionState.vault?.state !== "saved";
  if (hasUnsavedContent) {
    els.resetConfirm.dialog.showModal();
    return;
  }
  performReset();
}

// After a reload, restore the active Session (answers, chat, vault state) so
// the conversation survives page refreshes (server keeps it in memory). The
// persistent input is left empty and ready for a follow-up — it no longer
// gets pre-filled with the original question, since it's the same box that
// now continues the conversation.
// Run Safety — refresh during generation. The run keeps going on the server,
// but this page has no stream to attach to (the original fetch died with the
// old document) and the Session it will install does not exist yet. Block
// Send so the reload can't try to start a duplicate (the server would reject
// it anyway with a 409), show what is being worked on, then adopt the
// finished Session exactly like a normal reload would.
//
// The re-check below is the ONLY timer-driven server check in the app, and it
// exists solely for this state: it starts only when a reload lands mid-run,
// and stops the moment the run ends. Nothing polls during a normal run — that
// still runs entirely off the event stream.
const RUN_RECOVERY_INTERVAL_MS = 3000;
let runRecoveryActive = false;

// Maps the server's run state onto this page's controls. Called on every
// recovery poll so a state change (the user stops from another tab, or the
// run reaches the failure gate while this page is waiting) is picked up
// without a second loop of its own.
function applyRecoveredRunState(run) {
  if (!run) return;
  currentRunId = run.runId;
  if (run.state === "awaiting_failure_decision") {
    els.librarianStatus.textContent = str("awaitingDecision");
    lastFailureNames = failureScholarNames(run.failure?.scholars).join(str("nameSeparator") || ", ");
    // Send stays unavailable: the button is Stop, and the panel is modal.
    setRunButtonMode("stop");
    openFailureDecision(run.runId, run.failure?.scholars);
    return;
  }
  closeFailureDecision();
  if (run.state === "cancellation_requested") {
    els.librarianStatus.textContent = str("stopping");
    setRunButtonMode("stopping");
    return;
  }
  els.librarianStatus.textContent = str("runInProgressReload");
  setRunButtonMode("stop");
}

async function waitOutActiveRunAfterReload(run) {
  if (runRecoveryActive) return;
  runRecoveryActive = true;
  // The same flag a live run uses — startSessionRun() returns immediately
  // while it is set, so Send cannot start a second run from this page.
  runInFlight = true;
  els.librarianStatus.textContent = str("runInProgressReload");
  // The reloaded page gets the SAME runtime controls the original one had:
  // the run is still cancellable, and a run parked at the failure gate
  // reopens its decision panel here (this page can answer it — the decision
  // is submitted against the runId the server reports, never a remembered
  // one, so a stale page can never decide for a newer run).
  applyRecoveredRunState(run);
  const deadline = Date.now() + RUN_HARD_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, RUN_RECOVERY_INTERVAL_MS));
      // A failed check (server restarting, transient error) is not proof the
      // run ended — keep waiting rather than unlocking into a duplicate.
      const data = await api("/api/session").catch(() => null);
      if (!data) continue;
      if (data.run) {
        applyRecoveredRunState(data.run);
        continue;
      }
      break;
    }
  } finally {
    runRecoveryActive = false;
    runInFlight = false;
    currentRunId = null;
    closeFailureDecision();
    setRunButtonMode("send");
    els.run.disabled = false;
    els.librarianStatus.textContent = "";
  }
  console.debug("[council] run finished after reload", { runId: run?.runId });
  // The run is over: whatever it produced is now the active Session.
  await restoreSession();
}

async function restoreSession() {
  try {
    const data = await api("/api/session");
    if (!data.active) {
      // No Session yet, but a run is still working — reloaded mid-generation.
      if (data.run) {
        waitOutActiveRunAfterReload(data.run);
        return;
      }
      // Reloaded after the server lost the Session this tab was showing. The
      // Session itself cannot come back — it was memory-only — but if it
      // reached the Vault it was archived under the same id, so the
      // discussion is offered as a continuation instead of a blank page.
      // Nothing is restored INTO a session here: this is a pointer and a
      // button, never a rebuilt Session.
      const pointer = readSessionPointer();
      if (pointerIsContinuable(pointer)) {
        sessionLost = true;
        await showSessionLost({ sessionId: pointer.id, saved: true });
      } else {
        forgetSessionPointer();
      }
      return;
    }
    const s = data.session;
    // The server HAS a Session, so whatever this page believed about having
    // lost one is now wrong. Cleared before anything renders — otherwise a
    // leftover panel would sit above a live discussion and chatReady() would
    // keep the composer shut on a Session that is perfectly usable.
    hideSessionLost();
    sessionState = { ...s };
    // This tab is showing a live Session again — remember which, so a reload
    // after a restart can offer it (see the !data.active branch above).
    rememberSessionPointer();

    const slots = Object.keys(s.scholars || {})
      .map((k) => Number(k.replace("scholar", "")))
      .sort((a, b) => a - b);

    setMode(s.mode);
    // The restored checkbox must show the option the RUNNING Session actually
    // started with (it's locked below, so this is display, not a choice).
    els.useVaultToggle.checked = s.useVault !== false;
    lockSessionConfig();
    // Matches what would have happened live: Session Summary is only ever
    // expanded until the first follow-up, so a restored Session with
    // existing chat history comes back already collapsed.
    setSessionSummaryExpanded(!(s.chat || []).length);
    showConversation(s.mode, slots);
    for (const [key, scholar] of Object.entries(s.scholars || {})) updateScholarTab(key, scholar);
    if (s.mode === "council") updateSummaryTab(s.judge);
    for (const m of s.chat || []) appendChatBubble(m.role === "assistant" ? "assistant" : "user", m.text, m.attachments);
    renderSessionHeader();
    updateChatAvailability();
    // maybeRevealSessionSummary() (called from the updateScholarTab/
    // updateSummaryTab loop above) already promoted the layout if the
    // restored Session has a valid answer. A restored Session where NOTHING
    // succeeded must show the same fatal error state the live run would have
    // (see the !anyTabOk branch in startSessionRun()) — never a "waiting"
    // message with no run in flight, which would read as stuck in progress.
    if (!Object.values(tabAnswers).some((e) => e.status === "ok")) {
      els.discussionEmpty.hidden = true;
      showSessionError();
    }
    refreshDiscussionEmptyText();
  } catch {
    // No session to restore — the page simply starts empty.
  }
}

// ---------------------------------------------------------------- settings
// Compact sections, each an independent fieldset so future ones (Providers,
// Advanced, About) slot in as siblings: General (interface language + theme —
// application settings, never AI), Grand Sage (Judge provider + model +
// Default Reply Language — the language EVERY AI response defaults to),
// API Providers (enable toggles that expand to key config — no
// model here), and Scholar Assignment (three fixed slots with provider + model
// dropdowns). Model selection lives ONLY where a character is assigned.

// Page-session model cache: provider id -> string[] of model ids. Populated by
// Refresh models (and a background fetch when Settings opens). Only ever
// holds Aether Library's curated, catalog-intersected models — see
// GET /api/models/:provider (src/config/supported-models.js).
const modelCache = {};
// provider id -> { [modelId]: {fast,reasoning,budget,experimental} }, the
// catalog metadata for each cached model — drives badges (see
// classifyModelBadges below). Populated alongside modelCache.
const modelInfoCache = {};

// Working state for the open dialog. Rebuilt each time Settings opens.
let sx = null;

const EN_FALLBACK = {
  settings: "Settings", save: "Save", cancel: "Cancel",
  general: "General", interfaceLanguage: "Interface Language",
  theme: "Theme", themeDark: "Dark", themeLight: "Light",
  send: "Send", sending: "Sending…", reset: "Reset",
  saveToVault: "Save to Vault", saving: "Saving…",
  vaultRequiredToSave: "Connect a Vault to save this discussion.",
  councilWelcome: "The Council awaits your questions.",
  bookPrompt: "Click the book on the table to begin...",
  waiting: "Waiting…", noAnswer: "No answer.", noRuling: "No ruling.",
  progressPreparing: "Preparing the council…",
  progressScholars: "The scholars are reviewing your question…",
  progressJudge: "The Grand Sage is considering the scholars' arguments…",
  statusTabWaiting: "Waiting…", statusTabThinking: "Thinking…",
  statusTabCompleted: "Completed", statusTabFailed: "Failed",
  modeCouncil: "Council", modeMentor: "Mentor", modeLabel: "Mode",
  needScholar: "Enable at least one Scholar (needs an API key).",
  noProviderConfigured: "No provider configured yet — open Settings to add API keys.",
  provider: "Provider",
  model: "Model", defaultReplyLanguage: "Default Reply Language", apiProviders: "API Providers",
  scholarAssignment: "Scholar Assignment", apiKey: "API key", enabled: "Enabled",
  status: "Status", configured: "Configured", notConfigured: "Not configured",
  keyBlankKeeps: "configured — blank keeps it", keyNotSet: "not set",
  refreshModels: "Refresh Model List",
  aiSetupHint: "Connect your first AI Provider",
  vaultSetupHint: "Connect a Vault to save discussions",
  aiSetupHintDismiss: "Dismiss",
  aiSetupTitle: "AI Provider Required",
  aiSetupBody1: "No AI providers have been configured yet.",
  aiSetupBody2: "Connect your first AI provider in Settings to begin conversations.",
  aiSetupOpenSettings: "Open Settings",
  aiSetupLater: "Later",
  perplexitySonarNote: "Currently supports the Perplexity Sonar model family.",
  refreshing: "Refreshing…", statusConnected: "Connected",
  statusApiKeyRequired: "API key required", statusModelRequired: "Model required",
  statusModelUnavailable: "Model unavailable", statusProviderDisabled: "Provider disabled",
  selectModel: "Select a model", refreshHint: "Refresh models to load the list",
  modelUnavailableWarn: "The configured model was not found for this provider.",
  badgeRecommended: "⭐ Recommended", badgeFast: "⚡ Fast", badgeReasoning: "🧠 Reasoning",
  badgeBudget: "💰 Budget", badgeExperimental: "🧪 Experimental",
  assignedToScholar: "This Provider is currently assigned to {name}.",
  assignedToJudge: "This Provider is currently assigned to {name}.",
  judgeTitleSuffix: " (Main Judge)",
  saved: "Saved ✓",
  librarianSearching: "📚 The Librarian is searching the library...",
  librarianFoundOne: "📚 The Librarian found 1 related note.",
  librarianFound: "📚 The Librarian found {count} related notes.",
  librarianNone: "📚 The Librarian couldn't find any relevant notes.",
  attachTooltip: "Attach files (images, PDF, Markdown, text)",
  attachmentReading: "Reading {name}…",
  attachmentFetchingUrl: "Fetching page…",
  attachmentUnsupported: "Unsupported file type: {name}",
  attachmentsLoading: "Materials are still loading — one moment before starting.",
  copy: "Copy",
  copied: "Copied ✓",
  disableAssignedJudge:
    "{name} is assigned to the Grand Sage (Main Judge). Select a different Judge Provider before disabling it.",
  disableAssignedScholars:
    "Disable {name}? The Scholars using it will be turned off (their provider and model are kept).",
  // AI / Product Status (Batch A) — see src/locales/en.js for the canonical
  // copy and the note on why "Configured" never implies "check passed".
  aiStatusTitle: "AI Status",
  statusConfigured: "Configured",
  statusNotConfigured: "Not configured",
  statusDisabled: "Configured (off)",
  modelCheckLabel: "Model check",
  modelCheckNotChecked: "Not checked",
  modelCheckPassed: "Passed",
  modelCheckAcknowledged: "Acknowledged (not re-verified)",
  modelCheckNeedsRecheck: "Needs re-check",
  modelCheckFailed: "Check failed",
  productStatusTitle: "Product Status",
  productStatusOpen: "View Product Status",
  productStatusProviders: "AI Providers",
  productStatusCouncil: "Council",
  productStatusModelCheck: "Model Check",
  productStatusVault: "Vault",
  productStatusGrandSage: "Grand Sage",
  productStatusScholarSlot: "Scholar {n}",
  productStatusVaultConnected: "Connected",
  productStatusVaultMissing: "Configured, folder missing",
  productStatusVaultNone: "Not connected",
  productStatusAutoCheckOn: "Automatic check before each Council: on",
  productStatusAutoCheckOff: "Automatic check before each Council: off",
  productStatusNoLastCheck: "This build does not record a last-check time.",
  productStatusReadOnly: "Informational only — opening this never contacts a provider.",
  productStatusSlotOff: "Off",
  productStatusClose: "Close",
  // Batch B — see src/locales/en.js for the canonical copy.
  moreMenu: "MORE",
  moreTutorial: "Tutorial",
  moreLearn: "Learn",
  moreReportIssue: "Report & Feedback",
  moreWebsite: "Official Website",
  moreDiscord: "Join Discord",
  moreGithub: "GitHub",
  moreSupport: "Support Aether Library",
  moreAbout: "About",
  linkNotConfigured: "This link is not available yet.",
  aboutTitle: "About",
  aboutVersion: "Version {version}",
  aboutDescription:
    "A local-first reasoning workspace: several AI Scholars consider your question, a Grand Sage brings their answers together, and anything worth keeping is saved to your own Vault.",
  aboutWebsiteLead: "Learn more at",
  aboutClose: "Close",
  tutorialStepCount: "Step {n} of {total}",
  tutorialNext: "Next",
  tutorialBack: "Back",
  tutorialSkip: "Skip",
  tutorialFinish: "Enter the Library",
  tutorialStep1Title: "Settings",
  tutorialStep1Body:
    "Adjust your interface language, default reply language, and visual theme here.",
  tutorialStep2Title: "AI Config",
  tutorialStep2Body:
    "Connect your AI providers, set up API access, and choose or refresh your preferred models.",
  tutorialStep3Title: "Vault",
  tutorialStep3Body:
    "Choose the folder you want to use as your Vault.\nIf you want to sync to Obsidian, enable the option and select the folder that contains the .obsidian folder.",
  tutorialStep4Title: "Aetherom",
  tutorialStep4Body:
    "Click Aetherom whenever you want to start a new discussion.",
  tutorialStep5Title: "Council or Mentor",
  tutorialStep5Body:
    "Council gathers one or more independent opinions before the Grand Sage reaches a final conclusion.\nMentor lets one Scholar answer directly.",
  tutorialStep6Title: "Choose Your Scholars",
  tutorialStep6Body:
    "Choose which Scholars take part in this discussion.\nYou can change the Judge, switch modes, or pick different Scholars at any time.",
  tutorialStep7Title: "Attachments",
  tutorialStep7Body:
    "Attach files, PDFs, images, or text before asking a question. You can also drag and drop files or paste images directly.",
  tutorialStep8Title: "Ask Your Question",
  tutorialStep8Body:
    "Type your question, then press Send to begin the discussion.",
  tutorialStep9Title: "Review the Discussion",
  tutorialStep9Body:
    "Read the discussion, continue asking follow-up questions, or use Quick Questions below the input box to explore the topic further.",
  tutorialStep10Title: "Save to Vault",
  tutorialStep10Body:
    "Save this discussion to your Vault.\nIf Obsidian Sync is enabled, you can also choose to sync it to your Obsidian Vault.",
  tutorialStep11Title: "Privacy & Learn More",
  tutorialStep11Body:
    "Your API keys are stored on your device. Aether Library cannot access or retrieve your stored API keys.\nWhen you send a question, it is sent only to the AI provider(s) you selected.\nFor documentation, updates, and support, visit aetherlibrary.app",
  learnTitle: "Learn",
  learnClose: "Close",
};
function str(key) {
  const fromConfig = currentConfig && currentConfig.strings ? currentConfig.strings[key] : undefined;
  return fromConfig ?? EN_FALLBACK[key] ?? "";
}

// str() with `{placeholder}` substitution: strT("savedToPath", { path }).
function strT(key, subs = {}) {
  let s = str(key);
  for (const [k, v] of Object.entries(subs)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

function providerLabel(id) {
  return currentConfig?.providers?.[id]?.label || id;
}
function enabledProviderIds() {
  return Object.keys(currentConfig?.providers || {}).filter((id) => sx.enabled[id]);
}
// Whether a provider has a key: saved, or a new one typed into its panel.
function providerConfigured(id) {
  const typed = sx.keyInput[id] && sx.keyInput[id].value.trim() !== "";
  return Boolean(currentConfig?.providers?.[id]?.configured) || Boolean(typed);
}
// Character names currently assigning this provider (Judge + Scholars).
function assignmentsUsing(id) {
  const names = [];
  if (sx.judge.providerSel.value === id) names.push(currentConfig.identity.judge);
  for (const n of [1, 2, 3]) {
    if (sx.scholars[n]?.providerSel.value === id) names.push(currentConfig.identity.scholars[n]);
  }
  return names;
}

// Availability of a model for a provider given the cached list. Unknown
// (uncached) counts as available; alias/dated-snapshot matches count too. A
// runtimeUnavailable flag (confirmed by a real generation request, not just
// absence from the list — see markModelUnavailable()) always wins, since
// that's stronger evidence than a countTokens-class probe or a fresh list
// fetch, neither of which can prove generateContent actually works.
function modelAvailable(id, model) {
  if (isRuntimeUnavailable(id, model)) return false;
  const list = modelCache[id];
  if (!list || !list.length || !model) return true;
  if (list.includes(model)) return true;
  return list.some(
    (m) => m.startsWith(`${model}@`) || (m.startsWith(`${model}-`) && /^\d{8}$/.test(m.slice(model.length + 1)))
  );
}

function statusKey(id, model) {
  if (!sx.enabled[id]) return "statusProviderDisabled";
  if (!providerConfigured(id)) return "statusApiKeyRequired";
  if (!model) return "statusModelRequired";
  if (!modelAvailable(id, model)) return "statusModelUnavailable";
  return "statusConnected";
}
function applyStatus(el, id, model) {
  const key = statusKey(id, model);
  el.textContent = str(key);
  el.className = "assign-status " + (key === "statusConnected" ? "ok" : "warn");
}

function showSettingsMsg(text) {
  activeSettingsDialog().error.textContent = text;
  activeSettingsDialog().error.className = "settings-msg warn";
  activeSettingsDialog().error.hidden = false;
}

// Display-only hints for the model dropdown. Primary source is the curated
// catalog's explicit per-model metadata (src/config/supported-models.js,
// delivered via GET /api/models/:provider as modelInfo) — every model this
// dropdown ever lists came from that catalog, so this is the common path.
// The name-pattern regexes below are ONLY a fallback for a model outside the
// catalog (e.g. a manually configured .env.local override with no catalog
// entry). They match whole hyphen-delimited tokens — `(^|-)…(-|$)` — never a
// bare substring: a naive `/mini|flash|.../` previously matched "mini" INSIDE
// "gemini-2.5-pro" and mislabeled it Fast/Budget.
const REASONING_RE = /(^|-)o[0-9](-|$)|reasoning|thinking|(^|-)r1(-|$)/i;
const FAST_RE = /(^|-)(mini|flash|lite|nano|small|haiku)(-|$)/i;
const BUDGET_RE = /(^|-)(mini|nano|lite|haiku)(-|$)/i;
const EXPERIMENTAL_RE = /(^|-)(preview|exp|experimental|alpha|beta|rc)(-|$)/i;

// Recommended is a COMPUTED property (see public/model-recommendation.js) —
// never a hardcoded model id and never tied to whatever happens to be
// configured right now. It's derived fresh each time from the same three
// concepts populateModelSelect() already keeps separate: the curated+live
// candidate set (modelCache), catalog metadata (modelInfoCache), and runtime
// availability (isRuntimeUnavailable) — recommendation, selection, and
// availability never overwrite one another.
function recommendedModelFor(providerId) {
  const list = modelCache[providerId] || [];
  const info = modelInfoCache[providerId] || {};
  const models = list.map((id) => ({ id, ...(info[id] || {}), unavailable: isRuntimeUnavailable(providerId, id) }));
  return window.getRecommendedModel(providerId, models);
}

function classifyModelBadges(providerId, modelId) {
  const badges = [];
  if (modelId === recommendedModelFor(providerId)) badges.push("badgeRecommended");

  const meta = modelInfoCache[providerId]?.[modelId];
  if (meta) {
    if (meta.reasoning) badges.push("badgeReasoning");
    if (meta.fast) badges.push("badgeFast");
    if (meta.budget) badges.push("badgeBudget");
    if (meta.experimental) badges.push("badgeExperimental");
    return badges;
  }

  // Fallback — no catalog entry for this model.
  if (REASONING_RE.test(modelId)) badges.push("badgeReasoning");
  if (FAST_RE.test(modelId)) badges.push("badgeFast");
  if (BUDGET_RE.test(modelId)) badges.push("badgeBudget");
  if (EXPERIMENTAL_RE.test(modelId)) badges.push("badgeExperimental");
  return badges;
}

function modelOptionLabel(providerId, modelId) {
  const badges = classifyModelBadges(providerId, modelId).map((key) => str(key));
  return badges.length ? `${modelId}  ${badges.join(" ")}` : modelId;
}

// Fills a model <select> from the cache, always preserving the current model
// (marked unavailable when a cache exists but doesn't list it, OR when it's
// runtimeUnavailable — see markModelUnavailable() — even though it's still
// right there in the list; that flag must survive a fresh Refresh Model
// List, which is exactly what it's for).
function populateModelSelect(select, id, current) {
  const list = modelCache[id] || [];
  select.innerHTML = "";
  if (current && !list.includes(current)) {
    const suffix = list.length ? ` — ${str("statusModelUnavailable")}` : "";
    select.appendChild(new Option(current + suffix, current, true, true));
  }
  for (const m of list) {
    const label = isRuntimeUnavailable(id, m) ? `${m} — ${str("statusModelUnavailable")}` : modelOptionLabel(id, m);
    select.appendChild(new Option(label, m));
  }
  if (!current && list.length === 0) select.appendChild(new Option(str("selectModel"), ""));
  select.value = current || (list[0] || "");
}

// Re-fill any model dropdown currently pointing at this provider.
function repopulateModelsForProvider(id) {
  if (sx.judge.providerSel.value === id) {
    populateModelSelect(sx.judge.modelSel, id, sx.judge.modelSel.value || currentConfig.judgeModel);
  }
  for (const n of [1, 2, 3]) {
    const row = sx.scholars[n];
    if (row.providerSel.value === id) populateModelSelect(row.modelSel, id, row.modelSel.value);
  }
  updateAllStatuses();
}

async function ensureModels(id) {
  if (modelCache[id] || !providerConfigured(id)) return;
  try {
    const data = await api(`/api/models/${id}`);
    modelCache[id] = data.models || [];
    modelInfoCache[id] = data.modelInfo || {};
  } catch {
    // Leave uncached; dropdown keeps the current model + refresh affordance.
  }
}

function updateAllStatuses() {
  applyStatus(sx.judge.statusEl, sx.judge.providerSel.value, sx.judge.modelSel.value);
  for (const n of [1, 2, 3]) {
    const r = sx.scholars[n];
    applyStatus(r.statusEl, r.providerSel.value, r.modelSel.value);
  }
  for (const id of Object.keys(currentConfig.providers)) {
    if (sx.providerStatus[id]) {
      sx.providerStatus[id].textContent = providerConfigured(id) ? str("configured") : str("notConfigured");
      sx.providerStatus[id].className = "provider-status " + (providerConfigured(id) ? "ok" : "warn");
    }
  }
}

// Rebuild the provider <option> lists (enabled providers only), keeping values.
function refreshAssignmentDropdowns() {
  const ids = enabledProviderIds();
  const fill = (sel) => {
    const prev = sel.value;
    sel.innerHTML = "";
    for (const id of ids) sel.appendChild(new Option(providerLabel(id), id));
    if (prev && !ids.includes(prev)) sel.appendChild(new Option(providerLabel(prev), prev));
    sel.value = prev;
  };
  fill(sx.judge.providerSel);
  for (const n of [1, 2, 3]) fill(sx.scholars[n].providerSel);
  updateAllStatuses();
}

function renderProviderToggles() {
  const wrap = document.getElementById("provider-toggles");
  wrap.innerHTML = "";
  for (const [id, p] of Object.entries(currentConfig.providers)) {
    const on = sx.enabled[id];
    // Only the Grand Sage's provider is hard-locked (must reassign the Judge
    // first). Enabled-Scholar assignments are handled via confirmation instead.
    const locked = on && sx.judge.providerSel.value === id;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "provider-toggle" + (on ? " is-on" : "") + (locked ? " locked" : "");
    chip.innerHTML = `<span class="pt-box">${on ? "☑" : "☐"}</span> ${p.label}`;
    if (locked) chip.title = str("disableAssignedJudge").replace("{name}", p.label);
    chip.addEventListener("click", () => toggleProvider(id));
    wrap.appendChild(chip);
  }
}

function renderProviderPanels() {
  const wrap = document.getElementById("provider-panels");
  wrap.innerHTML = "";
  sx.keyInput = {};
  sx.providerStatus = {};
  for (const [id, p] of Object.entries(currentConfig.providers)) {
    if (!sx.enabled[id]) continue; // only enabled providers expand
    const panel = document.createElement("div");
    panel.className = "provider-panel";

    const head = document.createElement("div");
    head.className = "provider-panel-head";
    const nameEl = document.createElement("span");
    nameEl.className = "provider-panel-name";
    nameEl.textContent = p.label;
    const statusEl = document.createElement("span");
    statusEl.className = "provider-status " + (p.configured ? "ok" : "warn");
    statusEl.textContent = p.configured ? str("configured") : str("notConfigured");
    sx.providerStatus[id] = statusEl;
    head.append(nameEl, statusEl);
    panel.appendChild(head);

    const keyLabel = document.createElement("label");
    keyLabel.className = "provider-key-label";
    keyLabel.append(`${str("apiKey")} `);
    const hint = document.createElement("span");
    hint.className = `key-state ${p.configured ? "set" : "unset"}`;
    hint.textContent = p.configured ? `(${str("keyBlankKeeps")})` : `(${str("keyNotSet")})`;
    keyLabel.appendChild(hint);
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.autocomplete = "off";
    keyInput.addEventListener("input", updateAllStatuses);
    keyLabel.appendChild(keyInput);
    sx.keyInput[id] = keyInput;
    panel.appendChild(keyLabel);

    const row = document.createElement("div");
    row.className = "provider-actions";
    const note = document.createElement("span");
    note.className = "muted model-note";
    // Perplexity has no discovery endpoint — its catalog is maintained in
    // src/config/supported-models.js. Say so, so "Refresh Model List" is not
    // read as a promise to enumerate the whole Perplexity platform.
    if (id === "perplexity") note.textContent = str("perplexitySonarNote");

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "refresh-models";
    refresh.textContent = str("refreshModels");
    refresh.addEventListener("click", () => refreshModels(id, refresh, note));
    row.appendChild(refresh);
    row.appendChild(note);
    panel.appendChild(row);

    wrap.appendChild(panel);
  }
}

// Refresh Model List: validates the API key (a 400/401 from the backend
// surfaces as the error note below) and repopulates every dropdown pointing
// at this provider with only the models Refresh Model List is willing to
// show — non-text families and known-unusable names are already filtered
// server-side (see listModels() per provider); this also folds in what used
// to be a separate "Test connection" step, since a failed refresh IS the
// connection test now.
async function refreshModels(id, btn, note) {
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = str("refreshing"); }
  try {
    const data = await api(`/api/models/${id}`);
    modelCache[id] = data.models || [];
    modelInfoCache[id] = data.modelInfo || {};
    repopulateModelsForProvider(id);
    if (note) {
      const scope = id === "perplexity" ? ` — ${str("perplexitySonarNote")}` : "";
      note.textContent = strT("modelsCount", { count: data.models.length }) + scope;
      note.className = "model-note ok";
    }
  } catch (err) {
    if (note) { note.textContent = friendlyErrorMessage(err); note.className = "model-note warn"; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

function toggleProvider(id) {
  activeSettingsDialog().error.hidden = true;
  const label = providerLabel(id);
  if (sx.enabled[id]) {
    // Turning OFF.
    // (a) Grand Sage: block until another Judge Provider is selected.
    if (sx.judge.providerSel.value === id) {
      showSettingsMsg(str("disableAssignedJudge").replace("{name}", label));
      return;
    }
    // (b) Enabled Scholars using it: confirm, then disable those slots (their
    // provider + model assignment is preserved, just turned off).
    const scholarNs = [1, 2, 3].filter(
      (n) => sx.scholars[n].providerSel.value === id && sx.scholars[n].enabledChk.checked
    );
    if (scholarNs.length) {
      if (!window.confirm(str("disableAssignedScholars").replace("{name}", label))) return;
      for (const n of scholarNs) sx.scholars[n].enabledChk.checked = false;
    }
  }
  sx.enabled[id] = !sx.enabled[id];
  renderProviderPanels();
  renderProviderToggles();
  refreshAssignmentDropdowns();
}

// Provider dropdown for an assignment; on change, load the new provider's
// models and default to that provider's model.
function wireAssignmentProvider(providerSel, modelSel, statusEl) {
  providerSel.addEventListener("change", async () => {
    const id = providerSel.value;
    const def = currentConfig.providers[id]?.model || "";
    populateModelSelect(modelSel, id, def);
    applyStatus(statusEl, id, modelSel.value);
    renderProviderToggles(); // assignment changed → lock state may change
    await ensureModels(id);
    populateModelSelect(modelSel, id, modelSel.value || def);
    applyStatus(statusEl, id, modelSel.value);
  });
  modelSel.addEventListener("change", () => applyStatus(statusEl, providerSel.value, modelSel.value));
}

// General section: application settings only (interface language + theme),
// fully independent of the Grand Sage's AI settings below it.
function renderGeneral() {
  document.getElementById("general-title").textContent = str("general");
  document.getElementById("gen-lang-label").childNodes[0].nodeValue = str("interfaceLanguage") + " ";
  document.getElementById("gen-reply-lang-label").childNodes[0].nodeValue = str("defaultReplyLanguage") + " ";
  document.getElementById("gen-theme-label").childNodes[0].nodeValue = str("theme") + " ";

  // One option per locale file, labelled with its native name — a new
  // language added in src/locales/ appears here automatically.
  sx.uiLang = document.getElementById("gen-lang");
  sx.uiLang.innerHTML = "";
  const languages = currentConfig.interfaceLanguages?.length
    ? currentConfig.interfaceLanguages
    : [{ id: "en", label: "English" }];
  for (const { id, label } of languages) sx.uiLang.appendChild(new Option(label, id));
  sx.uiLang.value = currentConfig.interfaceLanguage || "en";

  // Default Reply Language — an application-wide AI setting that lives in
  // General alongside the other preferences, no longer under Grand Sage.
  sx.lang = document.getElementById("gen-reply-lang");
  sx.lang.value = currentConfig.defaultReplyLanguage || "en";

  sx.theme = document.getElementById("gen-theme");
  sx.theme.querySelector('option[value="dark"]').textContent = str("themeDark");
  sx.theme.querySelector('option[value="light"]').textContent = str("themeLight");
  sx.theme.value = currentConfig.theme === "light" ? "light" : "dark";
}

function renderGrandSage() {
  // Never render "undefined": fall back to a safe judge name if identity is
  // missing from a partial config, and str() supplies the suffix.
  const judgeName = currentConfig?.identity?.judge || "Grand Sage";
  document.getElementById("grand-sage-title").textContent = judgeName + str("judgeTitleSuffix");
  document.getElementById("gs-provider-label").childNodes[0].nodeValue = str("provider") + " ";
  document.getElementById("gs-model-label").childNodes[0].nodeValue = str("model") + " ";

  sx.judge.providerSel = document.getElementById("gs-provider");
  sx.judge.modelSel = document.getElementById("gs-model");
  sx.judge.statusEl = document.getElementById("gs-status");

  populateModelSelect(sx.judge.modelSel, currentConfig.judgeProvider, currentConfig.judgeModel);
  wireAssignmentProvider(sx.judge.providerSel, sx.judge.modelSel, sx.judge.statusEl);
}

function renderScholarRows() {
  document.getElementById("api-providers-title").textContent = str("apiProviders");
  document.getElementById("scholar-assignment-title").textContent = str("scholarAssignment");
  const container = document.getElementById("scholar-rows");
  container.innerHTML = "";
  const scholars = currentConfig.identity.scholars || {};

  for (const slot of scholarSlotsFrom(currentConfig)) {
    const n = slot.slot;
    const row = document.createElement("div");
    row.className = "assign-row";

    const head = document.createElement("div");
    head.className = "assign-row-head";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = slot.enabled !== false;
    const nameEl = document.createElement("span");
    nameEl.className = "assign-name";
    const slotLabel = strT("scholarSlotLabel", { n });
    nameEl.innerHTML = `<span class="slot-label">${slotLabel}</span>${scholars[n] || slotLabel}`;
    const statusEl = document.createElement("span");
    statusEl.className = "assign-status";
    head.append(chk, nameEl, statusEl);
    row.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "assign-grid";
    const provLabel = document.createElement("label");
    provLabel.className = "assign-field";
    provLabel.append(str("provider"));
    const providerSel = document.createElement("select");
    provLabel.appendChild(providerSel);
    const modelLabel = document.createElement("label");
    modelLabel.className = "assign-field";
    modelLabel.append(str("model"));
    const modelSel = document.createElement("select");
    modelLabel.appendChild(modelSel);
    grid.append(provLabel, modelLabel);
    row.appendChild(grid);

    container.appendChild(row);

    sx.scholars[n] = { providerSel, modelSel, enabledChk: chk, statusEl };
    // Options are filled by refreshAssignmentDropdowns(); set intended value first.
    providerSel.appendChild(new Option(providerLabel(slot.provider), slot.provider));
    providerSel.value = slot.provider;
    populateModelSelect(modelSel, slot.provider, slot.model);
    wireAssignmentProvider(providerSel, modelSel, statusEl);
    chk.addEventListener("change", () => applyStatus(statusEl, providerSel.value, modelSel.value));
  }
}

// THE DESKTOP BOUNDARY. Window/display controls belong to a desktop shell
// (Electron/Tauri) that does not exist yet. A wrapper will expose an object
// here; until then the controls render but stay disabled, so the SHAPE of the
// setting is fixed now and the packaged app implements against it rather than
// replacing a browser-only stand-in. Browser fullscreen is deliberately NOT
// wired up: it is not the same thing as a window mode and would have to be
// unpicked later.
function desktopShell() {
  return typeof window !== "undefined" && window.__aetherDesktop ? window.__aetherDesktop : null;
}

// Turns the desktop drag strip on for Borderless Windowed and off everywhere
// else. That mode has no native title bar, so #desktop-drag-strip is the only
// way to move the window; in every other mode — and in the browser, where
// there is no shell at all — the class is absent and the strip stays
// display:none, so it can never intercept a click.
//
// Entering or leaving Borderless recreates the BrowserWindow, which reloads
// the page, so calling this at boot covers every transition into and out of
// the mode. It is called after a Settings save as well, for the cases that do
// not recreate anything.
function applyDesktopWindowModeClass() {
  const shell = desktopShell();
  const borderless = Boolean(shell) && typeof shell.getWindowMode === "function" && shell.getWindowMode() === "borderless";
  document.body.classList.toggle("desktop-borderless", borderless);
}

// Whichever settings surface is currently open — both share `sx`, so errors and
// closes must address the right one.
function activeSettingsDialog() {
  if (els.aiConfig.dialog?.open) return els.aiConfig;
  return els.settings;
}

// THE canonical close for both settings surfaces. Cancel and every internal
// close route through here; ESC is the browser closing the <dialog> itself,
// which lands in the same place because neither modal commits anything until
// saveSettings runs. So Cancel and ESC are identical by construction — there
// is no separate cancel path to keep in sync.
function closeSettingsDialogs() {
  if (els.settings.dialog.open) els.settings.dialog.close();
  if (els.aiConfig.dialog?.open) els.aiConfig.dialog.close();
}

// `target` chooses which modal to show. The POPULATION is identical for both:
// every control still exists in the DOM (the AI fieldsets simply live in the
// other dialog now), so `sx` is built exactly as before and there is only ever
// one in-memory representation.
function openSettings(target = "settings") {
  if (!currentConfig) return;
  activeSettingsDialog().error.hidden = true;
  document.getElementById("settings-title").textContent = str("settings");
  els.settings.cancel.textContent = str("cancel");
  els.settings.save.textContent = str("save");

  sx = { enabled: {}, keyInput: {}, providerStatus: {}, judge: {}, scholars: {}, lang: null, uiLang: null, theme: null };
  // Restore each provider's enable state from the config. When the field is
  // present (canonical shape) honor it exactly; only if it is absent (a partial
  // config) fall back to "configured" so keyed providers are not shown unchecked.
  for (const [id, p] of Object.entries(currentConfig.providers)) {
    sx.enabled[id] = p.enabled !== undefined ? Boolean(p.enabled) : Boolean(p.configured);
  }

  renderGeneral();
  renderGrandSage();
  renderScholarRows();
  renderProviderToggles();
  renderProviderPanels();
  refreshAssignmentDropdowns();

  // Set the intended provider selections now that options exist.
  sx.judge.providerSel.value = currentConfig.judgeProvider;
  populateModelSelect(sx.judge.modelSel, currentConfig.judgeProvider, currentConfig.judgeModel);
  updateAllStatuses();

  // Council Model Check preference (§6) — same boolean the pre-send dialog's
  // own checkbox shows/writes (confirmCouncilCheckDialog()).
  els.settings.councilAutoChk.checked = Boolean(currentConfig.councilAutoCheck);
  // Manual "Check Models Now" result panel: never carries a stale result
  // over from a previous time Settings was open.
  els.settings.councilManualCheckResult.hidden = true;
  els.settings.councilManualCheckResult.innerHTML = "";

  // Display controls reflect the desktop-shell capability, never a fake.
  if (els.display.windowMode) {
    const shell = desktopShell();
    els.display.windowMode.disabled = !shell;
    if (els.display.alwaysOnTop) els.display.alwaysOnTop.disabled = !shell;
    if (els.display.note) els.display.note.hidden = Boolean(shell);
    if (shell && typeof shell.getWindowMode === "function") {
      els.display.windowMode.value = shell.getWindowMode() || "windowed";
    }
    if (shell && els.display.alwaysOnTop && typeof shell.getAlwaysOnTop === "function") {
      els.display.alwaysOnTop.checked = Boolean(shell.getAlwaysOnTop());
    }
  }
  if (target === "ai-config" && els.aiConfig.dialog) {
    els.aiConfig.error.hidden = true;
    els.aiConfig.cancel.textContent = str("cancel");
    els.aiConfig.save.textContent = str("save");
    els.aiConfig.dialog.showModal();
    return;
  }
  els.settings.dialog.showModal();

  // Background: load model lists for enabled+configured providers so the
  // dropdowns become full choice lists (no completion tokens spent).
  for (const id of enabledProviderIds()) {
    if (providerConfigured(id) && !modelCache[id]) refreshModels(id, null, null);
  }
}

// Once a Session begins, its configuration is fixed until Reset (see the
// session-lock section of app.js) — these are the exact fields locked to it:
// each Scholar's Provider/Model and the Grand Sage/Judge's Provider/Model.
// Theme, interface language, display language, API keys, and provider
// enable/disable never change what a running Session is doing, so they're
// exempt and keep applying immediately.
function settingsChangeAffectsActiveSession(payload) {
  if (!sessionState || !currentConfig) return false;
  if (payload.judgeProvider !== currentConfig.judgeProvider) return true;
  if ((payload.judgeModel || "") !== (currentConfig.judgeModel || "")) return true;
  for (const n of [1, 2, 3]) {
    const slot = (currentConfig.scholarSlots || []).find((s) => s.slot === n);
    if (!slot) continue;
    if (payload[`scholar${n}Provider`] !== slot.provider) return true;
    if (payload[`scholar${n}Model`] !== slot.model) return true;
  }
  return false;
}

// Resolves once the player picks Cancel (false) or Reset and Apply (true).
// ESC / backdrop-dismiss counts as Cancel — the default must always be "keep
// the running Session intact," matching confirmModelFailureWarning()'s
// pattern. Wording adapts to whether the active Session already made it to
// Vault (see section 7 of the spec this implements).
function confirmSettingsSessionChange() {
  const saved = sessionState?.vault?.state === "saved" || sessionState?.metadata?.vaultState === "saved";
  const w = els.settingsSessionWarning;
  w.body1.textContent = str(saved ? "settingsSessionWarningBody1Saved" : "settingsSessionWarningBody1Unsaved");
  w.body2.textContent = str(saved ? "settingsSessionWarningBody2Saved" : "settingsSessionWarningBody2Unsaved");
  w.body3.hidden = saved;
  if (!saved) w.body3.textContent = str("settingsSessionWarningBody3Unsaved");
  return new Promise((resolve) => {
    let decided = false;
    const finish = (result) => {
      if (decided) return;
      decided = true;
      resolve(result);
    };
    w.cancel.onclick = () => {
      finish(false);
      w.dialog.close();
    };
    w.confirm.onclick = () => {
      finish(true);
      w.dialog.close();
    };
    w.dialog.addEventListener("close", () => finish(false), { once: true });
    w.dialog.showModal();
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = {
    interfaceLanguage: sx.uiLang.value,
    theme: sx.theme.value,
    judgeProvider: sx.judge.providerSel.value,
    judgeModel: sx.judge.modelSel.value,
    defaultReplyLanguage: sx.lang.value,
    councilAutoCheck: els.settings.councilAutoChk.checked ? "true" : "false",
  };
  // A provider whose key field actually has new text typed in — used below
  // to invalidate any runtimeUnavailable state recorded under the OLD
  // credential once the save succeeds (a new key may well work for a model
  // the previous one couldn't).
  const keyChangedProviders = [];
  for (const id of Object.keys(currentConfig.providers)) {
    // Blank key preserves the saved one; disabling never sends a key change.
    payload[`${id}ApiKey`] = sx.keyInput[id] ? sx.keyInput[id].value : "";
    payload[`${id}Enabled`] = sx.enabled[id] ? "true" : "false";
    if (sx.keyInput[id] && sx.keyInput[id].value.trim()) keyChangedProviders.push(id);
  }
  for (const n of [1, 2, 3]) {
    const r = sx.scholars[n];
    payload[`scholar${n}Provider`] = r.providerSel.value;
    payload[`scholar${n}Model`] = r.modelSel.value;
    payload[`scholar${n}Enabled`] = r.enabledChk.checked ? "true" : "false";
  }

  // Provider/Model changes that would alter an active Session's locked
  // configuration are never applied silently — Cancel here aborts this save
  // attempt entirely (nothing is POSTed, Settings just closes); "Reset and
  // Apply" performs the normal Session Reset FIRST (preserving the existing
  // Archives record — resetSession() only clears the in-memory Session, see
  // sessionEngine.js) and only then falls through to actually apply the
  // payload below, exactly like an unaffected save always has.
  if (settingsChangeAffectsActiveSession(payload)) {
    const proceed = await confirmSettingsSessionChange();
    if (!proceed) {
      closeSettingsDialogs();
      return;
    }
    await performReset();
  }

  els.settings.save.disabled = true;
  try {
    await api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // The old credential's runtime-unavailable findings don't apply to a new
    // key — let every model for this provider be evaluated fresh.
    for (const id of keyChangedProviders) clearProviderFailures(id);
    await loadStatus();
    // Window Mode is a DESKTOP-SHELL setting, not a server one: it is applied
    // through the shell bridge and never travels in the payload above. In the
    // browser there is no shell and the control stays disabled, so this is a
    // no-op there and nothing about browser behaviour changes.
    const shell = desktopShell();
    if (shell && typeof shell.setWindowMode === "function" && els.display.windowMode && !els.display.windowMode.disabled) {
      // Always on Top first: it must already be in effect when a mode change
      // recreates the window, so the new window is created on top rather than
      // flashing behind whatever it was above.
      if (typeof shell.setAlwaysOnTop === "function" && els.display.alwaysOnTop) {
        shell.setAlwaysOnTop(els.display.alwaysOnTop.checked);
      }
      shell.setWindowMode(els.display.windowMode.value);
      // Keeps the drag strip in step for the transitions that do NOT recreate
      // the window; the ones that do reload the page and re-run this at boot.
      applyDesktopWindowModeClass();
    }
    // Visible success feedback, then close shortly after so it is seen.
    activeSettingsDialog().error.textContent = str("saved");
    activeSettingsDialog().error.className = "settings-msg ok";
    activeSettingsDialog().error.hidden = false;
    setTimeout(() => closeSettingsDialogs(), 900);
  } catch (err) {
    activeSettingsDialog().error.textContent = err.message;
    activeSettingsDialog().error.className = "settings-msg error-text";
    activeSettingsDialog().error.hidden = false;
  } finally {
    els.settings.save.disabled = false;
  }
}

// ------------------------------------------------------------------- archives
// Local history of completed Sessions (see src/services/archives.js). Fully
// separate from the Vault: Save to Vault is an explicit, curated write the
// player asks for; Archives is an automatic record of every completed run.
// Search is local — the full list is fetched once per Archives visit and
// filtered client-side, so typing in the search box never calls an AI.

let archivesCache = []; // thread groups: { threadId, title, count, updatedAt, latest, sessions }
let currentArchiveId = null;
// Which threads the player manually expanded — cleared on every fresh visit
// to Archives (openArchives()), not persisted. While a search is active,
// every thread that matches is shown expanded regardless of this set (see
// filteredArchives()), so a matching child is never hidden behind a click.
let expandedThreadIds = new Set();

function showLibraryView() {
  els.archives.view.hidden = true;
  els.libraryView.hidden = false;
}

function showArchivesListView() {
  els.archives.detailView.hidden = true;
  els.archives.listView.hidden = false;
  currentArchiveId = null;
}

function openArchives() {
  els.libraryView.hidden = true;
  els.archives.view.hidden = false;
  showArchivesListView();
  els.archives.search.value = "";
  expandedThreadIds = new Set();
  loadArchivesList();
}

function closeArchives() {
  showLibraryView();
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Dates follow the interface language (each locale pack names its own
  // BCP-47 date locale).
  try {
    return d.toLocaleString(str("dateLocale") || undefined);
  } catch {
    return d.toLocaleString();
  }
}

// "Jul 13, 2026" / "7:49 AM" pieces for the compact Archive cards.
function formatDateTimeParts(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return null;
  const locale = str("dateLocale") || undefined;
  try {
    return {
      date: d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }),
      time: d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
    };
  } catch {
    return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
  }
}

// Product name for a provider id ("google" → "Gemini") — always the live
// Settings registry, never hardcoded.
function providerProductName(id) {
  return currentConfig?.providers?.[id]?.short || id;
}

// Full AI configuration tag for the Session Detail page: "GPT (gpt-5.1)".
// Model names are intentionally preserved there — the detail page is a
// permanent historical record for comparing models across sessions.
function providerModelTag(provider, model) {
  if (!provider) return "";
  return model ? `${providerProductName(provider)} (${model})` : providerProductName(provider);
}

// Localized display names for the interaction modes ("council"/"single" stay
// as the internal session-engine identifiers): Council = multiple Scholars +
// Judge synthesis, Mentor = one Scholar for focused guidance.
function modeLabel(mode) {
  return mode === "single" ? str("modeMentor") : str("modeCouncil");
}

function setArchiveListMessage(text, isWarn) {
  els.archives.list.innerHTML = "";
  const p = document.createElement("p");
  p.className = "archive-status-msg" + (isWarn ? " warn" : "");
  p.textContent = text;
  els.archives.list.appendChild(p);
}

async function loadArchivesList() {
  setArchiveListMessage(str("loadingArchives"));
  try {
    const data = await api("/api/archives");
    archivesCache = data.archives || [];
    renderArchivesList(archivesCache, els.archives.search.value);
  } catch (err) {
    console.error("[archives] failed to load archives:", err);
    setArchiveListMessage(strT("archivesLoadFailed", { error: err.message }), true);
  }
}

// Matches against the backend-derived search haystack (title + question +
// structured metadata: mode, Scholars, providers, models, reply language),
// falling back to title/question for any cached summary without one.
function summaryMatchesQuery(s, q) {
  return (s.searchText || `${s.title || ""}\n${s.question || ""}`.toLowerCase()).includes(q);
}

// A thread survives the filter when ANY of its Sessions matches — a hit on a
// buried reply must still surface its whole thread (section 11), never just
// the root.
function filteredArchives(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return archivesCache;
  return archivesCache.filter((t) => t.sessions.some((s) => summaryMatchesQuery(s, q)));
}

// date • time • participating AI product names (GPT, Claude, Gemini, …) —
// the same compact scan line every Archive row has always used. Model names
// live on the detail page.
function archiveSubLine(dateIso, providers) {
  const when = formatDateTimeParts(dateIso);
  return [...(when ? [when.date, when.time] : []), ...(providers || []).map(providerProductName)].join(" • ");
}

// One plain Archive row — the exact markup every row has always used,
// whether it is a lone Session's only row or one child of an expanded
// thread. Caller wires up the click handler.
function buildArchiveItemRow(summary) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "archive-item";

  const main = document.createElement("div");
  main.className = "archive-item-main";
  const title = document.createElement("div");
  title.className = "archive-item-title";
  title.textContent = summary.title;
  const sub = document.createElement("div");
  sub.className = "archive-item-sub";
  sub.textContent = archiveSubLine(summary.finishedAt || summary.startedAt, summary.providers);
  main.append(title, sub);

  const meta = document.createElement("div");
  meta.className = "archive-item-meta";
  const modeEl = document.createElement("span");
  modeEl.className = "badge";
  modeEl.textContent = modeLabel(summary.mode);
  meta.appendChild(modeEl);

  item.append(main, meta);
  return item;
}

function toggleThreadExpanded(threadId) {
  if (expandedThreadIds.has(threadId)) expandedThreadIds.delete(threadId);
  else expandedThreadIds.add(threadId);
  renderArchivesList(archivesCache, els.archives.search.value);
}

function renderArchivesList(all, query) {
  const list = filteredArchives(query);
  const searching = Boolean((query || "").trim());

  if (archivesCache.length === 0) {
    const wrap = document.createElement("div");
    wrap.className = "archive-status-msg";
    const strong = document.createElement("strong");
    strong.textContent = str("noArchives");
    const sub = document.createElement("div");
    sub.textContent = str("noArchivesSub");
    wrap.append(strong, sub);
    els.archives.list.innerHTML = "";
    els.archives.list.appendChild(wrap);
    return;
  }

  if (list.length === 0) {
    setArchiveListMessage(str("noSearchMatch"));
    return;
  }

  els.archives.list.innerHTML = "";
  for (const t of list) {
    // A single-Session thread is a plain Archive row — visually identical
    // to every row before this feature existed (section 7: "should look
    // essentially the same as the current Archive row").
    if (t.count <= 1) {
      const item = buildArchiveItemRow(t.latest);
      item.addEventListener("click", () => openArchiveDetail(t.latest.id));
      els.archives.list.appendChild(item);
      continue;
    }

    // Multi-Session thread: a header (root title + latest activity/model +
    // count + expand toggle) plus, when expanded, every Session oldest ->
    // newest as its own clickable child row — so Continue Discussion can be
    // reached from ANY of them, not only the latest (section 10).
    const wrap = document.createElement("div");
    wrap.className = "archive-thread";

    const expanded = searching || expandedThreadIds.has(t.threadId);

    const header = document.createElement("button");
    header.type = "button";
    header.className = "archive-item archive-thread-header";
    header.setAttribute("aria-expanded", String(expanded));

    const toggle = document.createElement("span");
    toggle.className = "archive-thread-toggle";
    toggle.textContent = expanded ? "▾" : "▸";
    toggle.setAttribute("aria-hidden", "true");

    const count = document.createElement("span");
    count.className = "badge archive-thread-count";
    count.textContent = String(t.count);

    const main = document.createElement("div");
    main.className = "archive-item-main";
    const title = document.createElement("div");
    title.className = "archive-item-title";
    title.textContent = t.title;
    const sub = document.createElement("div");
    sub.className = "archive-item-sub";
    sub.textContent = archiveSubLine(t.updatedAt, t.latest.providers);
    main.append(title, sub);

    const meta = document.createElement("div");
    meta.className = "archive-item-meta";
    const modeEl = document.createElement("span");
    modeEl.className = "badge";
    modeEl.textContent = modeLabel(t.latest.mode);
    meta.appendChild(modeEl);

    header.append(toggle, count, main, meta);
    header.addEventListener("click", () => toggleThreadExpanded(t.threadId));
    wrap.appendChild(header);

    if (expanded) {
      const children = document.createElement("div");
      children.className = "archive-thread-children";
      for (const s of t.sessions) {
        const row = document.createElement("div");
        row.className = "archive-thread-child-row";
        const connector = document.createElement("span");
        connector.className = "archive-thread-connector";
        connector.textContent = "↳";
        connector.setAttribute("aria-hidden", "true");
        const item = buildArchiveItemRow(s);
        item.addEventListener("click", () => openArchiveDetail(s.id));
        row.append(connector, item);
        children.appendChild(row);
      }
      wrap.appendChild(children);
    }

    els.archives.list.appendChild(wrap);
  }
}

async function openArchiveDetail(id) {
  currentArchiveId = id;
  els.archives.listView.hidden = true;
  els.archives.detailView.hidden = false;
  els.archives.detailContent.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "archive-status-msg";
  loading.textContent = str("loadingSession");
  els.archives.detailContent.appendChild(loading);

  try {
    const data = await api(`/api/archives/${encodeURIComponent(id)}`);
    if (currentArchiveId === id) renderArchiveDetail(data.archive);
  } catch (err) {
    console.error("[archives] failed to load archive detail:", err);
    if (currentArchiveId === id) {
      els.archives.detailContent.innerHTML = "";
      const p = document.createElement("p");
      p.className = "archive-status-msg warn";
      p.textContent = strT("archiveLoadFailed", { error: err.message });
      els.archives.detailContent.appendChild(p);
    }
  }
}

function backToArchivesList() {
  showArchivesListView();
}

// Where `archive.id` sits within its thread, using the already-loaded
// Archives list cache (populated before any detail page can be reached —
// see openArchiveDetail()'s one call site). Returns null for a single-
// Session thread, so the caller shows nothing extra for the common case.
function threadPositionFor(id) {
  for (const t of archivesCache) {
    if (t.count <= 1) continue;
    const index = t.sessions.findIndex((s) => s.id === id);
    if (index !== -1) return { index: index + 1, count: t.count };
  }
  return null;
}

function renderArchiveDetail(archive) {
  const wrap = els.archives.detailContent;
  wrap.innerHTML = "";

  const h2 = document.createElement("h2");
  h2.className = "archive-detail-title";
  h2.textContent = archive.title;
  wrap.appendChild(h2);

  // Optional, low-risk addition (section 13): a compact "Discussion 2 of 3"
  // line when this Archive belongs to a multi-Session thread. Never shown
  // for a lone Archive — the detail page otherwise stays exactly as it was.
  const position = threadPositionFor(archive.id);
  if (position) {
    const positionEl = document.createElement("div");
    positionEl.className = "archive-detail-thread-position";
    positionEl.textContent = strT("archiveThreadPosition", position);
    wrap.appendChild(positionEl);
  }

  const question = document.createElement("p");
  question.className = "archive-detail-question";
  question.textContent = archive.question;
  wrap.appendChild(question);

  // The initial question's own attachments — same chips as the live header.
  // Older records without preview data still render (name + type); only the
  // preview degrades (see openAttachmentPreview()).
  const initialAttachments = renderTurnAttachments(archive.attachments);
  if (initialAttachments) wrap.appendChild(initialAttachments);

  const meta = document.createElement("div");
  meta.className = "archive-detail-meta";
  const judgeName = archive.identity?.judge;
  const metaParts = [
    [str("dateLabel"), formatDateTime(archive.finishedAt || archive.startedAt)],
    [str("modeLabel"), modeLabel(archive.mode)],
  ];
  // The Judge's row is labelled by its in-world name (Grand Sage / 大智者),
  // with the full AI configuration preserved — this page is the permanent
  // historical record.
  if (archive.mode === "council" && judgeName) {
    metaParts.push([judgeName, providerModelTag(archive.judge?.provider, archive.judge?.model) || "—"]);
  }
  for (const [label, value] of metaParts) {
    const span = document.createElement("span");
    span.className = "sh-item";
    span.append(`${label} `);
    const b = document.createElement("b");
    b.textContent = value;
    span.appendChild(b);
    meta.appendChild(span);
  }
  wrap.appendChild(meta);

  const scholars = Object.values(archive.scholars || {}).sort((a, b) => (a.slot || 0) - (b.slot || 0));
  if (scholars.length > 0) {
    const scholarsWrap = document.createElement("div");
    scholarsWrap.className = "archive-scholars";
    for (const s of scholars) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = s.persona || strT("scholarSlotLabel", { n: s.slot });
      if (s.provider) {
        const tag = document.createElement("span");
        tag.className = "muted";
        // Product name + full model, e.g. "Gemini (gemini-3.1-flash-lite)".
        tag.textContent = providerModelTag(s.provider, s.model);
        summary.appendChild(tag);
      }
      details.appendChild(summary);
      const body = document.createElement("div");
      body.className = "answer";
      if (s.status === "ok" && s.answer) {
        body.classList.add("state-ok");
        body.innerHTML = renderMarkdown(s.answer);
      } else {
        body.classList.add("state-error");
        body.textContent = `⚠ ${s.error || str("noAnswer")}`;
      }
      details.appendChild(body);
      scholarsWrap.appendChild(details);
    }
    wrap.appendChild(scholarsWrap);
  }

  if (archive.mode === "council" && archive.judge) {
    const synthesis = document.createElement("div");
    synthesis.className = "archive-synthesis";
    const h3 = document.createElement("h3");
    h3.textContent = strT("synthesisTitle", { name: judgeName || currentConfig?.identity?.judge || "Judge" });
    synthesis.appendChild(h3);
    const body = document.createElement("div");
    if (archive.judge.status === "ok" && archive.judge.answer) {
      body.className = "answer state-ok";
      body.innerHTML = renderMarkdown(archive.judge.answer);
    } else {
      body.className = "answer state-error";
      body.textContent = `⚠ ${archive.judge.error || str("noRuling")}`;
    }
    synthesis.appendChild(body);
    wrap.appendChild(synthesis);
  }

  // The follow-up conversation (manual questions and Quick Questions alike —
  // both travel through the same chat array), if any was captured as of the
  // most recent save. Reuses the live chat bubble classes for visual
  // consistency with the in-session Conversation thread.
  if (Array.isArray(archive.chat) && archive.chat.length > 0) {
    const convo = document.createElement("div");
    convo.className = "archive-conversation";
    const h3 = document.createElement("h3");
    h3.textContent = str("archiveConversationTitle");
    convo.appendChild(h3);
    const log = document.createElement("div");
    log.className = "chat-log";
    for (const m of archive.chat) {
      const bubble = document.createElement("div");
      bubble.className = `chat-msg chat-${m.role === "assistant" ? "assistant" : "user"}`;
      if (m.role === "assistant") bubble.innerHTML = renderMarkdown(m.text);
      else {
        bubble.textContent = m.text;
        prependTurnAttachments(bubble, m.attachments);
      }
      log.appendChild(bubble);
    }
    convo.appendChild(log);
    wrap.appendChild(convo);
  }

  if (archive.vault?.state === "saved" && archive.vault.path) {
    const vaultRef = document.createElement("p");
    vaultRef.className = "archive-vault-ref";
    vaultRef.textContent = strT("savedToVaultRef", { path: archive.vault.path });
    wrap.appendChild(vaultRef);
  }

  const actions = document.createElement("div");
  actions.className = "archive-detail-actions";

  // Continue Discussion — reopens this completed Archive as previous-
  // discussion context for a NEW session; never mutates this archive (see
  // continueDiscussion()). Placed first, matching the task's own layout.
  const continueStatus = document.createElement("span");
  continueStatus.className = "archive-sync-msg";
  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.id = "archive-continue";
  continueBtn.textContent = str("continueDiscussion");
  continueBtn.addEventListener("click", () => continueDiscussion(archive, continueBtn, continueStatus));

  // Sync to Obsidian — the recovery path for a session the user forgot to
  // export before resetting. The status line doubles as the synced-state
  // display and the success/failure notification; the archive is always kept.
  const syncStatus = document.createElement("span");
  syncStatus.className = "archive-sync-msg";
  if (archive.obsidianExport) {
    syncStatus.classList.add("ok");
    syncStatus.textContent = str("archiveSyncedObsidian");
    syncStatus.title = archive.obsidianExport.path || "";
  }
  const sync = document.createElement("button");
  sync.type = "button";
  sync.id = "archive-sync-obsidian";
  sync.textContent = str(archive.obsidianExport ? "archiveSyncAgain" : "archiveSyncObsidian");
  sync.addEventListener("click", () => syncArchiveToObsidian(archive, sync, syncStatus));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.id = "archive-remove";
  remove.textContent = str("removeFromArchives");
  remove.addEventListener("click", () => openRemoveArchiveDialog(archive.id));
  actions.append(continueBtn, continueStatus, sync, syncStatus, remove);
  wrap.appendChild(actions);
}

// "Continue Discussion" — loads this archive's own saved Markdown
// (read-only; never touches the archive) and reattaches it as previous-
// discussion context for a brand NEW session, then returns to the Library
// workspace. Never reopens the old runtime session, never appends to the
// old Archive, never auto-submits anything — the player types the follow-up
// naturally, exactly like starting fresh with one material pre-attached.
//
// If a session is currently active in the Library workspace, this is
// effectively "start a new Session" and follows the SAME rule Reset itself
// already uses: unsaved content is never silently discarded. Reuses the
// existing Reset-confirmation dialog (and performReset()) rather than a new
// one — a Cancel there aborts Continue Discussion entirely, leaving both
// the active Session and this Archive page untouched.
async function continueDiscussion(archive, btn, statusEl) {
  btn.disabled = true;
  statusEl.className = "archive-sync-msg";
  statusEl.textContent = "";
  let continuation;
  try {
    continuation = await api(`/api/archives/${encodeURIComponent(archive.id)}/continue`);
  } catch (err) {
    console.error("[archives] failed to load continuation text:", err);
    statusEl.className = "archive-sync-msg warn";
    statusEl.textContent = strT("archiveLoadFailed", { error: err.message });
    btn.disabled = false;
    return;
  }

  if (sessionState) {
    const hasUnsavedContent = sessionState.vault?.state !== "saved";
    if (hasUnsavedContent) {
      // Confirm via the SAME dialog Reset itself uses — but resolved through
      // its own Confirm/Cancel button clicks (and ESC/backdrop via the
      // dialog's native "cancel" event), never its "close" event: a
      // programmatic dialog.close() does not reliably dispatch "close" in
      // every environment, which previously left this awaiting forever. The
      // dialog's own existing Confirm handler still performs the actual
      // reset (fire-and-forget) — awaiting performReset() ourselves below
      // guarantees we never proceed before it has genuinely finished.
      const confirmed = await new Promise((resolve) => {
        const finish = (result) => {
          els.resetConfirm.confirm.removeEventListener("click", onConfirm);
          els.resetConfirm.cancel.removeEventListener("click", onCancel);
          els.resetConfirm.dialog.removeEventListener("cancel", onCancel);
          resolve(result);
        };
        const onConfirm = () => finish(true);
        const onCancel = () => finish(false);
        els.resetConfirm.confirm.addEventListener("click", onConfirm);
        els.resetConfirm.cancel.addEventListener("click", onCancel);
        els.resetConfirm.dialog.addEventListener("cancel", onCancel);
        els.resetConfirm.dialog.showModal();
      });
      if (!confirmed) {
        // The active Session is untouched, so Continue Discussion must not
        // proceed either.
        btn.disabled = false;
        return;
      }
      await performReset();
    } else {
      await performReset();
    }
  }

  closeArchives();
  // At most one thread parent (Archive Discussion Threads spec, section 6):
  // a second Continue Discussion click before submitting REPLACES the
  // previous previous-discussion chip rather than accumulating a second one
  // — the deterministic rule that keeps continuationLineage() below always
  // unambiguous, since no other path in this composer can ever produce a
  // second `kind: "archive"` material.
  sessionMaterials = sessionMaterials.filter((m) => m.kind !== "archive");
  pushMaterial({
    kind: "archive",
    icon: ARCHIVE_ICON,
    name: continuation.title,
    title: continuation.title, // raw, for renderAttachments() to re-localize the chip label on every render
    status: "ready",
    text: continuation.markdown,
    // Archive Discussion Threads lineage — carried on the material entry
    // itself (never a separate tracked variable) so removing this chip via
    // the existing × control automatically removes the lineage too (see
    // continuationLineage() below). Never sent to the AI (materialsPayload()
    // strips these before the material reaches the run request's `materials`
    // array) — only continuationLineage() reads them, into the request's
    // separate `continuation` field.
    sourceSessionId: continuation.id,
    sourceThreadId: continuation.threadId,
  });
  els.question.focus();
}

// Runs the archive Obsidian sync and reports the outcome inline. A missing
// Obsidian connection (checked locally first, and again authoritatively by
// the backend via the `notConfigured` flag) shows the localized prompt plus
// a shortcut to the Vault menu, where Enable Obsidian Integration lives —
// never a raw error. Re-syncing updates the note the archive already
// produced (the backend remembers its relPath), so no silent duplicates.
async function syncArchiveToObsidian(archive, btn, statusEl) {
  const showNotConfigured = () => {
    statusEl.className = "archive-sync-msg warn";
    statusEl.textContent = `${str("archiveSyncNotConfigured")} `;
    statusEl.title = "";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "archive-sync-link";
    go.textContent = str("archiveSyncOpenVaultMenu");
    go.addEventListener("click", (event) => {
      // Same as the menu toggle's own handler: without this, the click
      // bubbles to the document-level outside-click listener and closes the
      // menu the instant it opens.
      event.stopPropagation();
      closeArchives();
      toggleVaultMenu();
    });
    statusEl.appendChild(go);
  };

  if (!vaultState.obsidian?.enabled) {
    showNotConfigured();
    return;
  }

  btn.disabled = true;
  statusEl.className = "archive-sync-msg";
  statusEl.textContent = str("archiveSyncing");
  statusEl.title = "";
  try {
    const data = await api(`/api/archives/${encodeURIComponent(archive.id)}/export-obsidian`, { method: "POST" });
    archive.obsidianExport = data.export;
    btn.textContent = str("archiveSyncAgain");
    statusEl.className = "archive-sync-msg ok";
    statusEl.textContent = strT("archiveSyncSuccess", { path: data.export.path });
    statusEl.title = data.export.path || "";
  } catch (err) {
    console.error("[archives] Obsidian sync failed:", err);
    if (err.data?.notConfigured) showNotConfigured();
    else {
      statusEl.className = "archive-sync-msg warn";
      statusEl.textContent = strT("archiveSyncFailed", { error: err.message });
    }
  } finally {
    btn.disabled = false;
  }
}

// Removing only drops the session from the Archive index — Vault/Obsidian
// files are never touched. A small in-app dialog (not window.confirm, which
// can't carry custom button labels) states that distinction before acting.
let pendingRemoveArchiveId = null;

function openRemoveArchiveDialog(id) {
  pendingRemoveArchiveId = id;
  els.archives.removeDialog.showModal();
}

async function confirmRemoveArchive() {
  const id = pendingRemoveArchiveId;
  if (!id) return;
  els.archives.removeDialog.close();
  try {
    await api(`/api/archives/${encodeURIComponent(id)}`, { method: "DELETE" });
    backToArchivesList();
    // Re-fetch rather than patch archivesCache locally: deleting one Session
    // out of a thread can change that thread's count, its root title (a
    // deleted root falls back to the oldest surviving Session — section 12),
    // or its latest-activity sort position — all decided server-side by
    // listArchiveThreads(), never reconstructed here.
    await loadArchivesList();
  } catch (err) {
    console.error("[archives] failed to remove archive:", err);
    window.alert(strT("removeFailed", { error: err.message }));
  }
}

// ---------------------------------------------------------------------- vault
// The Vault connection lifecycle (see src/services/vaultConnection.js):
// picking a folder with the OS dialog, opening it in the OS file manager, and
// switching to a new one. Read-only display of the current Vault content
// (Save to Vault, the session header's Vault badge) is unchanged elsewhere.

function renderVaultControl() {
  const connected = Boolean(vaultState.configured);
  els.vault.connectBtn.hidden = connected;
  els.vault.split.hidden = !connected;
  // The Vault just changed, so stage-2 guidance may have become satisfied.
  refreshVaultSetupHint();
  // NOTE: the Start Menu's "Enter Library" is deliberately NOT touched here.
  // It used to be hidden until a Vault existed, which made a clean first
  // launch a dead end: the only way in was to connect a Vault, and because
  // the first-run tutorial is triggered by entering the Library, a new user
  // never saw it either. A Vault is optional for exploring — it is required
  // only to SAVE a discussion, which is enforced where saving happens.
  if (!connected) {
    closeVaultMenu();
    return;
  }
  els.vault.menuPath.textContent = vaultState.path;
  els.vault.openBtn.title = vaultState.exists
    ? strT("openVaultTitle", { path: vaultState.path })
    : strT("vaultPathMissing", { path: vaultState.path });

  // Optional Obsidian integration — two clear states, never required:
  //   Off: status line + "Enable Obsidian Integration" only. A remembered
  //        path may exist internally but is neither shown nor used.
  //   On:  status line + connected path + Change / Disable actions.
  const obsidian = vaultState.obsidian || { configured: false, enabled: false };
  const on = Boolean(obsidian.enabled);
  els.vault.obsidianState.textContent = on ? str("integrationOn") : str("integrationOff");
  els.vault.obsidianState.className = on ? "ok" : "";
  els.vault.obsidianDetail.hidden = !on;
  els.vault.obsidianPath.textContent = on ? obsidian.path || "" : "";
  els.vault.obsidianEnable.hidden = on;
  els.vault.obsidianChange.hidden = !on;
  els.vault.obsidianDisable.hidden = !on;
  renderObsidianExportRow();
}

// The inline, non-blocking secondary export action under the session header.
// Visible only when the Obsidian integration is enabled AND the active
// Session is saved to the native Vault — with the integration off, saving
// looks exactly as it always has.
function renderObsidianExportRow() {
  const obsidian = vaultState.obsidian || {};
  const saved = sessionState?.vault?.state === "saved" || sessionState?.metadata?.vaultState === "saved";
  const visible = Boolean(obsidian.enabled && saved);
  els.obsidianExport.row.hidden = !visible;
  if (!visible) return;

  els.obsidianExport.autoChk.checked = Boolean(obsidian.autoExport);
  // A follow-up + another Save to Vault moves vault.savedAt past the last
  // export's timestamp — that's this session's own note falling behind the
  // live conversation, so the export is stale and needs a re-push rather than
  // being done forever.
  const exportRecord = sessionState?.obsidianExport;
  const savedAt = sessionState?.vault?.savedAt || null;
  const stale = Boolean(exportRecord && savedAt && exportRecord.exportedAt < savedAt);
  const upToDate = Boolean(exportRecord) && !stale;
  els.obsidianExport.button.textContent = stale
    ? str("updateObsidian")
    : upToDate
      ? str("exported")
      : str("exportObsidian");
  els.obsidianExport.button.disabled = upToDate;
  els.obsidianExport.button.classList.toggle("is-exported", upToDate);
  els.obsidianExport.button.title = stale ? str("obsidianStaleHint") : "";
}

// ------------------------------------------------------ top-level dropdowns
// VAULT and MORE are the two header dropdowns and share one interaction
// model, so they share one helper. Previously each owned its own toggle and
// only MORE closed the other — opening VAULT while MORE was open left both
// menus visible, overlapping. Routing both through openDropdown() makes the
// exclusion symmetric by construction: opening ANY dropdown closes every
// other one, and aria-expanded is written from the same place as `hidden`,
// so the two can never disagree.
function dropdowns() {
  return [
    { menu: els.vault.menu, toggle: els.vault.menuToggle, control: els.vault.control },
    { menu: els.more.menu, toggle: els.more.toggle, control: els.more.control },
  ];
}

function setDropdownOpen(entry, open) {
  entry.menu.hidden = !open;
  entry.toggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAllDropdowns() {
  for (const entry of dropdowns()) setDropdownOpen(entry, false);
}

// Re-clicking the open toggle closes it; clicking a different one swaps.
function toggleDropdown(menu) {
  const wasOpen = !menu.hidden;
  closeAllDropdowns();
  if (wasOpen) return;
  const entry = dropdowns().find((d) => d.menu === menu);
  if (entry) setDropdownOpen(entry, true);
}

function anyDropdownOpen() {
  return dropdowns().some((d) => !d.menu.hidden);
}

function closeVaultMenu() {
  setDropdownOpen(dropdowns()[0], false);
}

function toggleVaultMenu() {
  toggleDropdown(els.vault.menu);
}

// One outside-click listener for every dropdown: a click inside ANY dropdown's
// own control leaves that one alone; anything else closes all of them.
document.addEventListener("click", (event) => {
  if (!anyDropdownOpen()) return;
  if (dropdowns().some((d) => d.control.contains(event.target))) return;
  closeAllDropdowns();
});

// ============================================================ Batch B: MORE
// The MORE dropdown mirrors the Vault dropdown's behaviour exactly (toggle,
// outside-click close, ESC via the single global keydown listener) so the two
// menus feel identical. Opening either one closes the other — two open
// dropdowns overlapping would be a UI bug, not a feature.

function closeMoreMenu() {
  setDropdownOpen(dropdowns()[1], false);
}

function toggleMoreMenu() {
  toggleDropdown(els.more.menu);
}

// -------------------------------------------------------- external links
// ------------------------------------------------------- Scene UI Content
// Presentational content authored in the F8 UI tab (About text + outbound
// The Scene's selected Tutorial resource, delivered by GET
// /api/content/tutorial already sanitized: disabled steps removed, targets
// restricted to the registry, and no filesystem path. Fetched once at
// startup; a Content-tab reload refreshes it without touching AI/session
// state.
let sceneUi = null;
// The PRODUCT configuration: official links, copyright and description.
// Loaded once, independent of any Scene or World — see §6 (a Scene must never
// be able to change where an official link points).
let productLinks = null;
let product = null;

// The F8 UI tab shows the app version READ-ONLY. Exposed here so the editor
// never invents a second version source — it stays package.json via
// publicConfig().appVersion.
function exposeAppVersionToEditor() {
  if (currentConfig?.appVersion) window.__aetherAppVersion = currentConfig.appVersion;
}

async function loadProduct() {
  product = await api("/api/product").catch(() => null);
  productLinks = product?.links || null;
  syncMoreMenuLinks();
}

// The Scene's selected Tutorial RESOURCE (sanitized, disabled steps already
// removed server-side). Scene Content itself carries only a resource id.
async function loadSceneUi() {
  sceneUi = await api("/api/content/tutorial").catch(() => null);
  syncMoreMenuLinks();
}

// The GLOBAL Learn guide resource. Product documentation — never varies by
// Scene or World.
let learnResource = null;

async function loadLearnResource() {
  learnResource = await api("/api/content/learn").catch(() => null);
}

// Exposed so the F8 UI tab can refresh the runtime after a save instead of
// requiring a reload. Deliberately narrow: content only, never session state.
window.__refreshSceneUi = loadSceneUi;
// F8 Content tab Reload: refresh sanitized content without touching AI
// session state, the Vault, settings, or scene geometry.
window.__refreshLearn = loadLearnResource;
window.__refreshProduct = loadProduct;

// World Content: a save in the F8 World tab re-applies the display identity
// server-side, so the client just needs its config again — that is where
// identity/strings come from (publicConfig().identity reads identityFor(),
// which now resolves through World Content).
window.__refreshWorld = () => loadStatus();

// A sanitized URL from scene UI content. The server already rejected
// anything that isn't http/https (or mailto where allowed); this is the
// second guard, so a tampered response still cannot navigate anywhere odd.
function openExternalUrl(url) {
  if (typeof url !== "string" || !url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "mailto:") {
    // A mail client hand-off, not a browsing context: window.open would
    // leave a blank tab behind in most browsers.
    window.location.href = url;
    return true;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

// THE one product-link -> MORE-entry map. Every external destination the app
// offers is here, and nowhere else: About reads only `website` from the same
// product payload, and there is no second fallback source.
//
// Official links come from the PRODUCT configuration alone. Scene Content and
// World Content are deliberately not consulted — a Scene or a shared preset
// must never be able to repoint an official link (see the security note in
// src/services/productConfig.js).
const PRODUCT_LINK_FOR_MENU = {
  feedback: "feedback",
  website: "website",
  github: "github",
  discord: "discord",
  support: "support",
};

function fixedLinkUrl(key) {
  const productKey = PRODUCT_LINK_FOR_MENU[key];
  if (!productKey) return "";
  const link = productLinks?.[productKey];
  return link?.configured && link.url ? link.url : "";
}

// The localized string for a Scene UI Content field, following the interface
// locale with an English fallback (the server sends both). "" means "not
// authored" — every caller then uses the product's built-in copy.
function sceneUiText(map) {
  if (!map || typeof map !== "object") return "";
  const locale = currentConfig?.interfaceLanguage || "en";
  const requested = typeof map[locale] === "string" ? map[locale].trim() : "";
  if (requested) return requested;
  return typeof map.en === "string" ? map.en.trim() : "";
}

// Disables the MORE entries whose URL is still a placeholder, with a title
// explaining why, rather than offering a dead item.
function syncMoreMenuLinks() {
  const entries = [
    [els.more.report, "feedback"],
    [els.more.website, "website"],
    [els.more.github, "github"],
    [els.more.discord, "discord"],
    [els.more.support, "support"],
  ];
  for (const [btn, key] of entries) {
    // One source: the product config. An entry is clickable only when its
    // own link sanitized to a usable URL.
    const ok = Boolean(fixedLinkUrl(key));
    btn.disabled = !ok;
    btn.title = ok ? "" : str("linkNotConfigured");
  }
}

// Opens one of the three fixed MORE entries through whichever source
// configured it. Never opens an unconfigured entry (the button is already
// disabled; this is the second guard).
function openFixedLink(key) {
  return openExternalUrl(fixedLinkUrl(key));
}

// ------------------------------------------------------------- Learn guide
// Content comes from the locale pack (learnSections), so both languages stay
// in step and nothing user-facing is hardcoded here. Purely presentational —
// no request of any kind.
let learnActiveSection = null;

// One authoritative Learn source: the extracted content resource, with the
// locale pack kept only as a fallback for an install whose resource file is
// missing. Locale choice follows the interface language, then English.
function learnSections() {
  const locales = learnResource?.locales;
  if (locales && typeof locales === "object") {
    const locale = currentConfig?.interfaceLanguage || "en";
    const forLocale = locales[locale];
    if (Array.isArray(forLocale) && forLocale.length) return forLocale;
    if (Array.isArray(locales.en) && locales.en.length) return locales.en;
  }
  return Array.isArray(currentConfig?.learnSections) ? currentConfig.learnSections : [];
}

function renderLearnContent(section) {
  const c = els.learn.content;
  c.innerHTML = "";
  if (!section) return;
  const h = document.createElement("h3");
  h.textContent = section.title;
  c.appendChild(h);
  for (const block of section.blocks || []) {
    if (block.type === "list") {
      const ul = document.createElement("ul");
      for (const item of block.items || []) {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      }
      c.appendChild(ul);
    } else {
      const p = document.createElement("p");
      p.textContent = block.text || "";
      c.appendChild(p);
    }
  }
  c.scrollTop = 0;
}

function renderLearn() {
  const sections = learnSections();
  els.learn.title.textContent = str("learnTitle");
  els.learn.close.textContent = str("learnClose");
  els.learn.nav.innerHTML = "";
  if (!sections.length) return;
  if (!sections.some((s) => s.id === learnActiveSection)) learnActiveSection = sections[0].id;
  for (const section of sections) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = section.title;
    btn.classList.toggle("is-active", section.id === learnActiveSection);
    btn.addEventListener("click", () => {
      learnActiveSection = section.id;
      renderLearn();
    });
    els.learn.nav.appendChild(btn);
  }
  renderLearnContent(sections.find((s) => s.id === learnActiveSection));
}

function openLearn() {
  closeMoreMenu();
  renderLearn();
  els.learn.dialog.showModal();
}

// ------------------------------------------------------------------ About
// About reads Scene UI Content (F8 UI tab) and falls back to the product's
// built-in copy for anything not authored. Every field is written with
// textContent — content is authored data and must never be injected as HTML.
// About is PRODUCT surface, not Scene surface: its description, copyright and
// every link it offers come from the product configuration (§1/§6), so
// loading a different Scene or preset can never change them. The title stays
// the localized product name.
function renderAbout() {
  els.about.title.textContent = str("aboutTitle");
  els.about.close.textContent = str("aboutClose");
  els.about.description.textContent = sceneUiText(product?.description) || str("aboutDescription");
  // Version comes from publicConfig().appVersion, which reads package.json —
  // NEVER from Scene UI Content, which has no version field at all. The row
  // is simply omitted if that ever fails, never shown as "undefined".
  const version = currentConfig?.appVersion || "";
  els.about.version.textContent = version ? strT("aboutVersion", { version }) : "";
  els.about.version.hidden = !version;
  // Product copyright; the start screen's attribution remains the fallback.
  els.about.attribution.textContent = product?.copyright || str("startCopyright");

  // ONE outbound line: the product's own website, shown by hostname and
  // opened at its full validated URL. Every other external destination lives
  // in MORE — About is identity and legal information only, so there is no
  // link list here to drift out of step with the menu.
  const site = productLinks?.website;
  const siteUrl = site?.configured && site.url ? site.url : "";
  els.about.website.innerHTML = "";
  els.about.website.hidden = !siteUrl;
  if (siteUrl) {
    let host = siteUrl;
    try {
      // Human-friendly: "aetherlibrary.app", not the full URL. Falls back to
      // the raw string if it somehow will not parse (it already sanitized).
      host = new URL(siteUrl).hostname.replace(/^www\./, "") || siteUrl;
    } catch {
      /* keep the raw value */
    }
    // A full-width colon already carries its own spacing, so an ASCII space
    // after it reads as a gap ("了解更多： host"). Only separate when the
    // lead does not already end in punctuation or whitespace.
    const leadText = str("aboutWebsiteLead");
    const lead = document.createTextNode(/[：:\s]$/.test(leadText) ? leadText : `${leadText} `);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "about-website-link";
    btn.textContent = host; // textContent, never innerHTML
    btn.addEventListener("click", () => openExternalUrl(siteUrl));
    els.about.website.append(lead, btn);
  }
}

function openAbout() {
  closeMoreMenu();
  renderAbout();
  els.about.dialog.showModal();
}

// =========================================================== Batch B: Tutorial
// A five-step first-use walkthrough: dim overlay, a ring highlighting the
// step's target, and a callout. Plain DOM + CSS — no animation library and
// no dependency, per spec.
//
// Deliberately independent of AI/config state: it reads nothing from
// currentConfig, writes nothing to settings, and issues no request. Replaying
// it can therefore never alter data. Its only persistence is one localStorage
// flag (same mechanism the existing model-failure memory already uses).
const TUTORIAL_SEEN_KEY = "aether.tutorialSeen";

// `target` is resolved lazily at render time (never captured up front): the
// element may not exist yet, may be hidden, or may have been renamed. A step
// whose target can't be found still shows — see positionTutorial().
// One full conversation, start to finish: set up (1-2), open a discussion
// (3-5), ask it (6-7), read and keep it (8-9), then the closing note (10).
// Order and targets follow the real workflow rather than a feature tour.
//
// Every target is resolved lazily and may legitimately be missing — Save to
// Vault, for instance, is hidden until a Session exists, so on a first run
// step 9 has no element at all. positionTutorial() already treats a missing,
// detached or zero-sized target as "no spotlight" and centres the callout, so
// these need no guards of their own.
// THE safe target registry. Authored content selects a target by ID; it can
// never persist a CSS selector, so tutorial data cannot reach into arbitrary
// DOM. Adding a future target is one entry here — never a new conditional.
// "" (or an unknown id) resolves to null, which positionTutorial() already
// treats as "centre the callout".
const TUTORIAL_TARGETS = {
  settings: () => els.settings.open,
  // Provider/model setup now lives behind its own top-level button.
  "ai-config": () => els.aiConfig.open,
  // The Vault lives in the header (location + Obsidian integration are both
  // in its dropdown), not inside the Settings dialog.
  vault: () => els.vault.control,
  "core-object": () => els.bookHotspot,
  mode: () => els.modeToggle,
  scholars: () => els.scholarPicker,
  attachments: () => els.attachBtn,
  // The composer frame covers the textarea AND the Send button in one
  // spotlight — the step is about both together.
  composer: () => els.composer,
  // Steps 8-9 run against the Author Preview when it is mounted (see
  // syncTutorialAuthorPreview) — the real discussion area and Save to Vault
  // are hidden behind it, and a spotlight on a display:none element is no
  // spotlight at all. Falling through to the real element keeps these two
  // working for a returning user with a genuine Session, and for "Preview
  // This Step" in F8 where no preview is mounted.
  "discussion-workspace": () => window.__authorPreview?.element("discussion") || els.discussionWorkspace,
  "save-to-vault": () => window.__authorPreview?.element("saveVault") || els.header.save,
};

function tutorialTargetEl(targetId) {
  const lookup = TUTORIAL_TARGETS[targetId];
  if (typeof lookup !== "function") return null; // "" and unknown ids centre
  try {
    return lookup() || null;
  } catch {
    return null; // a lookup that throws is treated exactly like "not found"
  }
}

// The product's built-in copy, keyed by stable step id. This is the DEFAULT
// layer of the resolution chain — the authored Tutorial resource wins over it —
// and it stays in the locale packs so translations live in one system.
// Nothing else reads these keys, so there is no second runtime source.
const TUTORIAL_DEFAULT_TEXT = {
  settings: { titleKey: "tutorialStep1Title", bodyKey: "tutorialStep1Body" },
  "ai-config": { titleKey: "tutorialStep2Title", bodyKey: "tutorialStep2Body" },
  vault: { titleKey: "tutorialStep3Title", bodyKey: "tutorialStep3Body" },
  "core-object": { titleKey: "tutorialStep4Title", bodyKey: "tutorialStep4Body" },
  mode: { titleKey: "tutorialStep5Title", bodyKey: "tutorialStep5Body" },
  scholars: { titleKey: "tutorialStep6Title", bodyKey: "tutorialStep6Body" },
  attachments: { titleKey: "tutorialStep7Title", bodyKey: "tutorialStep7Body" },
  composer: { titleKey: "tutorialStep8Title", bodyKey: "tutorialStep8Body" },
  "discussion-workspace": { titleKey: "tutorialStep9Title", bodyKey: "tutorialStep9Body" },
  "save-to-vault": { titleKey: "tutorialStep10Title", bodyKey: "tutorialStep10Body" },
  "privacy-more": { titleKey: "tutorialStep11Title", bodyKey: "tutorialStep11Body" },
};

// The canonical order + default targets, used when no authored tutorial has
// been delivered yet (content still loading, or the fetch failed).
const TUTORIAL_DEFAULT_STEPS = [
  { id: "settings", target: "settings" },
  { id: "ai-config", target: "ai-config" },
  { id: "vault", target: "vault" },
  { id: "core-object", target: "core-object" },
  { id: "mode", target: "mode" },
  { id: "scholars", target: "scholars" },
  { id: "attachments", target: "attachments" },
  { id: "composer", target: "composer" },
  { id: "discussion-workspace", target: "discussion-workspace" },
  { id: "save-to-vault", target: "save-to-vault" },
  // Closing note: no single control owns it, so it centres by design.
  { id: "privacy-more", target: "" },
];

// THE one place the runtime decides which steps exist. Authored content
// arrives with disabled steps already removed (see runtimeSceneUi), so this
// only has to choose between "authored" and "built-in defaults".
// `overrideSteps` is used by the F8 "Preview This Step" hook, which runs the
// same engine on unsaved form values rather than a second one.
let tutorialStepsOverride = null;

function tutorialSteps() {
  if (tutorialStepsOverride) return tutorialStepsOverride;
  const authored = sceneUi?.steps;
  if (Array.isArray(authored) && authored.length > 0) return authored;
  return TUTORIAL_DEFAULT_STEPS;
}

// Resolution per field: authored current locale -> authored English ->
// built-in default for this step -> "". Never undefined, never a raw key.
function tutorialText(step, field) {
  const authored = sceneUiText(step?.[field]);
  if (authored) return authored;
  const keys = TUTORIAL_DEFAULT_TEXT[step?.id];
  const key = keys && (field === "title" ? keys.titleKey : keys.bodyKey);
  return key ? str(key) : "";
}


// ================================================ First-run AI setup guidance
// A first-time user can finish the Tutorial with no provider configured, then
// click the Core Book and watch nothing happen. This is the whole remedy: a
// soft highlight on Settings, a one-line tooltip, and an explanatory dialog on
// that Core Book click.
//
// It is guidance, never a gate. The Library stays fully explorable with zero
// providers; every step of the existing Settings flow stays optional; nothing
// here opens a wizard, dims the page or blocks a click.
//
// STATE. "Is a provider configured?" is derived — currentConfig already
// carries it, so no flag can drift out of sync with reality. The one thing
// configuration cannot answer is "has the user already dealt with this?", and
// that needs exactly one persisted bit. It is set on dismissal AND the first
// time a provider appears, which is what makes the guidance permanent-off
// rather than something that returns if a key is later removed.
const AI_SETUP_HINT_DONE_KEY = "aether.aiSetupHintDone";

function anyProviderConfigured() {
  return providerStatusList().some((p) => p.configured);
}

function aiSetupHintDone() {
  try {
    return localStorage.getItem(AI_SETUP_HINT_DONE_KEY) === "1";
  } catch {
    // Storage blocked (private browsing): treat as done, exactly as
    // hasSeenTutorial() does, so guidance can never nag on every launch.
    return true;
  }
}

function markAiSetupHintDone() {
  try {
    localStorage.setItem(AI_SETUP_HINT_DONE_KEY, "1");
  } catch {
    /* storage blocked — nothing to remember; the hint simply won't return */
  }
}

// All four activation conditions in one place, so the highlight, the tooltip
// and any future surface can never disagree about when guidance applies.
function aiSetupGuidanceApplies() {
  return hasSeenTutorial() && !anyProviderConfigured() && !aiSetupHintDone();
}

// Opening Settings retires the TOOLTIP but not the highlight: the user went
// to look, which is not the same as having connected anything. Session-only,
// so it costs no persisted state — the highlight still answers "there is
// still no provider" until there is one.
let aiSetupTooltipSeen = false;

// Idempotent: safe to call on every config load, Settings save and tutorial
// exit. Adding an already-present class does not restart a CSS animation, so
// the particle keeps orbiting smoothly across re-renders.
function refreshAiSetupHint() {
  // AI CONFIG, not Settings: providers live there, and the tooltip's own
  // button opens it. Pointing the highlight at a different button than the
  // one the user is being sent to is what this corrects.
  const btn = els.aiConfig.open;
  const hint = els.aiSetupHint?.wrap;
  if (!btn) return;
  // Configured at last: retire the guidance for good, not just for now. This
  // is what makes it permanent — removing the key later cannot bring it back.
  if (anyProviderConfigured() && !aiSetupHintDone()) markAiSetupHintDone();

  const applies = aiSetupGuidanceApplies();
  btn.classList.toggle("ai-setup-highlight", applies);
  if (hint) hint.hidden = !applies || aiSetupTooltipSeen;
}

// The ✕. An explicit decision, so it is remembered across launches — the
// same rule the Tutorial applies to Skip.
function dismissAiSetupHint() {
  markAiSetupHintDone();
  refreshAiSetupHint();
}

// Settings was opened. Hides the tooltip for this session only.
function noteAiSetupSettingsOpened() {
  aiSetupTooltipSeen = true;
  refreshAiSetupHint();
}

// ------------------------------------------------- setup stage 2: the Vault
//
// SEQUENCED, not parallel. A brand-new user is shown ONE thing to do at a
// time, in dependency order: nothing in the product works without a provider,
// so AI Config comes first and the Vault hint stays silent until a provider
// exists. Otherwise a fresh launch lights up two controls at once and reads
// as a chore list.
//
// Everything else mirrors stage 1 exactly — derived state for "is it done",
// one persisted bit for "has the user dealt with this", and the same tooltip
// and highlight classes — so the two stages cannot drift apart in behaviour.
const VAULT_SETUP_HINT_DONE_KEY = "aether.vaultSetupHintDone";

function vaultSetupHintDone() {
  try {
    return localStorage.getItem(VAULT_SETUP_HINT_DONE_KEY) === "1";
  } catch {
    return true; // storage blocked — never nag, same rule as stage 1
  }
}

function markVaultSetupHintDone() {
  try {
    localStorage.setItem(VAULT_SETUP_HINT_DONE_KEY, "1");
  } catch {
    /* storage blocked — nothing to remember */
  }
}

// Stage 2 applies only once stage 1 is genuinely satisfied.
function vaultSetupGuidanceApplies() {
  return (
    hasSeenTutorial() &&
    anyProviderConfigured() &&
    !vaultState.configured &&
    !vaultSetupHintDone()
  );
}

let vaultSetupTooltipSeen = false;

function refreshVaultSetupHint() {
  const btn = els.vault.connectBtn;
  const hint = els.vaultSetupHint?.wrap;
  if (!btn) return;
  // Connected at last: retire it permanently, exactly as stage 1 does when a
  // provider appears — disconnecting later must not bring the guidance back.
  if (vaultState.configured && !vaultSetupHintDone()) markVaultSetupHintDone();

  const applies = vaultSetupGuidanceApplies();
  btn.classList.toggle("ai-setup-highlight", applies);
  if (hint) hint.hidden = !applies || vaultSetupTooltipSeen;
}

function dismissVaultSetupHint() {
  markVaultSetupHintDone();
  refreshVaultSetupHint();
}

// The folder picker was opened. Retires the tooltip for this session only —
// going to look is not the same as having connected, so the highlight stays
// until a Vault actually exists.
function noteVaultSetupOpened() {
  vaultSetupTooltipSeen = true;
  refreshVaultSetupHint();
}

// The one entry point every caller should use: both stages, in order, from a
// single call. Idempotent and derived, so it is safe on every config load,
// save, Vault change and Tutorial exit.
function refreshSetupGuidance() {
  refreshAiSetupHint();
  refreshVaultSetupHint();
}

// The Core Book with nothing configured. Explains, offers the two obvious
// ways forward, and traps no one: "Later" just closes.
function openAiSetupDialog() {
  els.aiSetup.dialog.showModal();
}

let tutorialIndex = 0;
let tutorialOpen = false;

// Steps 8-9 describe a FINISHED discussion — reviewing it, then keeping it —
// and a first-run user has none to look at. Those two steps therefore mount
// the Author Preview: the same deterministic completed-Council Workspace the
// dev-only F9 shortcut uses, through the same controller.
//
// Which steps want it is keyed on the stable step id, not the index: an
// authored resource may disable steps, so index 7 is not reliably "step 8".
const TUTORIAL_PREVIEW_STEPS = new Set(["discussion-workspace", "save-to-vault"]);

// OWNERSHIP. A preview the author entered themselves (F9) must survive a
// tutorial run, and a preview the Tutorial mounted must never outlive it.
// This flag is the whole distinction, and it is the reason Back, Skip,
// close, restart and a disabled-step jump all need no logic of their own.
let tutorialOwnsAuthorPreview = false;

// The persona names the mock should show. The LIVE identity — already
// resolved by the server through the Scene's world (custom override ->
// locale -> English -> built-in) and delivered in publicConfig — so the
// Tutorial needs no Scene Editor and no second resolution path.
function tutorialPreviewIdentity() {
  const identity = currentConfig?.identity;
  if (!identity?.judge || !identity?.scholars) return null;
  return { judge: identity.judge, scholars: { ...identity.scholars } };
}

// THE reconciliation point. Called from renderTutorial() (every step change,
// forward or back) and from the two exit paths, so there is exactly one
// place that decides whether the tutorial-owned preview should be up.
//
// It never touches a preview it does not own, and it is idempotent: moving
// 8 -> 9 leaves the existing mount alone rather than remounting, so the
// spotlight has a stable target and no duplicate root can appear.
function syncTutorialAuthorPreview(step) {
  const api = window.__authorPreview;
  if (!api) return;
  const wanted = tutorialOpen && TUTORIAL_PREVIEW_STEPS.has(step?.id);

  if (wanted) {
    if (api.isActive()) return; // already up — ours, or the author's own
    const identity = tutorialPreviewIdentity();
    // No identity yet (config still loading): the step still renders, with
    // positionTutorial() centring the callout as it does for any missing
    // target. Never a thrown error mid-tutorial.
    if (!identity) return;
    // indicator: false — the Tutorial has its own callout and Next button,
    // and "F9 to return to editor" would be meaningless to a first-run user.
    tutorialOwnsAuthorPreview = api.mount({ identity, indicator: false });
    return;
  }

  if (tutorialOwnsAuthorPreview) {
    api.unmount();
    tutorialOwnsAuthorPreview = false;
  }
}

function hasSeenTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1";
  } catch {
    // Storage blocked (private browsing): treat as "already seen" so the
    // tutorial can never re-interrupt on every single launch. It stays
    // available on demand from MORE.
    return true;
  }
}

function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
  } catch {
    /* storage blocked — nothing to remember, replay stays available via MORE */
  }
}

// Places the ring over the current target and the callout beside it. A
// missing/zero-sized target is NOT an error: the ring is hidden and the
// callout centres itself, so a renamed or absent element degrades to a plain
// centered message instead of trapping the player behind an invisible step.
function positionTutorial() {
  const step = tutorialSteps()[tutorialIndex];
  // Target ids only — tutorialTargetEl() never throws and returns null for an
  // unknown/absent id, which centres the callout.
  const el = tutorialTargetEl(step?.target);
  const rect = el && el.isConnected ? el.getBoundingClientRect() : null;
  const usable = rect && rect.width > 0 && rect.height > 0;

  const ring = els.tutorial.ring;
  const callout = els.tutorial.callout;
  if (!usable) {
    ring.hidden = true;
    callout.style.left = "50%";
    callout.style.top = "50%";
    callout.style.transform = "translate(-50%, -50%)";
    return;
  }
  const pad = 6;
  ring.hidden = false;
  ring.style.left = `${rect.left - pad}px`;
  ring.style.top = `${rect.top - pad}px`;
  ring.style.width = `${rect.width + pad * 2}px`;
  ring.style.height = `${rect.height + pad * 2}px`;

  callout.style.transform = "none";
  const calloutRect = callout.getBoundingClientRect();
  // Prefer below-right of the target, then flip when that would overflow —
  // clamped to the viewport so the callout is always fully reachable.
  let left = rect.left;
  let top = rect.bottom + 14;
  if (top + calloutRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - calloutRect.height - 14);
  left = Math.min(Math.max(8, left), window.innerWidth - calloutRect.width - 8);
  callout.style.left = `${left}px`;
  callout.style.top = `${top}px`;
}

function renderTutorial() {
  const steps = tutorialSteps();
  const step = steps[tutorialIndex];
  // Before anything is measured: mounting or unmounting the preview changes
  // what the spotlight can target, so it has to settle first.
  syncTutorialAuthorPreview(step);
  const t = els.tutorial;
  t.stepCount.textContent = strT("tutorialStepCount", { n: tutorialIndex + 1, total: steps.length });
  // textContent throughout: authored text is DATA, never markup. Line breaks
  // survive via the callout CSS (white-space: pre-line), so no HTML is needed
  // to render them.
  t.heading.textContent = tutorialText(step, "title");
  t.body.textContent = tutorialText(step, "body");
  renderTutorialImage(step);
  t.skip.textContent = str("tutorialSkip");
  t.back.textContent = str("tutorialBack");
  t.back.hidden = tutorialIndex === 0;
  const last = tutorialIndex === steps.length - 1;
  t.next.textContent = last ? str("tutorialFinish") : str("tutorialNext");
  positionTutorial();
}

// The optional per-step preview image. Hidden whenever there is no image, and
// hidden again if the file fails to load — a broken image must never block
// Next/Previous/Skip/Finish, so this only ever toggles visibility.
function renderTutorialImage(step) {
  const img = els.tutorial.image;
  if (!img) return;
  const src = typeof step?.previewImage === "string" ? step.previewImage : "";
  if (!src) {
    img.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.hidden = false;
  // The path is validated server-side (assets/tutorial/ only) and served by
  // the existing static mount; it is set as an attribute, never as markup.
  img.src = `/${src}`;
  img.onerror = () => {
    img.hidden = true;
    // Re-place the callout: it just got shorter.
    if (tutorialOpen) positionTutorial();
  };
  img.onload = () => {
    if (tutorialOpen) positionTutorial();
  };
}

function startTutorial(fromIndex = 0) {
  closeMoreMenu();
  // A previous run that was torn down abnormally cannot leave a mount
  // behind: drop ownership of anything still up before rendering step one.
  syncTutorialAuthorPreview(null);
  tutorialIndex = fromIndex;
  tutorialOpen = true;
  els.tutorial.overlay.hidden = false;
  renderTutorial();
}

// Both finishing and dismissing record the same flag: an explicit skip is
// still an answer, and re-interrupting someone who dismissed it would be
// exactly the nuisance the spec warns against.
function endTutorial() {
  if (!tutorialOpen) return;
  // A preview is not the tutorial: it exits without recording "seen", so
  // previewing a step in F8 can never suppress a real first-launch run.
  if (tutorialStepsOverride) {
    endTutorialPreview();
    return;
  }
  tutorialOpen = false;
  els.tutorial.overlay.hidden = true;
  // tutorialOpen is already false, so this can only unmount.
  syncTutorialAuthorPreview(null);
  markTutorialSeen();
  // The Tutorial has just finished or been skipped, which is one of the four
  // activation conditions — so this is the moment guidance can first apply.
  // Stage 1 shows now; stage 2 waits until a provider exists.
  refreshSetupGuidance();
}

function tutorialNext() {
  if (tutorialIndex >= tutorialSteps().length - 1) {
    endTutorial();
    return;
  }
  tutorialIndex += 1;
  renderTutorial();
}

function tutorialBack() {
  if (tutorialIndex === 0) return;
  tutorialIndex -= 1;
  renderTutorial();
}

// Auto-run on first entry into the library only. Deferred a tick so the
// shell is laid out and target rects are real before the ring is placed.
function maybeAutoStartTutorial() {
  if (hasSeenTutorial()) return;
  setTimeout(() => startTutorial(0), 400);
}

// F8 "Preview This Step": renders ONE unsaved step through the real tutorial
// engine (never a second one) by temporarily overriding the step list. It
// persists nothing, starts no run, and deliberately does NOT mark the
// tutorial as seen — closing it restores the normal step source.
window.__previewTutorialStep = (step) => {
  if (!step || typeof step !== "object") return false;
  tutorialStepsOverride = [step];
  tutorialIndex = 0;
  tutorialOpen = true;
  els.tutorial.overlay.hidden = false;
  renderTutorial();
  return true;
};

// Ends a preview without recording it as seen. The normal end path
// (endTutorial) still marks seen — a preview must never do that.
function endTutorialPreview() {
  tutorialStepsOverride = null;
  tutorialOpen = false;
  els.tutorial.overlay.hidden = true;
  syncTutorialAuthorPreview(null);
}

window.addEventListener("resize", () => {
  if (tutorialOpen) positionTutorial();
});
// Escape handling lives in the single global keydown listener (see wiring).

async function openVaultFolder() {
  closeVaultMenu();
  try {
    await api("/api/vault/open", { method: "POST" });
  } catch (err) {
    console.error("[vault] failed to open folder:", err);
    window.alert(strT("vaultOpenFailed", { error: err.message }));
  }
}

async function copyVaultPath() {
  const ok = await copyTextToClipboard(vaultState.path);
  if (ok) {
    const original = els.vault.menuCopy.textContent;
    els.vault.menuCopy.textContent = str("copied");
    setTimeout(() => {
      els.vault.menuCopy.textContent = original;
    }, 1000);
  }
  closeVaultMenu();
}

// First connection: no prior Vault to compare against, so no confirmation —
// straight from folder picker to connected.
async function connectVaultFirstTime() {
  try {
    const picked = await api("/api/vault/pick-folder", { method: "POST" });
    if (picked.cancelled) return;
    const data = await api("/api/vault/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: picked.path }),
    });
    vaultState = data.vault;
    renderVaultControl();
  } catch (err) {
    console.error("[vault] failed to connect:", err);
    window.alert(strT("vaultConnectFailed", { error: err.message }));
  }
}

// Changing an already-connected Vault: picker, then an explicit confirmation
// (current vs. new folder) before switching future sessions to it.
async function changeVaultLocation() {
  closeVaultMenu();
  try {
    const picked = await api("/api/vault/pick-folder", { method: "POST" });
    if (picked.cancelled) return;
    openVaultConfirmDialog(picked.path);
  } catch (err) {
    console.error("[vault] folder picker failed:", err);
    window.alert(strT("pickerFailed", { error: err.message }));
  }
}

// OPTIONAL Obsidian integration: pick an existing Obsidian vault folder and
// remember it. If the folder has no .obsidian marker the backend rejects with
// notObsidian and we confirm before retrying with force. Never required — the
// built-in Vault keeps working regardless of this connection.
async function connectObsidian() {
  closeVaultMenu();
  try {
    const picked = await api("/api/vault/pick-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "obsidian" }),
    });
    if (picked.cancelled) return;

    let data;
    try {
      data = await api("/api/vault/obsidian/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: picked.path }),
      });
    } catch (err) {
      if (!err.data?.notObsidian) throw err;
      if (!window.confirm(str("obsidianNotVault"))) return;
      data = await api("/api/vault/obsidian/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: picked.path, force: true }),
      });
    }
    vaultState = data.vault;
    renderVaultControl();
  } catch (err) {
    console.error("[vault] failed to connect Obsidian:", err);
    window.alert(strT("obsidianConnectFailed", { error: err.message }));
  }
}

// Re-checks the Vault (and Obsidian) state on disk and reloads config-driven
// UI — useful after moving folders around outside the app.
async function refreshVaultStatus() {
  closeVaultMenu();
  await loadStatus();
}

// Turns the integration on. With a remembered path this is a pure flag flip;
// without one, the backend answers needsPath and we fall into the existing
// folder-picker flow (connecting a folder enables the integration).
async function enableObsidianIntegration() {
  closeVaultMenu();
  try {
    const data = await api("/api/vault/obsidian/integration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    vaultState = data.vault;
    renderVaultControl();
  } catch (err) {
    if (err.data?.needsPath) return connectObsidian();
    console.error("[obsidian] failed to enable integration:", err);
    window.alert(strT("obsidianConnectFailed", { error: err.message }));
  }
}

// Turns the integration off. Only stops future exports — the remembered
// path, the auto-export preference, and every exported file stay untouched.
async function disableObsidianIntegration() {
  closeVaultMenu();
  try {
    const data = await api("/api/vault/obsidian/integration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    vaultState = data.vault;
    renderVaultControl();
  } catch (err) {
    console.error("[obsidian] failed to disable integration:", err);
    window.alert(strT("obsidianConnectFailed", { error: err.message }));
  }
}

// Persists the auto-export preference; reverts the checkbox if saving fails.
async function toggleAutoExport() {
  const enabled = els.obsidianExport.autoChk.checked;
  try {
    const data = await api("/api/vault/obsidian/auto-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    vaultState = data.vault;
  } catch (err) {
    console.error("[obsidian] failed to save auto-export preference:", err);
    els.obsidianExport.autoChk.checked = !enabled;
  }
}

// Manual "Export to Obsidian": copies the saved native-Vault note into
// aether-vault/. A failure never affects the native save — the button simply
// re-arms for a retry and the message says exactly what happened.
async function exportToObsidian() {
  const btn = els.obsidianExport.button;
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = str("exporting");
  try {
    const data = await api("/api/session/export-obsidian", { method: "POST" });
    if (sessionState) sessionState.obsidianExport = data.export;
    renderObsidianExportRow();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = str("exportObsidian");
    setHeaderMsg(`⚠ ${str("obsidianExportFailedMsg")}`);
    console.error("[obsidian] export failed:", err);
  }
}

let pendingVaultPath = null;

function openVaultConfirmDialog(newPath) {
  pendingVaultPath = newPath;
  els.vault.confirmCurrent.textContent = vaultState.path || "—";
  els.vault.confirmNew.textContent = newPath;
  els.vault.confirmError.hidden = true;
  els.vault.confirmDialog.showModal();
}

async function confirmVaultChange() {
  if (!pendingVaultPath) return;
  els.vault.confirmUse.disabled = true;
  try {
    const data = await api("/api/vault/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pendingVaultPath }),
    });
    vaultState = data.vault;
    renderVaultControl();
    els.vault.confirmDialog.close();
  } catch (err) {
    els.vault.confirmError.textContent = err.message;
    els.vault.confirmError.hidden = false;
  } finally {
    els.vault.confirmUse.disabled = false;
  }
}

// ------------------------------------------------- start menu & screen flow
// The start menu is the entry screen. Its background is AUTHORED, not
// hardcoded — see applyStartMenuBackground() and config/app-shell.json.
// Connect Vault runs the existing connection flow; a connected Vault reveals
// Enter Library, which switches to the main game shell.

// Gates autonomous wandering (see characterAITick): true only once the
// player has actually entered the library scene, never on the start menu.
let libraryEntered = false;

function enterLibrary() {
  els.start.menu.hidden = true;
  els.shell.hidden = false;
  libraryEntered = true;
  initIdleController();
  maybeAutoStartTutorial(); // Batch B: first-use walkthrough (localStorage-gated)
  // #app-shell (and everything inside it, including #app-split-divider) is
  // `hidden` until this point — initAppSplitDivider()'s own startup call ran
  // against a not-yet-visible shell, so the divider's active/inactive state
  // needs a fresh evaluation now that the layout is actually on screen. A
  // plain setTimeout (not requestAnimationFrame) on purpose — rAF is tied
  // to the rendering pipeline and can be suspended for a backgrounded/
  // non-painting tab, silently leaving the divider stuck in its stale
  // pre-entry state (reproduced directly: rAF here never fired in one
  // headless test harness, while a macrotask reliably did) — same fix
  // already applied to __onSceneEditorActiveChange's F8 hook below.
  setTimeout(applyAppSplitWidth, 0);
}

async function startMenuConnect() {
  await connectVaultFirstTime();
  if (vaultState.configured) enterLibrary();
}

// ------------------------------------------- book hotspot & mode selection
// Clicking the book on the council table opens the mode choice (智囊團模式 /
// 導師模式 — Council / Mentor), which drives the existing setMode() state.
// Scholar selection still happens in the composer's Scholar cards.

// The book hotspot is just a themed alternate route to the same Mode
// toggle — usable during follow-up too (see setMode()); it only ever
// prepares the *next* Symposium, never the running one.
function openModeModal() {
  // With nothing configured, a mode picker leads nowhere — explain instead.
  // The branch lives HERE rather than on the button because the Core Book has
  // two click paths (its own hotspot, and the delegated near-miss handler
  // below); this is the one point both of them call.
  if (!anyProviderConfigured()) {
    openAiSetupDialog();
    return;
  }
  // Rendered from already-fetched config only — see renderCoreBookAiStatus.
  // Opening the Core Book must never start a model check or contact a
  // provider, so this is a pure DOM update with no network call.
  renderCoreBookAiStatus();
  els.modeModal.dialog.showModal();
}

function chooseMode(mode) {
  setMode(mode);
  els.modeModal.dialog.close();
  els.question.focus();
}

// ------------------------------------------------------- fullscreen modes
// In-app focused views, not browser fullscreen: lib-full hides the chat
// panel, chat-full hides the library panel. Mutually exclusive.

function setPanelFullscreen(kind) {
  const cls = kind === "lib" ? "lib-full" : "chat-full";
  const other = kind === "lib" ? "chat-full" : "lib-full";
  const on = !document.body.classList.contains(cls);
  // A layout-mode change: an in-progress divider drag must terminate
  // cleanly first, then any stale inline dimensions are cleared and the
  // split is recalculated from #conversation's post-toggle bounds.
  cancelWorkspaceDrag();
  // Same for the production app-split divider — entering/leaving either
  // fullscreen mode removes one of the two panels it resizes between, so
  // any in-progress drag must end cleanly too. applyAppSplitWidth() (called
  // below) hides the divider and clears #chat-panel's inline width while
  // fullscreen is active — it does NOT reset chatPanelWidthPx, so exiting
  // fullscreen restores this session's chosen split automatically, per spec.
  cancelAppSplitDrag();
  document.body.classList.remove(other);
  document.body.classList.toggle(cls, on);
  els.libFullscreen.setAttribute("aria-pressed", String(document.body.classList.contains("lib-full")));
  els.chatFullscreen.setAttribute("aria-pressed", String(document.body.classList.contains("chat-full")));
  recalcWorkspaceSplit();
  applyAppSplitWidth();
}

// ------------------------------------------------------------------ wiring

els.start.connect.addEventListener("click", startMenuConnect);
els.start.settings.addEventListener("click", openSettings);
els.start.enter.addEventListener("click", enterLibrary);
// Keyboard path: Tab focus + Enter/Space still dispatches a native click
// AT the button itself regardless of pointer-events (that CSS property only
// affects pointer/mouse hit-testing, never focus or keyboard activation).
els.bookHotspot.addEventListener("click", openModeModal);
// Mouse/touch path: the button is pointer-events:none (style.css), so a real
// pointer click never reaches it directly — it now falls through to whatever
// actually renders at that fixed scene point (core_book_01's Prop, or bare
// scene background), which is the whole point of the fix: that Prop's own
// `:hover`/click can finally be hit-tested normally. This delegated listener
// restores the click-to-start behavior by testing the SAME fixed geometry
// the button always occupied, independent of what DOM element the pointer
// event actually resolved to. Guarded by `e.target !== els.bookHotspot` so a
// bubbled keyboard click (target IS the button) is never double-handled.
document.querySelector(".library-scene").addEventListener("click", (e) => {
  if (e.target === els.bookHotspot) return;
  // The F8 Scene Editor's own #se-capture overlay is ALSO a .library-scene
  // descendant (it needs to sit visually over the scene), so its clicks
  // bubble through here too while active — every click during authoring
  // (selecting a prop, dragging, editing collision/zones …) would otherwise
  // ALSO spuriously open this modal whenever it lands within the hotspot's
  // fixed region. The editor already fully owns pointer input while open
  // (its overlay sits above even this button's z-index), so this listener
  // has nothing to do then regardless.
  if (window.__sceneEditor?.state?.active) return;
  const r = els.bookHotspot.getBoundingClientRect();
  if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
    openModeModal();
  }
});
els.modeModal.council.addEventListener("click", () => chooseMode("council"));
els.modeModal.single.addEventListener("click", () => chooseMode("single"));
els.libFullscreen.addEventListener("click", () => setPanelFullscreen("lib"));
els.chatFullscreen.addEventListener("click", () => setPanelFullscreen("chat"));

// True when the keystroke belongs to text editing, not navigation.
function isEditableTarget(el) {
  return Boolean(
    el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
  );
}

// The single global ESC listener — one action per press, topmost layer
// first: an open <dialog> closes itself natively (we do nothing extra),
// then the vault dropdown, then the Archive screen (same path as its
// "Back to Library" button), then a fullscreen view. Never the app.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.querySelector("dialog[open]")) return;
  // Tutorial is the topmost layer when open — ESC dismisses it (which also
  // records it as seen, same as the Skip button).
  if (tutorialOpen) endTutorial();
  // Escape closes EVERY open dropdown, not just the first one found — with
  // two of them the old else-if chain needed two presses.
  else if (anyDropdownOpen()) closeAllDropdowns();
  else if (!els.archives.view.hidden) closeArchives();
  else if (document.body.classList.contains("lib-full")) setPanelFullscreen("lib");
  else if (document.body.classList.contains("chat-full")) setPanelFullscreen("chat");
});

// Browser-like Back: on the Session Detail page only, Backspace returns to
// the Archive list (same path as its "Back to Archives" button). Text
// editing always wins — a focused input/textarea keeps normal Backspace —
// and open dialogs are left alone.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Backspace") return;
  if (isEditableTarget(event.target)) return;
  if (document.querySelector("dialog[open]")) return;
  const onDetailPage = !els.archives.view.hidden && !els.archives.detailView.hidden;
  if (!onDetailPage) return;
  event.preventDefault();
  backToArchivesList();
});

// ----------------------------------------------- scene objects (NPCs & props)
// The standard placement system for every character and prop in the library
// scene. One object = one entry here; placing it requires NO manual pixel
// nudging, only three facts:
//
//   anchor — the sprite's own reference point, as fractions of its IMAGE BOX:
//            characters use FOOT CENTER, props use BOTTOM CENTER — both
//            measured from the art's alpha bounding box (transparent canvas
//            padding must never shift placement). Recorded per sprite below.
//   world  — where that anchor sits in the scene, in normalized scene
//            coordinates (fractions of the 1920×1080 scene art — the same
//            system .book-hotspot already uses). The scene element always
//            equals the drawn image in every mode, so these hold everywhere.
//   width  — the sprite BOX's world width as a fraction of scene width.
//            World size is a VISUAL choice per object (how tall should this
//            character stand next to the furniture?) — source-texture
//            resolution is irrelevant to it.
//
// Placing a character behind a desk/podium/counter is then just: give both
// the same world x and put the character's foot anchor a touch above the
// prop's bottom anchor — the depth-layer system (sceneDepthZ below) sorts
// the prop in front automatically, because its ground line is lower.
// Draw order: background image (DOM first) → scene objects (depth-layer
// bands, Y-sorted within each band) → interactive hotspots
// (.book-hotspot, z above all decor).
//
// CANONICAL PLACEMENT REFERENCE: assets/background/_guides/classic_library_bg_guide.png
// (kept in _guides/ so the F8 background picker never offers it — the listing
// skips every directory whose name begins with "_"; see /api/dev/backgrounds)
// — the artist's composite of the intended world scale and positions over
// the clean background (which itself carries only floor, shelves, walls,
// windows, and the center table; everything else renders as scene objects).
// The guide is reference-only: never shipped to the DOM, never modified.
// World sizes and positions below are MEASURED from it (pixel-diff against
// the clean background + template matching), in its 1920×1080 art space —
// never inferred from source-texture resolution.
const SCENE_OBJECTS = [
  {
    id: "classic-omega",
    // Editor-facing metadata (the game itself never reads these): display
    // name and kind ("npc" | "prop") shown in the Scene Editor inspector.
    name: "Omega",
    kind: "npc",
    asset: "classicOmega",
    // Character Asset id (see src/services/characterRegistry.js): traces
    // this baked Scene Object back to its entry in the Character Registry.
    // The game still resolves the sprite via `asset` → window.ASSETS above
    // (the baked cast is code-defined, same as before the rename) — this
    // field only establishes the data link for future dynamic character
    // loading, mirroring how scene-config props carry an assetId.
    characterId: "classic_omega",
    // Foot center, from the 1080×1080 source's alpha bbox (content x
    // 252–828, y 94–1024): ((252+828)/2 / 1080, 1024.5/1080).
    anchor: { x: 0.5, y: 0.949 },
    // Per the guide: foot center at scene (960, 299) — head top measured at
    // y=106 in the guide, plus the fixed 193px body height.
    world: { x: 0.5, y: 0.2769 },
    // FIXED render size: Omega's drawn body is 120×193 world px (spec'd, not
    // estimated). Body spans 577 of the 1080-px-wide source box, so the
    // box width that yields a 120px body is 120 × (1080/577) = 224.6 scene
    // px → 224.6/1920.
    width: 0.117,
    z: 2,
    // Foot collider (collision section): the tiny box around the feet that
    // movement blocking tests — never the sprite box.
    footCollider: { width: 40, height: 14 },
    // Ground shadow (see the ground-shadows section below): an 88×13
    // ellipse just under the feet — sized to Omega's stance, editable live
    // in the Scene Editor's Shadow section.
    shadow: {
      enabled: true,
      asset: "assets/shared/shadows/shadow_medium.png",
      offsetX: 0,
      offsetY: -4,
      width: 88,
      height: 13,
      opacity: 1,
    },
  },
  {
    id: "podium",
    name: "Podium",
    kind: "prop",
    asset: "podium",
    // Bottom center, from the 256×256 source's alpha bbox (content x
    // 57–199, y 63–194): (128/256, 194.5/256).
    anchor: { x: 0.5, y: 0.76 },
    // Per the guide: template-matching the sprite against the guide places
    // its content bottom-center at scene (960, 317.5) at scale 0.752 —
    // box width 256 × 0.752 = 192.5 scene px. Drawn above Omega (z), it
    // occludes them from the waist down exactly as the guide shows; hands
    // peek out ~7px past the lectern on each side.
    world: { x: 0.5, y: 0.294 },
    width: 0.1003,
    z: 3,
    // Starter collision footprint (≈ the plinth): centered band around the
    // base anchor. Demonstration values — tune live in the F8 Collision
    // section.
    collision: { enabled: true, offsetX: -52, offsetY: -12, width: 104, height: 24 },
    // A wide flat ellipse hugging the plinth (≈108 px wide base).
    shadow: {
      enabled: true,
      asset: "assets/shared/shadows/shadow_medium.png",
      offsetX: 0,
      offsetY: 0,
      width: 112,
      height: 17,
      opacity: 0.9,
    },
    // "omega_home" — Omega's canonical spawn/return destination (see
    // resolveCharacterSlot below). The offset is DERIVED from Omega's
    // original starting position relative to the podium's own anchor, so
    // the podium stays the single source of truth for this location:
    // offsetX = (0.5 - 0.5) * 1920 = 0
    // offsetY = (0.2769 - 0.294) * 1080 ≈ -18.5
    // Because resolution reads the podium's LIVE world position at read
    // time (never a copied absolute), moving the podium in the Scene
    // Editor moves Omega's resolved home destination with it — no
    // duplicated coordinate exists anywhere else.
    interactionSlots: [
      { id: "slot-1", slotId: "omega_home", actionId: "", offsetX: 0, offsetY: -18.5, facingDirection: "down", enabled: true },
    ],
  },
];

// ------------------------------------------------------------- depth layers
// Rendering priority is Render Layer first, then Y-sort within the layer:
//   z-index = base + renderLayer × band + sortY (in tenths of a scene px)
//
// Every scene object participates:
//   renderLayer — optional integer 0..9. Absent = DYNAMIC: the object lives
//                 in layer 0 and simply Y-sorts (the default for props and
//                 characters alike — scenes without layers keep behaving
//                 exactly as before). Large fixed structures (a multi-row
//                 bookshelf wall) can pin themselves to a layer so entire
//                 rows stack deterministically.
//   sortY       — optional override (scene px) of the object's ground line
//                 for sorting only. Defaults to the anchor's world Y, which
//                 IS the ground contact point — the classic 2D depth rule.
//                 Needed only by props standing ON other props (the record
//                 player sits on the cabinet: its own content-bottom is
//                 ABOVE the cabinet's, so without the override it would
//                 sort behind the furniture it rests on).
//
// Characters (kind "npc") without an explicit renderLayer additionally ask
// the pluggable zone resolver below: when a walkable zone under their
// anchor declares a Character Render Layer, they adopt it. Today only the
// dev Scene Editor installs a resolver (zones aren't shipped to production
// yet); the future movement system reuses the exact same hook — this is
// rendering architecture only, no gameplay.
//
// The UI above the scene keeps working because the bands stay below them:
// .book-hotspot and the editor overlay were rebased above DEPTH_Z_MAX, and
// .library-scene isolates its stacking context so no band can escape over
// the surrounding chrome.
const DEPTH_LAYER_MIN = 0;
const DEPTH_LAYER_MAX = 9;
const DEPTH_LAYER_BAND = 50000; // > the whole sortY sub-range (tenth-px resolution)
const DEPTH_Z_MAX = 1000000; // hotspots/overlays live above this

// The resolver the future movement system (or the dev Scene Editor, today)
// installs: (worldPoint {x,y} normalized) => layer int | null.
window.__characterLayerAt = window.__characterLayerAt || null;

function effectiveRenderLayer(def) {
  if (Number.isFinite(def.renderLayer)) return def.renderLayer;
  if (def.kind === "npc") {
    // The editor's live resolver wins while F8 is loaded (characters re-depth
    // as zones are edited); otherwise fall back to the Scene's own loaded
    // zones so a shipped Scene resolves the same layer — see
    // runtimeCharacterLayerAt.
    const fromZone =
      typeof window.__characterLayerAt === "function" ? window.__characterLayerAt(def.world) : runtimeCharacterLayerAt(def.world);
    if (Number.isFinite(fromZone)) return fromZone;
  }
  return DEPTH_LAYER_MIN; // dynamic default: layer 0, pure Y-sort
}

function sceneDepthZ(def) {
  // The session-entry-point hotspot (core_book) must always render above
  // every prop/character depth band regardless of its own Y position — the
  // SAME "hotspots/overlays live above DEPTH_Z_MAX" invariant this module
  // already documents (see DEPTH_Z_MAX above), now applied to a genuine
  // Scene Object rather than only a bare CSS z-index. It is otherwise a
  // completely normal def — position/scale/flip all go through the exact
  // same applySceneObjectStyle() every prop uses; only its depth is pinned.
  // Fixed here (the ONE place that computes a def's z-index) so it stays
  // pinned through every future restyle (shadow load, drag, undo/redo),
  // not just the first.
  if (def.id === "core_book_01") return DEPTH_Z_MAX + 1;
  const layer = Math.max(DEPTH_LAYER_MIN, Math.min(DEPTH_LAYER_MAX, Math.round(effectiveRenderLayer(def))));
  const sortY = Number.isFinite(def.sortY) ? def.sortY : def.world.y * 1080;
  // Tenth-px resolution keeps sub-pixel ground lines distinct; the clamp
  // covers anchors well outside the 0..1080 art (edge bookshelves).
  const ySub = Math.max(0, Math.min(DEPTH_LAYER_BAND - 1, Math.round((sortY + 1000) * 10)));
  return 10 + layer * DEPTH_LAYER_BAND + ySub;
}

// ---------------------------------------------------------------- collision
// Movement-blocking MVP: plain axis-aligned rectangles, nothing else. This
// is a SEPARATE system from depth (renderLayer/sortY/characterLayer) and
// from sprite geometry on purpose — a future Footprint system will manage
// depth, collision, interaction, and navigation as sibling components, so
// nothing here may read or influence the render stack.
//
// Per-object component, `collision` on a SCENE_OBJECTS def (persisted with
// the object; absent or disabled = the object blocks nothing — every
// existing scene loads unchanged). Three shapes, chosen by `shape`:
//   rectangle (default when shape is absent — backward compatible with
//              every collision block written before shapes existed):
//     { enabled, shape: "rectangle", offsetX, offsetY, width, height }
//   ellipse (same offset/size fields, inscribed in that box):
//     { enabled, shape: "ellipse", offsetX, offsetY, width, height }
//   polygon (no offset/size — bounds come from the points themselves):
//     { enabled, shape: "polygon", points: [[x,y], [x,y], …] }
// offsetX/offsetY/points are all LOCAL to the object's ANCHOR (its ground
// point), scene px. A centered rectangle/ellipse footprint is therefore
// offsetX: -width/2, offsetY: -height/2. Deliberately independent of scale
// (and of depth/renderLayer/sortY) — collision never scales with the
// sprite; a future Footprint system owns depth/collision/interaction as
// sibling components.
//
// Characters collide through a small FOOT collider (footCollider
// {width, height} on the def, centered on the anchor) — never the sprite
// box: a head overlapping a bookshelf drawn behind it is correct rendering,
// not a collision. The foot collider itself is always a plain rectangle.
function collisionConfig(def) {
  const c = def.collision || {};
  const shape = c.shape === "ellipse" ? "ellipse" : c.shape === "polygon" ? "polygon" : "rectangle";
  if (shape === "polygon") {
    const points = Array.isArray(c.points)
      ? c.points.filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      : [];
    return { enabled: c.enabled === true, shape, points };
  }
  return {
    enabled: c.enabled === true,
    shape,
    offsetX: typeof c.offsetX === "number" ? c.offsetX : 0,
    offsetY: typeof c.offsetY === "number" ? c.offsetY : 0,
    width: typeof c.width === "number" && c.width > 0 ? c.width : 0,
    height: typeof c.height === "number" && c.height > 0 ? c.height : 0,
  };
}

// THE single world-space BOUNDING BOX conversion for an object's collision
// shape (anchor + local offset/points, scene px) — used for rectangle AND
// ellipse (their bounds ARE the shape) and as the bounding box for polygon
// (selection UI, "other object" debug dimming). Both the runtime blocker
// and the F8 debug overlay (refreshCollisionDebug in scene-editor.js) call
// THIS function for bounds, so the drawn box and the actual blocking area
// can never drift apart. Ignores `enabled` on purpose — the debug overlay
// still needs to draw a DISABLED shape (gray); null only when there's no
// usable geometry at all.
function collisionBoxRect(def) {
  const c = collisionConfig(def);
  if (c.shape === "polygon") {
    if (c.points.length < 3) return null;
    const xs = c.points.map((p) => p[0]);
    const ys = c.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: def.world.x * 1920 + minX, y: def.world.y * 1080 + minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  if (!c.width || !c.height) return null;
  return { x: def.world.x * 1920 + c.offsetX, y: def.world.y * 1080 + c.offsetY, w: c.width, h: c.height };
}

// World-space polygon points (scene px), or null for non-polygon shapes —
// the ONE conversion the runtime polygon test and the debug polygon outline
// both call, same reasoning as collisionBoxRect above.
function collisionWorldPolygonPoints(def) {
  const c = collisionConfig(def);
  if (c.shape !== "polygon" || c.points.length < 3) return null;
  const wx = def.world.x * 1920;
  const wy = def.world.y * 1080;
  return c.points.map(([x, y]) => ({ x: wx + x, y: wy + y }));
}

// The object's collision box in scene px IF it can actually block movement
// (enabled + a usable size), or null. Rectangle/ellipse only — see
// collisionOverlapsFoot below for the shape-dispatching runtime test.
function collisionRect(def) {
  if (def.deleted) return null;
  if (!collisionConfig(def).enabled) return null;
  return collisionBoxRect(def);
}

// Default foot collider (Omega's original hardcoded box) — also what "Reset
// to Default" in the F8 inspector restores.
const DEFAULT_FOOT_COLLIDER = { width: 40, height: 14 };

// Normalized foot-collider config for any character def: `footCollider`
// {enabled (Show Collider — debug-visibility only, always participates in
// collision regardless), offsetX, offsetY, width, height}. offsetX/offsetY
// are scene-px LOCAL to the anchor, same convention as object collision
// boxes; absent = centered on the anchor (the original behavior), which is
// exactly offsetX: -width/2, offsetY: -height/2.
function footColliderConfig(def) {
  const fc = def.footCollider || {};
  const width = typeof fc.width === "number" && fc.width > 0 ? fc.width : DEFAULT_FOOT_COLLIDER.width;
  const height = typeof fc.height === "number" && fc.height > 0 ? fc.height : DEFAULT_FOOT_COLLIDER.height;
  return {
    enabled: fc.enabled !== false,
    offsetX: typeof fc.offsetX === "number" ? fc.offsetX : -width / 2,
    offsetY: typeof fc.offsetY === "number" ? fc.offsetY : -height / 2,
    width,
    height,
  };
}

// A character's foot collider at a PROSPECTIVE anchor position (scene px) —
// small and offset-editable, never the full sprite.
function footColliderRect(def, anchorX, anchorY) {
  const fc = footColliderConfig(def);
  return { x: anchorX + fc.offsetX, y: anchorY + fc.offsetY, w: fc.width, h: fc.height };
}

// A tiny epsilon shrinks the effective overlap test on every side so
// floating-point round-trips (world fraction → scene px → world fraction
// through repeated moves) can never register a phantom sub-pixel overlap —
// the class of bug that shows up as jitter or getting permanently stuck
// against a wall you're not actually touching. Real overlaps (anything a
// player would call "touching") are far larger than this and are completely
// unaffected. This is NOT the coordinate-distance tolerance the collision
// system explicitly avoids — it only trims the AABB overlap test itself.
const COLLISION_EPS = 0.01;

function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.w - COLLISION_EPS &&
    a.x + a.w > b.x + COLLISION_EPS &&
    a.y < b.y + b.h - COLLISION_EPS &&
    a.y + a.h > b.y + COLLISION_EPS
  );
}

// Ellipse-vs-AABB overlap: find the point on the (epsilon-shrunk) rect
// closest to the ellipse's center, then check whether that point falls
// inside the ellipse by normalizing it into unit-circle space (divide by
// the two radii) — the standard, practical AABB/ellipse test. Exact for the
// two cases that matter here: the rect's nearest edge/corner poking into
// the ellipse, and the ellipse's center falling inside the rect (nearest
// point IS the center, distance 0).
function ellipseRectOverlap(e, rect) {
  if (e.rx <= 0 || e.ry <= 0) return false;
  const closestX = Math.max(rect.x + COLLISION_EPS, Math.min(e.cx, rect.x + rect.w - COLLISION_EPS));
  const closestY = Math.max(rect.y + COLLISION_EPS, Math.min(e.cy, rect.y + rect.h - COLLISION_EPS));
  const nx = (closestX - e.cx) / e.rx;
  const ny = (closestY - e.cy) / e.ry;
  return nx * nx + ny * ny < 1;
}

// Ray-casting point-in-polygon on WORLD scene-px points (same algorithm the
// editor uses in normalized space — scale-invariant, so it's correct here
// unchanged).
function pointInPolygonWorld(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// Standard orientation-based segment intersection (strict — touching
// endpoints don't count, consistent with the epsilon-shrunk rect used by
// every other shape test here).
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

// Polygon-vs-AABB overlap for ANY simple polygon (convex or concave):
// (1) a polygon vertex lands inside the rect, (2) a rect corner lands
// inside the polygon, or (3) any polygon edge crosses any rect edge. All
// three together are the standard robust test — no convexity assumption,
// unlike a plain separating-axis test.
function polygonRectOverlap(points, rect) {
  if (points.length < 3) return false;
  const rx0 = rect.x + COLLISION_EPS;
  const ry0 = rect.y + COLLISION_EPS;
  const rx1 = rect.x + rect.w - COLLISION_EPS;
  const ry1 = rect.y + rect.h - COLLISION_EPS;
  if (rx1 <= rx0 || ry1 <= ry0) return false;
  for (const p of points) {
    if (p.x > rx0 && p.x < rx1 && p.y > ry0 && p.y < ry1) return true;
  }
  const corners = [
    { x: rx0, y: ry0 },
    { x: rx1, y: ry0 },
    { x: rx1, y: ry1 },
    { x: rx0, y: ry1 },
  ];
  for (const c of corners) {
    if (pointInPolygonWorld(c, points)) return true;
  }
  const rectEdges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (const [c, d] of rectEdges) {
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

// Shape-dispatching runtime test: does this object's collision shape
// overlap the given (world scene-px) foot-collider rect? The ONE function
// attemptMove's collidesAt calls — rectangle uses the existing AABB test,
// ellipse and polygon use their dedicated overlap tests above, all sharing
// collisionBoxRect/collisionWorldPolygonPoints for geometry so debug
// rendering and runtime blocking can never disagree about where a shape is.
function collisionOverlapsFoot(def, footRect) {
  if (def.deleted) return false;
  const c = collisionConfig(def);
  if (!c.enabled) return false;
  if (c.shape === "polygon") {
    const pts = collisionWorldPolygonPoints(def);
    return !!pts && polygonRectOverlap(pts, footRect);
  }
  const r = collisionBoxRect(def);
  if (!r) return false;
  if (c.shape === "ellipse") {
    return ellipseRectOverlap({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2 }, footRect);
  }
  return rectsIntersect(footRect, r);
}

// Would `mover` collide with a solid PROP if its anchor stood at
// (anchorX, anchorY)? Pure query — never moves anything. Only tests
// objects with kind !== "npc" — character-to-character collision is a
// future feature (movementProfile.collideWithCharacters below), not
// implemented yet; no NPC currently carries a `.collision` block anyway, so
// this filter is a no-op today and just documents the boundary precisely.
function collidesAt(mover, anchorX, anchorY) {
  const foot = footColliderRect(mover, anchorX, anchorY);
  for (const def of SCENE_OBJECTS) {
    if (def === mover || def.kind === "npc") continue;
    if (collisionOverlapsFoot(def, foot)) return true;
  }
  return false;
}

// ------------------------------------------------------- interaction slots
// Foundation only — see the "future Footprint system" note above collision:
// depth, collision, and interaction are sibling per-object components, and
// this is interaction's first data model. NOT wired into any gameplay yet:
// nothing here triggers an action, moves an NPC, or plays an animation.
//
// Deliberately a SEPARATE concept from the existing yellow "interaction"
// Zone type (see ZONE_TYPES in devtools/scene-editor.js / sceneLayout.js):
//   - Interaction ZONE  — a detection/awareness AREA (unchanged by this).
//   - Interaction SLOT  — a precise anchor-local position + facing where an
//     NPC must stand before performing one specific action.
// A Prop may have zero or more slots (`def.interactionSlots`, an array —
// today's editor exposes only the first entry, but the data model already
// supports more per requirement). Absent/empty = no authored slot.
//
// Fields, all AUTHORED (persisted): id, actionId, offsetX/offsetY (anchor-
// local scene px, same convention as collision), facingDirection ("up" |
// "down" | "left" | "right"), enabled, and the optional duration/animationId.
// `occupied`/`reservedBy` are deliberately NOT part of the authored schema —
// they are RUNTIME reservation state a future NPC system would set at play
// time, and persisting them would make a slot load back as "still occupied"
// from a stale save. Runtime code that starts using slots should treat
// `occupied`/`reservedBy` as transient, defaulting to unoccupied on load.
function interactionSlotsConfig(def) {
  return Array.isArray(def.interactionSlots) ? def.interactionSlots : [];
}

// World-space anchor point (scene px) for one slot — anchor + local offset,
// the same anchor-relative convention collision/shadow already use.
function interactionSlotWorldPos(def, slot) {
  return {
    x: def.world.x * 1920 + (slot.offsetX || 0),
    y: def.world.y * 1080 + (slot.offsetY || 0),
  };
}

// Per-character movement rules — a GENERIC, data-driven profile rather than
// hardcoded Omega-specific branching, so a future character (Aethera, per
// the spec) can opt out of individual checks without new movement code.
// Absent `movementProfile` on a def means "the default" below, which is
// exactly Omega's existing behavior — this is a documentation of current
// behavior, not a change to it. `collideWithCharacters` is accepted in the
// schema for forward-compatibility but not yet acted on anywhere
// (character-to-character collision is explicitly out of scope).
function movementProfileFor(def) {
  const mp = def.movementProfile || {};
  return {
    respectWalkableZones: mp.respectWalkableZones !== false,
    collideWithProps: mp.collideWithProps !== false,
    collideWithCharacters: mp.collideWithCharacters !== false,
  };
}

// --------------------------------------------------------------- zones (runtime)
// The Scene's zones as loaded from /api/scene-layout (loadCharacterRuntimeData
// below). Production has no Scene Editor, so before this existed the zone
// SYSTEM simply did not exist outside F8 and every position read as
// unrestricted — a shipped Scene's authored Blocking Zones did nothing.
//
// The editor keeps its own live, editable `state.zones` and its own resolvers
// (window.__positionAllowedForMovement / window.__characterLayerAt). Those
// still take priority wherever they exist, so F8 behaviour is untouched: this
// list is only consulted when no editor resolver is installed. Same
// browser-side duplication convention the codebase already uses for
// gridPointToWorld/worldToNearestGridPoint between sceneLayout.js and
// scene-editor.js — a small mirrored geometry helper, not a shared module.
let RUNTIME_ZONES = [];

// Point-in-zone on NORMALIZED scene fractions, matching SHAPES[*].contains in
// devtools/scene-editor.js exactly. Polygons reuse pointInPolygonWorld above:
// ray casting is scale-invariant, so it is correct in normalized space
// unchanged (its own comment says so).
function zoneContains(zone, pt) {
  if (zone.shape === "polygon") return Array.isArray(zone.points) && pointInPolygonWorld(pt, zone.points);
  const r = zone.rect;
  if (!r) return false;
  if (zone.shape === "ellipse") {
    const rx = r.w / 2;
    const ry = r.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    const nx = (pt.x - (r.x + rx)) / rx;
    const ny = (pt.y - (r.y + ry)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
}

// Is (anchorX, anchorY) — scene px — inside an active Walkable Zone (and
// not inside a Blocking Zone)? The Scene Editor's live resolver
// (positionAllowedForMovement, scene-editor.js) wins whenever it is loaded,
// so zones stay editable in F8; otherwise the same rule runs against the
// Scene's own loaded zones:
//   - inside any BLOCKED zone → never allowed, whatever overlaps it
//   - no WALKABLE zones authored at all → unrestricted (a Scene that never
//     defined a floor must not make every position invalid)
//   - otherwise → allowed only inside at least one walkable zone
// Interaction zones never affect this either way. A Scene with no zones at
// all still reads as unrestricted, exactly as before.
function positionAllowedByZones(anchorX, anchorY) {
  const pt = { x: anchorX / 1920, y: anchorY / 1080 };
  if (typeof window.__positionAllowedForMovement === "function") return window.__positionAllowedForMovement(pt);
  if (RUNTIME_ZONES.some((z) => z.type === "blocked" && zoneContains(z, pt))) return false;
  const walkable = RUNTIME_ZONES.filter((z) => z.type === "walkable");
  if (!walkable.length) return true;
  return walkable.some((z) => zoneContains(z, pt));
}

// Character Render Layer at a normalized point — the runtime half of
// characterLayerAt (scene-editor.js): the topmost (newest) WALKABLE zone
// containing the point that declares one, else null (dynamic Y-sort).
function runtimeCharacterLayerAt(pt) {
  for (let i = RUNTIME_ZONES.length - 1; i >= 0; i--) {
    const z = RUNTIME_ZONES[i];
    if (z.type === "walkable" && Number.isFinite(z.characterLayer) && zoneContains(z, pt)) return z.characterLayer;
  }
  return null;
}

// Axis-separated movement: X first, then Y, each cancelled independently on
// collision — which is exactly what lets a character slide along a wall
// instead of sticking to it. Blocking only: objects are never pushed.
//
// Each axis is walked in 1-scene-px sub-steps rather than tested only at
// the final position — simple swept-movement protection so a single
// keypress can never tunnel across a collision region narrower than the
// raw step size (TEST_PLAYER_STEP_PX). Stops at the first sub-step that
// would collide, so it still lands snugly against an edge rather than
// jittering.
//
// Validation order per step (Walkable Zones and Prop Collision are
// SEPARATE systems — a zone shapes the allowed navigation area; collision
// blocks solid objects inside it): 1) candidate position, 2) zone
// membership, 3) prop collision, 4) only then is the step actually taken.
function moveAxisBlocking(deltaPx, tryStep) {
  const dir = deltaPx > 0 ? 1 : -1;
  let remaining = Math.abs(deltaPx);
  while (remaining > 0) {
    const step = Math.min(1, remaining) * dir;
    if (!tryStep(step)) break;
    remaining -= Math.abs(step);
  }
}

function attemptMove(mover, dxPx, dyPx) {
  const profile = movementProfileFor(mover);
  let x = mover.world.x * 1920;
  let y = mover.world.y * 1080;
  if (dxPx) {
    moveAxisBlocking(dxPx, (step) => {
      const nx = x + step;
      if (profile.respectWalkableZones && !positionAllowedByZones(nx, y)) return false;
      if (profile.collideWithProps && collidesAt(mover, nx, y)) return false;
      x = nx;
      return true;
    });
  }
  if (dyPx) {
    moveAxisBlocking(dyPx, (step) => {
      const ny = y + step;
      if (profile.respectWalkableZones && !positionAllowedByZones(x, ny)) return false;
      if (profile.collideWithProps && collidesAt(mover, x, ny)) return false;
      y = ny;
      return true;
    });
  }
  // Keep the anchor inside the scene art so a test walk can't lose the
  // sprite off-canvas.
  x = Math.max(0, Math.min(1920, x));
  y = Math.max(0, Math.min(1080, y));
  const moved = x !== mover.world.x * 1920 || y !== mover.world.y * 1080;
  if (moved) {
    mover.world.x = x / 1920;
    mover.world.y = y / 1080;
    applySceneObjectStyle(mover); // depth (Y-sort) follows the walk automatically
    if (typeof window.__refreshCollisionDebug === "function") window.__refreshCollisionDebug();
  }
  return moved;
}

// Dev-only test movement: arrow keys walk the test character (Omega) so
// collision can be felt immediately. Gated on devTools — production
// keyboards do nothing here.
//
// Ownership of arrow keys requires BOTH: the Scene Editor is open (F8) AND
// window.__sceneEditor.state.testMovement is ON (the "Test Character
// Movement" toggle in the F8 Tools section). Any other combination — editor
// closed, or editor open with the toggle OFF — means arrows do NOT walk
// Omega: this listener steps aside completely (closed) or the editor's own
// nudge-the-selected-object behavior owns the keys instead (open, toggle
// off; see scene-editor.js). Test movement input only exists while both
// conditions hold, so leaving F8 always leaves it disabled.
const TEST_PLAYER_ID = "classic-omega";
const TEST_PLAYER_STEP_PX = 6;

document.addEventListener("keydown", (e) => {
  if (!currentConfig?.devTools || !e.key.startsWith("Arrow")) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable)) return;
  const ed = window.__sceneEditor;
  if (!ed?.state?.active || !ed.state.testMovement) return; // requires F8 open AND Test Character Movement ON
  const mover = SCENE_OBJECTS.find((d) => d.id === TEST_PLAYER_ID);
  const el = mover && document.getElementById(`scene-${mover.id}`);
  if (!el || !el.offsetParent) return; // scene not on screen
  const step = TEST_PLAYER_STEP_PX;
  const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
  const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
  if (!dx && !dy) return;
  e.preventDefault();
  attemptMove(mover, dx, dy);
});

// -------------------------------------------------------- character slots
// Foundation for named destinations a character can be sent to, and for
// Omega's autonomous wandering/commanded movement. Reuses attemptMove (and
// therefore the SAME collision + Walk Zone rules the keyboard test-movement
// path already uses) — nothing here bypasses or reimplements that system.
//
// A slot is a DESTINATION, never a hardcoded behavior: reaching a slot only
// applies its facing direction. What the character DOES there (wait, sit,
// browse) is decided by whatever future event commanded the move, via
// actionId/animationId on the slot — not by this module.

// Scene-level Character Slots (destinations with no owning Prop). Empty by
// default; the dev Scene Editor populates this from the saved layout (see
// loadSavedLayout in scene-editor.js) the same way it populates zones —
// absent in production (no dev script loaded) simply means "none", which is
// exactly correct when every authored slot belongs to a Prop.
let SCENE_CHARACTER_SLOTS = [];

// Resolves a slotId to a world position + facing, checking Prop-owned slots
// first (offsetX/offsetY are ANCHOR-LOCAL to the owning Prop's live world
// position, so moving the Prop moves the resolved destination with it — see
// the omega_home slot on the podium above) and falling back to scene-level
// slots (ABSOLUTE x/y, for destinations with no owning Prop). Returns null
// if nothing matches — callers must handle "no such slot" without crashing
// (e.g. a legacy scene that never authored omega_home at all).
function resolveCharacterSlot(slotId) {
  for (const def of SCENE_OBJECTS) {
    if (def.kind !== "prop" || !Array.isArray(def.interactionSlots)) continue;
    const slot = def.interactionSlots.find((s) => s.slotId === slotId && s.enabled);
    if (slot) {
      return {
        world: {
          x: def.world.x + (slot.offsetX || 0) / 1920,
          y: def.world.y + (slot.offsetY || 0) / 1080,
        },
        facingDirection: slot.facingDirection || "down",
        slot,
      };
    }
  }
  const sceneSlot = SCENE_CHARACTER_SLOTS.find((s) => s.slotId === slotId && s.enabled);
  if (sceneSlot) {
    return {
      world: { x: sceneSlot.x / 1920, y: sceneSlot.y / 1080 },
      facingDirection: sceneSlot.facingDirection || "down",
      slot: sceneSlot,
    };
  }
  return null;
}

// Map Grid + Slot placement (Section 5): resolves an NPC's Spawn Slot — the
// primary source of truth for INITIAL placement, distinct from homeSlotId
// (the wandering/return-home reference used by __onSceneEditorActiveChange
// and ensureSafeNpcSpawn's own fallback below — both unchanged by this).
// Returns null when spawnSlotId is missing, unresolvable, or disabled;
// callers must fall back to whatever world position the NPC already has.
function resolveNpcSpawnPosition(npc) {
  const spawnSlotId = npc.spawnSlotId || (npc.id === "classic-omega" ? "omega_home" : null);
  return (spawnSlotId && resolveCharacterSlot(spawnSlotId)) || null;
}

// Facing has no dedicated up/down art today — only the existing horizontal
// mirror (flipX, already applied by applySceneObjectStyle for any object)
// changes appearance. left/right set it; up/down are recorded (for future
// art/animation) without touching flipX.
function applyCharacterFacing(def, facingDirection) {
  def.facing = facingDirection || "down";
  if (def.facing === "left") def.flipX = true;
  else if (def.facing === "right") def.flipX = false;
  applySceneObjectStyle(def);
}

// One character's runtime-only movement state — NEVER persisted (see the
// interaction-slots section above: reservation/occupancy is play-time state,
// not authored data). mode is the state-priority ladder from simplest to
// most specific:
//   "editor"    — Scene Editor is open; autonomous movement fully disabled.
//   "idle"      — nothing to do; may start wandering once pauseUntil passes.
//   "wander"    — walking to a randomly chosen point inside the Walk Zone.
//   "commanded" — walking to a slot requested via moveCharacterToSlot.
//   "waiting"   — arrived at a commanded slot; holds the reservation until
//                 the caller explicitly resumes wandering (see below).
// Keyboard test movement (F8 + Test Character Movement) is a SEPARATE input
// path entirely and always wins in practice: entering the editor forces
// mode "editor" (this tick loop stops moving the character at all), so
// there is never a conflict between the two.
// -------------------------------------------------------------- NPC states
// Explicit state names, generic across every NPC (never a per-character
// hardcoded ladder). "MOVING"/"WAITING" are the generic movement primitives
// any interaction (Core Book today, something else in Athens/Avalon/the
// Immortal Library tomorrow) is built out of — see "guided interaction"
// below for the layer that sequences them into GO_TO_TARGET / WAIT_FOR_RESULT
// / PRESENT / RETURN_HOME without any world- or character-specific code.
const NPC_STATE = {
  IDLE: "idle", // nothing to do; may start wandering once pauseUntil passes
  WANDER: "wander", // walking to a randomly chosen point inside the Walk Zone
  MOVING: "moving", // walking to a slot requested via moveCharacterToSlot
  WAITING: "waiting", // arrived at a commanded slot; holds until released
  EDITOR: "editor", // Scene Editor owns this NPC; autonomous movement disabled
  PAUSED: "paused", // spawn-safety exhausted every fallback — see Section 1
};

// Per-NPC runtime-only state, keyed by Scene Object id. NEVER persisted
// (reservation/occupancy is play-time state, not authored data). Populated
// generically for every `kind: "npc"` Scene Object — see ensureCharacterAI —
// never hardcoded to one character.
const characterAI = {};
function ensureCharacterAI(npcId) {
  if (!characterAI[npcId]) {
    characterAI[npcId] = {
      state: NPC_STATE.IDLE,
      target: null, // {x,y} normalized — wander or commanded destination
      slotId: null, // the slotId being walked to/waited at, if any
      pauseUntil: 0, // wander: no new destination chosen before this timestamp
      stuckTicks: 0,
      pending: null, // { resolve, reject } for the in-flight moveCharacterToSlot promise
    };
  }
  return characterAI[npcId];
}

const WANDER_TICK_MS = 260;
const WANDER_STEP_PX = 3; // ambient wandering: calm, infrequent
// Commanded travel (Section 7): responsive without breaking the "natural"
// feel — close to the keyboard test-movement step (6px), well above the
// ambient wander pace. Ambient wandering is untouched by this change.
const MOVE_STEP_PX = 7;
const WANDER_ARRIVE_PX = 5;
const WANDER_PAUSE_MIN_MS = 4000;
const WANDER_PAUSE_MAX_MS = 9000;
const WANDER_STUCK_TICKS = 14; // ~3.6s of negligible progress before giving up
const EDITOR_EXIT_CALM_DELAY_MS = 1500; // "short calm delay" before wandering resumes

function releaseCharacterSlot(npcId) {
  const ai = characterAI[npcId];
  if (!ai) return;
  if (ai.slotId) {
    const dest = resolveCharacterSlot(ai.slotId);
    if (dest?.slot && dest.slot.reservedBy === npcId) delete dest.slot.reservedBy;
  }
  ai.target = null;
  ai.slotId = null;
  ai.stuckTicks = 0;
}

// -------------------------------------------------------- Section 1: spawn safety
// Generic for every NPC — never special-cased to Omega. A point is a valid
// NPC position when its root collider (the SAME footCollider box movement
// already tests) does not overlap: a Blocking Zone at its anchor, any
// blocking Prop, or (only when BOTH sides opt in via movementProfile) another
// NPC's root collider. Reuses positionAllowedByZones/collidesAt exactly —
// this is not a second, separately-maintained rule.
function npcCollidesWithOtherNpc(npc, anchorX, anchorY) {
  if (!movementProfileFor(npc).collideWithCharacters) return false;
  const footA = footColliderRect(npc, anchorX, anchorY);
  for (const other of SCENE_OBJECTS) {
    if (other === npc || other.kind !== "npc" || other.deleted) continue;
    if (!movementProfileFor(other).collideWithCharacters) continue;
    const footB = footColliderRect(other, other.world.x * 1920, other.world.y * 1080);
    if (rectsIntersect(footA, footB)) return true;
  }
  return false;
}

function npcPositionValid(npc, anchorX, anchorY) {
  return (
    anchorX >= 0 &&
    anchorX <= 1920 &&
    anchorY >= 0 &&
    anchorY <= 1080 &&
    positionAllowedByZones(anchorX, anchorY) &&
    !collidesAt(npc, anchorX, anchorY) &&
    !npcCollidesWithOtherNpc(npc, anchorX, anchorY)
  );
}
// Exposed for the Scene Editor (Section 2 — same shared-scope call pattern
// as every other cross-script function here, e.g. applySceneObjectStyle).
function isPositionValidForNpc(npc, anchorX, anchorY) {
  return npcPositionValid(npc, anchorX, anchorY);
}

// Expanding ring search around a point for the nearest valid position — used
// both for NPC spawn recovery and for placing an unauthored fallback slot
// (Section 6) safely instead of guessing a fixed coordinate. Deliberately
// NOT continuous pushing-apart (explicitly out of scope): one search, one
// relocation, before any movement starts.
function findNearestValidPosition(npc, startX, startY, maxRadiusPx = 400, ringStepPx = 16, samplesPerRing = 16) {
  if (npcPositionValid(npc, startX, startY)) return { x: startX, y: startY };
  for (let r = ringStepPx; r <= maxRadiusPx; r += ringStepPx) {
    for (let i = 0; i < samplesPerRing; i++) {
      const angle = (i / samplesPerRing) * Math.PI * 2;
      const x = startX + Math.cos(angle) * r;
      const y = startY + Math.sin(angle) * r;
      if (npcPositionValid(npc, x, y)) return { x, y };
    }
  }
  return null;
}

// Generic spawn-safety pass — called for every NPC at bootstrap and whenever
// the Scene Editor restores a saved layout. Order matches the spec exactly:
// valid position -> keep; invalid -> search nearby -> authored home slot ->
// pause + warn. Movement never starts before this resolves.
function ensureSafeNpcSpawn(npc) {
  const startX = npc.world.x * 1920;
  const startY = npc.world.y * 1080;
  if (npcPositionValid(npc, startX, startY)) return;

  const found = findNearestValidPosition(npc, startX, startY);
  if (found) {
    console.warn(`[npc-spawn] "${npc.id}" spawn position overlapped a blocker — relocated to the nearest valid point.`);
    npc.world = { x: found.x / 1920, y: found.y / 1080 };
    return;
  }

  const homeSlotId = npc.homeSlotId || (npc.id === "classic-omega" ? "omega_home" : null);
  const home = homeSlotId && resolveCharacterSlot(homeSlotId);
  if (home && npcPositionValid(npc, home.world.x * 1920, home.world.y * 1080)) {
    console.warn(`[npc-spawn] "${npc.id}" spawn position was unrecoverable nearby — falling back to its authored home slot "${homeSlotId}".`);
    npc.world = { ...home.world };
    return;
  }

  console.warn(`[npc-spawn] "${npc.id}" has no valid spawn position and no usable home slot — pausing this NPC.`);
  ensureCharacterAI(npc.id).state = NPC_STATE.PAUSED;
}

// Rejection-samples a point the movement resolvers themselves already
// consider valid (inside an active Walkable Zone if any are defined, not
// colliding with a Prop) — reusing those exact checks means "never leave
// the Walk Zone" and "never pass through collision objects" hold by
// construction, not by a second, separately-maintained rule.
function pickWanderTarget(mover) {
  for (let i = 0; i < 20; i++) {
    const nx = Math.random() * 1920;
    const ny = (0.3 + Math.random() * 0.6) * 1080; // bias away from the extreme top/bottom art
    if (npcPositionValid(mover, nx, ny)) return { x: nx / 1920, y: ny / 1080 };
  }
  return null;
}

// One tick of movement toward ai.target, reusing attemptMove — the SAME
// zone + collision gating as every other mover. Returns "arrived", "stuck",
// or "moving". stepPx is MOVE_STEP_PX for a commanded walk, WANDER_STEP_PX
// for ambient wandering (Section 7) — everything else about the step is identical.
function stepCharacterToward(mover, ai, stepPx) {
  const tx = ai.target.x * 1920;
  const ty = ai.target.y * 1080;
  const cx = mover.world.x * 1920;
  const cy = mover.world.y * 1080;
  const ddx = tx - cx;
  const ddy = ty - cy;
  const dist = Math.hypot(ddx, ddy);
  if (dist <= WANDER_ARRIVE_PX) return "arrived";

  if (Math.abs(ddx) > 0.5) applyCharacterFacing(mover, ddx < 0 ? "left" : "right");

  const stepDx = dist > 0 ? (ddx / dist) * Math.min(stepPx, dist) : 0;
  const stepDy = dist > 0 ? (ddy / dist) * Math.min(stepPx, dist) : 0;
  attemptMove(mover, stepDx, stepDy);

  const movedPx = Math.hypot(mover.world.x * 1920 - cx, mover.world.y * 1080 - cy);
  if (movedPx < 0.5) {
    ai.stuckTicks++;
    if (ai.stuckTicks >= WANDER_STUCK_TICKS) return "stuck";
  } else {
    ai.stuckTicks = 0;
  }
  return "moving";
}

// One NPC's tick — generic, called for every kind:"npc" Scene Object by the
// loop below. Nothing here reads or branches on a specific character id.
function tickOneNpc(mover) {
  const ai = ensureCharacterAI(mover.id);
  // Movement Enabled (Character Inspector; def.movementEnabled, persisted in
  // scene-layout.json — absent/false means OFF): the ONE authoritative gate
  // for ALL autonomous movement. Every autonomous step — wandering, choosing
  // a wander target, and commanded MOVING travel — happens inside this tick,
  // so returning here is the complete runtime disable; no other code path
  // needs its own check. An in-flight autonomous walk is CANCELLED (slot
  // released, pending promise rejected, back to IDLE), never frozen mid-
  // route: re-enabling starts fresh instead of resuming a stale target.
  // Read live from the def each tick, so an editor toggle takes effect the
  // moment ticks resume (they pause while F8 is open — editor always wins).
  // Deliberately untouched: Scene Editor dragging/nudging, arrow-key test
  // movement (a separate attemptMove path), undo/redo, spawn-safety
  // relocation, and rendering/selection — this gates autonomy only.
  if (mover.movementEnabled !== true) {
    if (ai.state === NPC_STATE.MOVING || ai.state === NPC_STATE.WANDER) {
      ai.pending?.reject?.(new Error(`Movement is disabled for "${mover.id}" (Movement Enabled is off).`));
      ai.pending = null;
      releaseCharacterSlot(mover.id);
      ai.state = NPC_STATE.IDLE;
    }
    return;
  }
  if (ai.state === NPC_STATE.PAUSED) return; // Section 1: no safe position — stays put
  if (ai.state === NPC_STATE.EDITOR) ai.state = NPC_STATE.IDLE; // just left the editor

  const now = performance.now();

  if (ai.state === NPC_STATE.MOVING || ai.state === NPC_STATE.WANDER) {
    if (!ai.target) {
      ai.state = NPC_STATE.IDLE;
      return;
    }
    const stepPx = ai.state === NPC_STATE.MOVING ? MOVE_STEP_PX : WANDER_STEP_PX;
    const result = stepCharacterToward(mover, ai, stepPx);
    if (result === "arrived") {
      const arrivedSlotId = ai.slotId;
      if (arrivedSlotId) {
        const dest = resolveCharacterSlot(arrivedSlotId);
        if (dest) applyCharacterFacing(mover, dest.facingDirection);
      }
      if (ai.state === NPC_STATE.MOVING) {
        ai.state = NPC_STATE.WAITING; // holds the slot until released
        const pending = ai.pending;
        ai.pending = null;
        pending?.resolve?.({ characterId: mover.characterId || mover.id, slotId: arrivedSlotId, arrived: true });
      } else {
        ai.target = null;
        ai.slotId = null;
        ai.state = NPC_STATE.IDLE;
        ai.pauseUntil = now + WANDER_PAUSE_MIN_MS + Math.random() * (WANDER_PAUSE_MAX_MS - WANDER_PAUSE_MIN_MS);
      }
    } else if (result === "stuck") {
      // Cancel this destination and pause briefly rather than repeatedly
      // colliding against the same obstacle — a new one is picked later.
      const wasMoving = ai.state === NPC_STATE.MOVING;
      releaseCharacterSlot(mover.id);
      ai.state = NPC_STATE.IDLE;
      ai.pauseUntil = now + WANDER_PAUSE_MIN_MS;
      if (wasMoving) {
        const pending = ai.pending;
        ai.pending = null;
        pending?.reject?.(new Error("Could not reach the requested slot (stuck)."));
      }
    }
    return;
  }

  if (ai.state === NPC_STATE.IDLE && now >= ai.pauseUntil) {
    const target = pickWanderTarget(mover);
    if (target) {
      ai.target = target;
      ai.slotId = null;
      ai.state = NPC_STATE.WANDER;
      ai.stuckTicks = 0;
    } else {
      ai.pauseUntil = now + 1000; // no valid point found this attempt — retry shortly
    }
  }
  // WAITING: intentionally does nothing here — only an explicit
  // moveCharacterToSlot() or resumeCharacterWandering() call moves it on.
}

function characterAITick() {
  if (!libraryEntered) return;
  const ed = window.__sceneEditor;
  if (ed?.state?.active) return; // Section 3 note: editor always wins, highest priority
  for (const def of SCENE_OBJECTS) {
    if (def.kind !== "npc" || def.deleted) continue;
    tickOneNpc(def);
  }
}
setInterval(characterAITick, WANDER_TICK_MS);

// -------------------------------------------------------- commanded movement
// Generic across every NPC and every future interaction — the ONE way
// anything ever sends a character to a named, authored Scene Editor slot
// (Section 6: never a hardcoded coordinate).
//
//   moveCharacterToSlot("classic_omega", "core_book_wait")
//     .then(() => { /* face the desk, wait, play an animation — future work */ })
//
// Resolves once the character ARRIVES (not once any waiting/action at the
// slot finishes) — a caller decides how long to hold the slot and calls
// resumeCharacterWandering() when the task is completely done. A new call
// ALWAYS interrupts whatever the character is doing immediately — including
// mid-wander — never queues behind it (Section 3): the target/pending are
// overwritten synchronously, and the very next tick steps toward the NEW
// target, not whatever was in progress before.
function moveCharacterToSlot(characterId, slotId) {
  return new Promise((resolve, reject) => {
    const mover = SCENE_OBJECTS.find((d) => d.characterId === characterId || d.id === characterId);
    const key = mover?.id;
    if (!mover || !key) {
      reject(new Error(`Unknown character: ${characterId}`));
      return;
    }
    // Movement Enabled gate — a movement-disabled character never STARTS a
    // commanded walk either (same authority as the tickOneNpc guard; without
    // this, a command would sit frozen in MOVING until the next tick
    // cancelled it, leaving the caller's promise to die less legibly).
    if (mover.movementEnabled !== true) {
      reject(new Error(`Movement is disabled for "${characterId}" (Movement Enabled is off).`));
      return;
    }
    const ai = ensureCharacterAI(key);
    const dest = resolveCharacterSlot(slotId);
    if (!dest) {
      reject(new Error(`Unknown or disabled slot: ${slotId}`));
      return;
    }
    // Interrupt, not queue: cancel/clear whatever this NPC was doing first.
    ai.pending?.reject?.(new Error("Superseded by a new moveCharacterToSlot command."));
    releaseCharacterSlot(key);
    if (dest.slot) dest.slot.reservedBy = characterId;
    ai.target = { ...dest.world };
    ai.slotId = slotId;
    ai.state = NPC_STATE.MOVING;
    ai.stuckTicks = 0;
    ai.pending = { resolve, reject };
  });
}

// Ends a WAITING (or any) commanded task and allows autonomous wandering to
// resume, after a calm pause. delayMs defaults to the normal wander-arrival
// pause; a guided interaction (below) may pass its own shorter value.
function resumeCharacterWandering(characterId, delayMs = WANDER_PAUSE_MIN_MS) {
  const mover = SCENE_OBJECTS.find((d) => d.characterId === characterId || d.id === characterId);
  const ai = mover && characterAI[mover.id];
  if (!ai) return;
  ai.pending?.resolve?.({ characterId, slotId: ai.slotId, released: true });
  ai.pending = null;
  releaseCharacterSlot(mover.id);
  ai.state = NPC_STATE.IDLE;
  ai.pauseUntil = performance.now() + delayMs;
}

// -------------------------------------------------------- guided interaction
// Generic engine for "NPC travels to a slot, waits for an external result,
// presents, returns home, resumes wandering" — usable by ANY future world's
// interaction point by passing different ids, never new code. State names
// are intentionally interaction-generic (not "CORE_BOOK_*") so the exact
// same function drives Athens/Avalon/the Immortal Library's equivalents.
//
//   TRAVELING -> WAITING_FOR_RESULT -> PRESENTING -> RETURNING -> (done)
//
// Mirrors the spec's GO_TO_TARGET / WAIT_AT_SLOT / PRESENT_RESULT /
// RETURN_HOME flow one-to-one; only the labels differ, to stay generic.
const INTERACTION_STATE = {
  TRAVELING: "traveling",
  WAITING_FOR_RESULT: "waiting_for_result",
  PRESENTING: "presenting",
  RETURNING: "returning",
};
const INTERACTION_ORGANIZING_PAUSE_MS = 750; // 0.5–1s
const INTERACTION_RETURN_CALM_DELAY_MS = 1500; // 1–2s

// One active session per character — keyed by characterId so multiple NPCs
// could each run their own interaction independently. Reassigning the entry
// is what makes a NEW call immediately supersede a still-in-flight one
// (Section 3/5: never duplicate or queue).
const activeInteraction = {};

function tryAdvanceInteraction(session) {
  if (session.state !== INTERACTION_STATE.WAITING_FOR_RESULT || !session.resultReady) return;
  session.state = INTERACTION_STATE.PRESENTING;
  setTimeout(() => {
    if (activeInteraction[session.characterId] !== session) return; // superseded meanwhile
    const ed = window.__sceneEditor;
    if (ed?.state?.active) return; // Scene Editor owns this NPC now
    session.state = INTERACTION_STATE.RETURNING;
    moveCharacterToSlot(session.characterId, session.homeSlotId)
      .then(() => {
        if (activeInteraction[session.characterId] === session) {
          resumeCharacterWandering(session.characterId, INTERACTION_RETURN_CALM_DELAY_MS);
          activeInteraction[session.characterId] = null;
        }
      })
      .catch((err) => console.warn(`[interaction] ${session.characterId} could not return to "${session.homeSlotId}":`, err.message));
  }, INTERACTION_ORGANIZING_PAUSE_MS);
}

// Starts (or immediately restarts, interrupting anything in progress) a
// guided interaction: cancel wandering, walk straight to targetSlotId, wait
// there for reportInteractionResultReady(characterId), then present, return
// to homeSlotId, and resume wandering. Never queues — calling this while a
// previous session is still traveling/waiting supersedes it outright.
function startGuidedInteraction(characterId, targetSlotId, homeSlotId) {
  const session = { characterId, targetSlotId, homeSlotId, state: INTERACTION_STATE.TRAVELING, resultReady: false };
  activeInteraction[characterId] = session;
  const ed = window.__sceneEditor;
  if (ed?.state?.active) {
    // Scene Editor already owns this NPC — don't fight it; once the result
    // is ready the (no-op, already-home) return still resolves cleanly.
    session.state = INTERACTION_STATE.WAITING_FOR_RESULT;
    return session;
  }
  moveCharacterToSlot(characterId, targetSlotId)
    .then(() => {
      if (activeInteraction[characterId] !== session) return;
      session.state = INTERACTION_STATE.WAITING_FOR_RESULT;
      tryAdvanceInteraction(session);
    })
    .catch((err) => {
      // Missing/unreachable slot degrades gracefully — still wait for the
      // result and present without having moved, never crash.
      console.warn(`[interaction] ${characterId} could not reach "${targetSlotId}":`, err.message);
      if (activeInteraction[characterId] !== session) return;
      session.state = INTERACTION_STATE.WAITING_FOR_RESULT;
      tryAdvanceInteraction(session);
    });
  return session;
}

// Reports that the external result (the AI's synthesized answer, or
// whatever a future interaction produces) is ready. Only actually advances
// the presentation once the NPC's OWN state has also reached
// WAITING_FOR_RESULT (Section 5) — arriving first or the result arriving
// first are both handled by the same single gate in tryAdvanceInteraction.
function reportInteractionResultReady(characterId) {
  const session = activeInteraction[characterId];
  if (!session) return;
  session.resultReady = true;
  tryAdvanceInteraction(session);
}

// -------------------------------------------------------- Core Book runtime
// Thin, Core-Book-specific integration over the generic guided-interaction
// engine above — the ONLY character/slot-specific code in this file. A
// future world's equivalent interaction point is just another call to
// startGuidedInteraction/reportInteractionResultReady with different ids.
const CORE_BOOK_WAIT_SLOT_ID = "core_book_wait";
const CORE_BOOK_CHARACTER_ID = "classic_omega";
const CORE_BOOK_HOME_SLOT_ID = "omega_home";

// Section 6: if the scene never authored core_book_wait, register a
// temporary development fallback — searched near the book hotspot for the
// nearest position that is actually reachable (a fixed, unvalidated
// coordinate previously landed inside a Blocking Zone and made the slot
// permanently unreachable; this reuses the SAME search spawn-safety uses).
function ensureCoreBookWaitSlotFallback() {
  if (resolveCharacterSlot(CORE_BOOK_WAIT_SLOT_ID)) return;
  const omega = SCENE_OBJECTS.find((d) => d.id === "classic-omega");
  const found = omega && findNearestValidPosition(omega, 0.5 * 1920, 0.62 * 1080, 600);
  if (!found) {
    console.warn(`[core-book] No slot "${CORE_BOOK_WAIT_SLOT_ID}" is authored and no valid fallback position could be found near the book hotspot. Author a real slot in the F8 Scene Editor.`);
    return;
  }
  console.warn(`[core-book] No slot with slotId "${CORE_BOOK_WAIT_SLOT_ID}" is authored — registering a temporary development fallback. Author a real slot (Prop-owned or scene-level) in the F8 Scene Editor.`);
  SCENE_CHARACTER_SLOTS.push({ slotId: CORE_BOOK_WAIT_SLOT_ID, enabled: true, x: found.x, y: found.y, facingDirection: "up" });
}

// Section 3: called immediately when the user submits a question — cancels
// wandering and begins walking to core_book_wait right away (fire-and-
// forget; the caller starts the AI pipeline in parallel, never blocked by this).
function onCoreBookQuestionSubmitted() {
  startGuidedInteraction(CORE_BOOK_CHARACTER_ID, CORE_BOOK_WAIT_SLOT_ID, CORE_BOOK_HOME_SLOT_ID);
}

// Called once the AI pipeline has fully settled (success OR failure — Omega
// must never wait forever on a failed run).
function onCoreBookAiSettled() {
  reportInteractionResultReady(CORE_BOOK_CHARACTER_ID);
}

// -------------------------------------------------------- Task 2: F8 reset
// Called by the Scene Editor (scene-editor.js's doToggle) on every F8
// open/close — the runtime, not the editor, owns character behavior, so the
// editor only reports the transition. Entering: cancel everything in-flight
// for EVERY NPC and teleport each straight to its home slot (immediate, no
// walk). Leaving: autonomous wandering may resume after a short calm delay.
window.__onSceneEditorActiveChange = function (active) {
  // Same "runtime owns it, editor only notifies" contract as the character
  // handling below — the app-split divider must yield the boundary to F8's
  // own #se-resize-divider while active, and resume once F8 closes. Any
  // in-progress drag of THIS divider also needs a clean stop (mirrors
  // setPanelFullscreen's cancelAppSplitDrag() for the same reason: F8
  // opening hides #chat-panel, one of the two panels this divider needs).
  // Deferred to the next tick: doToggle() calls this BEFORE it toggles
  // body.scene-editor-active, so appSplitActive()'s live class check would
  // otherwise read the PRE-toggle state and get this backwards. A plain
  // setTimeout (not requestAnimationFrame) on purpose — rAF is tied to the
  // rendering pipeline and can be suspended for a backgrounded/non-painting
  // tab, silently leaving the divider in its stale pre-toggle state; a
  // macrotask fires regardless, and doToggle's remaining synchronous work
  // (including the class toggle two lines below it) is guaranteed to have
  // already run by the time it does.
  cancelAppSplitDrag();
  setTimeout(applyAppSplitWidth, 0);
  for (const mover of SCENE_OBJECTS) {
    if (mover.kind !== "npc" || mover.deleted) continue;
    const ai = ensureCharacterAI(mover.id);
    if (active) {
      ai.pending?.reject?.(new Error("Cancelled: Scene Editor opened."));
      ai.pending = null;
      releaseCharacterSlot(mover.id);
      const homeSlotId = mover.homeSlotId || (mover.id === "classic-omega" ? "omega_home" : null);
      const home = homeSlotId && resolveCharacterSlot(homeSlotId);
      if (home) {
        mover.world = { ...home.world };
        applyCharacterFacing(mover, home.facingDirection);
      } else {
        applySceneObjectStyle(mover);
      }
      ai.state = NPC_STATE.EDITOR;
    } else if (ai.state !== NPC_STATE.PAUSED) {
      ai.state = NPC_STATE.IDLE;
      ai.pauseUntil = performance.now() + EDITOR_EXIT_CALM_DELAY_MS;
    }
  }
};

// ------------------------------------------------------------ ground shadows
// Every character and prop gets a ground-shadow sprite created with it and
// driven by the SAME placement data — a child render element of its entity,
// never an independent scene prop: it moves with the parent, dies with the
// parent, and renders DIRECTLY beneath the parent's sprite in the parent's
// own scene depth (same z-index, earlier DOM order = "z − ε"), above
// anything on lower layers.
//
// Per-entity config, `shadow` on the SCENE_OBJECTS entry (the same shape
// the Scene Editor edits and the layout file persists):
//   enabled  (bool, default true) — a disabled shadow does not render, but
//            its settings are kept and return when re-enabled
//   asset    (project-relative path, default assets/shared/shadows/
//            shadow_medium.png) — any PNG under assets/
//   offsetX / offsetY (scene px) — LOCAL offset of the shadow's center from
//            the entity's anchor (the ground contact point), so the shadow
//            follows the parent wherever it moves
//   width / height (scene px) — the VISIBLE shadow's size. Aspect is not
//            locked: props may need wide, flat ellipses. Explicit size also
//            means resizing the parent sprite never auto-resizes a
//            configured shadow. Sizing targets the texture's opaque CONTENT
//            (its alpha bbox, measured on load), so mostly-transparent
//            sheets still render at the requested visible size.
//   opacity  (0..1, default 1)
const SHADOW_DEFAULT_ASSET = "assets/shared/shadows/shadow_medium.png";

function shadowConfig(def) {
  const s = def.shadow || {};
  return {
    enabled: s.enabled !== false,
    asset: typeof s.asset === "string" && s.asset ? s.asset : SHADOW_DEFAULT_ASSET,
    offsetX: typeof s.offsetX === "number" ? s.offsetX : 0,
    offsetY: typeof s.offsetY === "number" ? s.offsetY : 0,
    width: typeof s.width === "number" && s.width > 0 ? s.width : 90,
    height: typeof s.height === "number" && s.height > 0 ? s.height : 14,
    opacity: typeof s.opacity === "number" ? Math.max(0, Math.min(1, s.opacity)) : 1,
  };
}

// Opaque-content bounds of each shadow texture (fractions of its canvas),
// measured once per asset from the alpha channel — what lets an explicit
// width/height describe the VISIBLE ellipse rather than the whole canvas.
// src -> { cx, cy, wf, hf } (content center + size, as canvas fractions).
const shadowContentCache = new Map();

// Auto Shadow Generation (dev-only authoring): a regenerated PNG reuses its
// path, so both the browser's HTTP cache and the measured-bounds cache above
// would keep serving the previous texture. One version token per asset path
// invalidates both. Never part of the stored Shadow value.
const shadowTextureVersions = new Map();
function invalidateShadowTexture(rel) {
  if (!rel) return;
  shadowTextureVersions.set(rel, Date.now());
  for (const key of [...shadowContentCache.keys()]) {
    if (key.includes(rel)) shadowContentCache.delete(key);
  }
}
window.__invalidateShadowTexture = invalidateShadowTexture;

function measureShadowContent(img) {
  if (!img.naturalWidth || shadowContentCache.has(img.src)) return;
  let bounds = { cx: 0.5, cy: 0.5, wf: 1, hf: 1 };
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) {
      bounds = {
        cx: (minX + maxX + 1) / 2 / w,
        cy: (minY + maxY + 1) / 2 / h,
        wf: (maxX - minX + 1) / w,
        hf: (maxY - minY + 1) / h,
      };
    }
  } catch {
    // Unreadable canvas: fall back to whole-canvas bounds.
  }
  shadowContentCache.set(img.src, bounds);
}

// ---------------------------------------------------- player interaction
// Direct player/pointer HOVER behavior for Props (F8 Scene Editor's "PLAYER
// INTERACTION" component — see sanitizePlayerInteraction's own comment in
// src/services/sceneConfig.js for the full schema). This is RUNTIME
// behavior, not an F8-only preview: the CSS classes/custom properties this
// section maintains are set from the def's saved data every time
// applySceneObjectStyle() runs (creation, drag, undo/redo, editor edits —
// there is only one styling path), so a saved Prop hovers correctly whether
// or not the Scene Editor script was ever loaded. The editor's inspector
// (devtools/scene-editor.js) only ever EDITS def.playerInteraction and calls
// this same styling path for a live preview — it owns no hover behavior of
// its own.
//
// Effective config reader — same "merge saved fields over defaults" pattern
// as shadowConfig()/collisionConfig() above, shared verbatim by this file
// and the F8 editor (same script, same globals — see maybeLoadSceneEditor).
function playerInteractionConfig(def) {
  const pi = def.playerInteraction || {};
  const effects = Array.isArray(pi.hover?.effects) ? pi.hover.effects : [];
  return { enabled: pi.enabled === true, hover: { effects } };
}

// Decoded-GIF Animation playback — the artist supplies one ordinary
// animated GIF; the engine derives everything else (dimensions, frame
// count, per-frame delay) from the file itself. No sprite-sheet authoring
// exists anymore (frameWidth/frameHeight/frameCount/fps/loop were removed —
// see sanitizeHoverEffect's "animation" branch, sceneConfig.js). Two
// renderer paths, chosen automatically per-source, never authored:
//   decoded (preferred) — browser ImageDecoder decodes the GIF's real
//     per-frame delays ONCE, cached; playback is driven by this file's own
//     setTimeout chain drawing to a dedicated <canvas> sibling layer, so
//     Speed genuinely changes playback (effectiveDelay = originalDelay /
//     speed — see effectiveFrameDelayMs() below, mirrored in the
//     Node-testable src/services/animationPlayback.js since this file can't
//     import it).
//   fallback — ImageDecoder (or GIF support within it) unavailable: the
//     ORIGINAL, unmodified <img src> swap. The GIF still animates (at its
//     own native, unchangeable rate) — Speed is simply inert there, exactly
//     as it always honestly was for a native GIF; this is a graceful
//     degradation, never a broken Animation effect.
// Same formula as src/services/animationPlayback.js's effectiveFrameDelayMs()
// — mirrored inline for the reason above.
const MIN_FRAME_DELAY_MS = 20; // ~50fps ceiling: GIF frame delays below 2/100s are unreliable across browsers
function effectiveFrameDelayMs(originalDelayMs, speed) {
  const base = typeof originalDelayMs === "number" && originalDelayMs > 0 ? originalDelayMs : 100;
  const mult = typeof speed === "number" && speed > 0 ? speed : 1;
  return Math.max(MIN_FRAME_DELAY_MS, base / mult);
}

// TEMPORARY RUNTIME VISIBILITY STATE (as opposed to persistent Scene Object
// presentation styles like position/transform/z-index) — see
// startDecodedGifPlayback's copy loop. Never copied from the img onto the
// animation canvas: the img's OWN hide-while-animating state (opacity:0,
// set by the pointerenter handler) must never leak onto the layer that's
// supposed to be the VISIBLE replacement for it.
const RUNTIME_VISIBILITY_STYLE_PROPS = new Set(["opacity", "visibility", "display", "pointer-events"]);

// Feature detection, cached — ImageDecoder itself may not exist at all
// (older browsers), or may exist but not support "image/gif" specifically
// (format support is NOT standardized across WebCodecs implementations).
// Resolves once per page load; every caller awaits the SAME promise.
let gifImageDecoderSupportedPromise = null;
function isGifImageDecoderSupported() {
  if (!gifImageDecoderSupportedPromise) {
    gifImageDecoderSupportedPromise = (async () => {
      if (typeof ImageDecoder === "undefined") return false;
      try {
        return await ImageDecoder.isTypeSupported("image/gif");
      } catch {
        return false;
      }
    })();
  }
  return gifImageDecoderSupportedPromise;
}

// source (project-relative path) -> Promise<{frames:[{bitmap,delayMs}],
// width, height} | null>. Decoding a GIF is the expensive part (network
// fetch + full per-frame decode) — cached by source so every Prop sharing
// the same GIF, and every re-hover of the same Prop, decodes it exactly
// once. `null` means "unsupported or failed to decode" — cached too, so a
// browser without GIF ImageDecoder support doesn't retry every hover.
const gifDecodeCache = new Map();

function getDecodedGifFrames(source) {
  if (!source) return Promise.resolve(null);
  if (!gifDecodeCache.has(source)) {
    gifDecodeCache.set(source, decodeGifFramesUncached(source).catch(() => null));
  }
  return gifDecodeCache.get(source);
}

async function decodeGifFramesUncached(source) {
  if (!(await isGifImageDecoderSupported())) return null;
  const res = await fetch(`/${source}`);
  if (!res.ok) return null;
  const data = await res.arrayBuffer();
  const decoder = new ImageDecoder({ data, type: "image/gif" });
  await decoder.tracks.ready;
  const frameCount = decoder.tracks.selectedTrack?.frameCount || 1;
  const frames = [];
  let width = 0;
  let height = 0;
  for (let i = 0; i < frameCount; i++) {
    // Disposal-method compositing (frames that only redraw a changed
    // region, "restore to background", etc.) is resolved by the browser's
    // OWN decoder into each fully-composited VideoFrame here — this file
    // never has to reimplement GIF disposal logic itself.
    const { image } = await decoder.decode({ frameIndex: i });
    if (!width) {
      width = image.displayWidth;
      height = image.displayHeight;
    }
    // Snapshotted to an ImageBitmap (cheap to redraw repeatedly) so the
    // VideoFrame itself — which carries its own separate memory/GPU
    // resource lifetime — can be closed immediately rather than held for
    // this animation's entire cached lifetime.
    const bitmap = await createImageBitmap(image);
    const delayMs = image.duration ? image.duration / 1000 : 100;
    image.close();
    frames.push({ bitmap, delayMs });
  }
  decoder.close();
  return frames.length ? { frames, width, height } : null;
}

// One dedicated <canvas> sibling per Prop (same insertion pattern as
// ensureShadowElement) — inert (display:none) unless a decoded-GIF
// animation is actually playing on it. Sized/positioned by copying the
// Prop's own <img> box at playback-start time (see startDecodedGifPlayback),
// same technique the old sprite-sheet layer used.
function ensureAnimationCanvasLayer(def, scene, hotspot) {
  if (document.getElementById(`scene-anim-canvas-${def.id}`)) return;
  const canvas = document.createElement("canvas");
  canvas.className = "pi-gif-canvas-layer";
  canvas.id = `scene-anim-canvas-${def.id}`;
  canvas.style.display = "none";
  scene.insertBefore(canvas, hotspot);
}

// instanceId -> { stop() } for the currently-running decoded playback, if
// any — lets a rapid re-hover (or an editor edit) cleanly stop a prior loop
// before starting a new one, and lets pointerleave stop it deterministically.
const activeGifPlaybacks = new Map();

function stopDecodedGifPlayback(instanceId) {
  const active = activeGifPlaybacks.get(instanceId);
  if (active) {
    active.stop();
    activeGifPlaybacks.delete(instanceId);
  }
  const canvas = document.getElementById(`scene-anim-canvas-${instanceId}`);
  if (canvas) {
    canvas.style.display = "none";
    // Drop any Float/Scale/Glow classes mirrored on at playback-start (see
    // startDecodedGifPlayback) — otherwise a stale CSS animation keeps
    // running on a display:none canvas, and the NEXT activation could start
    // mid-cycle instead of cleanly at rest.
    canvas.className = "pi-gif-canvas-layer";
  }
}

// Starts (or restarts) decoded playback. `authoredSpeed` is effect.speed
// (the saved default); the ACTUAL speed used is re-read on every single
// scheduled frame via effectiveAnimationSpeed() — never captured once at
// start — specifically so a future runtime override
// (setSceneObjectAnimationSpeedOverride) can change the playback rate WHILE
// this loop is already running, mid-animation, without restarting from
// frame 0 and without touching Scene Config: only the delay computed for
// the NEXT tick changes, `frameIndex` itself is untouched by a speed change.
function startDecodedGifPlayback(def, img, decoded, authoredSpeed) {
  stopDecodedGifPlayback(def.id);
  const canvas = document.getElementById(`scene-anim-canvas-${def.id}`);
  if (!canvas) return;
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  // Copy the img's CURRENT persistent presentation properties (anchor
  // position/width/transform/transform-origin/z-index, plus the --pi-*
  // custom properties Float/Scale/Glow read) onto the canvas — EXPLICITLY
  // EXCLUDING opacity/visibility/display/pointer-events, which are TEMPORARY
  // RUNTIME VISIBILITY STATE, not persistent Scene Object presentation: the
  // img is already opacity:0 by the time this runs (see the pointerenter
  // handler), and a blind `canvas.style.cssText = img.style.cssText` would
  // clone that "0" straight onto the canvas too, making the ACTUAL VISIBLE
  // layer invisible right along with the interaction owner it's supposed to
  // replace — exactly the bug a naive full-cssText clone produces, whether
  // the img's hide-state happens to be expressed via opacity or visibility.
  // Iterating (rather than an explicit property allow-list) so any FUTURE
  // --pi-* custom property a new effect type introduces keeps reaching the
  // canvas automatically, without this function needing to know its name.
  for (const prop of img.style) {
    if (RUNTIME_VISIBILITY_STYLE_PROPS.has(prop)) continue;
    canvas.style.setProperty(prop, img.style.getPropertyValue(prop));
  }
  canvas.style.display = "block";
  // Float/Scale/Glow are authored as pi-fx-* classes + CSS custom properties
  // on the IMG, triggered by ITS OWN `:hover` — the canvas can never match
  // `:hover` itself (pointer-events:none, by design, so it can't steal
  // Player Interaction hit-testing from the img). Mirroring whichever pi-fx-*
  // classes are actually authored onto the canvas applies the SAME custom-
  // property-driven animation/scale/filter (see the .pi-gif-canvas-layer.
  // pi-fx-* rules, style.css) to the VISIBLE layer, so the whole visual
  // floats/scales/glows together instead of only the invisible img doing so.
  const fx = Array.from(img.classList).filter((c) => c.startsWith("pi-fx-"));
  canvas.className = ["pi-gif-canvas-layer", ...fx].join(" ");
  const ctx = canvas.getContext("2d");

  let frameIndex = 0;
  let timer = null;
  let stopped = false;

  function drawCurrentFrame() {
    const frame = decoded.frames[frameIndex];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.bitmap, 0, 0);
  }
  function scheduleNext() {
    if (stopped) return;
    const frame = decoded.frames[frameIndex];
    const speed = effectiveAnimationSpeed(def.id, authoredSpeed);
    const delay = effectiveFrameDelayMs(frame.delayMs, speed);
    timer = setTimeout(() => {
      frameIndex = (frameIndex + 1) % decoded.frames.length;
      drawCurrentFrame();
      scheduleNext();
    }, delay);
  }
  drawCurrentFrame();
  scheduleNext();

  activeGifPlaybacks.set(def.id, {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  });
}

// Runtime-only Animation speed override — NEVER written into
// def.playerInteraction (the saved/authored data) or persisted anywhere.
// This is the seam Animation Behavior (assets/behaviors/*.json — see
// src/services/animationBehavior.js) drives: dispatchSceneBehaviorEvent()
// calls setSceneObjectAnimationSpeedOverride(instanceId, speed) when a
// matching rule carries an explicit `speed`, and clears it (pass a falsy/
// omitted value) when Behavior stops or its matching rule has no `speed` of
// its own. Keyed by instance id (a plain string) so it survives object
// re-selection/re-render without touching SCENE_OBJECTS or
// def.playerInteraction in any way.
//
// ABSOLUTE override, not a multiplier: per the Behavior spec, an explicit
// Behavior speed REPLACES the authored speed outright (an author writing
// `{speed: 1.0}` over a 2.0-authored GIF must get exactly 1.0x, never
// 2.0 * 1.0) — see effectiveAnimationSpeed() below. Range validation for
// what counts as a legal override value lives in
// src/services/animationBehavior.js's sanitizeAnimationBehavior (0.1–10),
// not here — by the time a value reaches this Map it's already trusted.
const runtimeAnimationSpeedOverrides = new Map();

function setSceneObjectAnimationSpeedOverride(instanceId, speed) {
  if (typeof speed === "number" && Number.isFinite(speed) && speed > 0) {
    runtimeAnimationSpeedOverrides.set(instanceId, speed);
  } else {
    runtimeAnimationSpeedOverrides.delete(instanceId);
  }
}

// An active runtime override REPLACES authoredSpeed outright (absolute, not
// multiplicative) — see the Map's own comment above for why. No override
// present -> authoredSpeed, falling back to system default 1.0 if even that
// is missing/invalid.
function effectiveAnimationSpeed(instanceId, authoredSpeed) {
  const base = typeof authoredSpeed === "number" && authoredSpeed > 0 ? authoredSpeed : 1;
  const override = runtimeAnimationSpeedOverrides.get(instanceId);
  return typeof override === "number" ? override : base;
}

// Player Interaction Animation ACTIVATION ownership. Hover and Animation
// Behavior (assets/behaviors/*.json — see dispatchSceneBehaviorEvent below)
// are two INDEPENDENT sources that can each want this Prop's Animation
// playing at the same time. Losing one must never stop playback the other
// still wants, and handing off between them while at least one keeps
// wanting playback must never restart the GIF from frame 0 — that's the
// whole reason this ownership bookkeeping exists rather than each source
// calling startDecodedGifPlayback/stopDecodedGifPlayback directly the way
// the original hover-only listeners used to.
//
// instanceId -> { hoverActive, behaviorActive, behaviorSpeed, token }.
// `behaviorSpeed` is the ABSOLUTE speed the currently-matched Behavior rule
// requested (undefined when that rule carries no `speed` of its own, in
// which case authored speed applies via effectiveAnimationSpeed's own
// fallback). `token` guards the async GIF-decode step in
// reconcileAnimationActivation against activation state changing again
// before the decode resolves — the same purpose the old per-listener
// `hoverToken` closure served, generalized to cover both sources.
const animationActivation = new Map();

function getActivationState(instanceId) {
  let state = animationActivation.get(instanceId);
  if (!state) {
    state = { hoverActive: false, behaviorActive: false, behaviorSpeed: undefined, token: 0 };
    animationActivation.set(instanceId, state);
  }
  return state;
}

// The static "at rest" visual — exactly undoes whichever of the two
// playback paths in reconcileAnimationActivation was actually engaged
// (decoded-canvas playback, or the native <img src> fallback swap). A safe
// no-op if neither ever engaged.
function restoreStaticAnimationVisual(instanceId, img) {
  stopDecodedGifPlayback(instanceId);
  if (img.dataset.piRestSrc) {
    img.src = img.dataset.piRestSrc;
    delete img.dataset.piRestSrc;
  }
  img.style.opacity = "";
}

// THE generic per-instance runtime teardown — the one place that hides/
// stops/clears EVERY auxiliary runtime layer a Scene Object can own, so
// deleting it (soft or hard) never leaves an orphan behind. Used by the F8
// Scene Editor's deleteSceneProp (devtools/scene-editor.js) — the editor
// only decides WHEN to tear down (the soft-delete flag + object list
// re-render); this function owns HOW, so no cleanup logic needs
// duplicating across delete call sites, present or future (Characters/NPCs
// aren't wired to this yet — out of scope for the Prop-deletion bug this
// was written for — but nothing here is Prop-specific; it takes a bare
// instance id and would work for any Scene Object).
//
// Idempotent and safe to call on an instance with no auxiliary layers at
// all (Shadow off, no Animation authored, never hovered) — every step is
// its own no-op guard, never assumes any particular layer exists. Hides
// rather than removes the main element/Shadow/canvas, matching the
// existing soft-delete convention (deleteSceneProp only ever sets
// def.deleted + display:none, never a real DOM removal) — this is what
// lets undo restore everything for free: applySnapshot's existing
// restore path already calls styleObject()/applySceneObjectStyle() for a
// def whose soft-delete is undone, which recomputes Shadow visibility
// from def.shadow itself and re-shows the main element — this function
// only needs to correctly HIDE things, never re-show them.
function teardownSceneObject(instanceId) {
  const el = document.getElementById(`scene-${instanceId}`);
  if (el) {
    // Stops any decoded-GIF playback loop, clears its activeGifPlaybacks
    // entry, hides+resets the canvas, AND restores the native-fallback
    // <img src> swap / opacity — covers whichever of the two Animation
    // playback paths (decoded canvas vs. native GIF src swap) happened to
    // be active, so the main element is never left mid-animation state.
    restoreStaticAnimationVisual(instanceId, el);
    el.style.display = "none";
  } else {
    // Element already gone for some other reason — still tear down
    // playback state keyed by this id, never leave it dangling.
    stopDecodedGifPlayback(instanceId);
  }
  // Behavior/Hover activation ownership (reconcileAnimationActivation's own
  // state, incl. any behaviorSpeed override). Bumping the token BEFORE
  // deleting the entry (rather than just deleting it) matters: an
  // in-flight GIF decode from a hover/Behavior event that started just
  // before deletion holds its OWN reference to this exact state object
  // (captured synchronously at the top of reconcileAnimationActivation,
  // before its `await`) — deleting the Map entry alone doesn't invalidate
  // THAT closure's reference, so its `token !== state.token` guard would
  // never trip and it could call startDecodedGifPlayback on this now-
  // hidden element once the decode resolves, resurrecting a canvas nobody
  // owns anymore. Incrementing the shared object's own .token first makes
  // that guard correctly detect staleness and bail.
  const activation = animationActivation.get(instanceId);
  if (activation) {
    activation.token++;
    activation.hoverActive = false;
    activation.behaviorActive = false;
  }
  animationActivation.delete(instanceId);
  // Runtime speed override (Behavior's absolute-speed seam, see
  // effectiveAnimationSpeed) — never meaningful once torn down.
  runtimeAnimationSpeedOverrides.delete(instanceId);
  // Shadow — a separate sibling DOM node (ensureShadowElement), never
  // touched by anything that only manages the main sprite element, which
  // is exactly how a Prop's Shadow was left orphaned by delete before this
  // function existed.
  const shadow = document.getElementById(`scene-shadow-${instanceId}`);
  if (shadow) shadow.style.display = "none";
}

// THE single place that turns {hoverActive, behaviorActive} into actual
// playback state — called after EITHER source changes (the pointerenter/
// pointerleave listeners in createSceneObjectElement, and
// applyBehaviorEventToProp below). Reads the Animation effect fresh from
// def every call, same "never cached at creation time" rule the old
// hover-only listeners followed.
//
// Continuity is the whole point: if playback is already running and
// shouldBeActive (hoverActive || behaviorActive) stays true across this
// call — e.g. Behavior stops while Hover is still active, or vice versa —
// this function does NOT touch startDecodedGifPlayback/
// stopDecodedGifPlayback at all, since starting always resets frameIndex to
// 0 (see startDecodedGifPlayback's own comment). It only starts on a true
// inactive->active transition and only stops on a true active->inactive
// one. A pure SPEED change while staying active needs no restart — it's
// picked up on the very next scheduled frame via
// setSceneObjectAnimationSpeedOverride + effectiveAnimationSpeed, applied
// unconditionally below regardless of which transition (if any) occurs.
async function reconcileAnimationActivation(def, img) {
  const state = getActivationState(def.id);
  const token = ++state.token;
  const anim = playerInteractionConfig(def).hover.effects.find((e) => e.type === "animation" && e.source);
  const shouldBeActive = !!anim && (state.hoverActive || state.behaviorActive);

  setSceneObjectAnimationSpeedOverride(def.id, state.behaviorActive ? state.behaviorSpeed : undefined);

  const wasActive = !!activeGifPlaybacks.get(def.id) || img.dataset.piRestSrc != null;
  if (!shouldBeActive) {
    if (wasActive) restoreStaticAnimationVisual(def.id, img);
    return;
  }
  if (wasActive) return; // continuing playback — the speed override above is all that changed

  const decoded = await getDecodedGifFrames(anim.source);
  if (token !== state.token) return; // superseded by a later activation change while decoding
  if (!(state.hoverActive || state.behaviorActive)) return; // deactivated while decoding
  if (decoded) {
    // opacity, NOT visibility — see createSceneObjectElement's pointerenter
    // listener (the original home of this exact reasoning) for why.
    img.style.opacity = "0";
    startDecodedGifPlayback(def, img, decoded, anim.speed);
    return;
  }
  if (!img.dataset.piRestSrc) img.dataset.piRestSrc = img.src;
  img.src = `/${anim.source}`;
}

// Animation "Behavior" files (assets/behaviors/*.json) — an OPTIONAL
// external file an Animation effect can reference (effect.behavior, a
// project-relative path — see sanitizeHoverEffect's "animation" branch,
// src/services/sceneConfig.js) telling the runtime how THIS Prop's
// Animation should react to generic, named app/session-state events. This
// block is the mirrored-inline copy of src/services/animationBehavior.js's
// exact validation logic (this file is a plain global-scope script and
// can't import an ES module — same duplication convention already used for
// effectiveFrameDelayMs()/src/services/animationPlayback.js above).
//
// Declarative data ONLY: a rule says "when this named event happens,
// play/stop and optionally use this ABSOLUTE speed" — nothing here ever
// evaluates or executes anything from the parsed JSON.
const BEHAVIOR_SPEED_MIN = 0.1;
const BEHAVIOR_SPEED_MAX = 10;

function sanitizeAnimationBehavior(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.version !== 1) return null;
  if (!Array.isArray(raw.rules)) return null;
  const rules = raw.rules.map(sanitizeBehaviorRule).filter(Boolean);
  return { version: 1, rules };
}

function sanitizeBehaviorRule(r) {
  if (!r || typeof r !== "object") return null;
  if (typeof r.when !== "string" || !r.when.trim()) return null;
  const out = { when: r.when.trim() };
  if (typeof r.play === "boolean") out.play = r.play;
  if (
    typeof r.speed === "number" &&
    Number.isFinite(r.speed) &&
    r.speed >= BEHAVIOR_SPEED_MIN &&
    r.speed <= BEHAVIOR_SPEED_MAX
  ) {
    out.speed = r.speed;
  }
  return out;
}

function findMatchingBehaviorRule(behavior, eventName) {
  if (!behavior || !Array.isArray(behavior.rules)) return null;
  if (typeof eventName !== "string" || !eventName) return null;
  return behavior.rules.find((r) => r.when === eventName) || null;
}

// source (project-relative Behavior JSON path) -> Promise<{version,rules}|null>,
// cached exactly like gifDecodeCache above so every Prop sharing the same
// Behavior file, and every dispatched event, loads/parses/validates it
// exactly once. `null` covers every failure mode uniformly — missing file,
// network error, JSON syntax error, or content that fails
// sanitizeAnimationBehavior's validation (wrong version, non-array rules,
// etc.) — a broken Behavior file degrades to "no Behavior", never a
// runtime error or a broken Prop.
const animationBehaviorCache = new Map();

function getAnimationBehavior(source) {
  if (!source) return Promise.resolve(null);
  if (!animationBehaviorCache.has(source)) {
    animationBehaviorCache.set(source, loadAnimationBehaviorUncached(source).catch(() => null));
  }
  return animationBehaviorCache.get(source);
}

async function loadAnimationBehaviorUncached(source) {
  const res = await fetch(`/${source}`);
  if (!res.ok) return null;
  const raw = await res.json();
  return sanitizeAnimationBehavior(raw);
}

// THE generic runtime event API. Callers pass an arbitrary event NAME
// string — this function and everything it calls know NOTHING about what
// that string means; it is never compared against a hardcoded list of
// Council/session state names anywhere in this function or its helpers.
// Session-state-specific meaning lives entirely OUTSIDE this function: in
// the single call site that wires real app state transitions to it (see
// triggerRoleSpeech) and in each Prop's own Behavior JSON (e.g.
// assets/behaviors/core_book_behavior.json) — never in engine code.
//
// For every scene object whose Animation effect has a `behavior` path:
// load (cached) + validate that file, find the rule whose `when` matches
// eventName, and update that Prop's Behavior activation ownership
// accordingly. Iterates ALL of SCENE_OBJECTS (props and baked cast alike)
// rather than filtering by kind === "prop" — Player Interaction data only
// ever exists on Props in practice (see playerInteractionConfig's own
// comment), so anything else naturally has no matching Animation effect and
// is skipped; no Character-vs-Prop branching lives in this function.
function dispatchSceneBehaviorEvent(eventName) {
  if (typeof eventName !== "string" || !eventName) return;
  for (const def of SCENE_OBJECTS) {
    const anim = playerInteractionConfig(def).hover.effects.find((e) => e.type === "animation" && e.source && e.behavior);
    if (!anim) continue;
    applyBehaviorEventToProp(def, anim, eventName);
  }
}

async function applyBehaviorEventToProp(def, anim, eventName) {
  const behavior = await getAnimationBehavior(anim.behavior);
  const rule = behavior ? findMatchingBehaviorRule(behavior, eventName) : null;
  const state = getActivationState(def.id);
  // No matching rule (including an unloadable/invalid Behavior file) ->
  // Behavior ownership releases cleanly; Hover ownership (if any) is
  // entirely untouched — see reconcileAnimationActivation's
  // shouldBeActive = hoverActive || behaviorActive union. A rule that
  // matches but omits `play` defaults to activating (an author writing only
  // `{when, speed}` clearly wants this state to play at that speed); only
  // an EXPLICIT `play:false` deactivates Behavior ownership.
  state.behaviorActive = !!rule && rule.play !== false;
  state.behaviorSpeed = state.behaviorActive && typeof rule.speed === "number" ? rule.speed : undefined;
  const img = document.getElementById(`scene-${def.id}`);
  if (!img) return; // Prop not currently rendered — nothing to reconcile visually
  reconcileAnimationActivation(def, img);
}

// A neutral SYSTEM default glow color for a freshly-added effect with no
// authored color yet — deliberately NOT the old ghost-book's warm gold
// (#eebd6a): that value is core_book_01's own AUTHORED data (see the
// migration in assets/scenes/classic_library.json), never a hardcoded
// default every future Prop would inherit.
const PLAYER_INTERACTION_DEFAULT_GLOW_COLOR = "#ffffff";

function hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(255, 255, 255, ${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Four hard-edge (no-blur) drop-shadows, one per side — the same
// "Photoshop-style outer glow around the sprite's alpha shape, crisp pixel
// edges" technique the old ghost-book hardcoded (book-glow, formerly in
// style.css), now generalized: size/color/opacity are per-instance authored
// values on the effect itself, never hardcoded into this function.
function hoverGlowFilterValue(size, color, opacity) {
  const s = Math.max(0, size);
  const rgba = hexToRgba(color, Math.max(0, Math.min(1, opacity)));
  return [
    `drop-shadow(${s}px 0 0 ${rgba})`,
    `drop-shadow(${-s}px 0 0 ${rgba})`,
    `drop-shadow(0 ${s}px 0 ${rgba})`,
    `drop-shadow(0 ${-s}px 0 ${rgba})`,
  ].join(" ");
}

// Keeps one Prop element's hover-effect CSS in sync with its CURRENT saved
// config. Composition safety (transform corruption — the reason this is a
// separate function rather than touching el.style.transform anywhere):
// FLOAT/SCALE below drive the INDEPENDENT CSS `translate`/`scale`
// properties (CSS Transforms Level 2), never the `transform` property
// applySceneObjectStyle() itself owns (anchor position + flipX) — the two
// compose additively by spec, in a fixed order, so however many times
// either one runs, neither can ever overwrite or corrupt the other. GLOW
// uses `filter`, fully independent of both. Pointer-events are ALSO gated
// here (data-hoverable, mirroring the existing NPC pattern in
// placeSceneObjects) so a Prop with nothing authored stays click-through,
// exactly as before this component existed.
function applyPlayerInteractionStyle(def, el) {
  const cfg = playerInteractionConfig(def);
  const hoverable = cfg.enabled && cfg.hover.effects.length > 0;
  if (hoverable) el.dataset.hoverable = "prop";
  else if (el.dataset.hoverable === "prop") delete el.dataset.hoverable;

  el.classList.remove("pi-fx-float", "pi-fx-scale", "pi-fx-glow");
  if (!hoverable) return;
  for (const effect of cfg.hover.effects) {
    if (effect.type === "float") {
      el.classList.add("pi-fx-float");
      const distance = typeof effect.distance === "number" ? effect.distance : 6;
      const duration = typeof effect.duration === "number" && effect.duration > 0 ? effect.duration : 1.2;
      el.style.setProperty("--pi-float-distance", `${Math.abs(distance)}px`);
      el.style.setProperty("--pi-float-duration", `${duration}s`);
    } else if (effect.type === "scale") {
      el.classList.add("pi-fx-scale");
      const scale = typeof effect.scale === "number" ? effect.scale : 1.05;
      const duration = typeof effect.duration === "number" && effect.duration > 0 ? effect.duration : 0.3;
      el.style.setProperty("--pi-scale-amount", String(scale));
      el.style.setProperty("--pi-scale-duration", `${duration}s`);
    } else if (effect.type === "glow") {
      el.classList.add("pi-fx-glow");
      const size = typeof effect.size === "number" ? effect.size : 4;
      const color = typeof effect.color === "string" && effect.color ? effect.color : PLAYER_INTERACTION_DEFAULT_GLOW_COLOR;
      const opacity = typeof effect.opacity === "number" ? effect.opacity : 0.7;
      el.style.setProperty("--pi-glow-filter", hoverGlowFilterValue(size, color, opacity));
    }
    // "animation" (decoded-GIF canvas playback, or the native <img src>
    // fallback) is handled by real pointerenter/pointerleave listeners (see
    // createSceneObjectElement/startDecodedGifPlayback) rather than a CSS
    // :hover rule here — both need JS (an async decode + a setTimeout-driven
    // draw loop, or an HTML attribute swap), neither of which a static CSS
    // rule in this loop can express.
    // "effectDefinition" (future external preset) has no runtime yet — see
    // its own comment in src/services/sceneConfig.js; present entries simply
    // round-trip inertly until that lands.
  }
}

// Character Player Interaction (MVP: Outline / Glow only — see
// sanitizeCharacterPlayerInteraction in src/services/sceneLayout.js).
// Deliberately a SEPARATE function from applyPlayerInteractionStyle above
// rather than a shared call, for one specific reason: that function owns
// `data-hoverable`, and on a Character that attribute is ALREADY load-
// bearing for a different system. `data-hoverable="npc"` (set by
// placeSceneObjects/createCharacterSceneElement) is what re-enables
// pointer-events for Characters so the Idle Controller's hover-thought
// bubbles work at all (see the .scene-object[data-hoverable="npc"] rule,
// style.css). Routing Characters through applyPlayerInteractionStyle would
// overwrite that with "prop" — which happens to keep pointer-events on, so
// the glow would look fine, while silently breaking every future/current
// query that distinguishes Characters from Props by it. This function
// therefore never touches data-hoverable at all: a Character is already
// hoverable by virtue of being a Character.
//
// Everything that actually RENDERS the glow is shared, not reimplemented:
// the same hoverGlowFilterValue() math, the same --pi-glow-filter custom
// property, and the same .pi-fx-glow CSS rule Props use. Hover on/off is
// pure CSS `:hover` — no JS listeners are added here, so the existing
// pointerenter/pointerleave thought-hover handlers are untouched and the
// two systems simply coexist on the same element.
function applyCharacterPlayerInteractionStyle(def, el) {
  const pi = def.playerInteraction;
  const effects = Array.isArray(pi?.hover?.effects) ? pi.hover.effects : [];
  const glow = pi?.enabled === true ? effects.find((e) => e.type === "glow") : null;
  if (!glow) {
    // Always clear both, so disabling in F8 (or undoing an enable) removes
    // the effect immediately rather than leaving a stale filter behind.
    el.classList.remove("pi-fx-glow");
    el.style.removeProperty("--pi-glow-filter");
    return;
  }
  el.classList.add("pi-fx-glow");
  const size = typeof glow.size === "number" ? glow.size : 4;
  const color = typeof glow.color === "string" && glow.color ? glow.color : PLAYER_INTERACTION_DEFAULT_GLOW_COLOR;
  const opacity = typeof glow.opacity === "number" ? glow.opacity : 0.7;
  el.style.setProperty("--pi-glow-filter", hoverGlowFilterValue(size, color, opacity));
}

// The ONE styling path for a scene object AND its shadow — used at creation
// and by the dev Scene Editor for live updates, so the pair can never drift
// apart. translate() percentages are relative to the element's own box, so
// shifting by the anchor fractions puts the anchor point exactly on
// (left, top) — the whole anchor system is this one line.
// ---------------------------------------------------- prop transform (v1)
// MIRRORED from src/services/propTransform.js, which owns the schema and is
// the tested source of truth. app.js is a plain <script> and cannot import an
// ESM service, so the homography is duplicated here under the same
// mirrored-constant rule the rest of this file uses — test/propTransform.test.js
// asserts the two stay in step.
//
// Solves the unit square -> four corners projective map, then conjugates it
// into the element's own pixel box (T = S.H.S^-1). Returns "" for an absent,
// identity or degenerate transform, which is what keeps untransformed Props on
// the exact rendering path they had before this feature existed.
// THE solver, extracted so rendering AND migration share one implementation.
// Gauss-Jordan with partial pivoting; null on a singular system rather than NaN.
function propHomography(dest) {
  if (!Array.isArray(dest) || dest.length !== 4) return null;
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const [sx, sy] = src[i];
    const [dx, dy] = dest[i];
    rows.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx, dx]);
    rows.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy, dy]);
  }
  const m = rows.map((r) => r.slice());
  const n = 8;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    for (let k = col; k <= n; k += 1) m[col][k] /= pv;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r][col];
      if (!factor) continue;
      for (let k = col; k <= n; k += 1) m[r][k] -= factor * m[col][k];
    }
  }
  const out = m.map((r) => r[n]);
  return out.every(Number.isFinite) ? out : null;
}

// Evaluate a homography at a point.
function applyPropHomography(H, x, y) {
  const [a, b, c, d, e, f, g, hh] = H;
  const w = g * x + hh * y + 1;
  if (!(Math.abs(w) > 1e-12)) return null;
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w];
}

// Usable area + no collapsed corners — mirrored from the service.
function propQuadUsable(c) {
  if (!Array.isArray(c) || c.length !== 4) return false;
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x1, y1] = c[i];
    const [x2, y2] = c[(i + 1) % 4];
    area += x1 * y2 - x2 * y1;
  }
  if (Math.abs(area / 2) < 0.01) return false;
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      if (Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]) < 0.02) return false;
    }
  }
  return true;
}

function propMatrix3d(corners, w, h, bounds) {
  if (!Array.isArray(corners) || corners.length !== 4 || !(w > 0) || !(h > 0)) return "";
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (corners.every((p, i) => p[0] === src[i][0] && p[1] === src[i][1])) return "";
  if (!propQuadUsable(corners)) return "";
  const useBounds = bounds && bounds.widthFraction > 0 && bounds.heightFraction > 0;
  const Q = useBounds
    ? corners.map(([cx, cy]) => [bounds.x0 + cx * bounds.widthFraction, bounds.y0 + cy * bounds.heightFraction])
    : corners;
  const H = propHomography(Q);
  if (!H) return "";
  let [a, b, c, d, e, f, g, hh] = H;
  if (useBounds) {
    const bx = bounds.x0, by = bounds.y0;
    const iw = 1 / bounds.widthFraction, ih = 1 / bounds.heightFraction;
    const t00 = a * iw, t01 = b * ih, t02 = a * -bx * iw + b * -by * ih + c;
    const t10 = d * iw, t11 = e * ih, t12 = d * -bx * iw + e * -by * ih + f;
    const t20 = g * iw, t21 = hh * ih, t22 = g * -bx * iw + hh * -by * ih + 1;
    if (!(Math.abs(t22) > 1e-12)) return "";
    a = t00 / t22; b = t01 / t22; c = t02 / t22;
    d = t10 / t22; e = t11 / t22; f = t12 / t22;
    g = t20 / t22; hh = t21 / t22;
  }
  const m00 = a, m01 = (b * w) / h, m02 = c * w;
  const m10 = (d * h) / w, m11 = e, m12 = f * h;
  const m20 = g / w, m21 = hh / h;
  const v = (x, dp = 8) => Number(x.toFixed(dp));
  return `matrix3d(${v(m00)}, ${v(m10)}, 0, ${v(m20, 10)}, ${v(m01)}, ${v(m11)}, 0, ${v(m21, 10)}, 0, 0, 1, 0, ${v(m02, 6)}, ${v(m12, 6)}, 0, 1)`;
}

// THE ONE content-bounds source, shared by the renderer and (via the def) the
// F8 overlay. Derived from the existing alpha scan in measureShadowContent —
// no second scan, no second cache.
function imageContentBounds(img) {
  if (!img || !img.naturalWidth) return null;
  measureShadowContent(img); // no-op when already cached
  const b = shadowContentCache.get(img.src);
  if (!b || !(b.wf > 0) || !(b.hf > 0)) return null;
  return {
    x0: b.cx - b.wf / 2,
    y0: b.cy - b.hf / 2,
    x1: b.cx + b.wf / 2,
    y1: b.cy + b.hf / 2,
    widthFraction: b.wf,
    heightFraction: b.hf,
  };
}

// ONE-TIME LEGACY MIGRATION.
//
// corners written before this change are ELEMENT-normalized; corners are now
// CONTENT-normalized. The conversion needs the sprite's measured alpha bounds,
// which only exist in a browser after decode — so it happens here rather than
// in any sanitizer.
//
//   content = (element - x0) / widthFraction        (and the y equivalent)
//
// UNCLAMPED on purpose: a perspective corner may sit outside the artwork.
//
// If the measurement is unavailable the Prop is LEFT ALONE and rendered with
// its legacy meaning, rather than being reinterpreted — silently corrupting
// authored perspective is the one outcome worth guarding against. It retries
// on the next style pass.
function migratePropCornerSpace(def, el) {
  const t = def && def.transform;
  if (!t || !Array.isArray(t.corners) || t.corners.length !== 4) return true;
  if (t.cornerSpace === "content") return true; // already migrated
  const b = imageContentBounds(el);
  if (!b) {
    if (!def._cornerSpaceWarned) {
      def._cornerSpaceWarned = true;
      console.warn(
        `[prop-transform] ${def.id}: could not measure content bounds; keeping legacy ` +
          "element-space corners and deferring migration."
      );
    }
    return false; // legacy meaning still applies for this pass
  }
  // APPEARANCE-PRESERVING CONVERSION.
  //
  // A plain rebase — (ex - x0)/cw on the raw corners — is WRONG and measurably
  // moved the rug (1.354x scale, ~51px translate). It preserves the ELEMENT
  // box; what must be preserved is where the VISIBLE ART lands.
  //
  //   H_old = homography(unitSquare -> legacy element-space corners)
  //   K_i   = the content rect's corners, in element-normalized coords
  //   Q_i   = H_old(K_i)              where the art actually renders today
  //   C_c   = (Q_i - origin) / size   that same place, content-normalized
  const cw = b.widthFraction, ch = b.heightFraction;
  const Hold = propHomography(t.corners);
  if (!Hold || !(cw > 0) || !(ch > 0)) {
    if (!def._cornerSpaceWarned) {
      def._cornerSpaceWarned = true;
      console.warn(`[prop-transform] ${def.id}: legacy corners are not solvable; migration deferred.`);
    }
    return false; // never partially migrated
  }
  const K = [
    [b.x0, b.y0],
    [b.x0 + cw, b.y0],
    [b.x0 + cw, b.y0 + ch],
    [b.x0, b.y0 + ch],
  ];
  const converted = [];
  for (const [kx, ky] of K) {
    const q = applyPropHomography(Hold, kx, ky);
    if (!q) return false;
    converted.push([
      Number(((q[0] - b.x0) / cw).toFixed(6)),
      Number(((q[1] - b.y0) / ch).toFixed(6)),
    ]);
  }
  t.corners = converted;
  t.cornerSpace = "content";
  return true;
}

// Absent/identity -> the defaults, so callers never branch on null.
function propTransformOf(def) {
  const t = def && def.transform;
  const nz = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 1);
  return {
    scaleX: nz(t && t.scaleX),
    scaleY: nz(t && t.scaleY),
    corners: t && Array.isArray(t.corners) && t.corners.length === 4 ? t.corners : null,
  };
}

function applySceneObjectStyle(def) {
  const el = document.getElementById(`scene-${def.id}`);
  if (el) {
    // Horizontal flip (def.flipX): the renderer's native mirroring —
    // scaleX(-1) around the element's own center — with the anchor fraction
    // mirrored to match, so the sprite stays pinned to the same world point
    // before and after the flip. Scale itself never goes negative: flipX is
    // a separate boolean, exactly displayScaleX = scale × (flipX ? -1 : 1).
    const ax = def.flipX ? 1 - def.anchor.x : def.anchor.x;
    el.style.left = `${def.world.x * 100}%`;
    el.style.top = `${def.world.y * 100}%`;

    // ADVANCED TRANSFORM (Props only; absent on every other kind).
    //
    // FREE SCALE: scaleX widens the element directly. scaleY needs an explicit
    // HEIGHT, which this model never had — height has always fallen out of the
    // image's natural aspect (see the audit). It is written only when scaleY is
    // authored, so an untransformed Prop keeps `height: auto` exactly as before.
    // MIGRATE FIRST. propTransformOf captures the corners array by reference, so
    // reading it before migration would use the stale legacy values for one
    // whole pass and only settle on the next restyle.
    const migrated = def.kind === "prop" ? migratePropCornerSpace(def, el) : true;
    const pt = def.kind === "prop" ? propTransformOf(def) : { scaleX: 1, scaleY: 1, corners: null };
    el.style.width = `${def.width * pt.scaleX * 100}%`;
    if (pt.scaleY !== 1 && el.naturalWidth > 0 && el.naturalHeight > 0) {
      // Natural height as a fraction of the SCENE's height: the element's width
      // is a fraction of scene width, so the aspect conversion carries the
      // 1920:1080 ratio between the two axes.
      const natFrac = (el.naturalHeight / el.naturalWidth) * (1920 / 1080);
      el.style.height = `${def.width * pt.scaleX * natFrac * pt.scaleY * 100}%`;
    } else {
      el.style.height = "";
    }

    // TRANSFORM ORDER MATTERS, and this element already had a transform.
    //
    //   translate(anchor)  positions the sprite so its anchor sits on the world
    //                      point. Must stay FIRST — everything after it is
    //                      expressed relative to that placement.
    //   scaleX(-1)         the existing horizontal flip, unchanged.
    //   matrix3d(...)      the perspective, appended LAST so it warps the
    //                      already-mirrored sprite. Authoring happens against
    //                      what is on screen, so corners must follow the flip
    //                      rather than fight it.
    //
    // offsetWidth/Height are the UNTRANSFORMED layout box (getBoundingClientRect
    // would already include this transform and feed itself). Zero while the
    // image is still decoding — styleObject re-runs on load, so the matrix
    // lands on the next pass rather than being computed from a 0x0 box.
    // A false `migrated` means the measurement was unavailable: the Prop keeps
    // its legacy element-space rendering (bounds omitted) rather than being
    // misread, and migration retries on the next pass.
    const contentBounds = migrated ? imageContentBounds(el) : null;
    let warp = pt.corners
      ? propMatrix3d(pt.corners, el.offsetWidth, el.offsetHeight, contentBounds)
      : "";
    if (pt.corners && !warp && !(el.offsetWidth > 0 && el.offsetHeight > 0)) {
      // The box is still 0x0 because the image has not decoded yet, so there
      // is nothing to conjugate the homography into. Re-apply once the sprite
      // has a real size — without this the perspective silently never lands,
      // since nothing else re-styles a Prop after its initial paint.
      if (!el.dataset.warpPending) {
        el.dataset.warpPending = "1";
        const retry = () => {
          delete el.dataset.warpPending;
          applySceneObjectStyle(def);
        };
        if (el.complete && el.naturalWidth > 0) requestAnimationFrame(retry);
        else el.addEventListener("load", retry, { once: true });
      }
    }
    el.style.transform =
      `translate(${-ax * 100}%, ${-def.anchor.y * 100}%)` +
      (def.flipX ? " scaleX(-1)" : "") +
      (warp ? ` ${warp}` : "");
    // Pivot point for the INDEPENDENT translate/scale/rotate properties
    // (Player Interaction hover effects, below) — defaults to 50%/50% like
    // every element, which would visibly drift a hover SCALE effect's
    // content away from the anchor point for anything not centered there
    // (a bottom-center-anchored prop, almost always). Harmless when nothing
    // sets translate/scale/rotate at all.
    el.style.transformOrigin = `${ax * 100}% ${def.anchor.y * 100}%`;
    // Depth: render layer band + Y-sort within it (see the depth-layers
    // section). def.z survives in the data as a legacy field but no longer
    // drives stacking.
    el.style.zIndex = String(sceneDepthZ(def));
    if (def.kind === "prop") applyPlayerInteractionStyle(def, el);
    else if (def.kind === "npc") applyCharacterPlayerInteractionStyle(def, el);
  }
  // Character Bubble integration (bubble-renderer.js): an active bubble
  // follows its character through THIS one styling path — movement, drag,
  // undo, and editor edits all funnel through applySceneObjectStyle, so no
  // second bubble update loop exists anywhere. Placed here (after the
  // sprite, before the shadow's own early returns) so it runs on every
  // path; a def without an active bubble is a no-op.
  window.__updateCharacterBubbleFor?.(def);
  const sh = document.getElementById(`scene-shadow-${def.id}`);
  if (!sh) return;
  const cfg = shadowConfig(def);

  // Live asset swap (Scene Editor "Browse"): re-point and re-measure.
  // A regenerated Shadow keeps the SAME path, so the browser would happily
  // re-serve the old decode. A per-asset version token (set only by
  // invalidateShadowTexture, dev-only) forces the refetch without ever
  // entering the stored value — the schema still holds a clean project path.
  const version = shadowTextureVersions.get(cfg.asset);
  const wantedSrc = new URL(`/${cfg.asset}${version ? `?v=${version}` : ""}`, location.origin).href;
  if (sh.src !== wantedSrc) {
    delete sh.dataset.missing;
    sh.src = wantedSrc;
  }

  const bounds = shadowContentCache.get(sh.src);
  // Hidden until: enabled, texture loaded & measured, and not missing.
  const renderable = cfg.enabled && bounds && !sh.dataset.missing;
  sh.style.display = renderable ? "" : "none";
  if (!renderable) return;

  // Scale the element so its opaque CONTENT measures width×height scene px,
  // and put the content's center at anchor + offset.
  const elWFrac = cfg.width / 1920 / bounds.wf;
  const elHFrac = cfg.height / 1080 / bounds.hf;
  sh.style.left = `${(def.world.x + cfg.offsetX / 1920) * 100}%`;
  sh.style.top = `${(def.world.y + cfg.offsetY / 1080) * 100}%`;
  sh.style.width = `${elWFrac * 100}%`;
  sh.style.height = `${elHFrac * 100}%`;
  sh.style.transform = `translate(${-bounds.cx * 100}%, ${-bounds.cy * 100}%)`;
  sh.style.opacity = String(cfg.opacity);
  // The parent's own depth, painted just beneath the sprite: same z-index,
  // earlier DOM position (see placeSceneObjects) — never a global layer.
  sh.style.zIndex = String(sceneDepthZ(def));
}

// The shadow child render element — UNIVERSAL to every Scene Object
// (baked cast AND scene-config props alike; never special-cased to a
// particular id or source), always created alongside its parent's sprite
// so Shadow settings survive being toggled on later, regardless of which
// path instantiated the object. Hidden while disabled/unmeasured, inserted
// immediately BEFORE the parent sprite: same z-index + earlier DOM =
// rendered directly beneath it, at the parent's own scene depth.
function ensureShadowElement(def, scene, hotspot) {
  if (document.getElementById(`scene-shadow-${def.id}`)) return;
  const sh = document.createElement("img");
  sh.className = "scene-shadow";
  sh.id = `scene-shadow-${def.id}`;
  sh.alt = "";
  sh.draggable = false;
  sh.style.display = "none"; // until loaded + measured
  sh.addEventListener("load", () => {
    measureShadowContent(sh);
    applySceneObjectStyle(def);
  });
  sh.addEventListener("error", () => {
    // Missing asset: never crash — stop rendering until a valid file is
    // chosen (the Scene Editor surfaces the warning).
    sh.dataset.missing = "1";
    sh.style.display = "none";
    console.warn(`[ui] shadow asset missing: ${shadowConfig(def).asset}`);
  });
  scene.insertBefore(sh, hotspot);
}

function placeSceneObjects() {
  const scene = document.querySelector(".library-scene");
  const hotspot = document.getElementById(BOOK_HOTSPOT_ELEMENT_ID);
  for (const def of SCENE_OBJECTS) {
    // Idempotent: an already-instantiated entity is never duplicated.
    if (document.getElementById(`scene-${def.id}`)) continue;
    ensureShadowElement(def, scene, hotspot);
    const img = document.createElement("img");
    img.className = "scene-object";
    img.id = `scene-${def.id}`;
    img.alt = "";
    img.draggable = false;
    // Re-enables pointer events for NPCs only (props/decor stay click-through
    // — see .scene-object's own comment) so the Idle Controller's hover
    // delegation can detect a character hover at all.
    if (def.kind === "npc") img.dataset.hoverable = "npc";
    img.addEventListener("error", () => {
      console.warn(`[ui] scene object art missing: ${window.ASSETS[def.asset]}`);
      img.remove();
      document.getElementById(`scene-shadow-${def.id}`)?.remove();
    });
    img.src = window.ASSETS[def.asset];
    scene.insertBefore(img, hotspot);
    applySceneObjectStyle(def);
  }
}

// ------------------------------------------------------------- scene props
// Static scene configuration (Scene Props Phase 1): the Classic Library's
// prop list lives in assets/scenes/classic_library.json, NOT hardcoded in
// the renderer — each entry becomes one independent scene object with its
// own element and position. Props render in the same normalized coordinate
// system as everything else (fractions of the 1920×1080 scene art), so they
// scale with the scene and stay aligned through window resizes and
// fullscreen automatically — never viewport-based.
//
// Render order comes from the depth-layer system (sceneDepthZ): optional
// renderLayer band first, then Y-sort by ground line (sortY override for
// props standing on other props) — hotspots stay above every band.
//
// Config entry: { id, asset, x, y, width, z? } — x/y are the sprite
// CONTENT's bottom-center anchor in scene px; width is the rendered content
// width. The content's alpha bbox is measured on load (same rule as every
// other sprite here: transparent canvas padding never shifts placement).
// A ROUTE, not the /assets static mount it used to be. The server resolves the
// Scene per request (src/services/runtimeScene.js), so a configured Default
// Scene's props are what arrive here — a static file could never be resolved.
// It also means SCENE_CONFIG_PATH is honoured, which the static mount ignored.
const SCENE_CONFIG_URL = "/api/scene-config";
const ASSET_REGISTRY_URL = "/assets/asset_registry.json";

// Scene-config props are FULL scene objects: each config entry becomes one
// SCENE_OBJECTS def (source: "scene-config"), rendered through the same
// element/creator/styling path as the cast — one rendering source, no
// hardcoded prop path. This is also what makes them selectable and editable
// in the dev Scene Editor. Extra fields on these defs:
//   instanceId / assetUid — the scene JSON identity + registry reference
//   assetPath             — resolved from the Asset Registry
//   scale (>= 0)          — uniform render scale of the native content
//                           (def.width is derived: scale × native content px)
//   flipX                 — horizontal mirror (see applySceneObjectStyle)

// Content width of the sprite at scale 1, in scene px — set after the alpha
// bbox measurement lands; width derives from it so scale stays the source
// of truth.
function updatePropWidth(def) {
  if (typeof def._nativeContentWpx === "number") {
    def.width = (Math.max(0, def.scale) * def._nativeContentWpx) / 1920;
  }
}

// Resolves once the scene's props are registered in SCENE_OBJECTS (the dev
// Scene Editor waits on this before snapshotting its saved-state baseline).
let scenePropsReady = Promise.resolve();

async function loadSceneProps() {
  let cfg;
  let registry = { assets: [] };
  try {
    const res = await fetch(SCENE_CONFIG_URL);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    cfg = await res.json();
  } catch (err) {
    console.warn(`[ui] scene config unavailable (${SCENE_CONFIG_URL}):`, err.message);
    return;
  }
  try {
    const res = await fetch(ASSET_REGISTRY_URL);
    if (res.ok) registry = await res.json();
  } catch {
    /* registry optional — v1 entries carry their own asset path */
  }
  const byUid = new Map((registry.assets || []).map((a) => [a.asset_uid, a]));

  for (const entry of cfg.objects || []) {
    // v2 entries reference the Asset Registry by immutable uid; v1 entries
    // ({ id, asset, width }) keep working — flipX absent means false, and a
    // v1 width is converted to scale once the content is measured.
    const isV2 = typeof entry?.instance_id === "string" && typeof entry?.asset_uid === "string";
    const id = isV2 ? entry.instance_id : entry?.id;
    const assetPath = isV2 ? byUid.get(entry.asset_uid)?.path : entry?.asset;
    if (!id || !assetPath) {
      if (id) console.warn(`[ui] scene object "${id}": unknown asset_uid ${entry.asset_uid}`);
      continue;
    }
    if (SCENE_OBJECTS.some((d) => d.id === id)) continue; // never duplicate

    const registryEntry = isV2 ? byUid.get(entry.asset_uid) : null;
    const def = {
      id,
      name: id,
      kind: "prop",
      source: "scene-config",
      instanceId: id,
      assetUid: isV2 ? entry.asset_uid : null,
      assetId: registryEntry?.asset_id || null,
      assetPath,
      // Anchor is provisional until the content bbox is measured on load.
      anchor: { x: 0.5, y: 1 },
      world: { x: (Number(entry.x) || 0) / 1920, y: (Number(entry.y) || 0) / 1080 },
      scale: isV2 ? Math.max(0, Number(entry.scale) || 0) : 1,
      flipX: entry.flipX === true,
      _v1width: isV2 ? null : Number(entry.width) || 100,
      width: 0.05, // provisional; recomputed on measure
      z: typeof entry.z === "number" ? entry.z : 1, // legacy — depth comes from sceneDepthZ
      // Depth-layer fields (optional; absent = dynamic Y-sort at the
      // anchor's own ground line — see the depth-layers section).
      ...(Number.isFinite(entry.renderLayer) ? { renderLayer: entry.renderLayer } : {}),
      ...(Number.isFinite(entry.sortY) ? { sortY: entry.sortY } : {}),
      // Collision component (independent of depth — see the collision
      // section). Absent = blocks nothing (compat default).
      ...(entry.collision && typeof entry.collision === "object" ? { collision: { ...entry.collision } } : {}),
      // Interaction Slots — foundation only (see the interaction-slots
      // section above). Absent/empty = no authored slot.
      ...(Array.isArray(entry.interactionSlots) ? { interactionSlots: entry.interactionSlots.map((s) => ({ ...s })) } : {}),
      // Prop Footprint milestone (editor-only foundation — not read by any
      // runtime behavior yet): forward reference to this Prop instance's
      // owned canonical Slot (state.characterSlots). See ownerPropId on the
      // Slot itself, and devtools/scene-editor.js's findOwnedSlot.
      ...(typeof entry.slotId === "string" && entry.slotId.trim() ? { slotId: entry.slotId.trim() } : {}),
      // Ground Projection calibration (editor-only — not read by any
      // runtime behavior yet): a designer-authored offset used ONLY by the
      // owned Slot/Footprint, relative to this Prop's own x/y anchor above.
      // Absent/malformed = 0,0, mathematically a no-op.
      ...(Number.isFinite(entry.groundOffsetX) ? { groundOffsetX: entry.groundOffsetX } : {}),
      ...(Number.isFinite(entry.groundOffsetY) ? { groundOffsetY: entry.groundOffsetY } : {}),
      // Shadow is a UNIVERSAL, independently-toggleable component — read
      // whatever was actually saved (previously this hardcoded {enabled:
      // false} unconditionally, silently reverting a saved-and-reloaded
      // prop's shadow back off every time). No saved block at all still
      // means "off, unconfigured" via the same {enabled:false} default —
      // just no longer clobbering a REAL saved shadow.
      shadow: entry.shadow && typeof entry.shadow === "object" ? { ...entry.shadow } : { enabled: false },
      // Player Interaction (hover effects — see playerInteractionConfig()
      // below and sanitizePlayerInteraction in src/services/sceneConfig.js).
      // Absent = no hover behavior, the compat default for every prop that
      // predates this component. core_book_01 carries the migrated
      // float+glow the old hardcoded #book-hotspot hover CSS used to own —
      // it renders because of THIS data, not because of its id.
      ...(entry.playerInteraction && typeof entry.playerInteraction === "object"
        ? { playerInteraction: { ...entry.playerInteraction, hover: { effects: (entry.playerInteraction.hover?.effects || []).map((e) => ({ ...e })) } } }
        : {}),
      // Advanced transform (free scale + perspective). DEEP-COPIED, corners
      // included: a def must never share a mutable array with the loaded
      // config, or dragging one Prop's corner would silently move a duplicate's
      // too. Absent = no key, which is what keeps every existing Prop on the
      // untransformed rendering path.
      ...(entry.transform && typeof entry.transform === "object"
        ? {
            transform: {
              ...entry.transform,
              ...(Array.isArray(entry.transform.corners)
                ? { corners: entry.transform.corners.map((p) => p.slice()) }
                : {}),
            },
          }
        : {}),
    };
    SCENE_OBJECTS.push(def);
    createSceneObjectElement(def);
  }
}

// Synchronously scans a LOADED <img>'s alpha channel for its opaque content
// bbox, as canvas-fraction {x0,y0,x1,y1} (whole-box fallback if the canvas
// is unreadable, e.g. a cross-origin asset). Shared by every scene object
// creation path that anchors to measured content — bottom-center = the
// object's ground-contact point, whether that's a prop's base or a
// standing character's feet, so callers don't each reimplement the scan.
function measureAlphaContentBounds(img) {
  let c = { x0: 0, y0: 0, x1: 1, y1: 1 };
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) c = { x0: minX / w, y0: minY / h, x1: (maxX + 1) / w, y1: (maxY + 1) / h };
  } catch {
    /* unreadable canvas — whole-box anchoring */
  }
  return c;
}

// Creates the DOM element for one scene-config prop and measures its
// content bbox (anchor = content bottom-center — same rule as everything).
// Also used by the Scene Editor to re-instantiate a prop on undo-delete.
//
// core_book (instance_id "core_book_01") goes through this SAME unmodified
// path like any other prop — it has no special case here. Its spawned <img>
// renders at the SAME fixed spot as the static #book-hotspot button
// (index.html), which is pointer-events:none (style.css) so it never shadows
// this Prop's own hover/click — see the wiring section's delegated click
// listener for how the button stays clickable anyway, and sceneDepthZ() for
// the one place this Prop's own depth is pinned above every band so it never
// renders underneath anything.
function createSceneObjectElement(def) {
  const scene = document.querySelector(".library-scene");
  const hotspot = document.getElementById(BOOK_HOTSPOT_ELEMENT_ID);
  if (document.getElementById(`scene-${def.id}`)) return;
  // Shadow is UNIVERSAL — scene-config props get the same child render
  // element as the baked cast (previously ONLY placeSceneObjects created
  // it, so a prop added through the Props panel never had anywhere for its
  // Shadow settings to actually render, even once enabled).
  ensureShadowElement(def, scene, hotspot);
  ensureAnimationCanvasLayer(def, scene, hotspot);
  const img = document.createElement("img");
  img.className = "scene-object scene-prop";
  img.id = `scene-${def.id}`;
  img.alt = "";
  img.draggable = false;
  img.style.display = "none"; // until measured
  img.addEventListener("load", () => {
    const c = measureAlphaContentBounds(img);
    def.anchor = { x: (c.x0 + c.x1) / 2, y: c.y1 };
    def._contentWFrac = c.x1 - c.x0;
    def._nativeContentWpx = (c.x1 - c.x0) * img.naturalWidth;
    // v1 compat: convert the legacy explicit width into a scale.
    if (def._v1width != null) {
      def.scale = def._v1width / def._nativeContentWpx;
      def._v1width = null;
    }
    updatePropWidth(def);
    applySceneObjectStyle(def);
    img.style.display = "";
  });
  img.addEventListener("error", () => {
    console.warn(`[ui] scene prop art missing: ${def.assetPath}`);
    img.remove();
    document.getElementById(`scene-shadow-${def.id}`)?.remove();
  });
  // Player Interaction's "animation" effect — see applyPlayerInteractionStyle's
  // own comment for why this alone needs real listeners rather than pure CSS.
  // Hover is just ONE of two independent activation sources now — the other
  // is Animation Behavior (assets/behaviors/*.json, dispatched via
  // dispatchSceneBehaviorEvent) — so these listeners only ever update THIS
  // Prop's hoverActive flag and hand off to reconcileAnimationActivation,
  // the one place that actually starts/stops/continues playback for the
  // union of both sources. See reconcileAnimationActivation's own comment
  // (near effectiveAnimationSpeed above) for the continuity/no-restart
  // guarantee and the async-decode token guard — both now live there
  // instead of in a per-listener closure.
  img.addEventListener("pointerenter", () => {
    getActivationState(def.id).hoverActive = true;
    reconcileAnimationActivation(def, img);
  });
  img.addEventListener("pointerleave", () => {
    getActivationState(def.id).hoverActive = false;
    reconcileAnimationActivation(def, img);
  });
  img.src = `/${def.assetPath}`;
  scene.insertBefore(img, hotspot);

  // Prefetch+decode any authored Animation source right away (fire-and-
  // forget, populates gifDecodeCache) rather than waiting for the first real
  // hover — by the time a user actually hovers, decoding has very likely
  // already finished, so playback starts on the very first hover with no
  // visible delay. Harmless no-op when nothing is authored, decoding is
  // unsupported, or the source is still unset.
  const animEffect = playerInteractionConfig(def).hover.effects.find((e) => e.type === "animation" && e.source);
  if (animEffect) getDecodedGifFrames(animEffect.source);
}

// Character Role Roster (Phase 2): creates the DOM element for a
// DYNAMICALLY CREATED Character Scene Object (assigning a Character Asset
// to a Role with no Scene Object yet — see devtools/scene-editor.js's
// createNpcForRole). Deliberately NOT createSceneObjectElement: that
// function's onload handler always calls updatePropWidth, which derives
// width from def.scale/_nativeContentWpx — the scene-config PROP
// convention. Characters use the OTHER existing convention instead (a
// fixed def.width FRACTION, exactly like every baked character/prop) —
// reusing the prop path verbatim would silently NaN a character's width
// the moment its sprite loaded, since a fresh character def has no
// def.scale at all. Anchor measurement (foot-center = bottom-center of the
// opaque content, same rule as everything) is shared via
// measureAlphaContentBounds; only the post-measurement step differs.
function createCharacterSceneElement(def) {
  const scene = document.querySelector(".library-scene");
  const hotspot = document.getElementById(BOOK_HOTSPOT_ELEMENT_ID);
  if (document.getElementById(`scene-${def.id}`)) return;
  ensureShadowElement(def, scene, hotspot); // universal, shared with props/baked cast
  const img = document.createElement("img");
  img.className = "scene-object";
  img.id = `scene-${def.id}`;
  img.alt = "";
  img.draggable = false;
  // Re-enables pointer events (see the .scene-object CSS comment) so the
  // Idle Controller's hover delegation can detect this Character — this
  // creator is ALWAYS an NPC (dynamically materialized via the Character
  // Runtime Bridge), unlike placeSceneObjects()'s mixed NPC/prop loop.
  img.dataset.hoverable = "npc";
  img.style.display = "none"; // until measured
  img.addEventListener("load", () => {
    const c = measureAlphaContentBounds(img);
    def.anchor = { x: (c.x0 + c.x1) / 2, y: c.y1 };
    applySceneObjectStyle(def);
    img.style.display = "";
  });
  img.addEventListener("error", () => {
    console.warn(`[ui] character asset missing: ${def.assetPath}`);
  });
  img.src = `/${def.assetPath}`;
  scene.insertBefore(img, hotspot);
}

// ---------------------------------------------------------------------
// Character Runtime Bridge — the production-safe boundary that lets the
// NORMAL game (not the F8 dev editor) resolve Role -> live Character Scene
// Instance -> Character Asset -> Speech Bubble Mapping, entirely from
// persisted scene data. Read + display ONLY: this never creates, repairs,
// or saves anything (that stays the F8 editor's job — see
// devtools/scene-editor.js's assignCharacterToRole/resolveLiveRoleOccupant,
// which this deliberately does NOT import or depend on). Fetches the SAME
// scene-layout.json shape the dev editor already persists (no second Role
// schema) via the new always-on GET /api/scene-layout, and the SAME
// discovered Character Asset list via GET /api/character-assets.
//
// This applies the FULL scene-layout schema, field for field with
// scene-editor.js's loadSavedLayout — placement, Shadow, Collision, Foot
// Collider, depth (renderLayer/sortY), Interaction Slots, Home/Spawn Slot,
// the scene-level Character Slots and the Scene's zones.
//
// It was once deliberately minimal (world/width/z + identity + bubble),
// which was correct while data/scene-layout.json was per-user local state
// that never shipped: the only client that ever applied a layout was F8, so
// every other component was the editor's business. Once the layout became
// part of the shipped Scene, that scoping silently became the difference
// between what an author sees in F8 and what a player sees — an authored
// Prop override (the podium) was dropped entirely, and every authored Shadow
// fell back to a code default. The two paths must agree about what a Scene
// file means; only the editing capability is dev-only, never the reading.
//
// Still NOT owned here: Prop instances from Scene Config (loadSceneProps),
// and any repair/migration of Role bindings (the editor's job).
// ---------------------------------------------------------------------

const SCENE_LAYOUT_URL = "/api/scene-layout";
const CHARACTER_ASSETS_URL = "/api/character-assets";

// Role Definitions (characterRoles) — read-only, refreshed once per page
// load (Part 17: Role occupancy must never go stale WITHIN a load, but
// there is no live-reload channel yet; a scene reload is a full page
// reload today, which re-fetches everything from scratch — the same
// staleness boundary the rest of this file already has).
let CHARACTER_ROLES = [];
// Discovered Character Assets (displayName, frontImage, sprites,
// speechBubbleMapping, …) — same shape the F8 editor's own
// state.characterAssets holds, fetched from the production-safe alias.
let CHARACTER_ASSETS = [];
function characterAssetById(characterId) {
  return CHARACTER_ASSETS.find((a) => a.characterId === characterId) || null;
}

let characterRuntimeReady = Promise.resolve();

// ------------------------------------------------------- Scene background
// The Scene owns its background (sceneMeta.background — a project-relative
// path under assets/background/, validated server-side by
// services/assetPaths.js). PRODUCTION CODE: it arrives on the always-on
// /api/scene-layout route, is served by the always-on /assets static mount,
// and needs no dev route and no F8 to render.
//
// "" is a real, authored value meaning a deliberately blank Scene — it is not
// a missing setting to be papered over with a default.

// The last reference we tried to show, so the error handler can name the file
// that actually failed rather than a constant.
let sceneBackgroundRef = "";

// Installed ONCE, before any background is applied, so every later assignment
// (initial load, F8 apply, reload) is covered by the same fallback: warn, and
// hide the element so the parchment stage shows instead of a broken-image
// glyph. The saved value is never changed — a disconnected drive must not
// silently erase an author's reference.
function attachSceneBackgroundErrorHandler() {
  const bg = document.getElementById("library-bg");
  if (!bg) return;
  bg.addEventListener("error", () => {
    console.warn(
      `[scene] background image could not be loaded: ${sceneBackgroundRef || "(none)"} — ` +
        "the Scene's saved reference is unchanged; check the file exists under assets/background/."
    );
    bg.style.display = "none";
  });
}

// Applies a Scene background reference to the real scene surface.
// ref === "" (or anything falsy) blanks the Scene deliberately.
function applySceneBackground(ref) {
  const bg = document.getElementById("library-bg");
  if (!bg) return;
  sceneBackgroundRef = typeof ref === "string" ? ref : "";
  if (!sceneBackgroundRef) {
    // A blank Scene, on purpose. removeAttribute (not src = "") because an
    // empty src re-requests the current page URL in some browsers, which
    // would fire a spurious error and log a misleading warning.
    bg.removeAttribute("src");
    bg.style.display = "none";
    return;
  }
  // Stored project-relative; served from the /assets static mount. The leading
  // slash is added HERE and never persisted, so the stored value stays a clean
  // project-relative path.
  bg.style.display = "";
  bg.src = `/${sceneBackgroundRef}`;
}

// Re-reads the Scene and re-applies its background. Exposed for the F8 Map tab
// (which calls it after a successful Save Layout), following the same
// window.__refresh* convention as the other editor→runtime hooks. Harmless in
// production, where nothing ever calls it.
async function refreshSceneBackground() {
  try {
    const res = await fetch(SCENE_LAYOUT_URL);
    if (!res.ok) return;
    const layout = await res.json();
    applySceneBackground(layout?.sceneMeta?.background || "");
  } catch {
    /* transient fetch failure — keep showing whatever is already on screen */
  }
}
window.__refreshSceneBackground = refreshSceneBackground;
// The F8 Map tab previews an unsaved choice through the SAME applier the
// shipped app uses, so the editor and the runtime can never disagree about how
// a reference becomes a rendered background. Dev-only caller; harmless here.
window.__applySceneBackground = applySceneBackground;

// ------------------------------------------------- canonical scene runtime reset
// THE one way to empty the Scene's runtime surfaces. New Scene calls it before
// applying a blank snapshot, and it is the only place that knows what a Scene
// owns at runtime.
//
// WHY IT EXISTS: the editor's applySnapshot() tears down through three
// PARTIAL paths — one for objects present in the snapshot, one for baked
// Characters, one for scene-config Props — and only the last called
// teardownSceneObject(). So a baked Character's sprite was hidden while its
// shadow (a SEPARATE sibling node, see ensureShadowElement) stayed on screen,
// and a baked non-Character Prop — the podium, the only one — matched no loop
// at all and survived whole. Blanking a Scene left the podium, its shadow, and
// four Character shadows behind.
//
// The fix is not to hide those ids: it is to have ONE reset that walks every
// Scene Object uniformly, through the teardown that already handles sprite,
// shadow and animation state together. A future baked object inherits it.
//
// SCOPE: Scene-owned runtime ONLY. It deliberately does not touch the
// Application Shell (the Start Menu background), product config, settings,
// the Vault, Archives, Tutorial or Learn — none of those are Scene data.
function resetSceneRuntime() {
  // 1. Every Scene Object: sprite, shadow and animation/playback state, via
  //    the one teardown that covers all three. Uniform — never per-id.
  for (const def of SCENE_OBJECTS) {
    teardownSceneObject(def.id);
    def.deleted = true;
  }
  // 2. Speech + interaction state keyed by those objects. A bubble or a
  //    pending click animation outlives its sprite otherwise. Bumping each
  //    Role's speech token invalidates any in-flight staggered/idle callback
  //    that still holds a reference to the Scene being torn down.
  cancelClickedDialogue();
  for (const def of SCENE_OBJECTS) window.hideCharacterBubble?.(def.id);
  for (const roleId of [...Object.values(SPEECH_SCHOLAR_ROLE_BY_SLOT), SPEECH_SAGE_ROLE_ID]) {
    bumpRoleSpeechToken(roleId);
  }
  // 3. NPC movement/AI state, so a torn-down Character cannot keep walking.
  for (const id of Object.keys(characterAI)) delete characterAI[id];
  // 4. Scene lights — the overlay layer is Scene-owned, so a blank Scene must
  //    be provably unlit. clearSceneLights() empties the ONE layer rather than
  //    removing it, so repeated resets can never leave a second one behind.
  clearSceneLights();
  // 5. Role occupancy — the live map from Role to Scene Object. Recomputed
  //    from the layout on the next apply; stale entries would otherwise make
  //    a blank Scene still report occupied Roles.
  CHARACTER_ROLES = [];
  return SCENE_OBJECTS.length;
}
window.__resetSceneRuntime = resetSceneRuntime;

// ------------------------------------------------------------ Light System v1
// Scene-owned lights, composited as ONE separate overlay layer.
//
// NOTHING IS BAKED. The background, props, sprites and generated Shadow PNGs
// are never touched — removing this layer restores the unlit Scene exactly.
// That is why it is a sibling element with its own stacking position rather
// than a filter on the scene container.
//
// STACKING (audited): scene objects and their shadows occupy the depth bands
// up to DEPTH_Z_MAX (1,000,000); .book-hotspot sits at 1,000,001; the F8
// editor overlay at 2,000,000. The light layer renders at 1,000,002 — above
// every piece of art, below the editor's own gizmos — and is
// `pointer-events: none`, so NPC clicks, the book hotspot and every F8
// interaction pass straight through it. Y-sort and Render Layer are
// untouched: this layer never participates in depth sorting.
//
// PUBLISH GAP, stated plainly: ALS is still authoring-only (opening one loads
// into the editor's memory, it does not write the runtime files). So a light
// authored in an .als reaches production only once the Scene is published
// through the existing Save Layout path. This renderer is production code and
// reads the same sanitized shape either way, so no second implementation will
// be needed when publishing arrives.
const SCENE_LIGHT_LAYER_ID = "scene-light-layer";

function sceneLightLayer() {
  const scene = document.querySelector(".library-scene");
  if (!scene) return null;
  let layer = document.getElementById(SCENE_LIGHT_LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = SCENE_LIGHT_LAYER_ID;
    layer.className = "scene-light-layer";
    scene.appendChild(layer);
  }
  return layer;
}

function hexToRgbTriplet(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "#ffffff").trim());
  const n = parseInt(m ? m[1] : "ffffff", 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// One CSS background layer per light. Stylized by design: a directional light
// is a linear wash, a point light a radial gradient, a spot light a cone —
// approximations chosen because they read correctly over pixel art and cost
// nothing to composite.
function lightBackgroundLayer(light) {
  const rgb = hexToRgbTriplet(light.color);
  const a = Math.max(0, Math.min(1, light.intensity / 2)); // 0..2 -> 0..1
  if (light.type === "directional") {
    // CSS gradients run TOWARDS their angle; the authored angle is the
    // direction the light travels, so the bright end is the far side.
    return `linear-gradient(${light.angle}deg, rgba(${rgb}, 0) 0%, rgba(${rgb}, ${a * 0.55}) 100%)`;
  }
  const cx = `${light.x * 100}%`;
  const cy = `${light.y * 100}%`;
  if (light.type === "point") {
    // Falloff moves where the gradient starts fading: 0 = hard edge, 1 = soft.
    const core = Math.round((1 - light.falloff) * 100);
    // `ellipse W% H%`, never `circle N%`: a circle's radius must be a LENGTH,
    // so a percentage there is invalid CSS and the browser drops the whole
    // background-image — every other light in the list with it.
    const r = `${light.radius * 100}%`;
    return `radial-gradient(ellipse ${r} ${r} at ${cx} ${cy}, rgba(${rgb}, ${a}) 0%, rgba(${rgb}, ${a * 0.6}) ${core}%, rgba(${rgb}, 0) 100%)`;
  }
  // Spot: a conic wedge masked by a radial reach. Two gradients composited by
  // the browser, no canvas and no per-pixel work.
  const half = light.coneAngle / 2;
  const from = light.angle - half;
  const softDeg = Math.max(1, light.coneAngle * light.falloff * 0.5);
  return (
    `conic-gradient(from ${from}deg at ${cx} ${cy}, ` +
      `rgba(${rgb}, 0) 0deg, rgba(${rgb}, ${a}) ${softDeg}deg, ` +
      `rgba(${rgb}, ${a}) ${Math.max(softDeg, light.coneAngle - softDeg)}deg, rgba(${rgb}, 0) ${light.coneAngle}deg, ` +
      `rgba(${rgb}, 0) 360deg), ` +
    `radial-gradient(ellipse ${light.distance * 100}% ${light.distance * 100}% at ${cx} ${cy}, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`
  );
}

// THE renderer. Idempotent: it rebuilds one layer's style from the given
// array, so repeated loads/resets can never accumulate a second layer.
function applySceneLights(lights) {
  const layer = sceneLightLayer();
  if (!layer) return;
  const active = (Array.isArray(lights) ? lights : []).filter((l) => l && l.enabled !== false);
  if (!active.length) {
    layer.style.backgroundImage = "";
    layer.style.display = "none";
    return;
  }
  layer.style.display = "";
  // Later lights composite over earlier ones; `screen` keeps them additive so
  // two lights brighten rather than the last one winning.
  layer.style.backgroundImage = active.map(lightBackgroundLayer).join(", ");
  layer.style.mixBlendMode = "screen";
}
window.__applySceneLights = applySceneLights;

// ------------------------------------------------- Light Blocker shadows v1
// Fake 2D environmental shadowing. A Light Blocker's geometry is projected
// AWAY from a Directional Light and drawn as a translucent dark shape — no ray
// tracing, no normal maps, no 3D. Visual plausibility is the whole goal: four
// rectangles arranged as a window frame throw a window-shaped pattern, and the
// gaps between them stay open because nothing is drawn there.
//
// STACKING (audited): scene objects compute their z from sceneDepthZ, whose
// lowest value is 10; #library-bg is static. So this layer sits at z-index 5 —
// above the background, BELOW every prop, character and existing ground shadow.
// That is exactly the requested order:
//   background -> projected environment shadows -> ground shadows -> objects
//   -> light overlays -> UI
// It is pointer-events: none, so Y-sort, clicks and F8 overlays are untouched.
const LIGHT_BLOCKER_LAYER_ID = "scene-light-blocker-layer";

function lightBlockerLayer() {
  const scene = document.querySelector(".library-scene");
  if (!scene) return null;
  let layer = document.getElementById(LIGHT_BLOCKER_LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LIGHT_BLOCKER_LAYER_ID;
    layer.className = "scene-light-blocker-layer";
    // Before the background's siblings so it cannot cover a scene object even
    // if a future z-index changes; the z-index is still the real guarantee.
    scene.appendChild(layer);
  }
  return layer;
}

// DIRECTION CONVENTION, stated once and used everywhere: `angle` is the
// direction the light TRAVELS, in degrees, clockwise from "pointing right"
// (0 = →, 90 = ↓, 180 = ←, 270 = ↑). A shadow is therefore thrown ALONG that
// same vector — light from the upper left (315°… i.e. travelling ↘) throws
// shadows down-right. The editor's tooltip says the same thing.
function shadowVector(angleDeg, length) {
  const rad = (angleDeg * Math.PI) / 180;
  return { dx: Math.cos(rad) * length, dy: Math.sin(rad) * length };
}

// One <svg> polygon per blocker: the blocker's own outline plus the same
// outline translated along the shadow vector, joined into the swept hull. For
// a rect that is an exact 6-point sweep; an ellipse is approximated by its
// bounding polygon, which is what "stylized" buys us.
function blockerShadowPolygon(blocker, dx, dy) {
  const pts = blocker.shape === "polygon"
    ? blocker.points.map((p) => [p.x, p.y])
    : (() => {
        const r = blocker.rect;
        return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
      })();
  const moved = pts.map(([x, y]) => [x + dx, y + dy]);
  // Convex hull of both footprints — the swept volume. Points are few, so a
  // gift-wrap is more than fast enough and avoids a geometry dependency.
  const all = [...pts, ...moved];
  return convexHull(all);
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// THE renderer. Idempotent: it rebuilds one layer's contents, so repeated
// loads and resets can never accumulate a second layer or a duplicate shadow.
function applyLightBlockerShadows(lights, blockers) {
  const layer = lightBlockerLayer();
  if (!layer) return;
  const sun = (Array.isArray(lights) ? lights : []).find(
    (l) => l && l.type === "directional" && l.enabled !== false && l.castShadows === true
  );
  const active = (Array.isArray(blockers) ? blockers : []).filter(
    (b) => b && b.enabled !== false && b.blocks?.directional !== false
  );
  // No sun, Cast Shadows off, or nothing to block: nothing is drawn at all.
  if (!sun || !active.length) {
    layer.innerHTML = "";
    layer.style.display = "none";
    return;
  }
  const { dx, dy } = shadowVector(sun.angle, sun.shadowLength);
  const softness = sun.shadowSoftness || 0;
  const parts = active.map((b) => {
    const hull = blockerShadowPolygon(b, dx, dy);
    const pointsAttr = hull.map(([x, y]) => `${(x * 100).toFixed(3)},${(y * 100).toFixed(3)}`).join(" ");
    const alpha = Math.max(0, Math.min(1, sun.shadowStrength * (b.opacity ?? 1)));
    return `<polygon points="${pointsAttr}" fill="rgba(0,0,0,${alpha.toFixed(3)})" />`;
  });
  layer.style.display = "";
  // Softness is a blur on the whole projection layer — a per-blocker blur
  // would need one filter each for no visible gain at these sizes.
  layer.style.filter = softness > 0 ? `blur(${(softness * 2.5).toFixed(2)}px)` : "";
  layer.innerHTML =
    `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">${parts.join("")}</svg>`;
}
window.__applyLightBlockerShadows = applyLightBlockerShadows;

// Removing the layer entirely is what makes "no light" provably unlit, and is
// what the canonical Scene runtime reset uses.
function clearSceneLights() {
  applySceneLights([]);
  applyLightBlockerShadows([], []);
}

// --------------------------------------------------- Start menu background
// The application START SCREEN's art. A SEPARATE concern from the Scene
// background above: separate field, separate document (config/app-shell.json),
// separate route. Entering or switching a Scene never touches it.
//
// PRODUCTION CODE: /api/app-shell is always-on and /assets is always mounted,
// so the shipping start screen renders its authored art with no dev route.
const APP_SHELL_URL = "/api/app-shell";

// Applies a start-menu reference to the start screen.
//
// The art is a CSS custom property, not an <img>, so a 404 is SILENT — the
// browser simply paints nothing and the neutral wood + parchment wash shows
// through. That is already a safe fallback, but a silent one, so the image is
// probed first: a missing file then produces a clear warning AND the same
// neutral fallback, instead of an unexplained blank screen.
function applyStartMenuBackground(ref) {
  const root = document.documentElement.style;
  const clear = () => root.setProperty("--start-bg-url", "none");
  const path = typeof ref === "string" ? ref : "";
  if (!path) {
    // Authored blank, or nothing configured: the neutral wash, on purpose.
    clear();
    return;
  }
  const url = `/${path}`;
  // APPLIED IMMEDIATELY, not after a probe. Waiting for an Image() to load
  // before setting the variable added a second serial round-trip on top of the
  // /api/app-shell fetch, and the pre-load surface was visible for both of
  // them — that was half of the flash on refresh. A background-image pointing
  // at a missing file simply paints nothing, so there is no failure state to
  // protect against here; the probe now only reports the problem.
  root.setProperty("--start-bg-url", `url("${url}")`);
  const probe = new Image();
  probe.onerror = () => {
    console.warn(
      `[app-shell] start menu background could not be loaded: ${path} — ` +
        "the saved reference is unchanged; check the file exists under assets/background/start-menu/."
    );
    clear();
  };
  probe.src = url;
}

// The Start Menu LOGO / SYMBOL and its position.
//
// The wordmark itself is HTML text (.start-title / .start-subtitle) — a
// rasterized wordmark went soft once scaled. This element is the future logo
// that will REPLACE that text, and its authoring pipeline is fully live today.
//
// So when a logo IS configured it takes over from the text, rather than the
// two stacking on top of each other; with none configured (the default) the
// text wordmark is what shows.
function applyStartMenuTitle(shell) {
  const el = document.getElementById("start-title-image");
  if (!el) return;
  const path = typeof shell?.startMenuTitleImage === "string" ? shell.startMenuTitleImage : "";
  const root = document.documentElement.style;
  // X/Y are the image's CENTRE in 1920x1080 canvas pixels (see appShell.js).
  // Stored as percentages so the art keeps its authored spot at any window
  // size instead of drifting with a fixed pixel offset.
  const x = Number.isFinite(Number(shell?.startMenuTitleX)) ? Number(shell.startMenuTitleX) : 960;
  const y = Number.isFinite(Number(shell?.startMenuTitleY)) ? Number(shell.startMenuTitleY) : 300;
  root.setProperty("--start-title-x", `${(x / 1920) * 100}%`);
  root.setProperty("--start-title-y", `${(y / 1080) * 100}%`);

  // The text wordmark yields to a configured logo, and comes back if it is
  // cleared. Only the <h1> — the subtitle is a separate brand statement and
  // keeps its own place under either treatment.
  const wordmark = document.getElementById("start-title");
  if (wordmark) wordmark.hidden = Boolean(path);

  if (!path) {
    el.hidden = true;
    el.removeAttribute("src");
    return;
  }
  el.src = `/${path}`;
  el.hidden = false;
}

// The decorative icon layer. INDEPENDENT of applyStartMenuTitle above: it
// reads its own fields, writes its own element, and — critically — never
// touches #start-title or #start-title-image. Configuring or clearing an icon
// therefore cannot affect whether the built-in wordmark shows, and vice versa.
function applyStartMenuIcon(shell) {
  const el = document.getElementById("start-icon-image");
  if (!el) return;
  const path = typeof shell?.startMenuIcon === "string" ? shell.startMenuIcon : "";
  const root = document.documentElement.style;
  // Same centre-in-canvas-pixels convention as the title image.
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const x = num(shell?.startMenuIconX, 960);
  const y = num(shell?.startMenuIconY, 160);
  const rawScale = Number(shell?.startMenuIconScale);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  root.setProperty("--start-icon-x", `${(x / 1920) * 100}%`);
  root.setProperty("--start-icon-y", `${(y / 1080) * 100}%`);
  root.setProperty("--start-icon-scale", String(scale));

  if (!path) {
    // Hidden AND src-less: an unconfigured icon must not leave a broken-image
    // request behind, and the layout is byte-identical to having no element.
    el.hidden = true;
    el.removeAttribute("src");
    root.removeProperty("--start-icon-w");
    return;
  }
  // "Scale 1 = natural size" is resolved against the canvas, so the natural
  // width has to be measured once the bitmap is known.
  const sizeToCanvas = () => {
    if (!el.naturalWidth) return;
    // vw, not %. The number is unchanged — it has always meant "this fraction
    // of the 1920-wide canvas" — but the icon now sits inside .start-content,
    // where a percentage would resolve against that box instead of the window.
    // vw keeps the authored meaning, and while the icon was positioned against
    // the viewport the two units were numerically identical anyway.
    root.setProperty("--start-icon-w", `${(el.naturalWidth / 1920) * 100}vw`);
  };
  el.onload = sizeToCanvas;
  el.src = `/${path}`;
  el.hidden = false;
  sizeToCanvas(); // already cached — onload will not fire again
}

async function loadStartMenuBackground() {
  try {
    const res = await fetch(APP_SHELL_URL);
    if (!res.ok) return; // leave the neutral pre-load surface showing
    const shell = await res.json();
    applyStartMenuBackground(shell?.startMenuBackground || "");
    applyStartMenuTitle(shell);
    applyStartMenuIcon(shell);
  } catch {
    /* transient failure — the neutral surface is a fine start screen */
  }
}
// F8's Content tab re-applies after writing the file. Dev-only callers.
window.__refreshStartMenuBackground = loadStartMenuBackground;
window.__applyStartMenuBackground = applyStartMenuBackground;
window.__applyStartMenuTitle = applyStartMenuTitle;
window.__applyStartMenuIcon = applyStartMenuIcon;

async function loadCharacterRuntimeData() {
  try {
    const [layoutRes, assetsRes] = await Promise.all([fetch(SCENE_LAYOUT_URL), fetch(CHARACTER_ASSETS_URL)]);
    const layout = layoutRes.ok ? await layoutRes.json() : null;
    const assetsJson = assetsRes.ok ? await assetsRes.json() : null;
    CHARACTER_ASSETS = Array.isArray(assetsJson?.assets) ? assetsJson.assets : [];
    if (!layout) return;
    // The Scene's own background — applied from the layout this function
    // already fetched, so owning the background costs no extra request and no
    // new route. Done before the object loop so the art is on screen as early
    // as possible.
    applySceneBackground(layout?.sceneMeta?.background || "");
    // Scene-owned lights, from the same layout this function already fetched.
    applySceneLights(layout?.lights || []);
    applyLightBlockerShadows(layout?.lights || [], layout?.lightBlockers || []);
    CHARACTER_ROLES = Array.isArray(layout.characterRoles) ? layout.characterRoles : [];
    // Scene-level Character Slots and zones, populated BEFORE the objects loop
    // for the same reason scene-editor.js's loadSavedLayout does it first:
    // Spawn Slot resolution and zone-driven character depth both read them
    // while the loop below styles each object. Production previously left
    // both empty — SCENE_CHARACTER_SLOTS was only ever filled by F8 (plus the
    // core_book_wait fallback), and zones did not exist outside the editor at
    // all, so authored Home/Spawn Slots and Blocking Zones were inert in a
    // shipped run.
    if (Array.isArray(layout.characterSlots)) SCENE_CHARACTER_SLOTS = layout.characterSlots.map((s) => ({ ...s }));
    RUNTIME_ZONES = Array.isArray(layout.zones) ? layout.zones.map((z) => ({ ...z })) : [];
    // Re-run the fallback: replacing the slot array above discards whatever
    // ensureCoreBookWaitSlotFallback registered at bootstrap. Idempotent — a
    // real authored slot with the same slotId always wins.
    ensureCoreBookWaitSlotFallback();

    // NPCs are finalized in a second pass (see below), matching the editor.
    const npcDefs = [];
    for (const saved of layout.objects || []) {
      let def = SCENE_OBJECTS.find((d) => d.id === saved.id);
      // A dynamically-created Character (Character Role Roster) has no
      // code counterpart at all — materialize it fresh, the SAME way the
      // F8 editor's own loadSavedLayout does (createCharacterSceneElement
      // is the shared creator, not reimplemented here).
      if (!def && saved.kind === "npc" && typeof saved.characterId === "string" && typeof saved.assetPath === "string") {
        def = {
          id: saved.id,
          kind: "npc",
          characterId: saved.characterId,
          assetPath: saved.assetPath,
          anchor: { x: 0.5, y: 1 }, // provisional until the content measure lands
          world: { ...saved.world },
          width: saved.width,
          z: typeof saved.z === "number" ? saved.z : 2,
        };
        SCENE_OBJECTS.push(def);
        createCharacterSceneElement(def);
      }
      if (!def) continue;
      const el = document.getElementById(`scene-${def.id}`);
      // A BAKED Character (e.g. Omega) has no code-fallback-free "doesn't
      // exist" state — her removal persists as an explicit deleted:true
      // (see scene-editor.js's bakedObjectsPayload) rather than omission.
      if (saved.deleted === true) {
        def.deleted = true;
        if (el) el.style.display = "none";
        continue;
      }
      def.deleted = false;
      def.world = { ...saved.world };
      if (typeof saved.width === "number") def.width = saved.width;
      if (typeof saved.z === "number") def.z = saved.z;
      // Placement/appearance components. Each is applied ONLY when the saved
      // entry actually carries it, so an object authored before a given field
      // existed keeps its baked code default rather than being cleared —
      // the same conditional semantics scene-editor.js's loadSavedLayout
      // uses, field for field, so the two paths cannot disagree about what a
      // given file means.
      if (Number.isFinite(saved.renderLayer)) def.renderLayer = saved.renderLayer;
      if (Number.isFinite(saved.sortY)) def.sortY = saved.sortY;
      if (saved.shadow) def.shadow = { ...saved.shadow };
      if (saved.collision) def.collision = { ...saved.collision };
      if (saved.footCollider) def.footCollider = { ...saved.footCollider };
      if (Array.isArray(saved.interactionSlots)) def.interactionSlots = saved.interactionSlots.map((s) => ({ ...s }));
      if (typeof saved.slotId === "string") def.slotId = saved.slotId;
      if (Number.isFinite(saved.groundOffsetX)) def.groundOffsetX = saved.groundOffsetX;
      if (Number.isFinite(saved.groundOffsetY)) def.groundOffsetY = saved.groundOffsetY;
      // Home/Spawn Slot: authored destinations the generic NPC bootstrap and
      // return-home behaviour resolve through SCENE_CHARACTER_SLOTS above.
      if (typeof saved.homeSlotId === "string") def.homeSlotId = saved.homeSlotId;
      if (typeof saved.spawnSlotId === "string") def.spawnSlotId = saved.spawnSlotId;
      if (typeof saved.name === "string" && saved.name) def.name = saved.name;
      if (typeof saved.gameplayRole === "string") def.gameplayRole = saved.gameplayRole;
      if (typeof saved.assetId === "string" && saved.assetId) def.assetId = saved.assetId;
      if (saved.movementEnabled === true) def.movementEnabled = true;
      if (typeof saved.characterId === "string") def.characterId = saved.characterId;
      if (typeof saved.assetPath === "string" && saved.assetPath) {
        def.assetPath = saved.assetPath;
        if (el && el.getAttribute("src") !== `/${saved.assetPath}`) el.src = `/${saved.assetPath}`;
      }
      if (saved.bubble) def.bubble = { ...saved.bubble }; // Part 11 — Scene Instance's OWN visual Bubble config
      // Character Player Interaction (Outline / Glow) — a purely visual
      // hover affordance, so it belongs in this minimal applied subset for
      // the same reason `bubble` does: it is Scene Instance presentation,
      // not movement/AI state (which stays deliberately unapplied above).
      // Deep-copied rather than referenced so a later editor edit can never
      // mutate the fetched payload in place. Always-assign (not a guarded
      // `if`) so a Character whose interaction was removed in the editor
      // and re-saved actually loses it on the next load instead of keeping
      // a stale code-side default.
      // Scoped to Characters deliberately: a Prop's hover behaviour is
      // authored in Scene Config (sanitizePlayerInteraction, sceneConfig.js)
      // and applied by loadSceneProps, never here, so an always-assign on
      // this path would clear a Prop's own data from the wrong source.
      if (def.kind === "npc") {
        def.playerInteraction = saved.playerInteraction
          ? { enabled: saved.playerInteraction.enabled === true, hover: { effects: (saved.playerInteraction.hover?.effects || []).map((e) => ({ ...e })) } }
          : undefined;
      }
      if (el) el.style.display = "";
      if (def.kind === "npc") {
        npcDefs.push(def);
        continue; // world/facing finalized + styled in the pass below
      }
      applySceneObjectStyle(def); // re-applies the glow (and everything else) from the freshly-loaded data
    }

    // Canonical Slot precedence — AFTER the loop above, so it also sees any
    // interactionSlots that loop just applied. resolveCharacterSlot() searches
    // Prop-owned interactionSlots BEFORE the scene-level registry, so a
    // CODE-BAKED Prop slot (the podium's "omega_home") silently shadows the
    // authored canonical Slot of the same name — and shadows it with a
    // position derived from the Prop's own anchor, so moving the Prop drags
    // the Character with it. The editor strips exactly these duplicates on
    // load (migrateOrphanedSlotReferences, scene-editor.js: "so it can never
    // shadow the canonical entry's position at runtime again"); the runtime
    // needs the same rule or the two disagree about where a Character stands.
    // Only the DE-DUPLICATION half is mirrored: materializing an orphaned
    // reference into the registry is authoring repair, and stays F8's job.
    for (const def of SCENE_OBJECTS) {
      if (!Array.isArray(def.interactionSlots)) continue;
      def.interactionSlots = def.interactionSlots.filter(
        (s) => !(s.slotId && SCENE_CHARACTER_SLOTS.some((c) => c.slotId === s.slotId))
      );
    }

    // Spawn Slot is the primary source of truth for INITIAL NPC placement and
    // can only be resolved once the scene-level Character Slots (above) and
    // every Prop's interactionSlots (the loop above) are populated — the same
    // ordering, and the same reason, as scene-editor.js's loadSavedLayout.
    //
    // The generic NPC bootstrap in initIdleController() already ran this for
    // the BAKED cast, but it ran BEFORE this fetch resolved: the slot list was
    // still empty, so nothing resolved, and any dynamically-created Character
    // did not exist yet to be seeded at all. Re-running here is idempotent for
    // the baked cast and is the only pass a dynamic Character ever gets.
    for (const def of npcDefs) {
      ensureCharacterAI(def.id);
      const spawn = resolveNpcSpawnPosition(def);
      if (spawn) {
        def.world = { ...spawn.world };
        applyCharacterFacing(def, spawn.facingDirection); // styles as a side effect
      }
      // A saved position that now overlaps a blocker gets relocated before any
      // movement starts — scene load is one of the three moments spawn-safety
      // must run.
      ensureSafeNpcSpawn(def);
      applySceneObjectStyle(def);
    }
  } catch (err) {
    console.warn("[runtime] Character Runtime Bridge unavailable:", err.message);
  }
}

// Production-safe, READ-ONLY live-occupancy resolver (Part 4) — mirrors
// devtools/scene-editor.js's resolveLiveRoleOccupant's exact semantics
// (assigned metadata alone is NEVER proof of "live") but is a fully
// independent implementation reading production's OWN CHARACTER_ROLES/
// SCENE_OBJECTS — never imports, never touches window.__sceneEditor or any
// F8-only state. Never mutates/repairs a stale relationship; that stays
// the editor's job (reconcileRoleBindings).
function resolveRuntimeRoleOccupant(roleId) {
  const role = CHARACTER_ROLES.find((r) => r.roleId === roleId);
  if (!role) return { ok: false, reason: "unknown-role", roleId };
  if (!role.assignedCharacterId) return { ok: false, reason: "unassigned", roleId };
  if (!role.sceneObjectId) return { ok: false, reason: "missing-instance", roleId };
  const sceneObject = SCENE_OBJECTS.find((d) => d.id === role.sceneObjectId);
  if (!sceneObject) return { ok: false, reason: "stale-binding", roleId };
  if (sceneObject.kind !== "npc" || sceneObject.deleted) return { ok: false, reason: "stale-binding", roleId };
  if (sceneObject.characterId !== role.assignedCharacterId) return { ok: false, reason: "stale-binding", roleId };
  const element = document.getElementById(`scene-${sceneObject.id}`);
  if (!element) return { ok: false, reason: "missing-instance", roleId };
  return { ok: true, roleId, characterId: sceneObject.characterId, sceneObjectId: sceneObject.id, sceneObject, element };
}

// ------------------------------------ Speech Bubble Mapping v1 (production)
// Mirrors src/services/bubbleMarkdown.js's exact semantics (Part 7) — public
// scripts here are plain classic <script> tags (no bundler, no ES module
// import), so this is the SAME mirrored-duplication convention already used
// for devtools/scene-editor.js's own copy; test/bubbleMarkdown.test.js keeps
// the canonical service copy honest, and this must never drift from it.
const SPEECH_STATES = ["pre_thinking", "vault_gathering", "scholar_thinking", "scholar_answering", "grand_sage_gathering", "grand_sage_answering", "post_answering", "clicked"];
const BUBBLE_STYLES = ["thought", "dialogue"];
const DEFAULT_BUBBLE_STYLE = {
  pre_thinking: "thought",
  vault_gathering: "thought",
  scholar_thinking: "thought",
  scholar_answering: "dialogue",
  grand_sage_gathering: "thought",
  grand_sage_answering: "dialogue",
  post_answering: "thought",
  clicked: "dialogue",
};

// Per-entry style (later addition, mirrors src/services/bubbleMarkdown.js
// exactly): an optional case-insensitive "[thought]"/"[dialogue]" prefix on
// a line becomes that entry's style and is stripped from its text; an
// unrecognized bracketed prefix (e.g. "[banana] hello") is left as literal
// text, style stays null so DEFAULT_BUBBLE_STYLE[state] applies.
const BUBBLE_STYLE_TAG_RE = /^\[(thought|dialogue)\]\s*/i;
function parseBubbleMarkdown(markdown) {
  const lines = String(markdown ?? "").split(/\r\n|\r|\n/);
  const entries = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] === "#") continue;
    const tagMatch = BUBBLE_STYLE_TAG_RE.exec(line);
    if (tagMatch) entries.push({ style: tagMatch[1].toLowerCase(), text: line.slice(tagMatch[0].length) });
    else entries.push({ style: null, text: line });
  }
  return entries;
}

const BUBBLE_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
function requiredBubbleTokens(text) {
  const set = new Set();
  BUBBLE_TOKEN_RE.lastIndex = 0;
  let m;
  const s = String(text ?? "");
  while ((m = BUBBLE_TOKEN_RE.exec(s))) set.add(m[1]);
  return set;
}
function bubbleTokenAvailable(context, token) {
  const v = context ? context[token] : undefined;
  return v !== undefined && v !== null && v !== "";
}
// Picks the WHOLE {style, text} entry atomically — style is never chosen
// independently from text.
function pickRandomBubbleEntry(entries, context) {
  const list = Array.isArray(entries) ? entries : [];
  const eligible = list.filter((entry) => {
    for (const token of requiredBubbleTokens(entry?.text)) {
      if (!bubbleTokenAvailable(context, token)) return false;
    }
    return true;
  });
  if (!eligible.length) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}
function resolveBubbleTokens(text, context) {
  return String(text ?? "").replace(BUBBLE_TOKEN_RE, (whole, token) => (bubbleTokenAvailable(context, token) ? String(context[token]) : whole));
}
// Mirrors src/services/bubbleMarkdown.js's filterDialogueEntries/
// filterThoughtEntries/pickEntryAvoidingRepeat exactly — used by the Idle
// Controller (see that section) to split PRE THINKING's pool by tag.
function filterDialogueEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e?.style === "dialogue");
}
function filterThoughtEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e?.style !== "dialogue");
}
function pickEntryAvoidingRepeat(entries, context, avoidText) {
  const first = pickRandomBubbleEntry(entries, context);
  if (!first || first.text !== avoidText) return first;
  const alternatives = (Array.isArray(entries) ? entries : []).filter((e) => e.text !== avoidText);
  if (!alternatives.length) return first;
  return pickRandomBubbleEntry(alternatives, context) || first;
}

// ------------------------------------- Unified Character Speech document
// Mirrors src/services/bubbleMarkdown.js's parseCharacterSpeechMarkdown/
// speechDocumentPath/speechDocumentCandidates/resolveSpeechDocument exactly
// (same mirrored-duplication convention already used for the parser above)
// — see that file's own header comment for the full section/heading rules.
const SECTION_HEADING_RE = /^(#{1,6})\s*(.*)$/;
function normalizeSectionHeading(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}
function parseCharacterSpeechMarkdown(markdown, states) {
  const recognized = Array.isArray(states) ? states : SPEECH_STATES;
  const lines = String(markdown ?? "").split(/\r\n|\r|\n/);
  const sections = {};
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const headingMatch = SECTION_HEADING_RE.exec(line);
    if (headingMatch) {
      if (headingMatch[1].length === 2) {
        const normalized = normalizeSectionHeading(headingMatch[2]);
        current = recognized.includes(normalized) ? normalized : null;
      }
      continue;
    }
    if (!current) continue;
    const tagMatch = BUBBLE_STYLE_TAG_RE.exec(line);
    const entry = tagMatch ? { style: tagMatch[1].toLowerCase(), text: line.slice(tagMatch[0].length) } : { style: null, text: line };
    (sections[current] ||= []).push(entry);
  }
  return sections;
}
function speechDocumentPath(speechSet, locale) {
  return `assets/dialogue/bubbles/${speechSet}_${locale}.md`;
}
function speechDocumentCandidates(speechSet, locale) {
  const loc = locale || "en";
  const candidates = [speechDocumentPath(speechSet, loc)];
  if (loc !== "en") candidates.push(speechDocumentPath(speechSet, "en"));
  return candidates;
}
async function resolveSpeechDocument(speechSet, locale, fetchText) {
  if (!speechSet) return null;
  const loc = locale || "en";
  for (const candidatePath of speechDocumentCandidates(speechSet, loc)) {
    const markdown = await fetchText(candidatePath);
    if (markdown !== null && markdown !== undefined) {
      const resolvedLocale = candidatePath === speechDocumentPath(speechSet, loc) ? loc : "en";
      return { path: candidatePath, locale: resolvedLocale, markdown };
    }
  }
  return null;
}
// Fetches a Speech document off the existing static /assets mount —
// resolves `null` (not `{}`/throw) on a 404 or network failure, matching
// resolveSpeechDocument's injected fetchText contract.
async function fetchSpeechDocumentText(path) {
  try {
    const res = await fetch(`/${path}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
// The locale production resolves against (Part 13) — the SAME
// currentConfig.interfaceLanguage already populated by loadStatus(), never
// a hardcoded "_en.md" concatenation scattered separately here.
function currentSpeechLocale() {
  return currentConfig?.interfaceLanguage || "en";
}

// Resolves the pool of {style, text} entries for a Role + speech state —
// the SHARED core both triggerCharacterSpeechState (below) and the Idle
// Controller (ambient PRE THINKING dialogue/hover — see that section) build
// on, so there is only ONE resolution path (Role -> live Character -> Speech
// Set -> locale -> section, with the legacy per-state fallback) rather than
// two competing implementations. Never picks/renders anything itself.
async function resolveRoleSpeechEntries(roleId, stateName, context) {
  if (!SPEECH_STATES.includes(stateName)) return { ok: false, reason: "unknown-state" };
  // Part 15/20 — the ONE authority; assigned metadata alone is never "live".
  // Every resolver failure (unknown role, unassigned, stale binding, missing
  // instance) collapses to the SAME "no-live-character" here — matching the
  // F8 editor's own triggerCharacterSpeechState surface exactly (Part 8:
  // "follow project conventions"), not a new distinct reason per case.
  const occ = resolveRuntimeRoleOccupant(roleId);
  if (!occ.ok) return { ok: false, reason: "no-live-character", roleId };
  const characterId = occ.characterId;
  const asset = characterAssetById(characterId);
  if (!asset) return { ok: false, reason: "no-live-character", roleId, characterId };

  // Before any entry is picked, the only style we can report is the
  // state-level default — the real, authoritative style is the picked
  // entry's own tag, resolved by the caller once one is chosen.
  const defaultStyle = DEFAULT_BUBBLE_STYLE[stateName];

  // Part 13 — enrich only what's already resolved; every other token
  // (current_question, vault_random_title, …) is 100% caller-supplied,
  // never fabricated here.
  const ctx = { ...(context || {}) };
  if (ctx.character_name === undefined && asset.displayName) ctx.character_name = asset.displayName;
  if (ctx.role_name === undefined) {
    const role = CHARACTER_ROLES.find((r) => r.roleId === roleId);
    if (role?.label) ctx.role_name = role.label;
  }

  // Resolution priority (unified Speech Set migration): a Character with a
  // Speech Set configured ALWAYS uses it — the old per-state
  // speechBubbleMapping is completely ignored the moment a Speech Set is
  // present, never partially combined. Only a Character with NO Speech Set
  // falls back to the old per-state mapping, so anything not yet migrated
  // keeps working exactly as before.
  let entries;
  if (asset.speechBubbleSet) {
    const locale = currentSpeechLocale();
    const doc = await resolveSpeechDocument(asset.speechBubbleSet, locale, fetchSpeechDocumentText);
    if (!doc) return { ok: false, reason: "missing-source", roleId, characterId, state: stateName, style: defaultStyle };
    const sections = parseCharacterSpeechMarkdown(doc.markdown);
    entries = sections[stateName] || [];
  } else {
    const entry = (asset.speechBubbleMapping || {})[stateName] || {};
    if (!entry.source) return { ok: false, reason: "no-source", roleId, characterId, state: stateName, style: defaultStyle };
    let markdown;
    try {
      const res = await fetch(`/${entry.source}`);
      if (!res.ok) throw new Error("not found");
      markdown = await res.text();
    } catch {
      return { ok: false, reason: "missing-source", roleId, characterId, state: stateName, style: defaultStyle, source: entry.source };
    }
    entries = parseBubbleMarkdown(markdown);
  }

  return { ok: true, roleId, characterId, occ, asset, entries, ctx, defaultStyle };
}

// Resolves entries from MULTIPLE speech states for the same Role and
// concatenates them into one pool (Conversation Bridge fix, Part 4) — used
// for the Scholar research/thinking window: a fast Vault search can finish
// before its own vault_gathering Bubble is ever meaningfully seen, so the
// visible dialogue during that window may draw from EITHER pool rather
// than demanding a dedicated, easily-skipped vault_gathering moment. Both
// Markdown states/sections stay fully separate on disk (never renamed or
// combined) — only their EFFECTIVE entries are combined here, at pick time.
async function resolveMergedRoleSpeechEntries(roleId, states, context) {
  let base = null;
  let firstFailure = null;
  const merged = [];
  for (const stateName of states) {
    const resolved = await resolveRoleSpeechEntries(roleId, stateName, context);
    if (!resolved.ok) {
      if (!firstFailure) firstFailure = resolved;
      continue;
    }
    if (!base) base = resolved;
    merged.push(...resolved.entries);
  }
  if (!base) return firstFailure || { ok: false, reason: "unknown-state" };
  return { ...base, entries: merged, defaultStyle: DEFAULT_BUBBLE_STYLE[states[0]] };
}

// Picks + shows from an already-resolved entry pool. `guard`, when given,
// is { generation, token } captured by the caller at dispatch time (Part
// 11) — if the session-level generation or this Role's own dispatch token
// has since moved on, this call has been superseded and must NOT touch the
// DOM, even though its own async resolve already completed successfully.
// Undefined guard (the debug hook / direct manual calls) always proceeds.
function pickAndShowFromResolved(resolved, roleId, stateName, guard) {
  if (!resolved.ok) return resolved;
  if (guard && isStaleSpeechDispatch({ generation: guard.generation, currentGeneration: speechGeneration, token: guard.token, currentToken: currentRoleSpeechToken(roleId) })) {
    return { ok: false, reason: "superseded", roleId };
  }
  const { characterId, occ, entries, ctx, defaultStyle } = resolved;
  const picked = pickRandomBubbleEntry(entries, ctx);
  if (picked === null) return { ok: false, reason: "no-eligible-entry", roleId, characterId, state: stateName, style: defaultStyle };
  const style = BUBBLE_STYLES.includes(picked.style) ? picked.style : defaultStyle;
  const text = resolveBubbleTokens(picked.text, ctx);
  showCharacterBubble(occ.sceneObject.id, { type: style, text }); // Part 11 — existing renderer resolves Dialogue/Thought asset from THIS Scene Instance's own def.bubble
  return { ok: true, roleId, characterId, state: stateName, style, text };
}

// THE production-safe runtime entry point (Part 8) — read + display only
// (Part 18): never creates/repairs/saves a Role, Character Asset, Sprite
// Set, or Speech Mapping.
async function triggerCharacterSpeechState({ roleId, state: stateName, context } = {}, guard) {
  const resolved = await resolveRoleSpeechEntries(roleId, stateName, context);
  return pickAndShowFromResolved(resolved, roleId, stateName, guard);
}

// Same as triggerCharacterSpeechState, but merges entries from multiple
// states first (Part 4) — `states[0]` supplies the reported state/style.
async function triggerCharacterSpeechStateMerged(roleId, states, context, guard) {
  const resolved = await resolveMergedRoleSpeechEntries(roleId, states, context);
  return pickAndShowFromResolved(resolved, roleId, states[0], guard);
}

// Part 12 — dev/debug-only manual trigger (never in a production build:
// gated on currentConfig.devTools, the SAME flag maybeLoadSceneEditor()
// above already gates the F8 script tag on — called from the same spot,
// loadStatus(), once currentConfig is actually populated). Deliberately a
// SEPARATE, minimal namespace from window.__sceneEditor — never exposes F8
// editor mutation APIs, only this read+display bridge.
function maybeExposeRuntimeDebugHook() {
  if (!currentConfig?.devTools || window.__aetherRuntime) return;
  window.__aetherRuntime = { resolveRuntimeRoleOccupant, triggerCharacterSpeechState };
  // Idle Controller debug surface — forcePreDialogueProbability defaults to
  // false/absent, so normal probabilistic behavior is completely unaffected
  // unless a developer explicitly flips it from the console. Distinguishes
  // "randomly hasn't fired yet" from "the scheduler never works" without
  // waiting out real chance.
  window.__aetherIdleDebug = { forcePreDialogueProbability: false, idleController };
}

// ============================================================
// Speech Bridge — Conversation lifecycle -> Role speech state
// ============================================================
// Connects the right-side Conversation pipeline (startSessionRun/
// handleEvent below) to the already-complete Speech Bubble runtime above,
// WITHOUT the Conversation code ever knowing a Speech filename, Character
// Asset id, Bubble PNG, or Scene Object id — it only ever names a Role and
// a speech state. This is the ONE place that connects the two systems.
//
// The Conversation pipeline identifies Scholars by fixed SLOT NUMBER
// (scholar1/2/3 — a provider/model assignment, config.scholarSlots) which
// has NO existing connection to the Character Role Roster's Role ids
// (alpha/beta/gamma, scene-layout.json's characterRoles) — these are two
// independent systems today. This table is the ONE place that connection
// is declared; nothing downstream ever hardcodes a Character id. Mirrors
// src/services/speechBridge.js exactly (the canonical, unit-tested copy —
// same mirrored-duplication convention as the rest of this feature; this
// file is a classic script with no module system).
const SPEECH_SCHOLAR_ROLE_BY_SLOT = { 1: "alpha", 2: "beta", 3: "gamma" };
const SPEECH_SAGE_ROLE_ID = "sage";
// Matches the F8 Test preview's own default lifetime (testSpeechBubbleState
// in devtools/scene-editor.js) — the smallest safe MVP auto-hide, since
// production's showCharacterBubble/triggerCharacterSpeechState leave a
// Bubble showing indefinitely otherwise (Part 15).
const SPEECH_BUBBLE_LIFETIME_MS = 4000;

// Conversation Bridge state-flow fixes — timing constants mirror
// src/services/speechBridge.js exactly (same mirrored-duplication
// convention as the Idle Controller section below; that file holds the
// canonical, unit-tested copy of every pure value/helper here).
const STAGGER_MIN_MS = 1000;
const STAGGER_MAX_MS = 3000;
const STAGGER_MIN_SEPARATION_MS = 900;
const GRAND_SAGE_GATHERING_SCHOLAR_REACTION_PROBABILITY = 0.35;
const GRAND_SAGE_GATHERING_SCHOLAR_DELAY_MIN_MS = 1500;
const GRAND_SAGE_GATHERING_SCHOLAR_DELAY_MAX_MS = 4000;
const GRAND_SAGE_ANSWERING_SAGE_DELAY_MIN_MS = 300;
const GRAND_SAGE_ANSWERING_SAGE_DELAY_MAX_MS = 800;
const GRAND_SAGE_ANSWERING_SCHOLAR_REACTION_PROBABILITY = 0.35;
const GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MIN_MS = 2000;
const GRAND_SAGE_ANSWERING_SCHOLAR_DELAY_MAX_MS = 5000;
const HOVER_THOUGHT_MIN_LIFETIME_MS = 30_000;
const HOVER_THOUGHT_MAX_LIFETIME_MS = 60_000;

function randomBetween(min, max, randomFn = Math.random) {
  return min + randomFn() * (max - min);
}
function staggeredDelays(count, opts = {}) {
  const { minMs = STAGGER_MIN_MS, maxMs = STAGGER_MAX_MS, minSeparationMs = STAGGER_MIN_SEPARATION_MS } = opts;
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  const delays = Array.from({ length: n }, () => randomBetween(minMs, maxMs)).sort((a, b) => a - b);
  for (let i = 1; i < delays.length; i++) {
    if (delays[i] - delays[i - 1] < minSeparationMs) delays[i] = delays[i - 1] + minSeparationMs;
  }
  return delays;
}
function filterEligibleByProbability(roleIds, probability) {
  const ids = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  if (probability >= 1) return ids;
  return ids.filter(() => Math.random() < probability);
}
function isStaleSpeechDispatch({ generation, currentGeneration, token, currentToken }) {
  return generation !== currentGeneration || token !== currentToken;
}
function isHoverCacheValid(cacheEntry, now) {
  return Boolean(cacheEntry) && now < cacheEntry.expiresAt;
}
function computeHoverCacheExpiry(now) {
  return now + randomBetween(HOVER_THOUGHT_MIN_LIFETIME_MS, HOVER_THOUGHT_MAX_LIFETIME_MS);
}
// Interface Language hot-switch detection — keyed on interfaceLanguage
// alone, never defaultReplyLanguage (currentSpeechLocale() never reads it, and
// it must go on affecting only the Grand Sage's ruling language). A falsy
// `previous` (the very first config load) is never a "change".
function hasInterfaceLanguageChanged(previous, next) {
  return Boolean(previous) && Boolean(next) && previous !== next;
}

// Speech generation (Part 11) — bumped by every event that must invalidate
// ALL previously scheduled speech callbacks regardless of which Role they
// target: a fresh question submission (idleEnterActive) and Reset
// (performReset/resetIdleController). A staggered dispatch or idle-async
// callback captures this value when it's scheduled and re-checks it right
// before touching a Bubble — never fires a stale reaction into a session
// that has since moved on or been discarded.
let speechGeneration = 0;
function bumpSpeechGeneration() {
  speechGeneration += 1;
  return speechGeneration;
}

// roleId -> monotonic token. Bumped once at the START of every NEW speech
// intent for that Role — an immediate trigger call (triggerRoleSpeech), or
// a staggered dispatch's own moment of firing — so an OLDER pending
// staggered dispatch or auto-hide timer for the SAME Role can recognize
// it's been superseded before it touches a bubble (Part 3/10/11: a stale
// scheduled reaction must never overwrite or clear a newer one — e.g. an
// individual Scholar completing faster than its own staggered "still
// thinking" reaction was due to fire).
const roleSpeechTokens = new Map();
function bumpRoleSpeechToken(roleId) {
  const token = (roleSpeechTokens.get(roleId) || 0) + 1;
  roleSpeechTokens.set(roleId, token);
  return token;
}
function currentRoleSpeechToken(roleId) {
  return roleSpeechTokens.get(roleId) || 0;
}

function scholarRoleIdForSlot(slot) {
  return SPEECH_SCHOLAR_ROLE_BY_SLOT[Number(slot)] || null;
}

function scholarRoleIdForKey(key) {
  return scholarRoleIdForSlot(String(key ?? "").replace("scholar", ""));
}

function sageParticipates(mode) {
  return mode === "council";
}

// Every Scholar Role currently participating in this run, derived from the
// SAME tabAnswers the Discussion tab bar itself is built from (buildTabs) —
// no separate "which roles are running" bookkeeping invented here.
function participatingScholarRoleIds() {
  const slots = Object.values(tabAnswers)
    .filter((e) => e.kind === "scholar")
    .map((e) => e.slot);
  return slots.map((s) => scholarRoleIdForSlot(s)).filter(Boolean);
}

// Schedules a Role's Bubble to auto-hide, guarded by the SAME per-Role
// dispatch token every other speech callback now shares (Part 10/11/16): a
// stale hide can never fire against a bubble a newer trigger already
// replaced. `token`, when given, is the token the caller already bumped for
// this exact dispatch (triggerRoleSpeech) — reused rather than bumped again
// so the show and its own hide-timer stay tied to the SAME ownership epoch.
// Callers with no token of their own (showRoleBubbleWithLifetime, used by
// the Idle Controller's PRE dialogue scheduler) get one bumped here.
function scheduleRoleBubbleAutoHide(roleId, targetId, token) {
  const useToken = token ?? bumpRoleSpeechToken(roleId);
  setTimeout(() => {
    if (currentRoleSpeechToken(roleId) === useToken) hideCharacterBubble(targetId);
  }, SPEECH_BUBBLE_LIFETIME_MS);
}

// Shows a Bubble for `roleId` and applies the same auto-hide guard — used by
// callers that resolve their OWN entry (e.g. the Idle Controller's PRE
// dialogue scheduler) rather than going through triggerCharacterSpeechState
// (which already shows its own Bubble internally).
function showRoleBubbleWithLifetime(roleId, targetId, type, text) {
  showCharacterBubble(targetId, { type, text });
  scheduleRoleBubbleAutoHide(roleId, targetId);
}

// THE central bridge call (Part 20) — every Conversation hook below goes
// through this, never a raw triggerCharacterSpeechState call. Purely
// decorative: a missing Role, unassigned Role, no live Character, no Speech
// Set, or a network failure all resolve to a safe no-op here — the AI
// pipeline always has priority over a Bubble (Part 13/19), so this is never
// awaited by core orchestration in a way that could delay it.
//
// `state` may be a single state name, or (Part 4) an array of state names
// to merge into one pool (e.g. ["scholar_thinking", "vault_gathering"]).
//
// Bumps this Role's dispatch token IMMEDIATELY (synchronously, before the
// resolve/fetch even starts) — establishing "this is now the newest speech
// intent for this Role" right away, so any OLDER pending staggered dispatch
// or auto-hide timer for the same Role recognizes it's been superseded even
// while THIS call is still in flight (Part 3/10/11).
async function triggerRoleSpeech(roleId, state, context) {
  const token = bumpRoleSpeechToken(roleId);
  const generation = speechGeneration;
  const stateLabel = Array.isArray(state) ? state.join("|") : state;
  // Animation Behavior dispatch — see dispatchSceneBehaviorEvent's own
  // comment (near effectiveAnimationSpeed above) for the generic engine
  // this feeds. This function is THE existing centralized place where
  // conversation/speech state transitions are already emitted, so Behavior
  // rides that same single path rather than a second one sprinkled across
  // scholar/provider code. Dispatched for EACH individual state name when
  // `state` is an array-merged pool — never the flattened `stateLabel`
  // string above, which would never match a single-word `rule.when` — and
  // independent of (never gated or delayed by) the speech-bubble outcome
  // below: a Bubble failure must never suppress Prop Behavior, or vice versa.
  for (const s of Array.isArray(state) ? state : [state]) dispatchSceneBehaviorEvent(s);
  try {
    const result = Array.isArray(state)
      ? await triggerCharacterSpeechStateMerged(roleId, state, context, { generation, token })
      : await triggerCharacterSpeechState({ roleId, state, context }, { generation, token });
    console.debug(`[SpeechBridge] ${roleId} → ${stateLabel}`, result.ok ? "ok" : result.reason);
    if (result.ok) scheduleRoleBubbleAutoHide(roleId, result.characterId, token);
    return result;
  } catch (err) {
    // A Bubble decoration must never break the Conversation — log and
    // continue exactly like any other optional no-op result.
    console.debug(`[SpeechBridge] ${roleId} → ${stateLabel} failed (non-critical):`, err.message);
    return { ok: false, reason: "bridge-error" };
  }
}

function triggerScholarSpeech(roleId, state, context) {
  return triggerRoleSpeech(roleId, state, context);
}

function triggerSageSpeech(state, context) {
  return triggerRoleSpeech(SPEECH_SAGE_ROLE_ID, state, context);
}

// Schedules a single Role's speech trigger after `delayMs`, guarded by the
// speech generation (Reset/new session before the delay elapses cancels it
// silently) and a per-Role dispatch token captured AT SCHEDULE time (a
// different, faster trigger for the SAME Role — e.g. an individual Scholar
// completing before its own group reaction was due — supersedes this one;
// it never fires late on top of something newer).
function scheduleRoleSpeech(roleId, state, context, delayMs) {
  const generation = speechGeneration;
  const tokenAtSchedule = currentRoleSpeechToken(roleId);
  setTimeout(() => {
    if (isStaleSpeechDispatch({ generation, currentGeneration: speechGeneration, token: tokenAtSchedule, currentToken: currentRoleSpeechToken(roleId) })) return;
    triggerRoleSpeech(roleId, state, context);
  }, delayMs);
}

// Group version (Part 3): every ELIGIBLE roleId (`probability` independent
// per-role roll, default always-eligible) gets its own randomized delay
// within [minMs, maxMs], nudged so no two land within minSeparationMs of
// each other — avoids exact-simultaneous multi-character bubbles without a
// fixed lockstep cadence. Each dispatch is guarded exactly like
// scheduleRoleSpeech above.
function scheduleStaggeredRoleSpeech(roleIds, state, context, opts = {}) {
  const { probability = 1, minMs, maxMs, minSeparationMs } = opts;
  const ids = filterEligibleByProbability(roleIds, probability);
  if (!ids.length) return;
  const delays = staggeredDelays(ids.length, { minMs, maxMs, minSeparationMs });
  ids.forEach((roleId, i) => scheduleRoleSpeech(roleId, state, context, delays[i]));
}

// Part 6/7 — fired once, synchronously alongside onCoreBookQuestionSubmitted
// (same fire-and-forget convention: the caller never awaits this, the AI
// pipeline starts in parallel). Sage only reacts in Council mode — Single
// mode has no Grand Sage synthesis at all (see runSessionEvents), so a
// waiting/thinking Sage Bubble would misrepresent a Role that isn't actually
// part of this exchange. The Vault's own vault_gathering reaction no longer
// fires HERE (Conversation Bridge fix, Part 4) — a search can resolve
// before a dedicated bubble at submission time would ever be seen; instead
// it's folded into the Scholar research-window pool once the "librarian"
// event actually arrives (see handleEvent below), which stays visible long
// enough to matter and still only fires when Use Vault is genuinely on.
//
// Every eligible Role reacts on its OWN staggered 1-3s delay (Part 3) —
// never all-at-once, which is exactly what "multiple characters react at
// the same time" looked like before this fix.
function emitQuestionSubmittedSpeech(question, mode) {
  const ctx = { current_question: question };
  const roles = participatingScholarRoleIds();
  if (sageParticipates(mode)) roles.push(SPEECH_SAGE_ROLE_ID);
  scheduleStaggeredRoleSpeech(roles, "pre_thinking", ctx);
}

// ============================================================
// Idle Controller — PRE THINKING (persistent idle) / POST THINKING lifecycle
// ============================================================
// PRE THINKING was previously ONLY a reaction to question submission
// (emitQuestionSubmittedSpeech above) — there was no ambient/idle trigger at
// all, so a player who opened the library and never asked anything saw
// nothing. This section adds that missing idle system as ONE small
// controller (never a scattered pile of unrelated setTimeout calls) that
// OWNS: the current mode, last activity time, PRE dialogue rate-limit
// bookkeeping, the POST expiration time, and per-Role "last shown" text to
// avoid immediate repeats.
//
// Mode priority (highest to lowest), enforced structurally, never by a
// competing scheduler: "active" (a Conversation Bridge run is in flight —
// see idleEnterActive/idleEnterPost, called only from startSessionRun) >
// "post" (up to POST_IDLE_DURATION_MS after a session finishes) > "pre"
// (the default/rest state — dialogue scheduling AND hover thoughts both
// live here). While in "active" or "post", the PRE dialogue scheduler and
// hover-thought handler are simply no-ops — never queued, never deferred.
//
// Timing constants mirror src/services/speechBridge.js exactly (the
// canonical, unit-tested copy — same mirrored-duplication convention as the
// rest of this feature; this file is a classic script with no module
// system) — declared ONCE here, never re-hardcoded elsewhere in this file.
const PRE_IDLE_INITIAL_DELAY_MS = 30_000;
const PRE_DIALOGUE_MIN_GAP_MS = 60_000;
const PRE_DIALOGUE_WINDOW_MS = 5 * 60_000;
const PRE_DIALOGUE_MAX_PER_WINDOW = 3;
const POST_IDLE_DURATION_MS = 3 * 60_000;
// How often the controller re-evaluates eligibility — NOT how often a
// dialogue fires (that's gated by the rate limits above plus the
// probability checks below). Frequent enough to feel responsive to a
// freshly-eligible window, infrequent enough to be free.
const IDLE_TICK_MS = 5_000;
// Per-eligible-tick chance of actually firing — keeps triggering "sparse and
// random" (Part 8) rather than firing the instant every rate-limit rule
// allows it. Not a target frequency; the rate limits above remain the hard
// ceiling regardless of how these rolls land.
const PRE_DIALOGUE_TRIGGER_PROBABILITY = 0.12;
const POST_IDLE_TRIGGER_PROBABILITY = 0.08;
// Part 8 — the FIRST possible post-answer reaction waits a randomized
// interval; entering POST must never itself look like an immediate
// multi-character reaction burst (that was the actual post_answering bug —
// see idleEnterPost/maybeTriggerPostIdle below). Additional reactions after
// the first reuse the existing per-tick probability roll, already randomized.
const POST_IDLE_INITIAL_DELAY_MIN_MS = 8_000;
const POST_IDLE_INITIAL_DELAY_MAX_MS = 20_000;
const IDLE_ROLE_IDS = ["sage", "alpha", "beta", "gamma"];

function isPastInitialIdleDelay(lastActivityAt, now) {
  return now - lastActivityAt >= PRE_IDLE_INITIAL_DELAY_MS;
}
function pruneToWindow(timestamps, now, windowMs = PRE_DIALOGUE_WINDOW_MS) {
  return (Array.isArray(timestamps) ? timestamps : []).filter((t) => now - t < windowMs);
}
function isWithinRateLimit(prunedTimestamps, maxPerWindow = PRE_DIALOGUE_MAX_PER_WINDOW) {
  return (Array.isArray(prunedTimestamps) ? prunedTimestamps.length : 0) < maxPerWindow;
}
function hasMinGapPassed(lastAt, now, minGapMs = PRE_DIALOGUE_MIN_GAP_MS) {
  return !lastAt || now - lastAt >= minGapMs;
}
function isPreDialogueEligible({ lastActivityAt, now, preDialogueTimestamps, lastPreDialogueAt }) {
  if (!isPastInitialIdleDelay(lastActivityAt, now)) return false;
  const pruned = pruneToWindow(preDialogueTimestamps, now);
  if (!isWithinRateLimit(pruned)) return false;
  if (!hasMinGapPassed(lastPreDialogueAt, now)) return false;
  return true;
}
function pickIdleRoleId(roleIds, excludeRoleId, randomFn = Math.random) {
  const candidates = (Array.isArray(roleIds) ? roleIds : []).filter((id) => id !== excludeRoleId);
  if (!candidates.length) return null;
  return candidates[Math.floor(randomFn() * candidates.length)];
}

const idleController = {
  mode: "pre", // "pre" | "post" | "active"
  lastActivityAt: Date.now(),
  lastPreDialogueAt: 0,
  preDialogueTimestamps: [],
  postUntil: 0,
  postFirstEligibleAt: 0,
  postRoleIds: [],
  lastPreDialogueTextByRole: new Map(),
  lastPreThoughtTextByRole: new Map(),
  hoverThoughtCache: new Map(), // roleId -> { text, style, expiresAt } — Part 9
  hoverRoleId: null,
  started: false,
};

// Part 4/10 — the Conversation Bridge is the ONLY thing that ever moves the
// controller into "active". Any PRE/POST idle Bubble currently visible must
// yield immediately: hide every fixed Role's Bubble now (the Conversation
// Bridge's own triggers show their own moments later via the normal flow) —
// reusing hideCharacterBubble's existing "no-op if nothing is showing"
// behavior rather than tracking "was an idle bubble visible" separately.
//
// Bumps the speech generation (Part 11) BEFORE anything else — a fresh
// question submission invalidates every previously scheduled idle/staggered
// speech callback, so none of them can land after the session has moved on.
// startSessionRun calls this BEFORE emitQuestionSubmittedSpeech precisely so
// that reaction is scheduled under the NEW generation, not immediately
// invalidated by it.
function idleEnterActive() {
  bumpSpeechGeneration();
  // Active session state is the highest bubble priority: a visible clicked
  // dialogue is cancelled and dismissed cleanly rather than lingering over
  // the run that just started.
  cancelClickedDialogue();
  idleController.mode = "active";
  idleController.hoverRoleId = null;
  for (const roleId of IDLE_ROLE_IDS) {
    const occ = resolveRuntimeRoleOccupant(roleId);
    if (occ.ok) hideCharacterBubble(occ.sceneObject.id);
  }
}

// Part 5 — entered only when a session FULLY finished with real content
// (the caller gates this on the same anyTabOk the post_answering trigger
// itself already uses). `roleIds` are exactly the Roles that participated,
// so POST idle reactions only ever come from Characters that were actually
// part of the just-finished exchange.
//
// Deliberately does NOT bump the speech generation — any still-pending
// staggered grand_sage_answering reaction from the session that JUST
// finished (Part 7: sage first, optional staggered Scholar reactions a few
// seconds later) must still be allowed to land even after POST begins; only
// a genuinely NEW session (idleEnterActive) or Reset invalidates those.
function idleEnterPost(roleIds) {
  idleController.mode = "post";
  const now = Date.now();
  idleController.postUntil = now + POST_IDLE_DURATION_MS;
  idleController.postFirstEligibleAt = now + randomBetween(POST_IDLE_INITIAL_DELAY_MIN_MS, POST_IDLE_INITIAL_DELAY_MAX_MS);
  idleController.postRoleIds = Array.isArray(roleIds) ? roleIds : [];
}

// Back to the normal long-term idle state — reached either after POST
// expires, or directly when a run produced no real content at all (a total
// failure has no "completed session" to retain context from). Deliberately
// does NOT reset lastActivityAt: if the player has genuinely been inactive
// throughout the whole session + POST window, PRE dialogue should be able
// to resume immediately, not wait another artificial 30s.
function idleEnterPre() {
  idleController.mode = "pre";
  idleController.postRoleIds = [];
}

function findRoleIdForSceneObjectId(sceneObjectId) {
  const role = (Array.isArray(CHARACTER_ROLES) ? CHARACTER_ROLES : []).find((r) => r.sceneObjectId === sceneObjectId);
  return role ? role.roleId : null;
}

// The automatic PRE dialogue scheduler (Part 2). Reuses resolveRoleSpeechEntries
// for the SAME resolution path triggerCharacterSpeechState uses, then filters
// to ONLY [dialogue]-tagged entries — [thought] entries (and untagged, which
// already default to "thought" for this state) never fire automatically.
async function triggerPreIdleDialogue(roleId) {
  const generation = speechGeneration;
  try {
    const resolved = await resolveRoleSpeechEntries(roleId, "pre_thinking", {});
    if (!resolved.ok) return;
    // The session state may have changed while this resolve was in flight
    // (a question submitted, or Reset) — an idle dialogue must never land
    // after that (Part 11).
    if (generation !== speechGeneration) return;
    const dialogueEntries = filterDialogueEntries(resolved.entries);
    if (!dialogueEntries.length) return;
    const picked = pickEntryAvoidingRepeat(dialogueEntries, resolved.ctx, idleController.lastPreDialogueTextByRole.get(roleId));
    if (!picked) return;
    const text = resolveBubbleTokens(picked.text, resolved.ctx);
    idleController.lastPreDialogueTextByRole.set(roleId, picked.text);
    showRoleBubbleWithLifetime(roleId, resolved.occ.sceneObject.id, "dialogue", text);
    console.debug(`[IdleController] ${roleId} → pre_thinking (dialogue, auto)`);
  } catch (err) {
    console.debug(`[IdleController] ${roleId} auto PRE dialogue failed (non-critical):`, err.message);
  }
}

function maybeTriggerPreDialogue(now) {
  if (clickedDialogueActive()) return; // clicked dialogue outranks idle dialogue
  if (
    !isPreDialogueEligible({
      lastActivityAt: idleController.lastActivityAt,
      now,
      preDialogueTimestamps: idleController.preDialogueTimestamps,
      lastPreDialogueAt: idleController.lastPreDialogueAt,
    })
  ) {
    return;
  }
  // Keep the rolling window pruned even on ticks that don't fire, so it
  // never grows unbounded across a long-running session.
  idleController.preDialogueTimestamps = pruneToWindow(idleController.preDialogueTimestamps, now);
  // Debug-only escape hatch (window.__aetherIdleDebug.forcePreDialogueProbability
  // — off by default, never changes normal probabilistic behavior on its
  // own) so a real trigger can be proven deterministically without waiting
  // out real chance: "randomly didn't fire yet" vs "the scheduler is broken"
  // are otherwise impossible to tell apart from outside the process.
  if (!window.__aetherIdleDebug?.forcePreDialogueProbability && Math.random() >= PRE_DIALOGUE_TRIGGER_PROBABILITY) return; // eligible, but silence is valid (Part 2/8)
  const roleId = pickIdleRoleId(IDLE_ROLE_IDS, idleController.hoverRoleId);
  if (!roleId) return;
  idleController.lastPreDialogueAt = now;
  idleController.preDialogueTimestamps.push(now);
  triggerPreIdleDialogue(roleId); // fire-and-forget — never blocks the tick loop
}

// POST idle re-triggers reuse the EXISTING post_answering state/content
// wholesale (Part 5: "preserve existing POST semantics", "existing POST
// content may trigger probabilistically") — no tag-pool split here, unlike
// PRE. Goes through the same triggerRoleSpeech the Conversation Bridge uses,
// so it shares its auto-hide token guard.
async function triggerPostIdleReaction(roleId) {
  const result = await triggerRoleSpeech(roleId, "post_answering", {});
  console.debug(`[IdleController] ${roleId} → post_answering (idle re-trigger)`, result.ok ? "ok" : result.reason);
}

function maybeTriggerPostIdle(now) {
  if (clickedDialogueActive()) return; // clicked dialogue outranks idle dialogue
  // Part 8 — the FIRST possible reaction waits a randomized 8-20s from the
  // moment POST began; entering POST must never itself read as an instant
  // multi-character burst.
  if (now < idleController.postFirstEligibleAt) return;
  if (Math.random() >= POST_IDLE_TRIGGER_PROBABILITY) return;
  const roleId = pickIdleRoleId(idleController.postRoleIds, idleController.hoverRoleId);
  if (!roleId) return;
  triggerPostIdleReaction(roleId); // fire-and-forget
}

function idleTick() {
  const now = Date.now();
  if (idleController.mode === "active") return; // the Conversation Bridge owns everything right now
  if (idleController.mode === "post") {
    if (now >= idleController.postUntil) {
      idleEnterPre();
      return;
    }
    maybeTriggerPostIdle(now);
    return;
  }
  maybeTriggerPreDialogue(now);
}

// Hover thoughts (Part 3/9) — PRE THINKING only; active/post own the Bubble
// during their own windows, so hover never interrupts either (the same
// conservative reading Part 4 asks for: hover must never override an active
// session's own state). Hidden immediately on hover-leave.
//
// Each Role keeps its FIRST-picked line cached for a randomized 30-60s
// lifetime (idleController.hoverThoughtCache) — a repeated hover (leave then
// re-enter) within that lifetime shows the SAME cached line, never rerolls
// it; hiding the bubble does not touch the cache. Only after the cached
// entry expires does the next hover pick (and cache) a new one.
async function showHoverThought(roleId) {
  // Clicked dialogue outranks hover, and a just-clicked Role stays suppressed
  // until the pointer leaves and re-enters it (see canShowHoverThought).
  if (!canShowHoverThought({ idleMode: idleController.mode, clickedRoleId: npcClickState.roleId, suppressedRoleId: npcClickState.suppressedHoverRoleId, roleId })) return;
  const now = Date.now();
  const cached = idleController.hoverThoughtCache.get(roleId);
  if (isHoverCacheValid(cached, now)) {
    const occ = resolveRuntimeRoleOccupant(roleId);
    if (occ.ok) showCharacterBubble(occ.sceneObject.id, { type: cached.style, text: cached.text });
    return;
  }
  try {
    const resolved = await resolveRoleSpeechEntries(roleId, "pre_thinking", {});
    if (!resolved.ok) return;
    // The session state (or the hover target itself) may have changed while
    // this resolve was in flight — never show/cache a thought that's no
    // longer current.
    if (!canShowHoverThought({ idleMode: idleController.mode, clickedRoleId: npcClickState.roleId, suppressedRoleId: npcClickState.suppressedHoverRoleId, roleId })) return;
    const thoughtEntries = filterThoughtEntries(resolved.entries);
    if (!thoughtEntries.length) return;
    if (idleController.hoverRoleId !== roleId) return;
    const picked = pickEntryAvoidingRepeat(thoughtEntries, resolved.ctx, idleController.lastPreThoughtTextByRole.get(roleId));
    if (!picked) return;
    const text = resolveBubbleTokens(picked.text, resolved.ctx);
    idleController.lastPreThoughtTextByRole.set(roleId, picked.text);
    idleController.hoverThoughtCache.set(roleId, { text, style: "thought", expiresAt: computeHoverCacheExpiry(now) });
    showCharacterBubble(resolved.occ.sceneObject.id, { type: "thought", text }); // no auto-hide timer — hover-leave hides it
    console.debug(`[IdleController] ${roleId} → pre_thinking (thought, hover, new pick)`);
  } catch (err) {
    console.debug(`[IdleController] ${roleId} hover thought failed (non-critical):`, err.message);
  }
}

// ------------------------------------------------- clickable NPC interaction
// Mirrors src/services/npcInteraction.js (same no-import constraint as every
// other mirrored block in this file); that module is the tested source of
// truth for the timings, the priority order, and both decision functions.
const NPC_CLICK_ANIMATION_MS = 200;
const NPC_CLICK_SCALE = 1.03;
const CLICKED_DIALOGUE_VISIBLE_MS = 1800;
const CLICKED_DIALOGUE_FADE_MS = 250;

// ONE central record of the clicked-dialogue bubble — never a per-NPC timer.
// `token` is bumped on every new click so an older hold/fade callback can
// recognise it has been superseded, the same ownership-epoch pattern
// roleSpeechTokens already uses for speech dispatches.
const npcClickState = {
  roleId: null,
  sceneObjectId: null,
  token: 0,
  holdTimer: null,
  fadeTimer: null,
  // The Role whose hover thought stays suppressed until the pointer leaves
  // it and comes back (cleared in the pointerout handler below).
  suppressedHoverRoleId: null,
};

function clickedDialogueActive() {
  return Boolean(npcClickState.roleId);
}

function canShowHoverThought({ idleMode, clickedRoleId, suppressedRoleId, roleId }) {
  if (idleMode !== "pre") return false;
  if (clickedRoleId) return false;
  if (suppressedRoleId && suppressedRoleId === roleId) return false;
  return true;
}

function scholarSlotByRole(scholarRoleBySlot) {
  const out = {};
  for (const [slot, roleId] of Object.entries(scholarRoleBySlot || {})) {
    const n = Number(slot);
    if (roleId && Number.isFinite(n)) out[roleId] = n;
  }
  return out;
}

// Reuses the EXISTING authoritative Role tables (SPEECH_SCHOLAR_ROLE_BY_SLOT
// / SPEECH_SAGE_ROLE_ID) rather than declaring a second Alpha/Beta/Gamma/
// Omega mapping — see npcInteraction.js's header.
function npcClickIntent(roleId) {
  if (!roleId) return null;
  if (roleId === SPEECH_SAGE_ROLE_ID) return { mode: "council", slot: null };
  const slot = scholarSlotByRole(SPEECH_SCHOLAR_ROLE_BY_SLOT)[roleId];
  if (slot === undefined) return null;
  return { mode: "single", slot };
}

// The subtle acknowledgement pop.
//
// A plain CSS class cannot be used here: applySceneObjectStyle writes the
// element's full transform as an INLINE style — `translate(-ax%, -ay%)` plus
// `scaleX(-1)` for a flipped sprite — with transformOrigin pinned to the
// Character's anchor. Any class-level transform would replace that whole
// string, dropping the position and the horizontal flip. So the current
// inline transform is read and each keyframe is built ON TOP of it, and the
// animation is left with the default `fill: "none"` so the element reverts
// to exactly that inline value when it ends. Because transformOrigin is the
// anchor (foot-centre for a Character), the scale grows from the feet: no
// layout shift, no positional drift, and appending a uniform scale after
// scaleX(-1) preserves the mirror.
function playNpcClickAnimation(sceneObjectId) {
  const el = document.getElementById(`scene-${sceneObjectId}`);
  if (!el || typeof el.animate !== "function") return; // no element, or no WAAPI — silently skip
  const base = el.style.transform || "";
  try {
    el.animate(
      [
        { transform: `${base} scale(1)` },
        { transform: `${base} scale(${NPC_CLICK_SCALE})`, offset: 0.5 },
        { transform: `${base} scale(1)` },
      ],
      { duration: NPC_CLICK_ANIMATION_MS, easing: "ease-out" }
    );
  } catch {
    // Purely decorative — a rejected keyframe must never break the click.
  }
}

// Clears the clicked-dialogue state and its timers. `hide` false is used by
// the fade path, which has already removed the bubble itself.
function cancelClickedDialogue({ hide = true } = {}) {
  clearTimeout(npcClickState.holdTimer);
  clearTimeout(npcClickState.fadeTimer);
  npcClickState.holdTimer = null;
  npcClickState.fadeTimer = null;
  const targetId = npcClickState.sceneObjectId;
  npcClickState.roleId = null;
  npcClickState.sceneObjectId = null;
  npcClickState.token += 1; // any in-flight hold/fade/resolve is now stale
  if (hide && targetId) hideCharacterBubble(targetId);
}

function clickedBubbleElement(sceneObjectId) {
  return document.querySelector(`#bubble-layer [data-character="${CSS.escape(sceneObjectId)}"]`);
}

// Hold fully visible for CLICKED_DIALOGUE_VISIBLE_MS, then fade over
// CLICKED_DIALOGUE_FADE_MS before the bubble is actually removed. Both
// stages are guarded by the token captured when this dialogue was shown.
function scheduleClickedDialogueDismissal(token) {
  npcClickState.holdTimer = setTimeout(() => {
    if (npcClickState.token !== token) return;
    const targetId = npcClickState.sceneObjectId;
    clickedBubbleElement(targetId)?.classList.add("is-fading-out");
    npcClickState.fadeTimer = setTimeout(() => {
      if (npcClickState.token !== token) return;
      hideCharacterBubble(targetId);
      cancelClickedDialogue({ hide: false });
    }, CLICKED_DIALOGUE_FADE_MS);
  }, CLICKED_DIALOGUE_VISIBLE_MS);
}

// Resolves ONE random [dialogue] line from this Character's `## CLICKED`
// section through the existing Speech Set pipeline (resolveRoleSpeechEntries
// -> pickRandomBubbleEntry -> resolveBubbleTokens) and shows it in the
// existing bubble renderer. A Character with no CLICKED section, an empty
// one, or no live Character at all resolves to a quiet no-op — the mode
// switch and input focus have already happened by then, so they are never
// blocked by missing content.
async function showClickedDialogue(roleId) {
  const token = npcClickState.token;
  try {
    const resolved = await resolveRoleSpeechEntries(roleId, "clicked", {});
    if (!resolved.ok) return;
    if (npcClickState.token !== token) return; // superseded while resolving
    const picked = pickRandomBubbleEntry(resolved.entries, resolved.ctx);
    if (!picked) return; // section present but empty / nothing eligible — no empty bubble
    const text = resolveBubbleTokens(picked.text, resolved.ctx);
    if (!text) return;
    const targetId = resolved.occ.sceneObject.id;
    // Owns this Role's speech epoch now, so an older auto-hide timer from an
    // idle/session bubble cannot cut this one short.
    bumpRoleSpeechToken(roleId);
    npcClickState.roleId = roleId;
    npcClickState.sceneObjectId = targetId;
    showCharacterBubble(targetId, { type: picked.style || DEFAULT_BUBBLE_STYLE.clicked, text });
    // A reused bubble element may still carry the previous fade class.
    clickedBubbleElement(targetId)?.classList.remove("is-fading-out");
    scheduleClickedDialogueDismissal(token);
    console.debug(`[NpcClick] ${roleId} → clicked`);
  } catch (err) {
    console.debug(`[NpcClick] ${roleId} clicked dialogue failed (non-critical):`, err.message);
  }
}

// Omega's click convenes the WHOLE council: every currently eligible Scholar
// becomes selected, using the same predicate buildScholarPicker applies for
// its own Council default — so an unavailable Scholar (provider disabled, or
// no API key) is never switched on by this, and its chip stays disabled.
//
// Deliberately NOT part of setMode(): manually switching to Council through
// the Mode toggle keeps its existing behaviour of leaving the current
// selection alone. This is Omega-click-specific.
//
// If nothing is eligible the current selection is left untouched rather than
// emptied — mirroring toggleScholar's own "never drop to zero" instinct, so a
// misconfigured setup can't silently clear the picker.
function applyCouncilEligibleSelection() {
  const eligible = councilEligibleSlots();
  if (!eligible.length) return;
  selectedSlots.clear();
  for (const slot of eligible) selectedSlots.add(slot);
  syncScholarChips();
  // Same tail as toggleScholar: the chip rows may rewrap, which changes
  // .ask-controls' measured height and therefore the divider floor.
  reclampWorkspaceSplit();
}

// The one entry point for a Character click.
//
// Order matters: the mode switch and focus happen SYNCHRONOUSLY and first,
// so they are never delayed by (or dependent on) the dialogue resolving.
// The bubble then lives its own 3s life independently.
function handleNpcClick(roleId, sceneObjectId) {
  // 1-2. Any pending or visible hover thought for this (or any) Character
  // yields immediately, and hover stays suppressed for this Role until the
  // pointer leaves and re-enters it.
  cancelClickedDialogue(); // also bumps the token, invalidating an in-flight hover/clicked resolve
  if (idleController.hoverRoleId) {
    const occ = resolveRuntimeRoleOccupant(idleController.hoverRoleId);
    if (occ.ok) hideCharacterBubble(occ.sceneObject.id);
  }
  hideCharacterBubble(sceneObjectId);
  npcClickState.suppressedHoverRoleId = roleId;

  // 3. Subtle acknowledgement.
  playNpcClickAnimation(sceneObjectId);

  // 4-5. Conversation target + focus, immediately. Routed through the SAME
  // setMode/toggleScholar the Mode toggle and Scholar chips already use, so
  // a locked Session, the single-mode radio rule, and the chip sync all keep
  // behaving exactly as they do for a manual click.
  const intent = npcClickIntent(roleId);
  if (intent) {
    setMode(intent.mode);
    if (intent.slot !== null) toggleScholar(intent.slot);
    else applyCouncilEligibleSelection();
    els.question.focus();
  }

  // 6-8. Fire-and-forget: the bubble's own lifetime is independent.
  showClickedDialogue(roleId);
}

// Click delegation, mounted on the same stable scene container the hover
// delegation uses. CAPTURE phase deliberately: `.library-scene` already has
// a bubble-phase click listener (the Core Book hotspot's fixed-region test),
// and a Character standing within that region would otherwise trigger BOTH
// this and the Mode modal from one click. Running in capture lets a genuine
// Character click stop there; a click anywhere else in the scene is left
// completely untouched, so the Core Book keeps working exactly as before.
function attachNpcClickDelegation() {
  const scene = document.querySelector(".library-scene");
  if (!scene) return;
  scene.addEventListener(
    "click",
    (event) => {
      // The existing runtime-vs-authoring guard (same check the Core Book
      // hotspot listener uses): while F8 is open its own overlay owns every
      // pointer interaction, so runtime click behaviour steps aside entirely
      // and editor selection/manipulation is unaffected.
      if (window.__sceneEditor?.state?.active) return;
      const el = event.target.closest('[id^="scene-"]');
      if (!el) return;
      // Only real Characters: a Prop has no Role, so findRoleIdForSceneObjectId
      // returns null and this feature never makes props clickable.
      const sceneObjectId = el.id.slice("scene-".length);
      const roleId = findRoleIdForSceneObjectId(sceneObjectId);
      if (!roleId) return;
      event.stopPropagation();
      handleNpcClick(roleId, sceneObjectId);
    },
    true
  );
}

// Event delegation on the stable scene container — ONE listener pair covers
// every current AND future character element (Add/Remove/Replace/Move never
// need a re-attach), matching "reuse an existing centralized tracker rather
// than adding duplicate listeners" in spirit even though no prior tracker
// existed to reuse.
//
// Both handlers are gated on mode === "pre" FIRST (Part 9/10) — hover must
// only ever drive a Bubble during ambient idle. Without this gate, hovering
// a Character during an active/post session would still set hoverRoleId,
// and the LATER pointerout (mouse leaving) would then unconditionally call
// hideCharacterBubble — silently cutting short whatever real state-triggered
// Bubble (scholar_answering, grand_sage_answering, …) was showing at the
// time, well before its own auto-hide lifetime. This was the exact
// mechanism behind "one observed long line disappeared almost immediately."
function attachCharacterHoverDelegation() {
  const scene = document.querySelector(".library-scene");
  if (!scene) return;
  scene.addEventListener(
    "pointerover",
    (event) => {
      if (idleController.mode !== "pre") return;
      const el = event.target.closest('[id^="scene-"]');
      if (!el) return;
      const sceneObjectId = el.id.slice("scene-".length);
      const roleId = findRoleIdForSceneObjectId(sceneObjectId);
      if (!roleId || roleId === idleController.hoverRoleId) return;
      idleController.hoverRoleId = roleId;
      showHoverThought(roleId);
    },
    { passive: true }
  );
  scene.addEventListener(
    "pointerout",
    (event) => {
      if (idleController.mode !== "pre") return;
      const el = event.target.closest('[id^="scene-"]');
      if (!el) return;
      if (el.contains(event.relatedTarget)) return; // still inside the same element
      const sceneObjectId = el.id.slice("scene-".length);
      const roleId = findRoleIdForSceneObjectId(sceneObjectId);
      if (!roleId || roleId !== idleController.hoverRoleId) return;
      idleController.hoverRoleId = null;
      // The pointer has genuinely left this Character: a later re-entry is
      // allowed to show a hover thought again.
      if (npcClickState.suppressedHoverRoleId === roleId) npcClickState.suppressedHoverRoleId = null;
      // A mouseleave must never dismiss clicked dialogue — it owns the bubble
      // until its own timer expires.
      if (npcClickState.sceneObjectId === sceneObjectId) return;
      hideCharacterBubble(sceneObjectId);
    },
    { passive: true }
  );
}

// Part 1 — "as soon as the library/game scene becomes active, start
// tracking user inactivity" — called from enterLibrary(). Guarded so a
// second enterLibrary() call (unlikely, but cheap to guard) never installs
// duplicate listeners or a second tick interval.
function initIdleController() {
  if (idleController.started) return;
  idleController.started = true;
  idleController.lastActivityAt = Date.now();
  const markActivity = () => {
    idleController.lastActivityAt = Date.now();
  };
  for (const type of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) {
    document.addEventListener(type, markActivity, { passive: true });
  }
  setInterval(idleTick, IDLE_TICK_MS);
  attachCharacterHoverDelegation();
  attachNpcClickDelegation();
}

// Apply the central asset map (assets.js): the CSS-consumed art URLs. Art
// paths live ONLY in window.ASSETS — never duplicated across components.
//
// The LIBRARY background is NOT applied here any more. It belongs to the Scene
// (sceneMeta.background) and arrives with the layout — see
// applySceneBackground() and its call in loadCharacterRuntimeData(). Only the
// error handler is installed at this point, so a background applied later
// always has it attached.
{
  attachSceneBackgroundErrorHandler();
  // The START MENU background and title art are authored too, in their own
  // document — fetched here rather than read from a constant. Until it
  // resolves, --start-bg-base (a neutral near-black) is what shows: the old
  // warm --wood-dark base under the removed parchment wash is precisely what
  // flashed as "yellow" for the duration of this fetch on every refresh.
  loadStartMenuBackground();
  // --core-book-url (and window.ASSETS.coreBook, assets.js) were removed
  // along with the old .book-sprite ghost-book layer — core_book_01 (a real
  // Scene Object) is the book's only remaining visual now.

  // Generic NPC bootstrap (Section 1; Spawn Slot is now the primary source
  // of truth per Section 5) — every kind:"npc" Scene Object, not just Omega:
  // resolve its authored SPAWN slot (sourced through slotId resolution so a
  // podium/prop edit is reflected automatically; falls back to whatever
  // world position is already baked on the object if nothing resolves),
  // THEN run spawn-safety BEFORE any movement starts. Home Slot is a
  // separate concept (wandering/return-home reference) and is deliberately
  // NOT consulted here — see resolveNpcSpawnPosition and
  // __onSceneEditorActiveChange. ensureCharacterAI seeds the generic AI
  // state map.
  for (const npc of SCENE_OBJECTS) {
    if (npc.kind !== "npc") continue;
    ensureCharacterAI(npc.id);
    const spawn = resolveNpcSpawnPosition(npc);
    if (spawn) {
      npc.world = { ...spawn.world };
      npc.facing = spawn.facingDirection;
      if (spawn.facingDirection === "left") npc.flipX = true;
      else if (spawn.facingDirection === "right") npc.flipX = false;
    }
    ensureSafeNpcSpawn(npc); // may relocate npc.world again if the resolved spot is unsafe
  }
  ensureCoreBookWaitSlotFallback(); // Section 6: never leave core_book_wait unresolvable

  placeSceneObjects();
  scenePropsReady = loadSceneProps();
  characterRuntimeReady = loadCharacterRuntimeData();
}

// Save to Vault stays hidden until a session holds a valid answer.
els.header.save.hidden = true;
els.header.save.disabled = true;

els.run.addEventListener("click", handleSend);
els.header.save.addEventListener("click", saveToVault);
els.header.reset.addEventListener("click", resetSession);
// The lost-Session panel's own "Start a New Session" — deliberately the same
// performReset() the header's Reset ends at, not a second teardown path. It
// skips the confirm dialog because there is nothing left on the server to
// discard: the Session is already gone, and the panel says so.
els.sessionLost.resetBtn.addEventListener("click", () => performReset());
// Notices a server restart that happened while this tab was in the background
// — the "left the window open for a long time" case.
initSessionLivenessWatch();
els.attachmentPreview.close.addEventListener("click", () => els.attachmentPreview.dialog.close());
els.resetConfirm.cancel.addEventListener("click", () => els.resetConfirm.dialog.close());
els.resetConfirm.confirm.addEventListener("click", () => {
  els.resetConfirm.dialog.close();
  performReset();
});
els.copyAnswer.addEventListener("click", async () => {
  const entry = tabAnswers[activeTab];
  if (!entry || entry.status !== "ok" || !entry.text) return;
  if (await copyTextToClipboard(entry.text)) flashCopied(els.copyAnswer);
});

for (const btn of els.modeToggle.querySelectorAll(".mode-btn")) {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
}
els.useVaultToggle.addEventListener("change", updateUseVaultHint);

// The one persistent input: Enter sends (first question or a follow-up,
// whichever the Session's current state calls for — see handleSend()),
// Shift+Enter inserts a newline. isComposing keeps Enter usable for IME
// candidate confirmation (zh-TW input).
els.question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    handleSend();
  }
});

// Draft Autosave (Batch C). Passive: `input` fires after the textarea has
// already updated, so normal typing, IME composition, paste, undo and
// autosize behave exactly as before — nothing here reads, blocks, or
// rewrites the value.
els.question.addEventListener("input", scheduleDraftSave);
// The debounce is what makes a refresh mid-sentence lossless: both of these
// flush the pending write while the page is still alive. `pagehide` covers
// reload/close/navigation; `visibilitychange` covers the cases where a
// mobile or backgrounded tab is discarded without ever firing `pagehide`.
window.addEventListener("pagehide", flushDraftSave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraftSave();
});

els.settings.open.addEventListener("click", () => {
  // The tooltip has served its purpose once Settings is open; the highlight
  // stays until a provider actually exists.
  noteAiSetupSettingsOpened();
  openSettings();
});
els.aiSetupHint.dismiss?.addEventListener("click", dismissAiSetupHint);
els.aiSetup.later?.addEventListener("click", () => els.aiSetup.dialog.close());
els.aiSetup.openSettings?.addEventListener("click", () => {
  els.aiSetup.dialog.close();
  noteAiSetupSettingsOpened();
  // AI Config, not Settings: providers, keys and models moved there when the
  // two modals were split. Sending a first-run user to Settings left them
  // looking for provider fields that are no longer in it.
  openSettings("ai-config");
});
els.settings.cancel.addEventListener("click", () => closeSettingsDialogs());
els.settings.form.addEventListener("submit", saveSettings);
// AI Config opens the SAME state through the SAME save path — one payload, one
// route, one store.
els.aiConfig.open?.addEventListener("click", () => {
  noteAiSetupSettingsOpened();
  openSettings("ai-config");
});
els.aiConfig.cancel?.addEventListener("click", () => closeSettingsDialogs());
els.aiConfig.form?.addEventListener("submit", saveSettings);

// Council Pre-check failure block's actions (§9C). Retry Check re-runs the
// SAME check/decide flow — on success it persists the acknowledgment and
// clears the block (the user's original question is still sitting untouched
// in the composer; pressing Send now goes straight through). It never
// starts the Council itself — that stays the user's own Send action.
els.councilPrecheckError.retry.addEventListener("click", async () => {
  const slots = [...selectedSlots].sort((a, b) => a - b);
  if (slots.length === 0) return;
  const btn = els.councilPrecheckError.retry;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = str("councilCheckChecking");
  try {
    const ok = await runPrecheckAndProceed(slots, councilConfigSignature(slots));
    if (ok) hideCouncilPrecheckError();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});
els.councilPrecheckError.openSettings.addEventListener("click", openSettings);
els.settings.councilManualCheckBtn.addEventListener("click", runManualCouncilCheck);
// Product Status (Batch A) — informational only; opening it renders from
// already-fetched config and never contacts a provider.
els.productStatus.openBtn.addEventListener("click", openProductStatus);
// ---------------------------------------------------------- Batch B: MORE
els.more.toggle.addEventListener("click", toggleMoreMenu);
els.more.caret.addEventListener("click", toggleMoreMenu);
els.more.tutorial.addEventListener("click", () => startTutorial(0));
els.more.learn.addEventListener("click", openLearn);
els.more.about.addEventListener("click", openAbout);
els.more.report.addEventListener("click", () => {
  if (openFixedLink("feedback")) closeMoreMenu();
});
els.more.website.addEventListener("click", () => {
  if (openFixedLink("website")) closeMoreMenu();
});
els.more.github.addEventListener("click", () => {
  if (openFixedLink("github")) closeMoreMenu();
});
els.more.discord.addEventListener("click", () => {
  if (openFixedLink("discord")) closeMoreMenu();
});
els.more.support.addEventListener("click", () => {
  if (openFixedLink("support")) closeMoreMenu();
});
els.learn.close.addEventListener("click", () => els.learn.dialog.close());
els.about.close.addEventListener("click", () => els.about.dialog.close());
els.tutorial.next.addEventListener("click", tutorialNext);
els.tutorial.back.addEventListener("click", tutorialBack);
els.tutorial.skip.addEventListener("click", endTutorial);
els.productStatus.closeBtn.addEventListener("click", () => els.productStatus.dialog.close());

els.archives.open.addEventListener("click", openArchives);
els.archives.back.addEventListener("click", closeArchives);
els.archives.detailBack.addEventListener("click", backToArchivesList);
els.archives.removeCancel.addEventListener("click", () => els.archives.removeDialog.close());
els.archives.removeConfirm.addEventListener("click", confirmRemoveArchive);
els.archives.search.addEventListener("input", () => {
  renderArchivesList(archivesCache, els.archives.search.value);
});

els.vault.connectBtn.addEventListener("click", () => {
  // Same rule as stage 1's Settings button: opening the picker retires the
  // tooltip for this session, while the highlight waits for a real Vault.
  noteVaultSetupOpened();
  connectVaultFirstTime();
});
els.vaultSetupHint.dismiss?.addEventListener("click", dismissVaultSetupHint);
els.vault.openBtn.addEventListener("click", openVaultFolder);
els.vault.menuToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleVaultMenu();
});
els.vault.menuOpen.addEventListener("click", openVaultFolder);
els.vault.menuCopy.addEventListener("click", copyVaultPath);
els.vault.menuChange.addEventListener("click", changeVaultLocation);
els.vault.obsidianEnable.addEventListener("click", enableObsidianIntegration);
els.vault.obsidianChange.addEventListener("click", connectObsidian);
els.vault.obsidianDisable.addEventListener("click", disableObsidianIntegration);
els.vault.menuRefresh.addEventListener("click", refreshVaultStatus);
els.obsidianExport.button.addEventListener("click", exportToObsidian);
els.obsidianExport.autoChk.addEventListener("change", toggleAutoExport);
els.vault.confirmCancel.addEventListener("click", () => els.vault.confirmDialog.close());
els.vault.confirmUse.addEventListener("click", confirmVaultChange);
els.chat.quickActionsToggle.addEventListener("click", toggleQuickActions);
els.sessionSummary.toggle.addEventListener("click", () => setSessionSummaryExpanded(!sessionSummaryExpanded));

initComposer();
initWorkspaceDivider();
initAppSplitDivider();
// Deep link: #library skips the start menu (useful for dev reloads and
// returning users' bookmarks); the start menu remains the default entry.
if (location.hash === "#library") enterLibrary();
// restoreComposerDraft() runs LAST on purpose: restoreSession() is what
// decides whether this page load has a locked (follow-up) composer or the
// main one, and therefore which draft belongs in it. `finally` so a failed
// status/session fetch still gets the player their unsent text back.
// Desktop-only, and independent of the server: the drag strip must be live
// from the first paint in Borderless, not after the config round trip.
applyDesktopWindowModeClass();

loadStatus().then(restoreSession).finally(restoreComposerDraft);
// Scene UI Content is presentational and independent of session restore, so
// it loads alongside rather than blocking it. A failure leaves sceneUi null
// and every consumer falls back to the product's built-in copy.
loadSceneUi();
// Product identity/links load alongside — never gated on a Scene.
loadProduct();
loadLearnResource();
