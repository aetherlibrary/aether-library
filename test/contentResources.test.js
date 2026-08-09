// Tests for the Content architecture refactor (§B–§K).
//
// Ownership after the refactor:
//   PRODUCT   config/product.json — official links, copyright, description,
//             and the single global Learn reference. Hand-edited, no write
//             route, unreachable from Scene or World data.
//   LEARN     assets/content/learn/<id>.json — global product documentation.
//   TUTORIAL  assets/content/tutorial/<id>.json — selected per Scene BY ID.
//   SCENE     remembers only that id. No About, no links, no embedded
//             tutorial, no presets.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let C;
let S;
let tmpRoot;
let contentRoot;
let scenePath;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-content-"));
  contentRoot = path.join(tmpRoot, "content");
  scenePath = path.join(tmpRoot, "scene.ui.json");
  process.env.CONTENT_ROOT = contentRoot;
  process.env.SCENE_UI_PATH = scenePath;
  await fs.mkdir(path.join(contentRoot, "tutorial"), { recursive: true });
  await fs.mkdir(path.join(contentRoot, "learn"), { recursive: true });
  C = await import("../src/services/contentResources.js");
  S = await import("../src/services/sceneContent.js");
});

after(async () => {
  delete process.env.CONTENT_ROOT;
  delete process.env.SCENE_UI_PATH;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(scenePath, { force: true });
  for (const kind of ["tutorial", "learn"]) {
    await fs.rm(path.join(contentRoot, kind), { recursive: true, force: true });
    await fs.mkdir(path.join(contentRoot, kind), { recursive: true });
  }
});

const writeResource = (kind, id, data) =>
  fs.writeFile(path.join(contentRoot, kind, `${id}.json`), JSON.stringify(data), "utf8");

// The real shipped resources, used to prove the migration preserved them.
const shippedLearn = JSON.parse(
  await fs.readFile(path.join(process.cwd(), "assets", "content", "learn", "default.json"), "utf8")
);
const shippedTutorial = JSON.parse(
  await fs.readFile(path.join(process.cwd(), "assets", "content", "tutorial", "default.json"), "utf8")
);

// ==================================================== RESOURCE SECURITY

test("34/35. traversal and arbitrary paths are rejected as resource ids", () => {
  for (const bad of [
    "../escape",
    "..",
    "/etc/passwd",
    "C:/Windows/system32",
    "a/b",
    "a\\b",
    ".hidden",
    "UPPER",
    "",
    "file:///etc/passwd",
    "x".repeat(80),
    null,
  ]) {
    assert.equal(C.isValidResourceId(bad), false, `${bad} must be rejected`);
    assert.throws(() => C.resourcePath("tutorial", bad), /Invalid resource id|Unknown content kind/);
  }
  for (const ok of ["default", "classic", "classic_christmas", "a", "a-b_c9"]) {
    assert.equal(C.isValidResourceId(ok), true, `${ok} must be accepted`);
  }
});

test("39. a resolved resource can never escape its approved root", () => {
  const root = path.join(contentRoot, "tutorial");
  for (const id of ["default", "a-b_c9"]) {
    assert.equal(path.dirname(C.resourcePath("tutorial", id)), root);
  }
  // An unknown kind has no root at all.
  assert.throws(() => C.resourcePath("../secrets", "default"), /Unknown content kind/);
  assert.throws(() => C.resourcePath("passwords", "default"), /Unknown content kind/);
});

test("36. listing offers only valid, parseable JSON resources", async () => {
  await writeResource("learn", "default", { version: 1, locales: { en: [] } });
  await writeResource("learn", "festive", { version: 1, locales: { en: [] } });
  await fs.writeFile(path.join(contentRoot, "learn", "BAD-ID.json"), "{}", "utf8");
  await fs.writeFile(path.join(contentRoot, "learn", "broken.json"), "{ not json", "utf8");
  await fs.writeFile(path.join(contentRoot, "learn", "notes.txt"), "hello", "utf8");
  const ids = (await C.listResources("learn")).map((r) => r.id);
  assert.deepEqual(ids.sort(), ["default", "festive"]);
});

test("37. resource locations are project-relative, never absolute", async () => {
  await writeResource("tutorial", "default", shippedTutorial);
  const rel = C.relativeResourcePath("tutorial", "default");
  assert.ok(!path.isAbsolute(rel), rel);
  assert.ok(!rel.includes(tmpRoot));
  const listed = await C.listResources("tutorial");
  for (const r of listed) {
    assert.ok(!path.isAbsolute(r.path), r.path);
    for (const leak of ["C:", "/home/", "/Users/", "node_modules"]) assert.ok(!r.path.includes(leak));
  }
});

// ============================================================== LEARN

test("21/22. all 12 Learn sections migrate with their ids and order intact", () => {
  const expected = [
    "getting-started", "providers", "council", "mentor", "model-check", "vault",
    "archives", "obsidian", "materials", "privacy", "api-usage", "troubleshooting",
  ];
  for (const locale of ["en", "zh-TW"]) {
    const sections = shippedLearn.locales[locale];
    assert.equal(sections.length, 12, `${locale} must have 12 sections`);
    assert.deepEqual(sections.map((s) => s.id), expected, `${locale} ids and order`);
  }
});

test("24. privacy and API-usage content survived the migration", () => {
  for (const locale of ["en", "zh-TW"]) {
    const byId = Object.fromEntries(shippedLearn.locales[locale].map((s) => [s.id, s]));
    for (const id of ["privacy", "api-usage"]) {
      assert.ok(byId[id], `${locale}/${id} missing`);
      assert.ok(byId[id].blocks.length > 0, `${locale}/${id} has no content`);
    }
  }
  const privacyEn = JSON.stringify(shippedLearn.locales.en.find((s) => s.id === "privacy"));
  assert.match(privacyEn, /API key/i);
  assert.match(privacyEn, /provider/i);
});

test("23. Learn falls back to English for an unknown or empty locale", async () => {
  await writeResource("learn", "default", {
    version: 1,
    locales: { en: [{ id: "a", title: "A", blocks: [{ type: "p", text: "English" }] }] },
  });
  const resource = await C.loadLearnResource("default");
  assert.equal(C.learnSectionsFor(resource, "en")[0].title, "A");
  assert.equal(C.learnSectionsFor(resource, "zh-TW")[0].title, "A", "missing locale falls back");
  assert.equal(C.learnSectionsFor(resource, "de")[0].title, "A", "unknown locale falls back");
  assert.deepEqual(C.learnSectionsFor(null, "en"), [], "no resource yields an empty list, never undefined");
});

test("26. authored Learn text is sanitized to plain, safe strings", () => {
  const out = C.sanitizeLearn({
    locales: {
      en: [
        {
          id: "x/../evil",
          title: "Title\u0000with control",
          blocks: [
            { type: "p", text: "<script>alert(1)</script>" },
            { type: "list", items: ["one", "", "two"] },
            { type: "unknown", text: "" },
          ],
          extra: "dropped",
        },
        { id: "", title: "no id", blocks: [{ type: "p", text: "x" }] },
      ],
    },
  });
  const section = out.locales.en[0];
  assert.equal(section.id, "xevil", "the id is normalized to a safe slug");
  assert.equal(section.extra, undefined, "unknown fields are discarded");
  assert.ok(!section.title.includes("\u0000"));
  // Markup is carried as TEXT — the renderer uses textContent, never innerHTML.
  assert.equal(section.blocks[0].text, "<script>alert(1)</script>");
  assert.deepEqual(section.blocks[1].items, ["one", "two"], "empty items dropped");
  assert.equal(out.locales.en.length, 1, "a section with no id is dropped");
});

test("25. locale packs no longer own duplicate Learn prose", async () => {
  const localeEn = await fs.readFile(path.join(process.cwd(), "src", "locales", "en.js"), "utf8");
  const localeZh = await fs.readFile(path.join(process.cwd(), "src", "locales", "zh-TW.js"), "utf8");
  // A distinctive sentence from the migrated guide must live in the resource,
  // not in the locale packs.
  const sample = shippedLearn.locales.en.find((s) => s.id === "getting-started").blocks[0].text.slice(0, 40);
  assert.ok(sample.length > 10);
  for (const [name, src] of [["en.js", localeEn], ["zh-TW.js", localeZh]]) {
    assert.ok(!src.includes(sample), `${name} still contains migrated Learn prose`);
  }
});

// =========================================================== TUTORIAL

test("27/28. all 11 Tutorial steps migrate with stable ids and order", () => {
  const expected = [
    "settings",
  "ai-config", "vault", "core-object", "mode", "scholars",
    "attachments", "composer", "discussion-workspace", "save-to-vault", "privacy-more",
  ];
  assert.equal(shippedTutorial.steps.length, 11);
  assert.deepEqual(shippedTutorial.steps.map((s) => s.id), expected);
  assert.deepEqual(C.TUTORIAL_STEP_IDS, expected);
});

test("29. targets remain registry-only", () => {
  const out = C.sanitizeTutorial({
    steps: [
      { id: "ai-config", target: "#css-selector" },
      { id: "vault", target: "javascript:alert(1)" },
      { id: "mode", target: "scholars" },
    ],
  });
  const byId = Object.fromEntries(out.steps.map((s) => [s.id, s]));
  assert.equal(byId["ai-config"].target, "ai-config", "a selector is rejected");
  assert.equal(byId.vault.target, "vault", "a URL is rejected");
  assert.equal(byId.mode.target, "scholars", "a valid registry id is honoured");
  for (const step of out.steps) assert.ok(C.TUTORIAL_TARGET_IDS.includes(step.target));
});

test("30. preview-image safety is unchanged", () => {
  for (const bad of [
    "https://evil.test/x.png", "data:image/png;base64,AA", "file:///etc/passwd",
    "/abs/x.png", "assets/tutorial/../../secret.png", "assets/other/x.png",
    "assets/tutorial/x.svg", "assets/tutorial/x.txt",
  ]) {
    assert.equal(C.sanitizeTutorialImage(bad), "", `${bad} must be rejected`);
  }
  assert.equal(C.sanitizeTutorialImage("assets/tutorial/step8.png"), "assets/tutorial/step8.png");
});

test("33. a missing or invalid Tutorial resource falls back safely", async () => {
  const missing = await C.loadTutorialResource("nope");
  assert.equal(missing.steps.length, 11, "the built-in workflow is used");
  assert.equal(missing.missing, true);
  const traversal = await C.loadTutorialResource("../escape");
  assert.equal(traversal.steps.length, 11, "an unsafe id never reaches the filesystem");
  await fs.writeFile(path.join(contentRoot, "tutorial", "broken.json"), "{ not json", "utf8");
  const broken = await C.loadTutorialResource("broken");
  assert.equal(broken.steps.length, 11);
});

test("an all-disabled Tutorial resource restores the default workflow", () => {
  const out = C.sanitizeTutorial({ steps: C.TUTORIAL_STEP_IDS.map((id) => ({ id, enabled: false })) });
  assert.ok(out.steps.every((s) => s.enabled));
});

test("Tutorial bodies keep their line breaks", () => {
  const out = C.sanitizeTutorial({ steps: [{ id: "vault", body: { en: "One.\nTwo.\r\nThree." } }] });
  assert.equal(out.steps.find((s) => s.id === "vault").body.en, "One.\nTwo.\nThree.");
});

// ====================================================== SCENE REFERENCE

test("32. a Scene stores only the Tutorial resource id", async () => {
  const saved = await S.saveSceneContent({ sceneId: "classic_library", content: { tutorial: "default" } });
  assert.deepEqual(Object.keys(saved).sort(), ["content", "sceneId", "version"]);
  assert.deepEqual(Object.keys(saved.content), ["tutorial"]);
  const onDisk = JSON.parse(await fs.readFile(scenePath, "utf8"));
  assert.deepEqual(onDisk, saved);
  // No path of any kind reaches the file.
  const raw = await fs.readFile(scenePath, "utf8");
  for (const leak of ["/", "\\", ".json", "assets"]) {
    assert.ok(!raw.includes(`"tutorial": "${leak}`), `a path leaked: ${leak}`);
  }
});

test("a Scene cannot point at anything outside the approved root", () => {
  for (const bad of ["../escape", "/etc/passwd", "C:/Windows/x", "a/b", "file:///x", ".hidden", ""]) {
    assert.equal(S.sanitizeSceneContent({ content: { tutorial: bad } }).content.tutorial, "default");
  }
  assert.equal(S.sanitizeSceneContent({ content: { tutorial: "festive" } }).content.tutorial, "festive");
});

test("44. a legacy Scene UI document loads without crashing and drops dead fields", async () => {
  const legacy = {
    version: 2,
    sceneId: "classic_library",
    presetSource: "classic",
    about: { title: { en: "Old" }, description: { en: "Old" }, copyright: "Old ©" },
    links: [{ id: "website", url: "https://old.test", type: "website", enabled: true }],
    fixedLinks: { github: { url: "https://old.test", enabled: true } },
    tutorial: { steps: [{ id: "settings", title: { en: "Old step" } }] },
  };
  await fs.writeFile(scenePath, JSON.stringify(legacy), "utf8");
  assert.equal(S.hasLegacyFields(legacy), true);
  const loaded = await S.loadSceneContent();
  assert.deepEqual(loaded, { version: 3, sceneId: "classic_library", content: { tutorial: "default" } });
  for (const dead of ["about", "links", "fixedLinks", "tutorial", "presetSource"]) {
    assert.equal(loaded[dead], undefined, `${dead} must not be republished`);
  }
  // Nothing was destroyed: the file is untouched until something saves.
  const stillOnDisk = JSON.parse(await fs.readFile(scenePath, "utf8"));
  assert.equal(stillOnDisk.about.copyright, "Old ©", "authored data is preserved on disk");
});

test("a malformed Scene content file falls back to defaults", async () => {
  await fs.writeFile(scenePath, "{ not json", "utf8");
  const loaded = await S.loadSceneContent();
  assert.equal(loaded.content.tutorial, "default");
});

// ================================================ SOURCE-LEVEL CONTRACTS

const serverJs = (await fs.readFile(path.join(process.cwd(), "src", "server.js"), "utf8")).replace(/\r\n/g, "\n");
const appJs = (await fs.readFile(path.join(process.cwd(), "public", "app.js"), "utf8")).replace(/\r\n/g, "\n");

test("19/38. production exposes no authoring route and no product write route", () => {
  const devBlock = serverJs.indexOf("if (config.devTools) {");
  for (const route of [
    'app.post("/api/dev/scene-content"',
    'app.get("/api/dev/content-resources/:kind"',
    'app.get("/api/dev/product-path"',
  ]) {
    const at = serverJs.indexOf(route);
    assert.ok(at > devBlock, `${route} must be dev-only`);
  }
  assert.doesNotMatch(serverJs, /app\.post\("\/api\/product"/, "the product has no write route in any mode");
  assert.doesNotMatch(serverJs, /app\.post\("\/api\/content\//, "content resources are read-only at runtime");
});

test("16/17/18. official links come only from the product config", () => {
  const fn = appJs.slice(appJs.indexOf("function fixedLinkUrl(key)"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /productLinks\?\.\[productKey\]/);
  assert.doesNotMatch(body, /sceneUi/, "a Scene can never supply an official link");
  assert.doesNotMatch(body, /world/i, "a World can never supply an official link");
});

test("20. product reload goes through the same sanitized service", () => {
  assert.match(appJs, /window\.__refreshProduct = loadProduct;/);
  const fn = appJs.slice(appJs.indexOf("async function loadProduct()"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /api\("\/api\/product"\)/, "the same read route, hence the same sanitizer");
});

test("31. tutorialSeen and replay behaviour are untouched by the refactor", () => {
  assert.match(appJs, /const TUTORIAL_SEEN_KEY = "aether\.tutorialSeen";/);
  assert.match(appJs, /if \(hasSeenTutorial\(\)\) return;/);
  assert.match(appJs, /markTutorialSeen\(\);/);
  // Steps now come from the resource payload, through the same one resolver.
  assert.match(appJs, /const authored = sceneUi\?\.steps;/);
  assert.match(appJs, /api\("\/api\/content\/tutorial"\)/);
});
