// VERSION OWNERSHIP — one source, every surface derived from it.
//
// THE BUG THESE PIN. The application shipped able to report two different
// versions at once: package.json said one number while the Start Menu and
// /api/health said the previous release's. Both were hardcoded literals with
// nothing connecting them to the version actually being built, so a bump only
// landed on the surfaces someone remembered to edit by hand. It had already
// happened across more than one release.
//
// The fix is ownership, not vigilance: package.json is canonical, config.js's
// appVersion reads it, and every production surface derives from appVersion.
//
// DELIBERATELY VERSION-AGNOSTIC. Not one assertion here names a release
// number, so a future bump makes these pass unchanged — an expected-literal
// test is the very thing that rotted last time. What is asserted is the
// RELATIONSHIP, which a literal could never check: both sides can be edited to
// the same wrong number, but they cannot be decoupled without failing here.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = async (rel) => (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const pkg = JSON.parse(await read("../package.json"));
const configSrc = await read("../src/config.js");
const serverSrc = await read("../src/server.js");
const indexHtml = await read("../public/index.html");
const appJs = await read("../public/app.js");

// Comments explain at length which literals were REMOVED and why, so the
// "no hardcoded release number" assertions have to run against code alone.
const codeOnly = (src) => src.replace(/^\s*\/\/.*$/gm, "");
const htmlCodeOnly = (src) => src.replace(/<!--[\s\S]*?-->/g, "");

// A release literal is a bare semver in source. Version-like strings that are
// NOT the app's release (schema versions, dependency ranges) are not written
// this way in the files under test.
const RELEASE_LITERAL = /["'`]v?\d+\.\d+\.\d+["'`]/;

// ------------------------------------------------------------ 1. the source

test("package.json owns the application version", () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+/, "package.json must carry a real version");
});

// -------------------------------------------------------- 2. config.appVersion

test("config.appVersion IS package.json's version, read at runtime", async () => {
  // The read itself, not merely a mention of the filename.
  assert.match(
    configSrc,
    /JSON\.parse\(fs\.readFileSync\(path\.join\(projectRoot, "package\.json"\), "utf8"\)\)\.version/,
    "appVersion must be derived from package.json"
  );
  const { appVersion } = await import("../src/config.js");
  assert.equal(appVersion, pkg.version, "the app version must BE package.json's version");

  // Exactly one definition — a second would be a second authority.
  assert.equal((configSrc.match(/export const appVersion/g) || []).length, 1);
});

test("appVersion reaches the frontend through publicConfig, not a parallel field", async () => {
  const { publicConfig } = await import("../src/config.js");
  assert.equal(publicConfig().appVersion, pkg.version);
});

// ------------------------------------------------------------ 3. /api/health

test("/api/health reports the canonical version, never a literal", () => {
  const route = serverSrc.slice(serverSrc.indexOf('app.get("/api/health"'));
  const handler = route.slice(0, route.indexOf("});"));
  assert.match(handler, /version: appVersion/, "the health endpoint must derive its version");
  assert.doesNotMatch(
    codeOnly(handler),
    RELEASE_LITERAL,
    "a hardcoded release number here is what made the app report a stale version"
  );
  // And appVersion is genuinely imported from the one source.
  assert.match(serverSrc, /import \{[^}]*\bappVersion\b[^}]*\} from "\.\/config\.js"/);
});

// ----------------------------------------------------------- 4. Start Menu

test("the Start Menu renders the canonical version, and ships with no number", () => {
  // The markup carries no version at all — an empty badge cannot be stale.
  const badge = indexHtml.slice(indexHtml.indexOf('<div class="start-version">'));
  const element = badge.slice(0, badge.indexOf("</div>") + "</div>".length);
  assert.equal(element, '<div class="start-version"></div>', "the badge must ship empty");

  // It is filled from the same value the About dialog uses.
  assert.match(appJs, /function renderStartMenuVersion\(\)/);
  const fn = appJs.slice(appJs.indexOf("function renderStartMenuVersion()"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /currentConfig\?\.appVersion/, "rendered from publicConfig().appVersion");
  assert.match(body, /`v\$\{version\}`/, "displayed with the v prefix the badge always had");
  assert.doesNotMatch(codeOnly(body), RELEASE_LITERAL);

  // Called when config lands, beside the other appVersion consumer, so the two
  // surfaces can never be refreshed out of step.
  assert.match(appJs, /exposeAppVersionToEditor\(\);\s*renderStartMenuVersion\(\);/);
});

test("the About dialog still reads the same source — one value, two surfaces", () => {
  assert.match(appJs, /const version = currentConfig\?\.appVersion \|\| "";/);
});

// ------------------------------- 5 & 6. no literals, so bumps stay painless

test("no production surface hardcodes a release number", () => {
  // index.html: nothing outside comments may look like a version.
  assert.doesNotMatch(
    htmlCodeOnly(indexHtml).replace(/initial-scale=1\.0/g, ""),
    /v\d+\.\d+\.\d+/,
    "index.html must not carry a release number"
  );
  // server.js: the health route is the only place that ever did.
  assert.doesNotMatch(codeOnly(serverSrc), /version: "\d+\.\d+\.\d+"/);
});

test("a future version bump requires no test or production edit", async () => {
  // The whole contract restated as one property: every surface equals
  // package.json's version, whatever that version happens to be. Nothing here
  // — or in the assertions above — names a release, so bumping package.json
  // alone keeps all of it true.
  const { appVersion, publicConfig } = await import("../src/config.js");
  for (const [name, value] of [
    ["config.appVersion", appVersion],
    ["publicConfig().appVersion", publicConfig().appVersion],
  ]) {
    assert.equal(value, pkg.version, `${name} must track package.json`);
  }
  // The two formerly-stale surfaces are now expressions, not values, so there
  // is nothing left for a bump to forget.
  assert.match(serverSrc, /version: appVersion/);
  assert.match(appJs, /el\.textContent = version \? `v\$\{version\}` : "";/);
});
