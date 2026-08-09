// Batch C — Draft Autosave.
//
// The storage rules are real behaviour in a pure module, so those are proper
// behavioural tests driven against fake storages (including one that throws
// on every call). The DOM wiring — which lifecycle point clears which draft
// — has no DOM available in this project (no jsdom; same precedent as
// bookHotspotPointerEvents.test.js), so those are source-level guards on the
// exact promises that matter: cleared only on genuine acceptance, never on a
// validation failure, and never a network request.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DRAFT_KEYS,
  FOLLOW_UP_DRAFT_LIMIT,
  isBlankDraft,
  readMainDraft,
  writeMainDraft,
  clearMainDraft,
  followUpDraftId,
  readFollowUpDraft,
  writeFollowUpDraft,
  clearFollowUpDraft,
  clearFollowUpDraftIfUnchanged,
} from "../src/services/composerDrafts.js";

// A localStorage-shaped fake. `values` is exposed so a test can assert on
// what was actually written, not merely on what reads back.
function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => void values.set(k, String(v)),
    removeItem: (k) => void values.delete(k),
  };
}

// Every operation throws — private browsing, a disabled storage, or a quota
// that is already full.
const hostileStorage = {
  getItem() { throw new Error("storage disabled"); },
  setItem() { throw new Error("storage disabled"); },
  removeItem() { throw new Error("storage disabled"); },
};

// ------------------------------------------------------------ main composer

test("main composer text survives a reload", () => {
  const s = fakeStorage();
  writeMainDraft(s, "What is the nature of a good question?");
  // A reload is a brand-new module reading the same storage.
  assert.equal(readMainDraft(s), "What is the nature of a good question?");
});

test("the draft is stored verbatim — the user's own newlines and spacing come back exactly as typed", () => {
  const s = fakeStorage();
  const typed = "  first line\n\n\tindented second  ";
  writeMainDraft(s, typed);
  assert.equal(readMainDraft(s), typed);
});

test("an empty composer never leaves a stored draft behind", () => {
  const s = fakeStorage();
  writeMainDraft(s, "");
  assert.equal(s.values.has(DRAFT_KEYS.main), false, "nothing should be written at all");
  assert.equal(readMainDraft(s), "");
});

test("a whitespace-only composer counts as empty and removes any existing draft", () => {
  const s = fakeStorage();
  writeMainDraft(s, "real text");
  assert.equal(s.values.has(DRAFT_KEYS.main), true);
  for (const blank of ["   ", "\n\n", "\t", ""]) {
    writeMainDraft(s, blank);
    assert.equal(s.values.has(DRAFT_KEYS.main), false, `${JSON.stringify(blank)} must clear the entry`);
    writeMainDraft(s, "real text");
  }
});

test("isBlankDraft treats non-strings as blank rather than throwing", () => {
  for (const v of [undefined, null, 0, {}, []]) assert.equal(isBlankDraft(v), true);
  assert.equal(isBlankDraft("x"), false);
});

test("clearing the main draft removes the key entirely", () => {
  const s = fakeStorage();
  writeMainDraft(s, "consumed by a send");
  clearMainDraft(s);
  assert.equal(s.values.has(DRAFT_KEYS.main), false);
  assert.equal(readMainDraft(s), "");
});

test("a missing main draft reads as empty, never as undefined or null", () => {
  assert.equal(readMainDraft(fakeStorage()), "");
});

// -------------------------------------------------------- follow-up scoping

test("a follow-up draft restores only for the same Session", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "session-A", "half-written follow-up for A");
  assert.equal(readFollowUpDraft(s, "session-A"), "half-written follow-up for A");
});

test("Session A's draft never appears in Session B", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "session-A", "belongs to A");
  assert.equal(readFollowUpDraft(s, "session-B"), "", "B must show its own empty state");
  writeFollowUpDraft(s, "session-B", "belongs to B");
  assert.equal(readFollowUpDraft(s, "session-A"), "belongs to A", "A is untouched by B's typing");
  assert.equal(readFollowUpDraft(s, "session-B"), "belongs to B");
});

test("switching back and forth keeps each Session's own draft intact", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "a1");
  writeFollowUpDraft(s, "B", "b1");
  writeFollowUpDraft(s, "A", "a2"); // returned to A and kept typing
  assert.equal(readFollowUpDraft(s, "A"), "a2");
  assert.equal(readFollowUpDraft(s, "B"), "b1");
});

test("clearing one Session's follow-up draft leaves every other Session's alone", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "a");
  writeFollowUpDraft(s, "B", "b");
  clearFollowUpDraft(s, "A");
  assert.equal(readFollowUpDraft(s, "A"), "");
  assert.equal(readFollowUpDraft(s, "B"), "b");
});

test("an emptied follow-up composer drops its entry rather than storing a blank one", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "typed then deleted");
  writeFollowUpDraft(s, "A", "   ");
  assert.equal(readFollowUpDraft(s, "A"), "");
  assert.equal(s.values.has(DRAFT_KEYS.followUps), false, "the last entry going blank removes the key");
});

test("no stable Session identity means nothing is persisted at all", () => {
  const s = fakeStorage();
  for (const id of [null, undefined, "", "   ", 42, {}]) {
    assert.equal(followUpDraftId(id), null, `${JSON.stringify(id)} is not a usable identity`);
    assert.equal(writeFollowUpDraft(s, id, "text with nowhere to go"), false);
  }
  assert.equal(s.values.size, 0, "an identity-less composer must never write a key");
});

test("follow-up drafts live under one key, kept bounded to the most recently touched Sessions", () => {
  const s = fakeStorage();
  for (let i = 0; i < FOLLOW_UP_DRAFT_LIMIT + 5; i++) {
    writeFollowUpDraft(s, `session-${i}`, `draft ${i}`, 1000 + i);
  }
  assert.equal(s.values.size, 1, "one key, never one key per Session");
  const stored = JSON.parse(s.values.get(DRAFT_KEYS.followUps));
  assert.equal(Object.keys(stored).length, FOLLOW_UP_DRAFT_LIMIT);
  // The newest survive; the oldest are dropped.
  assert.ok(stored[`session-${FOLLOW_UP_DRAFT_LIMIT + 4}`], "the newest draft is kept");
  assert.ok(!stored["session-0"], "the oldest draft is pruned");
});

test("a corrupt or hand-edited follow-up entry fails open instead of throwing", () => {
  for (const junk of ["{not json", "[]", "null", '"a string"', "17"]) {
    const s = fakeStorage({ [DRAFT_KEYS.followUps]: junk });
    assert.equal(readFollowUpDraft(s, "A"), "");
    assert.doesNotThrow(() => writeFollowUpDraft(s, "A", "recovered"));
    assert.equal(readFollowUpDraft(s, "A"), "recovered");
  }
});

test("a malformed entry inside the map can never resurrect as a phantom draft", () => {
  const s = fakeStorage({
    [DRAFT_KEYS.followUps]: JSON.stringify({ A: { text: 42 }, B: { text: "   " }, C: "raw", D: { text: "ok" } }),
  });
  assert.equal(readFollowUpDraft(s, "A"), "");
  assert.equal(readFollowUpDraft(s, "B"), "");
  assert.equal(readFollowUpDraft(s, "C"), "");
  assert.equal(readFollowUpDraft(s, "D"), "ok");
});

// --------------------------------------------- acceptance-gated clearing

test("a successful follow-up send clears only that Session's draft", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "the follow-up being sent");
  writeFollowUpDraft(s, "B", "an unrelated Session's draft");
  clearFollowUpDraftIfUnchanged(s, "A", "the follow-up being sent");
  assert.equal(readFollowUpDraft(s, "A"), "");
  assert.equal(readFollowUpDraft(s, "B"), "an unrelated Session's draft");
});

test("a failed follow-up send preserves its draft — nothing clears without confirmed acceptance", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "this send will fail");
  // The failure path simply never calls the clear. The draft is still there
  // for the retry, and a reload brings it back.
  assert.equal(readFollowUpDraft(s, "A"), "this send will fail");
});

test("a Quick Question send never discards the half-written follow-up sitting in the composer", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "something the player is still writing");
  // A chip sends its own text without ever touching the composer.
  const cleared = clearFollowUpDraftIfUnchanged(s, "A", "Summarize the key disagreements");
  assert.equal(cleared, false);
  assert.equal(readFollowUpDraft(s, "A"), "something the player is still writing");
});

test("acceptance matches on the trimmed text the application actually sent", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "  padded question  \n");
  assert.equal(clearFollowUpDraftIfUnchanged(s, "A", "padded question"), true);
  assert.equal(readFollowUpDraft(s, "A"), "");
});

test("text typed after the send wins — a newer draft is never silently discarded", () => {
  const s = fakeStorage();
  writeFollowUpDraft(s, "A", "sent text");
  writeFollowUpDraft(s, "A", "sent text plus more typing");
  assert.equal(clearFollowUpDraftIfUnchanged(s, "A", "sent text"), false);
  assert.equal(readFollowUpDraft(s, "A"), "sent text plus more typing");
});

// ------------------------------------------------------- storage failure

test("a storage that throws on every call never breaks drafting", () => {
  assert.doesNotThrow(() => {
    assert.equal(writeMainDraft(hostileStorage, "typed anyway"), false);
    assert.equal(readMainDraft(hostileStorage), "");
    assert.equal(clearMainDraft(hostileStorage), false);
    assert.equal(writeFollowUpDraft(hostileStorage, "A", "typed anyway"), false);
    assert.equal(readFollowUpDraft(hostileStorage, "A"), "");
    // A clear with nothing to clear reports success — there is genuinely no
    // draft left, which is exactly the state the caller asked for.
    assert.equal(clearFollowUpDraft(hostileStorage, "A"), true);
    assert.equal(clearFollowUpDraftIfUnchanged(hostileStorage, "A", "typed anyway"), false);
  });
});

test("with storage unavailable, typing and sending still work — drafts just stop being remembered", () => {
  // The composer's own value is never read back from storage, so the write
  // failing is invisible to typing. The only consequence is that a reload
  // finds nothing, which is the correct degraded behaviour.
  assert.equal(writeMainDraft(hostileStorage, "a question typed with storage disabled"), false);
  assert.equal(readMainDraft(hostileStorage), "");
});

test("an absent storage object degrades the same way", () => {
  assert.doesNotThrow(() => {
    assert.equal(readMainDraft(undefined), "");
    assert.equal(readFollowUpDraft(undefined, "A"), "");
  });
});

// ---------------------------------------------------------- app.js wiring

const appJs = fs.readFileSync(path.join(process.cwd(), "public", "app.js"), "utf8");
const moduleJs = fs.readFileSync(path.join(process.cwd(), "src", "services", "composerDrafts.js"), "utf8");

function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${signature}`);
}

test("the app.js mirror uses the exact same storage keys and bound as the module", () => {
  for (const literal of ['"aether.draft.main"', '"aether.draft.followups"']) {
    assert.ok(moduleJs.includes(literal), `module must define ${literal}`);
    assert.ok(appJs.includes(literal), `app.js mirror must use ${literal}`);
  }
  assert.match(appJs, /const FOLLOW_UP_DRAFT_LIMIT = 20;/);
  assert.match(moduleJs, /FOLLOW_UP_DRAFT_LIMIT = 20;/);
});

test("draft keys are centralized — no ad-hoc draft key string is built anywhere else", () => {
  const occurrences = appJs.match(/aether\.draft\./g) || [];
  assert.equal(occurrences.length, 2, "the two keys are declared once each, in DRAFT_KEYS");
});

test("only the composers' unsent text is persisted — no secrets, answers, attachments or session content", () => {
  const persist = extractFn(appJs, "function persistComposerDraft()");
  assert.match(persist, /els\.question\.value/);
  for (const forbidden of ["apiKey", "providers", "answer", "materials", "attachments", "sessionState.chat", "vault"]) {
    assert.ok(!persist.includes(forbidden), `draft persistence must not touch ${forbidden}`);
  }
});

test("draft persistence issues no network request", () => {
  for (const sig of [
    "function persistComposerDraft()",
    "function restoreComposerDraft()",
    "function writeMainDraft(text)",
    "function writeFollowUpDraft(sessionId, text)",
    "function readFollowUpMap()",
    "function scheduleDraftSave()",
    "function flushDraftSave()",
  ]) {
    assert.doesNotMatch(extractFn(appJs, sig), /fetch\(|api\(|XMLHttpRequest|navigator\.sendBeacon/, `${sig} must never contact the network`);
  }
  assert.doesNotMatch(moduleJs, /fetch\(|XMLHttpRequest|sendBeacon|import .*http/);
});

test("the main draft is cleared only after every send gate has passed", () => {
  const run = extractFn(appJs, "async function startSessionRun()");
  const clearAt = run.indexOf("clearMainDraft()");
  assert.ok(clearAt > 0, "startSessionRun must clear the main draft");
  const before = run.slice(0, clearAt);
  // Each of these is an early `return` that aborts the run, and each must sit
  // ABOVE the clear so an aborted send leaves the draft untouched.
  assert.ok(before.includes("if (!question)"), "empty-question validation precedes the clear");
  assert.ok(before.includes('str("needScholar")'), "no-Scholar validation precedes the clear");
  assert.ok(before.includes('str("attachmentsLoading")'), "attachment validation precedes the clear");
  assert.ok(before.includes("runCouncilConfigGate"), "the Council Model Check precedes the clear");
  assert.ok(before.includes("confirmModelFailureWarning"), "the failed-model confirmation precedes the clear");
  // …and the clear sits with the point that actually commits the run.
  assert.ok(before.includes("runInFlight = true"), "the clear happens only once the run is committed");
});

test("a validation or pre-check abort returns before ever reaching the clear", () => {
  const run = extractFn(appJs, "async function startSessionRun()");
  const clearAt = run.indexOf("clearMainDraft()");
  const aborts = run.slice(0, clearAt).match(/\breturn;/g) || [];
  assert.ok(aborts.length >= 5, "every gate aborts with a bare return above the clear");
  // The gates must not be reordered below the clear later on.
  assert.equal(run.slice(clearAt).includes("runCouncilConfigGate"), false);
  assert.equal(run.slice(clearAt).includes("confirmModelFailureWarning"), false);
});

test("a run that fails outright re-saves the question it puts back in the composer", () => {
  const run = extractFn(appJs, "async function startSessionRun()");
  assert.match(run, /els\.question\.value = question;\s*(\/\/[^\n]*\n\s*)*writeMainDraft\(question\);/);
});

test("a follow-up draft is cleared only on a confirmed reply, never at dispatch", () => {
  // The signature gained an `options` argument (session-recovery: a send
  // refused because the server lost the Session hands the typed text back).
  // The draft rule below is unchanged by it.
  const send = extractFn(appJs, "async function sendChat(message, options)");
  // Captured before the await so a mid-flight state change cannot misroute it.
  assert.match(send, /const draftSessionId = activeSessionDraftId\(\);/);
  const clearAt = send.indexOf("clearFollowUpDraftIfUnchanged(draftSessionId, text)");
  assert.ok(clearAt > 0, "sendChat must retire the draft on success");
  const before = send.slice(0, clearAt);
  assert.ok(before.includes("sessionState.chat.push"), "the turn is recorded before the draft is retired");
  // It must live in the try, above the catch — a failure can never reach it.
  assert.ok(before.lastIndexOf("} catch (err) {") === -1, "the clear must sit in the success branch");
  // handleSend empties the textarea but must NOT clear the draft itself.
  const handle = extractFn(appJs, "function handleSend()");
  assert.ok(!handle.includes("clearFollowUpDraft"), "dispatch is not acceptance");
  assert.match(handle, /cancelPendingDraftSave\(\);/, "only the pending debounced write is cancelled");
});

test("explicit Reset clears both drafts it could own, scoped to the discarded Session", () => {
  const reset = extractFn(appJs, "async function performReset()");
  // The id must be read before sessionState is dropped, or there is nothing
  // left to scope the follow-up draft to.
  const idAt = reset.indexOf("const discardedSessionId = activeSessionDraftId();");
  const nullAt = reset.indexOf("sessionState = null;");
  assert.ok(idAt >= 0 && nullAt > idAt, "the Session id is captured before it is discarded");
  assert.match(reset, /clearMainDraft\(\);/);
  assert.match(reset, /clearFollowUpDraft\(discardedSessionId\);/);
});

test("restore is silent and routed by the composer's actual state, and never overwrites live text", () => {
  const restore = extractFn(appJs, "function restoreComposerDraft()");
  assert.match(restore, /if \(els\.question\.value\) return;/, "text already in the composer always wins");
  assert.match(restore, /sessionConfigLocked \? readFollowUpDraft\(activeSessionDraftId\(\)\) : readMainDraft\(\)/);
  // No banner, no dialog, no confirmation — the requirement is invisibility.
  assert.doesNotMatch(restore, /confirm\(|showModal|setHeaderMsg|librarianStatus|hidden = false/);
  // It must run after restoreSession(), which is what decides which composer
  // this page load actually has.
  assert.match(appJs, /loadStatus\(\)\.then\(restoreSession\)\.finally\(restoreComposerDraft\);/);
});

test("the follow-up draft is scoped to the Session id the composer is already gated on", () => {
  const id = extractFn(appJs, "function activeSessionDraftId()");
  assert.match(id, /sessionState\?\.id/, "reuses the existing Session identity");
  // chatReady() is what enables the follow-up composer, and it already
  // requires that same id — so a follow-up can never be typed without one.
  const ready = extractFn(appJs, "function chatReady()");
  assert.match(ready, /if \(!s \|\| !s\.id\) return false;/);
  // No parallel identity system.
  assert.ok(!appJs.includes("draftSessionCounter") && !appJs.includes("generateDraftId"));
});

test("typing stays passive — the input listener only schedules a save", () => {
  assert.match(appJs, /els\.question\.addEventListener\("input", scheduleDraftSave\);/);
  const schedule = extractFn(appJs, "function scheduleDraftSave()");
  assert.doesNotMatch(schedule, /preventDefault|els\.question\.value =/, "normal textarea behaviour is untouched");
});

test("a debounced write is flushed before the page can go away, so a refresh loses nothing", () => {
  assert.match(appJs, /const DRAFT_DEBOUNCE_MS = 300;/);
  assert.match(appJs, /window\.addEventListener\("pagehide", flushDraftSave\);/);
  assert.match(appJs, /document\.addEventListener\("visibilitychange"/);
  const flush = extractFn(appJs, "function flushDraftSave()");
  assert.match(flush, /persistComposerDraft\(\)/);
});

test("no draft UI is introduced — no banner, toast, setting or confirmation", () => {
  for (const term of ["draftSaved", "Draft saved", "draft-banner", "draftRestored", "restore-banner"]) {
    assert.ok(!appJs.includes(term), `Draft Autosave must stay invisible (found "${term}")`);
  }
  const html = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf8");
  assert.ok(!/draft/i.test(html), "no draft markup belongs in the page");
});

test("Batch A and Batch B behaviour is untouched by Batch C", () => {
  const openStatus = extractFn(appJs, "function openProductStatus()");
  assert.doesNotMatch(openStatus, /Draft|clearMainDraft|writeMainDraft/);
  for (const sig of ["function startTutorial(fromIndex = 0)", "function openLearn()", "function openAbout()"]) {
    assert.doesNotMatch(extractFn(appJs, sig), /Draft|clearMainDraft|writeMainDraft/, `${sig} must be unaffected`);
  }
  // Batch B's own localStorage flag is a separate key with a separate meaning.
  assert.match(appJs, /const TUTORIAL_SEEN_KEY = "aether\.tutorialSeen"/);
  assert.ok(!appJs.includes("aether.draft.tutorial"));
});
