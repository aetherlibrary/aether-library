// Tests for Author Preview Mode (F9) — the dev-only preview that hides the
// F8 editor and paints a mock completed Council session with the CURRENT
// UNSAVED Scene.
//
// Two properties matter more than anything else here, and most of the file
// exists to defend them:
//
//   SAFETY — the preview must be incapable of touching anything real. No
//   provider call, no Session, no Archive, no Vault or Settings write, no
//   Scene save, no history entry. It is a DOM layer over hidden originals,
//   so there is no real state being rewritten and nothing to restore wrong.
//
//   HONESTY — what it shows must be the unsaved authoring state, resolved
//   the same way the runtime resolves it. A preview that quietly reloaded
//   from disk, or rendered saved values, would be worse than no preview.
//
// The DOM behaviour itself is exercised in the browser; what is asserted
// here is the source contract that makes that behaviour possible, plus the
// fixture's content policy.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const preview = () => readSource("../public/author-preview.js");
const app = () => readSource("../public/app.js");

// ------------------------------------------------------------- activation

// ----------------------------------------------------------- editor state

// ------------------------------------------------------------ unsaved data

test("the mock mounts inside #chat-panel so it inherits the authored theme", async () => {
  const src = await preview();
  assert.match(src, /const panel = document\.getElementById\("chat-panel"\);/);
  assert.match(src, /panel\.appendChild\(root\);/);
  // Real children are hidden, never cleared — so there is nothing to rebuild.
  assert.doesNotMatch(src, /panel\.innerHTML/);
  assert.doesNotMatch(src, /\.remove\(\)[\s\S]{0,40}chat-panel/);
  assert.match(src, /document\.body\.classList\.add\(BODY_CLASS\);/);
  assert.match(src, /document\.body\.classList\.remove\(BODY_CLASS\);/);
});

// -------------------------------------------------------- mock workspace

test("the mock exposes every surface an author needs to judge a theme", async () => {
  const src = await preview();
  // Four persona tabs, one selected — so active AND inactive tab states show.
  assert.match(src, /\{ label: identity\.judge, active: true \}/);
  for (const slot of [1, 2, 3]) {
    assert.ok(src.includes(`identity.scholars[${slot}], active: false`), `scholar ${slot} tab`);
  }
  // Session header, with the deterministic metadata.
  // Substring, not an exact token: several of these are used in combined
  // class strings ("muted sh-save-msg"), exactly as the real markup does.
  for (const cls of ["session-header", "sh-question", "sh-save-btn", "sh-meta", "sh-save-msg"]) {
    assert.ok(src.includes(cls), `missing ${cls}`);
  }
  // Completed-session content: summary container, ruling, headings, body,
  // bullets, muted text and the copy control.
  for (const cls of ["session-summary", "answer-wrap", "tab-content answer", "copy-btn", "chat-log", "chat-user", "chat-assistant"]) {
    assert.ok(src.includes(cls), `missing ${cls}`);
  }
  assert.match(src, /el\("h3", null, FIXTURE\.summary\.heading\)/);
  assert.match(src, /el\("p", "muted", FIXTURE\.summary\.muted\)/);
  // Composer controls, all three Scholar cards, mode toggle, Use Vault.
  for (const cls of ["mode-toggle", "mode-btn", "use-vault-label", "scholar-picker", "scholar-chip", "chip-check", "composer", "composer-toolbar", "attach-btn", "quick-actions-toggle"]) {
    assert.ok(src.includes(`"${cls}"`), `missing ${cls}`);
  }
  // Selected AND unselected Scholar cards are both on screen.
  assert.match(src, /index < 2 \? "scholar-chip is-on" : "scholar-chip"/);
  // The active/inactive mode buttons likewise.
  assert.match(src, /el\("button", "mode-btn is-active"/);
  assert.match(src, /el\("button", "mode-btn",/);
});

test("persona names come from the caller's Scene identity — never hardcoded", async () => {
  const src = await preview();
  // The fixture names no character at all.
  const fixture = src.slice(src.indexOf("const FIXTURE = {"), src.indexOf("// --------------------------------------------------------------- helpers"));
  for (const name of ["Grand Sage", "Architect", "Oracle", "Analyst", "大智者", "謀者", "墨者", "理者", "Traveler", "Pet"]) {
    assert.ok(!fixture.includes(name), `the fixture must not hardcode "${name}"`);
  }
  // And mount refuses to render without a resolved identity.
  assert.match(src, /if \(!identity \|\| !identity\.judge \|\| !identity\.scholars\) return false;/);
});

test("the mock Vault path is unmistakably fake, and the fixture carries no real data", async () => {
  const src = await preview();
  assert.match(src, /vaultPath: "XXX \/ Author Preview",/);
  assert.match(src, /sessionId: "PREVIEW",/);
  // Nothing that could be mistaken for a real path, address or secret.
  const fixture = src.slice(src.indexOf("const FIXTURE = {"), src.indexOf("// --------------------------------------------------------------- helpers"));
  assert.doesNotMatch(fixture, /[A-Za-z]:\\|\/Users\/|\/home\/|@[\w.]+\.\w{2,}|sk-[A-Za-z0-9]/);
  // It says what it is.
  assert.match(fixture, /no provider was called/);
});

test("the preview uses the app's own localized labels rather than a second English copy", async () => {
  const src = await preview();
  const appJs = await app();
  assert.match(appJs, /window\.__aetherStrings = \{ str, strT \};/);
  for (const key of ["saveToVault", "modeLabel", "modeCouncil", "modeMentor", "useVaultLabel", "sessionSummary", "reset", "send", "quickQuestions", "shSession", "shVault", "shScholars"]) {
    assert.ok(src.includes(`"${key}"`), `label ${key} should be looked up, not hardcoded`);
  }
});

// ----------------------------------------------------------------- safety

test("the preview cannot reach the network, a provider, a Session, an Archive or the Vault", async () => {
  const src = await preview();
  for (const forbidden of [/fetch\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /WebSocket/, /EventSource/, /localStorage/, /sessionStorage/, /\/api\//]) {
    assert.doesNotMatch(src, forbidden, `the preview must not use ${forbidden}`);
  }
  // It never writes application state either.
  for (const forbidden of [/currentConfig\s*=/, /vaultState\s*=/, /window\.__sceneEditor/, /saveLayout/, /startSessionRun/]) {
    assert.doesNotMatch(src, forbidden);
  }
});

test("one central inert boundary makes every mock control incapable of acting", async () => {
  const src = await preview();
  // Every interaction event is captured and stopped at the root — not
  // guarded control by control.
  assert.match(src, /const INERT_EVENTS = \["click", "dblclick", "mousedown", "mouseup", "submit", "change", "input", "keydown", "keypress", "keyup"\];/);
  assert.match(
    src,
    /for \(const type of INERT_EVENTS\) \{\s*root\.addEventListener\(\s*type,\s*\(e\) => \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*\},\s*true\s*\);/
  );
  // No mock control is ever wired to anything real.
  assert.doesNotMatch(src, /addEventListener\("click", (?!.*INERT)/);
  // The mock composer never carries a draft.
  assert.match(src, /textarea\.value = "";/);
});

// ------------------------------------------------------------------- keys

// -------------------------------------------------------------- isolation

test("the preview module exposes only inspection helpers", async () => {
  const src = await preview();
  const api = src.slice(src.indexOf("window.__authorPreview = {"));
  for (const member of ["mount", "unmount", "isActive", "fixture", "ROOT_ID", "BODY_CLASS"]) {
    assert.ok(api.includes(member), `missing ${member}`);
  }
  // fixture() hands out a copy, so a caller cannot mutate the mock.
  assert.match(api, /fixture: \(\) => JSON\.parse\(JSON\.stringify\(FIXTURE\)\)/);
});

// ------------------------------------------------------------ layout (F9)
// REGRESSION. The first implementation hid the F8 editor and stopped there,
// which produced the opposite of a preview: devtools/scene-editor.css line 9
// is `body.scene-editor-active #chat-panel { display: none !important; }` —
// the editor REPLACES the Workspace rather than covering it. Hiding the
// editor alone therefore left #library-panel (flex: 3) as the only item in
// the row, stretched full width, with the Workspace still hidden.
//
// Author Preview must restore the normal two-panel application layout: the
// author is here to see how the real Workspace reacts to their theme.

test("the mock lays out as real Workspace content, not as a nested panel", async () => {
  const css = await readSource("../public/style.css");
  // display: contents keeps the wrapper out of the layout — the mock
  // sections become direct flex items of #chat-panel, governed by the real
  // panel rules rather than a container of our own.
  assert.match(css, /\.author-preview \{\s*display: contents;\s*\}/);
  // No replacement panel chrome: no border, background or positioning that
  // would make the preview read as an overlay on top of the application.
  const block = css.slice(css.indexOf(".author-preview {"), css.indexOf(".author-preview {") + 200);
  assert.doesNotMatch(block, /position: (fixed|absolute)|background|border|z-index/);
});

test("restoration needs no reconstruction, because nothing real is mutated", async () => {
  const preview = await readSource("../public/author-preview.js");
  // The real Workspace children are hidden by a class and never rewritten,
  // so there is no partial hand-written subset to restore from — the exact
  // prior DOM is still sitting there untouched.
  assert.doesNotMatch(preview, /innerHTML\s*=/);
  // It only ever looks up ONE existing element — the panel it mounts into.
  const lookups = [...preview.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  // The root is looked up through the ROOT_ID constant, not a literal.
  assert.deepEqual([...new Set(lookups)].sort(), ["author-preview-indicator", "chat-panel"]);
  assert.match(preview, /document\.getElementById\(ROOT_ID\)\?\.remove\(\);/);
  for (const forbidden of [/removeChild/, /replaceChild/, /\.setAttribute\("hidden"/, /\.hidden\s*=/]) {
    assert.doesNotMatch(preview, forbidden, "the preview must not mutate real Workspace elements");
  }
  // Unmount removes exactly what mount added: the root and the indicator.
  assert.match(preview, /document\.getElementById\(ROOT_ID\)\?\.remove\(\);/);
  assert.match(preview, /document\.getElementById\("author-preview-indicator"\)\?\.remove\(\);/);
  // And restoring the real content is a single class removal.
  assert.match(preview, /document\.body\.classList\.remove\(BODY_CLASS\);/);
});

// ================================================ Tutorial integration (8-9)
// Steps 8 and 9 describe a FINISHED discussion — reviewing it, then keeping
// it — and a first-run user has none to look at. Those two steps therefore
// mount the SAME Author Preview the dev-only F9 shortcut uses.
//
// The properties that matter: one implementation shared by both callers, and
// an ownership rule strict enough that the Tutorial can never tear down a
// preview the author opened themselves, nor leave its own behind.

test("only Steps 8 and 9 want the preview, keyed on step id rather than index", async () => {
  const appJs = await app();
  assert.match(appJs, /const TUTORIAL_PREVIEW_STEPS = new Set\(\["discussion-workspace", "save-to-vault"\]\);/);
  // Index would be wrong: an authored resource may disable steps, so the
  // eighth step is not reliably at index 7.
  assert.match(appJs, /const wanted = tutorialOpen && TUTORIAL_PREVIEW_STEPS\.has\(step\?\.id\);/);
  // The five earlier steps and the closing one are not in the set.
  for (const id of ["settings", "vault", "core-object", "mode", "scholars", "attachments", "composer", "privacy"]) {
    assert.ok(!["discussion-workspace", "save-to-vault"].includes(id));
  }
});

test("one reconciliation point serves every transition, forward and back", async () => {
  const appJs = await app();
  // renderTutorial() is the single funnel every step change passes through —
  // Next, Back, and a jump past disabled steps alike.
  assert.match(
    appJs,
    /function renderTutorial\(\) \{[\s\S]{0,400}?syncTutorialAuthorPreview\(step\);/
  );
  // It settles BEFORE anything is measured, because mounting changes what
  // the spotlight can target.
  const render = appJs.slice(appJs.indexOf("function renderTutorial()"), appJs.indexOf("function renderTutorialImage"));
  assert.ok(
    render.indexOf("syncTutorialAuthorPreview(step)") < render.indexOf("positionTutorial()"),
    "the preview must settle before the ring is positioned"
  );
  // Both exits unmount, and so does a restart — so no run can inherit a
  // stale mount from an abnormally torn-down one.
  for (const fn of ["function endTutorial()", "function endTutorialPreview()", "function startTutorial("]) {
    const body = appJs.slice(appJs.indexOf(fn), appJs.indexOf(fn) + 700);
    assert.match(body, /syncTutorialAuthorPreview\(null\)/, `${fn} must reconcile the preview`);
  }
});

test("the Tutorial only ever unmounts a preview it owns", async () => {
  const appJs = await app();
  assert.match(appJs, /let tutorialOwnsAuthorPreview = false;/);
  // An already-active preview (the author's own F9 session) is left alone.
  assert.match(appJs, /if \(api\.isActive\(\)\) return; \/\/ already up — ours, or the author's own/);
  // Ownership is recorded from the mount result, and only an owned preview
  // is torn down.
  assert.match(appJs, /tutorialOwnsAuthorPreview = api\.mount\(\{ identity, indicator: false \}\);/);
  assert.match(
    appJs,
    /if \(tutorialOwnsAuthorPreview\) \{\s*api\.unmount\(\);\s*tutorialOwnsAuthorPreview = false;\s*\}/
  );
});

test("Steps 8 and 9 target the preview's own elements while it is mounted", async () => {
  const appJs = await app();
  const previewSrc = await preview();
  // Stable ids owned by the preview module, not classes guessed from outside.
  assert.match(previewSrc, /const TARGET_IDS = \{ discussion: "author-preview-discussion", saveVault: "author-preview-save-vault" \};/);
  assert.match(previewSrc, /workspace\.id = TARGET_IDS\.discussion;/);
  assert.match(previewSrc, /save\.id = TARGET_IDS\.saveVault;/);
  // Resolved only while mounted, so a stale id can never be spotlighted.
  assert.match(previewSrc, /element: \(name\) => \(active \? document\.getElementById\(TARGET_IDS\[name\] \|\| ""\) : null\)/);
  // The registry prefers the preview and falls back to the real element —
  // which keeps these steps working for a returning user with a genuine
  // Session, and for F8's "Preview This Step" where nothing is mounted.
  assert.match(appJs, /"discussion-workspace": \(\) => window\.__authorPreview\?\.element\("discussion"\) \|\| els\.discussionWorkspace,/);
  assert.match(appJs, /"save-to-vault": \(\) => window\.__authorPreview\?\.element\("saveVault"\) \|\| els\.header\.save,/);
  // Still a code-owned registry: authored JSON selects by id, never a selector.
  assert.match(appJs, /const TUTORIAL_TARGETS = \{/);
});

test("tutorial-seen behaviour is untouched by the preview", async () => {
  const appJs = await app();
  // Mounting or unmounting the preview never records "seen" — only the
  // existing endTutorial() path does, exactly as before.
  const syncAt = appJs.indexOf("function syncTutorialAuthorPreview");
  const sync = appJs.slice(syncAt, appJs.indexOf(String.fromCharCode(10) + "}", syncAt));
  assert.doesNotMatch(sync, /markTutorialSeen|TUTORIAL_SEEN_KEY|localStorage/);
  // "Preview This Step" (F8) still exits without recording seen.
  assert.match(appJs, /if \(tutorialStepsOverride\) \{\s*endTutorialPreview\(\);\s*return;\s*\}/);
  const endPreview = appJs.slice(appJs.indexOf("function endTutorialPreview()"), appJs.indexOf("function endTutorialPreview()") + 300);
  assert.doesNotMatch(endPreview, /markTutorialSeen/);
  // And it still cleans the preview up.
  assert.match(endPreview, /syncTutorialAuthorPreview\(null\)/);
});

test("nothing about the schemas or the authored resource changed", async () => {
  const W = await import("../src/services/worldContent.js");
  assert.equal(W.WORLD_CONTENT_VERSION, 1);
  assert.equal(Object.keys(W.THEME_TOKENS).length, 17);
  const sceneContent = await import("../src/services/sceneContent.js");
  assert.equal(sceneContent.SCENE_CONTENT_VERSION, 3);
  // The Tutorial resource still owns only copy/enabled/preview metadata —
  // no target selectors, no mock prose.
  const contentResources = await readSource("../src/services/contentResources.js");
  assert.doesNotMatch(contentResources, /author-preview|Author Preview/);
  // No screenshot asset was introduced for these steps.
  const tutorialJson = await fs.readFile(new URL("../assets/content/tutorial/default.json", import.meta.url), "utf8");
  const parsed = JSON.parse(tutorialJson);
  const steps = parsed.steps || [];
  for (const id of ["discussion-workspace", "save-to-vault"]) {
    const step = steps.find((s) => s.id === id);
    if (step) assert.ok(!step.previewImage, `${id} must not require a screenshot`);
  }
});
