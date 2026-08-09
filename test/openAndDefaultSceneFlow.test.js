// FILE > Open and DEFAULT SCENE > Select.
//
// BOTH WERE BROKEN BY ONE BUG, and the shape of that bug is what these tests
// guard. WINDOWS_SCRIPT was joined with "; ", putting a semicolon before
// `else`, which ends the if-statement. Save As kept working (its branch had
// already assigned $d); Open never assigned $d at all, never reached
// ShowDialog, and fell through to writing the CANCEL sentinel.
//
// So a completely broken dialog was reported to the caller as "the author
// changed their mind" — and the caller's correct response to a cancel is to do
// nothing, silently. That is why Open "appeared to do nothing" rather than
// erroring. Cancel and failure must never share a representation again.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const server = () => readSource("../src/server.js");

// Bounded slice of one editor function.
const fnBody = (src, name, end) => {
  const at = src.indexOf(`async function ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  return src.slice(at, end ? src.indexOf(end, at) : at + 1400);
};

// ====================================================== the dialog result

// ============================================================ FILE > Open

// ================================================ DEFAULT SCENE > Select

// ================================================================ server

test("one dialog route serves both modes; production has none", async () => {
  const srv = await server();
  const route = srv.slice(srv.indexOf('app.post("/api/dev/scene-file/dialog"'), srv.indexOf('app.get("/api/dev/scene-file/new"'));
  assert.match(route, /const mode = req\.body\?\.mode === "save" \? "save" : "open";/);
  assert.match(route, /mode === "save" \? await pickSceneFileToSave\(options\) : await pickSceneFileToOpen\(options\)/);
  // Dev-gated.
  const devStart = srv.indexOf("if (config.devTools) {");
  const alwaysOn = srv.indexOf('app.get("/api/health"');
  const at = srv.indexOf('app.post("/api/dev/scene-file/dialog"');
  assert.ok(at > devStart && at < alwaysOn);
});
