// Three-phase timeout architecture for provider calls.
//
// One fixed per-request deadline (the old PROVIDER_TIMEOUT_MS = 60s) killed
// every long-but-healthy request: a PDF analysis or reasoning-model run that
// was still streaming tokens at t=60s was aborted and then misread as a model
// failure. This module replaces it with three independent phases:
//
//   connect     — how long the provider may take to START responding
//                 (headers). A dead endpoint fails fast here.
//   inactivity  — the longest tolerated silence BETWEEN stream events once
//                 the response has started. Every chunk of activity resets
//                 it, so a request is never terminated merely because wall-
//                 clock time passed while tokens are still arriving.
//   task        — the hard ceiling for the whole request, by profile:
//                 normal questions, reasoning models, and file/long-context
//                 analysis each get their own configurable limit.
//
// Every timeout abort is CLASSIFIED (err.code): connection_timeout,
// inactivity_timeout, or hard_task_timeout — alongside provider_error (a real
// HTTP error response, see errors.js) and user_cancelled (client-side). The
// UI must treat these differently: a hard-task timeout during a 600s PDF run
// says nothing about the model being unavailable.
//
// Values come from config.timeouts (.env.local-overridable — see config.js);
// profiles are resolved per request by resolveTimeoutProfile().

import { config } from "../config.js";
import { catalogFor } from "../config/supported-models.js";

export const TIMEOUT_REASON_CODES = new Set([
  "connection_timeout",
  "inactivity_timeout",
  "hard_task_timeout",
]);

// Stop Generation's own abort reason. Deliberately OUTSIDE
// TIMEOUT_REASON_CODES above: everything that reads that set is asking "did
// this model fail to respond in time", and a user Stop must never answer yes
// to that question (it is not a model verdict at all).
export const USER_CANCELLED_CODE = "user_cancelled";

// -------------------------------------------------------------- profiles

export function timeoutProfile(kind) {
  const t = config.timeouts || {};
  const connectMs = t.connectMs || 45_000;
  const inactivityMs = t.inactivityMs || 90_000;
  const taskMs =
    kind === "file"
      ? t.taskFileMs || 600_000
      : kind === "reasoning"
        ? t.taskReasoningMs || 300_000
        : t.taskNormalMs || 120_000;
  return { kind: kind === "file" || kind === "reasoning" ? kind : "normal", connectMs, inactivityMs, taskMs };
}

// Reasoning flag from the curated catalog, tolerant of dated snapshots and
// versioned ids the same way intersectWithCatalog() aliases them
// ("o3-2025-04-16" / "model@001" still count as their catalog entry).
// Exported for the Council Pre-check (council.js): a reasoning model can
// spend its entire token budget on hidden reasoning before any visible
// output, so a tiny maxTokens cap would make a perfectly healthy reasoning
// model look "unavailable" (empty response) — the pre-check skips the cap
// for these instead of guessing a safe-enough budget.
export function isReasoningModel(providerId, model) {
  if (!providerId || !model) return false;
  for (const m of catalogFor(providerId)) {
    if (
      model === m.id ||
      model.startsWith(`${m.id}@`) ||
      (model.startsWith(`${m.id}-`) && /^\d{8}/.test(model.slice(m.id.length + 1)))
    ) {
      return m.reasoning === true;
    }
  }
  return false;
}

// Prompts longer than this are "long context" and get the file-analysis
// ceiling even without attachments (a huge vault retrieval reads just as
// slowly as an attached document).
const LONG_CONTEXT_CHARS = 32_000;

// Picks the timeout profile for one provider request:
//   - any attached file/materials content → "file" (600s ceiling),
//   - long context → "file",
//   - a catalog-flagged reasoning model → "reasoning" (300s),
//   - everything else → "normal" (120s).
export function resolveTimeoutProfile({ providerId, model, hasFiles = false, promptChars = 0 } = {}) {
  if (hasFiles || promptChars > LONG_CONTEXT_CHARS) return timeoutProfile("file");
  if (isReasoningModel(providerId, model)) return timeoutProfile("reasoning");
  return timeoutProfile("normal");
}

// ------------------------------------------------------------ the clock

// One request's timeout state machine. Use:
//   const clock = startTimeoutClock(profile, label);
//   fetch(url, { signal: clock.signal })  → then clock.connected()
//   per stream chunk                      → clock.activity()
//   finally                               → clock.done()
//   catch (err)                           → throw clock.classify(err) || err
//
// `externalSignal` (optional) is the RUN's own AbortSignal — Stop Generation
// (see the run registry in services/council.js). It is deliberately routed
// through this same clock rather than handed to fetch as a second signal:
// the clock is already the one place that owns the request's AbortController
// and knows why it aborted, so a user Stop becomes just one more classified
// reason ("user_cancelled") instead of an unclassified AbortError that the
// callers would have to guess about. A stop is NEVER a timeout and NEVER a
// provider failure — see classify() below and USER_CANCELLED_CODE.
export function startTimeoutClock(profile, label, externalSignal) {
  const controller = new AbortController();
  const startedAt = Date.now();
  let reason = null;
  let inactivityTimer = null;

  const abortWith = (r) => {
    if (reason) return;
    reason = r;
    controller.abort();
  };

  let connectTimer = setTimeout(() => abortWith("connection_timeout"), profile.connectMs);
  const taskTimer = setTimeout(() => abortWith("hard_task_timeout"), profile.taskMs);
  const armInactivity = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => abortWith("inactivity_timeout"), profile.inactivityMs);
  };

  // A run already stopped before this call even started aborts immediately —
  // the fetch below never leaves the process.
  let onExternalAbort = null;
  if (externalSignal) {
    if (externalSignal.aborted) abortWith(USER_CANCELLED_CODE);
    else {
      onExternalAbort = () => abortWith(USER_CANCELLED_CODE);
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const clearAll = () => {
    clearTimeout(connectTimer);
    clearTimeout(inactivityTimer);
    clearTimeout(taskTimer);
    // Runs finish far more often than they are stopped; without this the
    // run's signal would accumulate a listener per provider call.
    if (onExternalAbort) externalSignal.removeEventListener("abort", onExternalAbort);
  };

  return {
    signal: controller.signal,
    // Headers arrived: the connection phase is over; silence is now governed
    // by the inactivity window.
    connected() {
      clearTimeout(connectTimer);
      connectTimer = null;
      armInactivity();
    },
    // Any stream event/token/heartbeat: the provider is alive — reset the
    // inactivity window (never the task ceiling).
    activity() {
      if (!reason) armInactivity();
    },
    done: clearAll,
    elapsedMs: () => Date.now() - startedAt,
    get reason() {
      return reason;
    },
    // If this clock aborted the request, returns a classified Error carrying
    // the machine-readable reason (err.code) and logs it; otherwise null so
    // the caller falls through to its normal error wrapping.
    classify(err) {
      if (!reason || (err?.name !== "AbortError" && err?.name !== "TimeoutError")) return null;
      clearAll();
      // A user Stop is not a timeout and must never be logged or reported as
      // one: no timeout diagnostics, and a code the run pipeline recognises
      // as "the user did this" rather than "this model failed".
      if (reason === USER_CANCELLED_CODE) {
        const e = new Error(`${label} request stopped by the user.`);
        e.code = USER_CANCELLED_CODE;
        return e;
      }
      const s = (ms) => `${Math.round(ms / 1000)}s`;
      const detail =
        reason === "connection_timeout"
          ? `did not start responding within ${s(profile.connectMs)}`
          : reason === "inactivity_timeout"
            ? `stalled — no activity for ${s(profile.inactivityMs)}`
            : `reached the maximum processing time (${s(profile.taskMs)}, ${profile.kind} profile)`;
      // Requirement: the ACTUAL timeout reason is logged, separately from
      // provider errors — never collapsed into one generic "timed out".
      console.error(
        `[timeout] provider=${label} reason=${reason} elapsedMs=${this.elapsedMs()} profile=${profile.kind} ` +
          `(connect=${profile.connectMs} inactivity=${profile.inactivityMs} task=${profile.taskMs})`
      );
      const e = new Error(`${label} ${detail} (${reason}).`);
      e.code = reason;
      return e;
    },
  };
}

// ------------------------------------------------------------- SSE reader

// Reads a Server-Sent-Events response body, calling clock.activity() on
// every chunk received and onData(payloadString) for each `data:` line.
// Stops at stream end or an SSE "[DONE]" sentinel. The caller owns error
// handling (abort classification) and JSON parsing of the payloads.
export async function readSSE(res, clock, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    clock.activity();
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "").trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // event:/id:/comments — activity only
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      if (payload) onData(payload);
    }
  }
}
