// Tests for the Session Materials unified input layer (src/services/
// materials.js), focused on the "archive" kind added for the Continue
// Discussion feature (Archives detail action) — a previous-discussion
// material must be reachable through the SAME pipeline every other
// attachment kind uses, while still reading distinctly to the AI. Run with
// `npm test` (Node's built-in test runner — no new dependency).

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMaterials, materialsBlock, materialsMetadata, continuationLineageFrom } from "../src/services/materials.js";

test("normalizeMaterials: accepts a well-formed archive material", () => {
  const result = normalizeMaterials([{ kind: "archive", name: "Origin of the Big Bang", text: "# Origin of the Big Bang\n\nSome discussion." }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "archive");
  assert.equal(result[0].name, "Origin of the Big Bang");
  assert.equal(result[0].text, "# Origin of the Big Bang\n\nSome discussion.");
});

test("normalizeMaterials: an archive material with no text is dropped, never throws", () => {
  assert.deepEqual(normalizeMaterials([{ kind: "archive", name: "Empty" }]), []);
  assert.deepEqual(normalizeMaterials([{ kind: "archive", name: "Blank", text: "   " }]), []);
});

test("normalizeMaterials: archive text is capped exactly like a document's", () => {
  const long = "x".repeat(30_000);
  const result = normalizeMaterials([{ kind: "archive", name: "Huge", text: long }]);
  assert.ok(result[0].text.length < long.length);
  assert.ok(result[0].text.endsWith("[…truncated]"));
});

test("normalizeMaterials: archive coexists with a normal document, both survive", () => {
  const result = normalizeMaterials([
    { kind: "archive", name: "Black Hole Hypothesis", text: "# Black Hole Hypothesis\n\nPrior ruling." },
    { kind: "document", name: "new-paper.pdf", text: "Fresh paper content." },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].kind, "archive");
  assert.equal(result[1].kind, "document");
});

test("materialsBlock: an archive material gets its own 'previous discussion' framing, not the generic one", () => {
  const block = materialsBlock([{ kind: "archive", name: "Origin of the Big Bang", text: "# Origin of the Big Bang\n\nPrior content here." }]);
  assert.match(block, /### Previous discussion: Origin of the Big Bang/);
  assert.match(block, /completed earlier Aether Library conversation/);
  assert.match(block, /not authoritative truth/);
  assert.match(block, /Prior content here\./);
  // Never framed as ordinary "attached" reference material.
  assert.doesNotMatch(block, /### Attached document: Origin of the Big Bang/);
});

test("materialsBlock: an archive alongside a normal document keeps each its own distinct framing", () => {
  const block = materialsBlock([
    { kind: "archive", name: "Black Hole Hypothesis", text: "Prior ruling text." },
    { kind: "document", name: "new-paper.pdf", text: "Fresh paper text." },
  ]);
  assert.match(block, /### Previous discussion: Black Hole Hypothesis/);
  assert.match(block, /### Attached document: new-paper\.pdf/);
  // The normal document must NOT be described as prior discussion context.
  const docSection = block.slice(block.indexOf("### Attached document"));
  assert.doesNotMatch(docSection, /completed earlier Aether Library conversation/);
});

test("materialsBlock: does not waste tokens — the archive framing is a short, fixed instruction", () => {
  const block = materialsBlock([{ kind: "archive", name: "X", text: "Y" }]);
  // The framing sentence itself (excluding heading/content) stays under a
  // small fixed budget, regardless of how long the archive content is.
  const framing = block.split("\n").find((line) => line.includes("completed earlier"));
  assert.ok(framing.length < 400, `framing sentence should be concise, was ${framing.length} chars`);
});

test("materialsMetadata: an archive material persists a restorable text preview, like a document", () => {
  const meta = materialsMetadata([{ kind: "archive", name: "Origin of the Big Bang", text: "# Origin of the Big Bang\n\nContent." }]);
  assert.equal(meta.length, 1);
  assert.equal(meta[0].kind, "archive");
  assert.equal(meta[0].name, "Origin of the Big Bang");
  assert.equal(meta[0].preview.text, "# Origin of the Big Bang\n\nContent.");
});

// ============================================================
// Archive Discussion Threads — continuationLineageFrom()
// ============================================================
// The one place that decides whether a run request actually establishes
// thread lineage (session.threadId/parentSessionId). Deliberately gated on
// the normalized materials array genuinely carrying a `kind: "archive"`
// entry — never trusting the client's claim alone, and never inferring
// anything from the archive material's own Markdown text.

const archiveMaterial = [{ kind: "archive", name: "X", text: "Y" }];
const documentMaterial = [{ kind: "document", name: "notes.md", text: "Y", language: null }];

test("continuationLineageFrom: an archive-kind material + a continuation claim propagates it", () => {
  const lineage = continuationLineageFrom(archiveMaterial, { sourceSessionId: "session-A", sourceThreadId: "session-A" });
  assert.deepEqual(lineage, { parentSessionId: "session-A", threadId: "session-A" });
});

test("continuationLineageFrom: no continuation claim at all -> no lineage, even with an archive material present", () => {
  assert.deepEqual(continuationLineageFrom(archiveMaterial, null), { parentSessionId: null, threadId: null });
  assert.deepEqual(continuationLineageFrom(archiveMaterial, undefined), { parentSessionId: null, threadId: null });
});

test("continuationLineageFrom: a normal attachment NEVER establishes a thread relationship, even if a continuation claim rides along", () => {
  const lineage = continuationLineageFrom(documentMaterial, { sourceSessionId: "session-A", sourceThreadId: "session-A" });
  assert.deepEqual(lineage, { parentSessionId: null, threadId: null });
});

test("continuationLineageFrom: removing the previous-discussion attachment (empty materials) drops the lineage claim", () => {
  const lineage = continuationLineageFrom([], { sourceSessionId: "session-A", sourceThreadId: "session-A" });
  assert.deepEqual(lineage, { parentSessionId: null, threadId: null });
});

test("continuationLineageFrom: an archive material coexisting with a normal document still propagates lineage", () => {
  const lineage = continuationLineageFrom(
    [...archiveMaterial, ...documentMaterial],
    { sourceSessionId: "session-B", sourceThreadId: "session-A" }
  );
  assert.deepEqual(lineage, { parentSessionId: "session-B", threadId: "session-A" });
});

test("continuationLineageFrom: a malformed continuation claim (non-string fields) is ignored, never throws", () => {
  assert.deepEqual(continuationLineageFrom(archiveMaterial, { sourceSessionId: 42, sourceThreadId: null }), {
    parentSessionId: null,
    threadId: null,
  });
});
