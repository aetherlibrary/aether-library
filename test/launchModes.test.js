// The LAUNCH CONTRACT — production/development separation.
//
// THE INVARIANT: a shipped launch is production-safe by default, and the
// authoring tools turn on only for an explicit development launch. The
// dangerous shape this replaces was a normal `node src/server.js` with no
// NODE_ENV set, which fell through to DEV_TOOLS defaulting ON — so a fresh
// public checkout served the whole F8 Scene Editor and ~45 write-capable
// /api/dev/* routes to anyone who followed the documented start command.
//
// The fix is a bootstrap entry (src/start.js) rather than a shell prefix,
// because `NODE_ENV=production node ...` is not portable to cmd.exe or
// PowerShell and Aether Library ships on Windows and macOS.
//
// Most of this file is fast source/config assertion. The last section spawns
// BOTH modes for real and checks the HTTP surface, because "the route 404s in
// production" is the actual security claim and deserves to be observed rather
// than inferred.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Repo root, resolved portably — a URL pathname is "/D:/..." on Windows and
// "/Users/..." on macOS, so it must never be sliced by hand.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readSrc = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const pkg = JSON.parse(await readSrc("../package.json"));

// ==================================================== the launch commands

test("npm start runs the production bootstrap, not the server directly", async () => {
  assert.equal(pkg.scripts.start, "node src/start.js");
  // No shell-prefixed environment assignment: that is the non-portable shape
  // this design exists to avoid.
  assert.doesNotMatch(pkg.scripts.start, /^[A-Z_]+=/, "no VAR=value prefix — breaks on Windows");
  assert.doesNotMatch(pkg.scripts.start, /cross-env|dotenv-cli|env /, "no new dependency was introduced");
});

test("the package's default entry is the production bootstrap, not the dev server", async () => {
  // Nothing reads `main` today (the app is private and always launched through
  // a script), but a future desktop packager that resolves it must land on the
  // production-safe entry rather than silently shipping the authoring build.
  assert.equal(pkg.main, "src/start.js");
});

test("npm run dev keeps the existing authoring launch, watch included", async () => {
  assert.equal(pkg.scripts.dev, "node --watch src/server.js");
  // The dev path deliberately does NOT go through src/start.js — that entry
  // forces production, which would disable exactly what dev mode is for.
  assert.doesNotMatch(pkg.scripts.dev, /start\.js/);
});

// ==================================================== the bootstrap entry

test("the production bootstrap sets NODE_ENV before anything can read it", async () => {
  const src = await readSrc("../src/start.js");
  const assignAt = src.indexOf('process.env.NODE_ENV = "production"');
  const importAt = src.indexOf('await import("./server.js")');
  assert.ok(assignAt > 0, "the entry sets NODE_ENV");
  assert.ok(importAt > assignAt, "server.js is imported AFTER the assignment");
  // A static import would be hoisted above the assignment and evaluated
  // first, which is the whole reason this is a dynamic import.
  assert.doesNotMatch(src, /^\s*import\s+.*from\s+["']\.\/server\.js["']/m, "must not statically import server.js");
  assert.doesNotMatch(src, /^\s*import\s+.*from\s+["']\.\/config\.js["']/m, "must not statically import config.js");
  // Unconditional, not default-if-absent: a stray NODE_ENV in the user's
  // shell must not be able to turn a shipped launch into an authoring one.
  assert.doesNotMatch(src, /NODE_ENV\s*\?\?=|NODE_ENV\s*\|\|=/, "must not be a conditional default");
  assert.doesNotMatch(src, /if\s*\(\s*!process\.env\.NODE_ENV/, "must not be a conditional default");
});

// ==================================================== the resolved config

test("production reports devTools false and no environment variable overrides it", async () => {
  const cfg = await import("../src/config.js");
  const restore = { node: process.env.NODE_ENV, dev: process.env.DEV_TOOLS };

  process.env.NODE_ENV = "production";
  delete process.env.DEV_TOOLS;
  cfg.reloadConfig();
  assert.equal(cfg.config.devTools, false, "production is off");
  assert.equal(cfg.publicConfig().devTools, false, "and the frontend is told so");

  // Even an explicit opt-in loses to production — the frontend gates F8 on
  // this same flag, so this is what makes the editor unreachable.
  process.env.DEV_TOOLS = "true";
  cfg.reloadConfig();
  assert.equal(cfg.config.devTools, false, "explicit DEV_TOOLS=true must not win in production");

  // A development launch (no NODE_ENV) still enables the authoring tools.
  delete process.env.NODE_ENV;
  delete process.env.DEV_TOOLS;
  cfg.reloadConfig();
  assert.equal(cfg.config.devTools, true, "dev launch keeps the editor");

  restore.node === undefined ? delete process.env.NODE_ENV : (process.env.NODE_ENV = restore.node);
  restore.dev === undefined ? delete process.env.DEV_TOOLS : (process.env.DEV_TOOLS = restore.dev);
  cfg.reloadConfig();
});

test("the dev-only surface is registered behind the gate, never outside it", async () => {
  const server = await readSrc("../src/server.js");
  const gateAt = server.indexOf("if (config.devTools) {");
  assert.ok(gateAt > 0);
  // The editor's static mount and every dev route sit after the gate opens.
  const staticAt = server.indexOf('app.use("/dev", express.static');
  assert.ok(staticAt > gateAt, "/dev static mount is inside the gate");
  for (const m of server.matchAll(/app\.(get|post|put|delete)\("(\/api\/dev\/[^"]*)"/g)) {
    assert.ok(m.index > gateAt, `${m[2]} must be inside the devTools gate`);
  }
});

// ==================================================== both modes, for real

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const running = [];
after(() => running.forEach((c) => { try { c.kill(); } catch { /* already gone */ } }));

// Boots a server with EVERY writable path pointed at a scratch directory, so
// a launch test can never touch real Scene, config or vault data.
async function boot(entry, extraEnv = {}) {
  const port = await freePort();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aether-launch-"));
  await fs.writeFile(path.join(tmp, ".env"), "");
  const child = spawn(process.execPath, [entry], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...extraEnv,
      PORT: String(port),
      ENV_FILE_PATH: path.join(tmp, ".env"),
      SCENE_LAYOUT_PATH: path.join(tmp, "scene-layout.json"),
      RUNTIME_SCENE_CONFIG_PATH: path.join(tmp, "runtime-scene.json"),
      AUTHORING_CONFIG_PATH: path.join(tmp, "authoring.json"),
      VAULT_PATH: path.join(tmp, "vault"),
      ARCHIVES_PATH: path.join(tmp, "archives"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.push(child);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${entry} did not start in time`)), 20000);
    child.stdout.on("data", (b) => {
      if (String(b).includes("running at")) { clearTimeout(timer); resolve(); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`${entry} exited early (${code})`)); });
  });
  const get = async (p) => (await fetch(`http://127.0.0.1:${port}${p}`)).status;
  return { get, port, child, tmp };
}

const DEV_ROUTES = ["/api/dev/assets?ext=png", "/api/dev/scene-file/new", "/api/dev/backgrounds"];
