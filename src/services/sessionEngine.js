// Session Engine — the core conversation workflow of Aether Library.
//
// A Session begins when the user asks a question and stays ACTIVE until the
// player explicitly Saves it to the Vault or Resets it. Everything the player
// does in one discussion (scholar answers, judge ruling, follow-up chat)
// belongs to the one active Session.
//
// This engine is the single source of truth for the active Session and the
// only path to persistence — and it never touches disk directly, only the
// active Vault Adapter. Later milestones (RPG, attachments, replay, history,
// reputation) build on this object without changing the council pipeline.

import { randomUUID } from "node:crypto";
import { getActiveAdapter } from "../vault/index.js";

// One active Session at a time. Starting a new one discards the previous
// Session (and its chat) — a Session always belongs to the most recent run.
let current = null;

export const SESSION_MODES = ["single", "council"];

function sessionError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Metadata belongs to the Session (not the UI). Kept in sync on every mutation
// so any reader — UI, future statistics, replay — sees consistent values.
function computeMetadata(s) {
  return {
    sessionId: s.id,
    mode: s.mode,
    status: s.status,
    scholarCount: Object.keys(s.scholars || {}).length,
    vaultState: s.vault.state,
    outcome: s.outcome,
  };
}

function refresh(s) {
  s.metadata = computeMetadata(s);
  return s;
}

// Creates and installs a new active Session. Called once per run by the
// council pipeline; discards any prior Session.
//
// scholars: { scholar1..3: { slot, persona, provider, label, model, status, answer, error } }
//           — participating slots only.
// judge:    council ruling object, or null in Single Scholar mode.
// identity: display-language identity snapshot, so names stay stable if the
//           display language changes after the run.
// attachments: metadata of the Session Materials the run received
//           ([{ kind, name, url? }]) — names only, never content.
// parentSessionId/threadId: Archive Discussion Threads lineage (see
//           services/materials.js's continuationLineageFrom(), the ONE place
//           that decides these from a run request — never inferred here).
//           A brand-new session gets no parent and becomes its own thread
//           root; both default below so every Session always has a threadId,
//           exactly like a legacy Archive normalizes to one at read time
//           (see normalizeThread() in services/archives.js).
// outcome: how the RUN that produced this Session ended — "completed",
//           "stopped" (user Stop, or Stop chosen at the provider failure
//           gate), "continued_with_failures" (the user authorized the Grand
//           Sage to rule without a failed Scholar), or "insufficient_results"
//           (no Scholar produced anything usable). Recorded on the Session so
//           nothing downstream has to re-derive it from scholar statuses, and
//           so a stopped run is never mistaken for a fully successful one.
//           Defaults to "completed" for every existing caller.
export function startSession({
  question,
  mode,
  scholars,
  judge,
  identity,
  attachments,
  useVault,
  parentSessionId,
  threadId,
  outcome,
}) {
  // Globally unique and immutable — survives Save to Vault unchanged.
  const id = `session-${randomUUID()}`;
  current = {
    id,
    question,
    mode, // "single" | "council"
    status: "active", // "active" | "saved" | "discarded"
    startedAt: new Date().toISOString(),
    finishedAt: null,
    scholars: scholars || {},
    judge: judge || null,
    // Conversation that belongs to this Session: the Judge Chat (council) or
    // the continuing chat with the single Scholar. { role: user|assistant }.
    chat: [],
    identity,
    vault: { state: "unsaved", adapter: null, path: null, savedAt: null },
    attachments: Array.isArray(attachments) ? attachments : [],
    // The "Use Vault" Session option this run started with — recorded so the
    // UI can restore the checkbox's locked state after a reload. Session-
    // level and immutable until Reset, like mode/scholars above.
    useVault: useVault !== false,
    // A thread root's own id doubles as its threadId — the same "no parent
    // means it defines its own group" rule normalizeThread() applies to
    // legacy Archives.
    threadId: threadId || id,
    parentSessionId: parentSessionId || null,
    outcome: outcome || "completed",
    // Reserved for future milestones — declared so the Session shape is stable
    // when replay arrives. NOT implemented yet.
    timeline: [],
    metadata: null,
  };
  return refresh(current);
}

export function getActiveSession() {
  return current;
}

// Appends one turn to the active Session's conversation. role is "user" or
// "assistant" (the assistant is the Judge in council mode, the Scholar in
// single mode). `attachments` (optional) is this turn's OWN metadata-only
// list ({kind, name, url?}, same shape as the session-level attachments) —
// it belongs to this one message only, never merged into the session-level
// array, so Vault/Archives can tell which turn a follow-up attachment came in
// on.
export function appendChat(role, text, attachments) {
  if (!current) throw sessionError(409, "No active session to append chat to.");
  const message = { role, text, at: new Date().toISOString() };
  if (Array.isArray(attachments) && attachments.length > 0) message.attachments = attachments;
  current.chat.push(message);
  return message;
}

// Reset Session: destroy the active Session. Nothing is written.
export function resetSession() {
  const existed = Boolean(current);
  current = null;
  return existed;
}

// Save to Vault: persist the active Session through the active Vault Adapter,
// then mark it saved. The Session ID is preserved by the adapter. The Session
// stays available for viewing; the player may still Reset afterwards.
export async function saveActiveSessionToVault() {
  if (!current) throw sessionError(409, "No active session to save.");
  const hasAnswer = Object.values(current.scholars || {}).some((s) => s?.status === "ok" && s.answer);
  if (!hasAnswer) throw sessionError(409, "This session has no valid answer to save.");

  // Flip to the saved state BEFORE writing so the persisted file records
  // status "saved" and a finished timestamp, matching what the API returns.
  current.status = "saved";
  current.finishedAt = current.finishedAt || new Date().toISOString();
  refresh(current);

  const result = await getActiveAdapter().saveSession(current);
  current.vault = {
    state: "saved",
    adapter: result.adapter,
    path: result.path,
    savedAt: result.savedAt,
  };
  return refresh(current);
}
