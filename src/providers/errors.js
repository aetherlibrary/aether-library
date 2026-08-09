// Shared error classification for provider HTTP calls. Every provider's
// complete()/listModels() wraps its fetch body with this so a failure always
// carries a clear message plus a machine-readable `.code`/`.status` the rest
// of the app (council.js, sessionChat.js, the frontend) can act on without
// parsing message text.

// Completion calls are bounded by the three-phase timeout clock in
// timeouts.js (connect / inactivity / hard task, per-request profile) — the
// old fixed 60s PROVIDER_TIMEOUT_MS is gone. listModels()/probe calls keep
// their own short fixed timeouts (<= 30s), classified here as plain
// "timeout".

// Classifies a caught fetch-layer error (thrown before a response was ever
// received — DNS failure, connection reset, or an AbortSignal.timeout
// firing) into a clear, localizable-ready Error. Completion-call timeouts
// are classified FIRST by the timeout clock (clock.classify(err), carrying
// connection_timeout / inactivity_timeout / hard_task_timeout); this is the
// fallback for aborts the clock didn't cause. Errors that are already a
// well-formed `${label} API ${status}: ...` (thrown by the caller after
// inspecting a real response) pass through unchanged.
export function wrapProviderError(err, label) {
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    const e = new Error(`${label} request timed out.`);
    e.code = "timeout";
    return e;
  }
  if (err instanceof TypeError) {
    // fetch's own network-failure signature ("fetch failed", "Failed to
    // fetch", DNS/connection errors) — never a well-formed API error.
    const e = new Error(`${label} network error: ${err.message}`);
    e.code = "network";
    return e;
  }
  return err;
}

// Attaches the HTTP status to an API error so callers can classify it
// (unavailable/permission/auth/rate-limit) without re-parsing the message.
// code "provider_error" separates a real provider HTTP failure from the
// timeout reason codes in timeouts.js — the two must never be conflated.
export function httpError(label, status, detail) {
  const e = new Error(`${label} API ${status}: ${detail}`);
  e.status = status;
  e.code = "provider_error";
  return e;
}

// ------------------------------------------------ product-level categories
// Normalizes any error this module (or timeouts.js) can produce into one of
// six product-facing categories — for the Council Model Pre-check's failure
// UI, which needs to say something more useful than "provider_error" to a
// non-technical user. Built entirely from fields every caught error here
// already carries (`.status`, `.code`, `.message`) — no parallel error
// system, just one more reading of the same data `providerErrorCategory()`
// (public/app.js) already reads for real Scholar/Judge run failures. That
// client-side function is untouched; this is a server-side classifier for a
// different surface (the pre-check), with one genuinely new capability:
// billing/credit exhaustion is never lumped into generic "unavailable",
// because the user's remedy is different (see BILLING_RE below).
const TIMEOUT_CODES = new Set(["timeout", "connection_timeout", "inactivity_timeout", "hard_task_timeout"]);

// Keyword match on the raw provider detail text — deliberately broad since
// providers phrase billing failures very differently (OpenAI:
// "insufficient_quota"/"exceeded your current quota"; Anthropic: "credit
// balance is too low"; generic: "billing"/"payment required"). Checked
// BEFORE the generic 429/403 status fallback so a billing failure is never
// misread as a plain rate limit or access-denied error.
const BILLING_RE =
  /insufficient[_ ]?quota|insufficient[_ ]?(credit|balance|funds)|credit balance|billing|payment required|purchase more credits|exceeded your current quota/i;
const AUTH_RE = /api key not valid|invalid api key|api_key_invalid|incorrect api key|unauthorized/i;

export function classifyProviderError(err) {
  const status = err?.status ?? err?.httpStatus;
  const code = err?.code;
  const message = err?.message || "";
  if (code && TIMEOUT_CODES.has(code)) return "TIMEOUT";
  if (code === "network") return "PROVIDER_ERROR";
  if (BILLING_RE.test(message) || status === 402) return "BILLING_ERROR";
  if (status === 401 || AUTH_RE.test(message)) return "AUTH_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 403 || status === 404) return "MODEL_UNAVAILABLE";
  if (typeof status === "number" && status >= 500) return "PROVIDER_ERROR";
  return "PROVIDER_ERROR";
}
