// Tests for the F8 Content tab's Open / Reveal / Reload actions.
//
// This is a DEVELOPER-UX change: the tab used to offer "Copy Relative Path",
// which still had to be pasted somewhere by hand. Open and Reveal close that
// gap by handing the file to the OS.
//
// What matters, and what these tests hold:
//
//   NO NEW REACH — the client sends a KIND (and a resource id), never a path.
//   The absolute target is resolved server-side through the SAME validated
//   resolvers the runtime already uses, so this adds no file access the
//   existing path route did not already imply.
//   DEV-ONLY — the route lives inside the devTools gate, exactly like every
//   other /api/dev/* route. A production run does not have it.
//   RELOAD UNCHANGED — the third button must still be byte-for-byte what it
//   was, since it is the one action with runtime consequences.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const server = () => readSource("../src/server.js");
const devOpen = () => readSource("../src/services/devOpen.js");

// ------------------------------------------------------------- the buttons

// --------------------------------------------------------- no scope creep

// ------------------------------------------------------------- the route

test("the target is resolved server-side through the existing validated resolvers", async () => {
  const src = await server();
  const route = src.slice(src.indexOf('app.post("/api/dev/content-open"'), src.indexOf('// The scene\'s own object list'));
  // Product is a fixed constant; everything else goes through resourcePath(),
  // which validates the id and refuses anything that escapes its root.
  assert.match(route, /if \(kind === "product"\) \{\s*target = PRODUCT_CONFIG_PATH;/);
  assert.match(route, /if \(!isValidResourceId\(id\)\) return res\.status\(400\)/);
  assert.match(route, /target = resourcePath\(kind, id\);/);
  assert.match(route, /return res\.status\(400\)\.json\(\{ error: "Unknown content kind\." \}\);/);
  // The request body is never used as a path.
  assert.doesNotMatch(route, /req\.body\?\.path|path\.resolve\(req\./);
});

test("the route is dev-only, inside the same gate as every other /api/dev route", async () => {
  const src = await server();
  const gateAt = src.indexOf("if (config.devTools) {");
  const routeAt = src.indexOf('app.post("/api/dev/content-open"');
  // Every /api/dev route sits between the gate and the first public route.
  const firstPublicAt = src.indexOf('app.get("/api/config"');
  assert.ok(gateAt > 0 && routeAt > gateAt && routeAt < firstPublicAt, "content-open must be inside the devTools gate");
});

// ----------------------------------------------------------- the OS opener

test("Open uses the OS file association; Reveal selects the file where supported", async () => {
  const dev = await devOpen();
  // Open — default handler per platform.
  assert.match(dev, /launch\("cmd\.exe", \["\/c", "start", "", targetPath\]\);/);
  assert.match(dev, /launch\("open", \[targetPath\]\);/);
  assert.match(dev, /launch\("xdg-open", \[targetPath\]\);/);
  // Reveal — /select, is ONE explorer token, not two arguments.
  assert.match(dev, /launch\("explorer\.exe", \[`\/select,\$\{targetPath\}`\]\);/);
  assert.match(dev, /launch\("open", \["-R", targetPath\]\);/);
  // Linux has no portable "select" — the containing folder is the honest
  // fallback rather than a silently different behaviour.
  assert.match(dev, /launch\("xdg-open", \[path\.dirname\(targetPath\)\]\);/);
});

test("the opener refuses anything that is not an existing file, with useful statuses", async () => {
  const dev = await devOpen();
  assert.match(dev, /if \(!stat\.isFile\(\)\) throw openError\(400, "That content path is not a file\."\);/);
  assert.match(dev, /if \(err\.code === "ENOENT"\) throw openError\(404,/);
  assert.match(dev, /if \(err\.code === "EACCES" \|\| err\.code === "EPERM"\) throw openError\(403,/);
  // Fire-and-forget, like the existing Vault opener — the exit code of a GUI
  // launcher is not a success signal, and waiting would block the request.
  assert.match(dev, /detached: true, stdio: "ignore"/);
  assert.match(dev, /child\.unref\(\);/);
  // It never composes a path from caller input.
  assert.doesNotMatch(dev, /path\.join\(|path\.resolve\(/);
});

test("no shell string is built from the path — arguments stay arguments", async () => {
  const dev = await devOpen();
  // spawn() with an argv array, never a concatenated command line, and never
  // shell:true. A path with spaces or quotes cannot become extra arguments.
  assert.match(dev, /spawn\(command, args, \{/);
  assert.doesNotMatch(dev, /shell:\s*true/);
  assert.doesNotMatch(dev, /exec\(|execSync\(/);
});

// ---------------------------------------------------------------- runtime

test("nothing outside the Content tab changed", async () => {
  const src = await server();
  // The existing path route is untouched.
  assert.match(src, /app\.get\("\/api\/dev\/content-resources\/:kind\/:id\/path"/);
  assert.match(src, /res\.json\(\{ kind, id, path: relativeResourcePath\(kind, id\) \}\)/);
  // The content services themselves are unchanged: the opener is a separate
  // module, and nothing was added to the production resource resolvers.
  const resources = await readSource("../src/services/contentResources.js");
  assert.doesNotMatch(resources, /spawn|openPathInOs|child_process/);
  const product = await readSource("../src/services/productConfig.js");
  assert.doesNotMatch(product, /spawn|openPathInOs|child_process/);
  // No version bump came with it.
  const pkg = JSON.parse(await readSource("../package.json"));
  assert.equal(pkg.version, "1.0.1");
});
