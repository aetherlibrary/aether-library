// F8 panel hierarchy: FILE → DEFAULT SCENE → VIEWPORT → TOOLS.
//
// The rule these tests protect: everything ABOVE Tools is persistent and
// tool-independent — which file you are editing, which file the application
// boots into, and how you are looking at it. A tool tab is only HOW you edit
// the Scene, so none of those three may live inside one.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const app = () => readSource("../public/app.js");
const server = () => readSource("../src/server.js");

// Comments mention these headings constantly; assertions about STRUCTURE must
// read the code, not the prose around it.
//
// LINE-ANCHORED on purpose. A naive /\/\*[\s\S]*?\*\//g swallows live code the
// moment it meets a `/*` inside a regex literal or string, and a naive
// //-stripper eats the tail of any line containing a URL. This codebase writes
// its prose as whole-line comments, which is exactly what this removes.
const stripComments = (src) => src.replace(/^[ \t]*\/\/[^\n]*$/gm, "").replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, "");

// =========================================================== DEFAULT SCENE

// ================================================================== server

test("configuring is dev-only; reading is runtime", async () => {
  const src = await server();
  const devStart = src.indexOf("if (config.devTools) {");
  const alwaysOn = src.indexOf('app.get("/api/health"');
  assert.ok(devStart >= 0 && alwaysOn > devStart);

  // All three configuration routes are inside the dev gate.
  for (const route of [
    'app.get("/api/dev/default-scene"',
    'app.post("/api/dev/default-scene"',
    'app.delete("/api/dev/default-scene"',
  ]) {
    const at = src.indexOf(route);
    assert.ok(at > devStart && at < alwaysOn, `${route} must be dev-only`);
  }

  // The runtime Scene routes are outside it, and read through the resolver.
  for (const route of ['app.get("/api/scene-layout"', 'app.get("/api/scene-config"', 'app.get("/api/scene-content"']) {
    const at = src.indexOf(route);
    assert.ok(at > alwaysOn || at > devStart, `${route} must exist`);
    const body = src.slice(at, at + 400);
    assert.match(body, /resolveRuntimeScene\(\)/, `${route} must resolve the Default Scene`);
  }
});

test("production reads the Default Scene but is told nothing about the path", async () => {
  const src = await server();
  // publicConfig carries no path — the absolute local path stays server-side.
  const at = src.indexOf("function publicConfig(");
  const body = src.slice(at, at + 2500);
  assert.ok(!/defaultScene/i.test(body), "publicConfig must not expose the Default Scene path");
  // The client never asks for it either.
  assert.doesNotMatch(await app(), /default-scene/);
});

test("the client fetches props from the resolved route, not the static mount", async () => {
  const src = await app();
  assert.match(src, /const SCENE_CONFIG_URL = "\/api\/scene-config";/);
  assert.doesNotMatch(src, /"\/assets\/scenes\/classic_library\.json"/);
});
