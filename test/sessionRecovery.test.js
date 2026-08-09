// Regression tests for the session persistence / state restoration bug.
//
// THE BUG
//
// After a completed Council session was saved to the Vault and the tab was
// left open for a long time, a follow-up failed with
//
//     409 "No active session — start one by asking a question first."
//
// while the UI still showed the discussion AND an enabled follow-up composer.
// Refreshing then closed the workspace entirely.
//
// THE CAUSE — proven, not assumed, by the first group below: the active
// Session lives ONLY in the server process's memory (sessionEngine.js keeps it
// in a module variable). It is assigned in exactly three places (initialised
// to null, startSession, resetSession); Save does not clear it and there is no
// TTL, timer or expiry anywhere. So the only thing that removes it while a tab
// still shows the discussion is a PROCESS RESTART. Everything else people
// reach for first — a timeout, an idle sweep, memory pressure — is ruled out
// here so a future reader does not re-investigate them.
//
// THE FIX has two halves, and both are covered below:
//   1. The follow-up composer is never enabled without a live backend Session
//      (services/sessionRecovery.js decides; public/app.js mirrors it).
//   2. Restoration of the live Session is deliberately UNSUPPORTED — it would
//      require a second session store outside the Vault Adapter. A Session
//      that reached the Vault was archived under the same id, so the recovery
//      is the EXISTING Continue Discussion flow, not a new session model.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  RECOVERY_STATES,
  RECOVERY_ACTIONS,
  decideRecovery,
  composerEnabled,
  isSessionLostError,
  sessionPointer,
  pointerIsContinuable,
} from "../src/services/sessionRecovery.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

let engine;
let archives;
let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aether-session-recovery-"));
  process.env.ARCHIVE_DIR = tmpDir;
  process.env.VAULT_PATH = path.join(tmpDir, "vault");
  engine = await import("../src/services/sessionEngine.js");
  archives = await import("../src/services/archives.js");
});

after(async () => {
  delete process.env.ARCHIVE_DIR;
  delete process.env.VAULT_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function buildSessionArgs(overrides = {}) {
  return {
    question: "What is a Session?",
    mode: "council",
    scholars: {
      scholar1: { slot: 1, persona: "Oracle", provider: "openai", model: "gpt-5.1", status: "ok", answer: "An answer.", error: null },
    },
    judge: { status: "ok", provider: "anthropic", model: "claude-sonnet-4-5", answer: "A ruling.", error: null },
    identity: {},
    ...overrides,
  };
}

// ===================================================================== cause
// Why activeSession disappears — process restart, not a timeout.

test("the active Session is memory-only: exactly three assignments, no TTL", async () => {
  const src = await readSource("../src/services/sessionEngine.js");
  // The whole store is one module variable.
  assert.match(src, /^let current = null;$/m);
  // Assigned in exactly three places: the declaration, startSession, reset.
  // Two writes after the declaration above: startSession installs, reset
  // clears. Nothing else in the file touches the store.
  const assignments = [...src.matchAll(/^\s*current = /gm)];
  assert.equal(assignments.length, 2, "current must be written in exactly two places");
  assert.match(src, /export function resetSession\(\) \{\s*const existed = Boolean\(current\);\s*current = null;/);
  // No expiry mechanism of ANY kind — this is what rules out "it timed out".
  for (const forbidden of [/setTimeout/, /setInterval/, /\bttl\b/i, /expire/i, /maxAge/i, /Date\.now\(\) -/]) {
    assert.doesNotMatch(src, forbidden, `sessionEngine must not contain ${forbidden}`);
  }
  // It never persists itself either — the Vault Adapter is the only writer.
  assert.doesNotMatch(src, /node:fs|writeFile/);
});

test("Save to Vault does NOT end the Session — so saving is not the cause", async () => {
  engine.startSession(buildSessionArgs());
  assert.ok(engine.getActiveSession(), "session is active after the run");
  await engine.saveActiveSessionToVault();
  const after = engine.getActiveSession();
  assert.ok(after, "the Session survives Save to Vault");
  assert.equal(after.status, "saved");
  assert.equal(after.vault.state, "saved");
  engine.resetSession();
});

test("idling does not end the Session — there is no timeout to reproduce", async () => {
  const started = engine.startSession(buildSessionArgs());
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(engine.getActiveSession()?.id, started.id, "still the same Session after idling");
  engine.resetSession();
});

test("a fresh module instance has no Session — the restart IS the cause", async () => {
  engine.startSession(buildSessionArgs());
  assert.ok(engine.getActiveSession());
  // A new module instance is what a restarted process gets: same code, new
  // memory. Nothing carries `current` across.
  const restarted = await import(`../src/services/sessionEngine.js?restart=${randomUUID()}`);
  assert.equal(restarted.getActiveSession(), null, "a restarted process starts with no Session");
  engine.resetSession();
});

test("the 409 the user saw is the engine's own, and only a Session produces it", async () => {
  const chat = await readSource("../src/services/sessionChat.js");
  assert.match(chat, /if \(!session\) \{\s*throw httpError\(409, "No active session — start one by asking a question first\."\);/);
  engine.resetSession();
  assert.throws(() => engine.appendChat("user", "hi"), /No active session/);
  await assert.rejects(() => engine.saveActiveSessionToVault(), /No active session/);
});

// ================================================= 1. stale frontend state
// A page still showing a discussion while the backend has none.

test("stale frontend state with no backend active session closes the composer", () => {
  const d = decideRecovery({
    hasLocalSession: true,
    serverActive: false,
    localSessionId: "session-a",
    archiveExists: false,
  });
  assert.equal(d.state, "lost_unrecoverable");
  assert.equal(d.composerEnabled, false, "the follow-up composer must not stay enabled");
  assert.equal(d.action, RECOVERY_ACTIONS.RESET);
  // The user's content is never destroyed to tidy up our own state.
  assert.equal(d.keepDiscussionVisible, true);
});

test("a server that restarted and ran a DIFFERENT session is still lost", () => {
  // active: true is not enough — a follow-up would append to a stranger's
  // discussion. The id must match.
  const d = decideRecovery({
    hasLocalSession: true,
    serverActive: true,
    serverSessionId: "session-someone-else",
    localSessionId: "session-mine",
    archiveExists: true,
  });
  assert.equal(d.state, "lost_continuable");
  assert.equal(d.composerEnabled, false);
});

test("a live, matching session keeps the composer open", () => {
  const d = decideRecovery({
    hasLocalSession: true,
    serverActive: true,
    serverSessionId: "session-a",
    localSessionId: "session-a",
  });
  assert.equal(d.state, "live");
  assert.equal(d.composerEnabled, true);
  assert.equal(d.action, null);
});

test("the composer's enabled state requires ALL THREE terms", () => {
  assert.equal(composerEnabled({ sessionReady: true, sessionLost: false, chatBusy: false }), true);
  // The term the bug was missing.
  assert.equal(composerEnabled({ sessionReady: true, sessionLost: true, chatBusy: false }), false);
  assert.equal(composerEnabled({ sessionReady: false, sessionLost: false, chatBusy: false }), false);
  assert.equal(composerEnabled({ sessionReady: true, sessionLost: false, chatBusy: true }), false);
  assert.equal(composerEnabled({}), false);
});

test("only the Session-gone 409 counts — run_in_progress means the opposite", () => {
  assert.equal(
    isSessionLostError({ status: 409, message: "No active session — start one by asking a question first." }),
    true
  );
  // The run-safety gate also answers 409, and it means a Session is very much
  // alive. Treating it as loss would close the composer mid-run.
  assert.equal(isSessionLostError({ status: 409, code: "run_in_progress", message: "A run is already in progress." }), false);
  assert.equal(isSessionLostError({ status: 502, message: "No active session" }), false);
  assert.equal(isSessionLostError({ status: 409, message: "This session has no valid answer to save." }), false);
  assert.equal(isSessionLostError({}), false);
});

test("no local session means there is no recovery question to answer", () => {
  const d = decideRecovery({ hasLocalSession: false, serverActive: false });
  assert.equal(d.state, "live");
  assert.equal(d.composerEnabled, false);
  assert.equal(d.keepDiscussionVisible, false);
  assert.deepEqual([...RECOVERY_STATES].sort(), ["live", "lost_continuable", "lost_unrecoverable"]);
});

// ============================================ 2. refresh after a completion
// The reload case: the page's own copy is gone too, so only the pointer and
// the Archive remain.

test("refresh after a completed, SAVED session offers continuation", async () => {
  const started = engine.startSession(buildSessionArgs());
  await engine.saveActiveSessionToVault();
  const saved = engine.getActiveSession();
  await archives.archiveSession(saved);

  // What the page remembers across a reload: an id and one boolean. Never a
  // copy of the Session — that would be the parallel session model.
  const pointer = sessionPointer(saved);
  assert.deepEqual(pointer, { id: started.id, saved: true });
  assert.deepEqual(Object.keys(pointer).sort(), ["id", "saved"], "the pointer carries no session content");
  assert.equal(pointerIsContinuable(pointer), true);

  // The Archive really is there, under the SAME id — this is what makes
  // continuation possible at all.
  const archive = await archives.getArchive(started.id);
  assert.ok(archive, "a saved Session is archived under its own id");
  assert.equal(archive.id, started.id);

  // And the reload decision follows.
  const d = decideRecovery({
    hasLocalSession: true,
    serverActive: false,
    localSessionId: started.id,
    archiveExists: true,
  });
  assert.equal(d.state, "lost_continuable");
  assert.equal(d.action, RECOVERY_ACTIONS.CONTINUE);
  assert.equal(d.composerEnabled, false);
  engine.resetSession();
});

test("refresh after an UNSAVED session offers no false promise", async () => {
  const started = engine.startSession(buildSessionArgs());
  const pointer = sessionPointer(engine.getActiveSession());
  assert.deepEqual(pointer, { id: started.id, saved: false });
  // Never saved -> never archived -> continuation would 404. Do not offer it.
  assert.equal(pointerIsContinuable(pointer), false);
  assert.equal(await archives.getArchive(started.id), null);
  const d = decideRecovery({ hasLocalSession: true, serverActive: false, localSessionId: started.id, archiveExists: false });
  assert.equal(d.state, "lost_unrecoverable");
  assert.equal(d.action, RECOVERY_ACTIONS.RESET);
  engine.resetSession();
});

test("a missing session yields no pointer at all", () => {
  assert.equal(sessionPointer(null), null);
  assert.equal(sessionPointer({}), null);
  assert.equal(pointerIsContinuable(null), false);
  assert.equal(pointerIsContinuable({ id: "x" }), false);
});

// =============================================== 3. follow-up after long idle
// The reported reproduction, end to end at the decision layer, plus the
// wiring in app.js that makes the page notice without a user action.

test("follow-up after long idle: saved session, server restarted", async () => {
  // 1-2. Complete and save.
  const started = engine.startSession(buildSessionArgs());
  await engine.saveActiveSessionToVault();
  await archives.archiveSession(engine.getActiveSession());
  const pointer = sessionPointer(engine.getActiveSession());

  // 3. Long idle, during which the process restarts.
  const restarted = await import(`../src/services/sessionEngine.js?idle=${randomUUID()}`);
  assert.equal(restarted.getActiveSession(), null);

  // 4-5. The follow-up. Before the fix the composer was enabled and this
  // produced a 409 error bubble; now the decision closes the composer first.
  const d = decideRecovery({
    hasLocalSession: true,
    serverActive: Boolean(restarted.getActiveSession()),
    localSessionId: started.id,
    archiveExists: Boolean(await archives.getArchive(started.id)),
  });
  assert.equal(d.composerEnabled, false, "no enabled composer without a backend Session");
  assert.equal(d.state, "lost_continuable");
  assert.equal(d.action, RECOVERY_ACTIONS.CONTINUE);
  // 6. And the reload has something to offer rather than a blank workspace.
  assert.equal(pointerIsContinuable(pointer), true);
  engine.resetSession();
});

test("the page notices a long idle without the user pressing anything", async () => {
  const app = await readSource("../public/app.js");
  // Returning to a backgrounded tab re-checks the server.
  assert.match(app, /function initSessionLivenessWatch\(\) \{\s*document\.addEventListener\("visibilitychange"/);
  assert.match(app, /if \(document\.visibilityState !== "visible"\) return;/);
  assert.match(app, /const \{ known, alive \} = await verifyActiveSession\(\);\s*if \(known && !alive\) await handleSessionLost\(\);/);
  // It is actually installed, not merely defined.
  assert.match(app, /^initSessionLivenessWatch\(\);$/m);
  // A run in flight must not be interrupted by the watch.
  assert.match(app, /if \(!sessionConfigLocked \|\| sessionLost \|\| runInFlight \|\| chatBusy\) return;/);
});

test("an unreachable server is never mistaken for a lost Session", async () => {
  const app = await readSource("../public/app.js");
  // verifyActiveSession reports "not known" on a failed request, and every
  // caller requires `known` before acting. A transient blip must not lock the
  // composer.
  assert.match(app, /const data = await api\("\/api\/session"\)\.catch\(\(\) => null\);\s*if \(!data\) return \{ known: false, alive: false \};/);
  assert.match(app, /if \(liveness\.known && !liveness\.alive\) \{/);
});

// ================================================ 4. archive continuation
// The fallback, and the constraint that it must not be a new session model.

test("archive continuation is the fallback, through the EXISTING flow", async () => {
  const started = engine.startSession(buildSessionArgs());
  await engine.saveActiveSessionToVault();
  await archives.archiveSession(engine.getActiveSession());

  // The continuation payload the recovery button fetches is the archive's own
  // saved markdown — read-only, and it never touches the active Session.
  const continuation = await archives.archiveContinuationText(started.id);
  assert.ok(continuation, "a saved Session can be reopened as continuation context");
  assert.equal(continuation.id, started.id);
  assert.equal(continuation.threadId, started.id);
  assert.ok(continuation.markdown.length > 0);
  // Reading it changed nothing.
  assert.ok(await archives.getArchive(started.id));
  engine.resetSession();
});

test("the recovery button reuses continueDiscussion(), it does not reimplement it", async () => {
  const app = await readSource("../public/app.js");
  assert.match(app, /t\.continueBtn\.onclick = \(\) => continueDiscussion\(\{ id: sessionId \}, t\.continueBtn, t\.status\);/);
  // Exactly one continuation implementation exists.
  const definitions = [...app.matchAll(/^async function continueDiscussion\(/gm)];
  assert.equal(definitions.length, 1, "there must be exactly one Continue Discussion implementation");
  // It still goes through the one archive continuation route.
  assert.match(app, /await api\(`\/api\/archives\/\$\{encodeURIComponent\(archive\.id\)\}\/continue`\)/);
});

test("no parallel session model was introduced", async () => {
  const app = await readSource("../public/app.js");
  const recovery = await readSource("../src/services/sessionRecovery.js");
  const server = await readSource("../src/server.js");
  const engineSrc = await readSource("../src/services/sessionEngine.js");

  // The recovery module decides; it stores nothing and reaches nothing.
  for (const forbidden of [/node:fs/, /fetch\(/, /localStorage/, /sessionStorage/, /document\./, /setTimeout/]) {
    assert.doesNotMatch(recovery, forbidden, `sessionRecovery must not contain ${forbidden}`);
  }
  // The engine is untouched: still one store, still no persistence of its own.
  const assignments = [...engineSrc.matchAll(/^\s*current = /gm)];
  assert.equal(assignments.length, 2, "the session engine's store is unchanged");
  // No new session route, and no route that writes a session back.
  assert.doesNotMatch(server, /\/api\/session\/restore|\/api\/session\/resume|\/api\/session\/rehydrate/);
  // The browser pointer is an id and a boolean — never session content.
  const pointerFn = app.slice(app.indexOf("function rememberSessionPointer("), app.indexOf("function readSessionPointer("));
  assert.match(pointerFn, /\{ id: sessionState\.id, saved: sessionState\.vault\?\.state === "saved" \}/);
  assert.doesNotMatch(pointerFn, /scholars|judge|chat|question/, "the pointer must not copy session content");
});

// ====================================================== app.js mirror + gate
// public/app.js cannot import, so it mirrors the module. These keep the two
// from drifting, and hold the invariant the bug violated.

test("chatReady() carries the sessionLost term", async () => {
  const app = await readSource("../public/app.js");
  const fn = app.slice(app.indexOf("function chatReady() {"), app.indexOf("// Governs the persistent input/Send button"));
  assert.match(fn, /if \(sessionLost\) return false;/);
  // Declared before its first reader, or it would be a TDZ ReferenceError.
  assert.ok(
    app.indexOf("let sessionLost = false;") < app.indexOf("function chatReady() {"),
    "sessionLost must be declared before chatReady() reads it"
  );
});

test("one gate closes the composer, Send and every Quick Question together", async () => {
  const app = await readSource("../public/app.js");
  const fn = app.slice(app.indexOf("function updateChatAvailability() {"), app.indexOf("function setChatBusy("));
  assert.match(fn, /const enabled = chatReady\(\) && !chatBusy;/);
  assert.match(fn, /els\.run\.disabled = !enabled;/);
  assert.match(fn, /els\.question\.disabled = !enabled;/);
  assert.match(fn, /for \(const btn of els\.chat\.quickActions\.querySelectorAll\("button"\)\) btn\.disabled = !enabled;/);
  // handleSessionLost drives exactly that gate rather than disabling by hand.
  assert.match(app, /sessionLost = true;\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*updateChatAvailability\(\);/);
});

test("every discovery path funnels through the one transition", async () => {
  const app = await readSource("../public/app.js");
  // Exactly one definition, and the guard that makes it idempotent.
  assert.equal([...app.matchAll(/^async function handleSessionLost\(/gm)].length, 1);
  assert.match(app, /if \(sessionLost\) return;\s*sessionLost = true;/);
  // The three ways it can be discovered: pre-send, the 409, and the save 409.
  assert.match(app, /const liveness = await verifyActiveSession\(\);/);
  assert.match(app, /if \(isSessionLostError\(err\)\) \{/);
  assert.match(app, /await handleSessionLost\(\{ sessionId: sessionState\?\.id, saved: false \}\);/);
});

test("the lost state is cleared only by Reset, a new run, or a live Session", async () => {
  const app = await readSource("../public/app.js");
  assert.match(app, /function hideSessionLost\(\) \{\s*sessionLost = false;/);
  // Reset: clears the state AND the pointer.
  assert.match(app, /hideSessionLost\(\);\s*forgetSessionPointer\(\);/);
  // A new run clears it before anything renders.
  const begin = app.slice(app.indexOf("function beginSession("), app.indexOf("function lockSessionConfig("));
  assert.ok(begin.includes("hideSessionLost();") || app.slice(app.indexOf("function beginSession(")).slice(0, 900).includes("hideSessionLost();"));
  // Restoring a live Session clears it too — otherwise a stale panel would sit
  // above a working discussion and keep the composer shut.
  const restore = app.slice(app.indexOf("async function restoreSession()"), app.indexOf("// ---------------------------------------------------------------- settings"));
  assert.match(restore, /hideSessionLost\(\);\s*sessionState = \{ \.\.\.s \};/);
});

test("a refused send hands the user's text back", async () => {
  const app = await readSource("../public/app.js");
  // The composer is emptied by handleSend BEFORE sendChat runs, so a refusal
  // has to restore it or the typed question is silently lost.
  assert.match(app, /sendChat\(text, \{ fromComposer: true \}\);/);
  assert.match(app, /if \(fromComposer && !els\.question\.value\.trim\(\)\) els\.question\.value = text;/);
  // A Quick Question chip never claims to have come from the composer.
  assert.match(app, /sendChat\(action\.text\);/);
});

test("the discussion is never destroyed by the recovery", async () => {
  const app = await readSource("../public/app.js");
  const handler = app.slice(app.indexOf("async function handleSessionLost("), app.indexOf("// Renders the panel and wires its recovery action."));
  // Nothing in the transition clears the transcript, the tabs or the answers.
  for (const forbidden of [/els\.chat\.log\.innerHTML = ""/, /els\.tabs\.innerHTML = ""/, /tabAnswers = \{\}/, /sessionState = null/]) {
    assert.doesNotMatch(handler, forbidden, `handleSessionLost must not run ${forbidden}`);
  }
});

test("both locales carry the recovery copy", async () => {
  const en = (await import("../src/locales/en.js")).default.strings;
  const zh = (await import("../src/locales/zh-TW.js")).default.strings;
  const keys = [
    "sessionLostTitle",
    "sessionLostChecking",
    "sessionLostSaved",
    "sessionLostUnsaved",
    "sessionLostContinue",
    "sessionLostReset",
  ];
  for (const key of keys) {
    for (const [name, pack] of [["en", en], ["zh-TW", zh]]) {
      assert.equal(typeof pack[key], "string", `${name}.${key}`);
      assert.ok(pack[key].trim().length > 0, `${name}.${key} must not be blank`);
    }
  }
  // The saved and unsaved messages must differ — the whole point is that one
  // offers continuation and the other does not pretend to.
  assert.notEqual(en.sessionLostSaved, en.sessionLostUnsaved);
  assert.notEqual(zh.sessionLostSaved, zh.sessionLostUnsaved);
  // The panel exists in the markup with both actions.
  const html = await readSource("../public/index.html");
  assert.match(html, /<div class="session-error session-lost" id="session-lost" hidden>/);
  assert.match(html, /id="session-lost-continue" hidden/);
  assert.match(html, /id="session-lost-reset"/);
});
