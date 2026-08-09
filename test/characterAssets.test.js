// Character Asset discovery (src/services/characterAssets.js) — Phase 1 of
// the Character management architecture. Verifies both supported layouts
// (current flat PNGs + future folders with optional character.json), the
// baseline-front-image fallback order, portrait priority, and missing-asset
// reporting. Uses CHARACTER_ASSETS_DIR so the real assets/ is never touched.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let characterAssets;
let tmpRoot;
let dialogueRoot;

async function makeAssetsDir(structure) {
  // Fresh scratch dir per test: { "name.png": true, "folder/": { files... } }
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(tmpRoot, { recursive: true });
  for (const [name, content] of Object.entries(structure)) {
    if (typeof content === "object") {
      const dir = path.join(tmpRoot, name);
      await fs.mkdir(dir, { recursive: true });
      for (const [file, fileContent] of Object.entries(content)) {
        await fs.writeFile(path.join(dir, file), typeof fileContent === "string" ? fileContent : "png");
      }
    } else {
      await fs.writeFile(path.join(tmpRoot, name), typeof content === "string" ? content : "png");
    }
  }
}

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-char-assets-test-"));
  process.env.CHARACTER_ASSETS_DIR = tmpRoot;
  dialogueRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aether-dialogue-bubbles-test-"));
  process.env.DIALOGUE_BUBBLES_DIR = dialogueRoot;
  characterAssets = await import("../src/services/characterAssets.js");
});

after(async () => {
  delete process.env.CHARACTER_ASSETS_DIR;
  delete process.env.DIALOGUE_BUBBLES_DIR;
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.rm(dialogueRoot, { recursive: true, force: true });
});

async function makeDialogueDir(files) {
  await fs.rm(dialogueRoot, { recursive: true, force: true });
  await fs.mkdir(dialogueRoot, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dialogueRoot, name), content);
  }
}

test("flat PNG (the CURRENT structure): the file is its own baseline front image", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const assets = await characterAssets.discoverCharacterAssets();
  assert.equal(assets.length, 1);
  assert.deepEqual(assets[0], {
    characterId: "classic_omega",
    displayName: "classic_omega",
    folder: "assets/characters",
    frontImage: "assets/characters/classic_omega.png",
    portraitImage: null,
    sprites: { front: null, back: null, left: null, right: null },
    speechBubbleMapping: {},
    speechBubbleSet: null,
    visualStates: { standing: {}, sitting: {} },
    hasMetadata: false,
    missing: false,
  });
});

test("folder asset with character.json: metadata is authoritative, portrait resolved", async () => {
  await makeAssetsDir({
    "socrates/": {
      "character.json": JSON.stringify({
        characterId: "socrates",
        displayName: "Socrates of Athens",
        front: "front.png",
        portrait: "portrait.png",
        visualStates: { standing: { idle: {} }, sitting: {} },
      }),
      "front.png": true,
      "portrait.png": true,
    },
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.characterId, "socrates");
  assert.equal(asset.displayName, "Socrates of Athens");
  assert.equal(asset.frontImage, "assets/characters/socrates/front.png");
  assert.equal(asset.portraitImage, "assets/characters/socrates/portrait.png");
  assert.deepEqual(asset.visualStates, { standing: { idle: {} }, sitting: {} });
  assert.equal(asset.hasMetadata, true);
  assert.equal(asset.missing, false);
});

test("folder asset WITHOUT metadata: everything is inferred from the folder + files", async () => {
  await makeAssetsDir({ "merlin/": { "front.png": true, "portrait.png": true } });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.characterId, "merlin");
  assert.equal(asset.displayName, "merlin");
  assert.equal(asset.frontImage, "assets/characters/merlin/front.png");
  assert.equal(asset.portraitImage, "assets/characters/merlin/portrait.png");
  assert.equal(asset.hasMetadata, false);
});

test("baseline front fallback order: front.png > <folder>.png > first PNG alphabetically", async () => {
  await makeAssetsDir({
    "a_has_front/": { "front.png": true, "zzz.png": true },
    "b_has_named/": { "b_has_named.png": true, "aaa.png": true },
    "c_first_png/": { "walk.png": true, "idle.png": true },
  });
  const assets = await characterAssets.discoverCharacterAssets();
  const by = (id) => assets.find((a) => a.characterId === id);
  assert.equal(by("a_has_front").frontImage, "assets/characters/a_has_front/front.png");
  assert.equal(by("b_has_named").frontImage, "assets/characters/b_has_named/b_has_named.png");
  assert.equal(by("c_first_png").frontImage, "assets/characters/c_first_png/idle.png", "alphabetically first PNG");
});

test("a character.json naming a nonexistent front falls back instead of producing a broken path", async () => {
  await makeAssetsDir({
    "typo/": { "character.json": JSON.stringify({ front: "does_not_exist.png" }), "real.png": true },
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.frontImage, "assets/characters/typo/real.png");
});

test("missing asset: a folder with no PNGs at all is reported (missing: true), never hidden", async () => {
  await makeAssetsDir({ "empty_one/": { "notes.txt": "todo" } });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.characterId, "empty_one");
  assert.equal(asset.frontImage, null);
  assert.equal(asset.missing, true);
});

test("characterId normalization + folder-over-flat-file precedence for the same id", async () => {
  await makeAssetsDir({
    "Fancy Name/": { "character.json": JSON.stringify({ characterId: "Fancy Name!" }), "front.png": true },
    "fancy_name.png": true, // same normalized id as the folder — folder wins
  });
  const assets = await characterAssets.discoverCharacterAssets();
  assert.equal(assets.length, 1, "duplicate normalized ids collapse to one entry");
  assert.equal(assets[0].characterId, "fancy_name");
  assert.equal(assets[0].frontImage, "assets/characters/Fancy Name/front.png", "the folder entry won");
});

test("no characters directory at all yields an empty list, not an error", async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
  assert.deepEqual(await characterAssets.discoverCharacterAssets(), []);
});

test("normalizeStableId: shared id vocabulary for character AND role ids", () => {
  assert.equal(characterAssets.normalizeStableId("Host Scholar!"), "host_scholar");
  assert.equal(characterAssets.normalizeStableId("  SAGE  "), "sage");
  assert.equal(characterAssets.normalizeStableId("__a__b__"), "a_b");
  assert.equal(characterAssets.normalizeStableId(""), "");
});

// ------------------------------------------------- Basic directional Sprite Set

test("flat asset with no sidecar: sprites are all null, Front resolves to the legacy baseline", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(asset.sprites, { front: null, back: null, left: null, right: null });
  const front = characterAssets.resolveCharacterSprite(asset, "front");
  assert.deepEqual(front, {
    path: "assets/characters/classic_omega.png",
    requestedDirection: "front",
    resolvedDirection: "front",
    fallbackUsed: false,
    flip: false,
  });
});

test("flat asset with a sidecar: explicit Front overrides the legacy baseline (Part 6)", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega_v2.png": true,
    "classic_omega.json": JSON.stringify({ front: "classic_omega_v2.png" }),
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.front, "assets/characters/classic_omega_v2.png");
  assert.equal(asset.frontImage, "assets/characters/classic_omega_v2.png", "resolved baseline follows the explicit override");
});

test("folder asset: explicit Front in character.json overrides the inferred baseline", async () => {
  await makeAssetsDir({
    "socrates/": {
      "character.json": JSON.stringify({ front: "front_v2.png" }),
      "front.png": true,
      "front_v2.png": true,
    },
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.front, "assets/characters/socrates/front_v2.png");
  assert.equal(asset.frontImage, "assets/characters/socrates/front_v2.png");
});

test("explicit Back/Left/Right resolve directly, no fallback", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega_back.png": true,
    "classic_omega_left.png": true,
    "classic_omega_right.png": true,
    "classic_omega.json": JSON.stringify({
      back: "classic_omega_back.png",
      left: "classic_omega_left.png",
      right: "classic_omega_right.png",
    }),
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  for (const [dir, file] of [
    ["back", "classic_omega_back.png"],
    ["left", "classic_omega_left.png"],
    ["right", "classic_omega_right.png"],
  ]) {
    const r = characterAssets.resolveCharacterSprite(asset, dir);
    assert.equal(r.path, `assets/characters/${file}`);
    assert.equal(r.resolvedDirection, dir);
    assert.equal(r.fallbackUsed, false);
    assert.equal(r.flip, false);
  }
});

test("missing Back falls back to Front, then the legacy baseline", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const [asset] = await characterAssets.discoverCharacterAssets();
  const r = characterAssets.resolveCharacterSprite(asset, "back");
  assert.equal(r.path, "assets/characters/classic_omega.png");
  assert.equal(r.resolvedDirection, "front");
  assert.equal(r.fallbackUsed, true);
  assert.equal(r.flip, false);
});

test("missing Left falls back to Right with horizontal flip, before Front/baseline", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega_right.png": true,
    "classic_omega.json": JSON.stringify({ right: "classic_omega_right.png" }),
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  const r = characterAssets.resolveCharacterSprite(asset, "left");
  assert.equal(r.path, "assets/characters/classic_omega_right.png");
  assert.equal(r.resolvedDirection, "right");
  assert.equal(r.fallbackUsed, true);
  assert.equal(r.flip, true, "mirrored from the opposite side");
});

test("missing Right falls back to Left with horizontal flip, before Front/baseline", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega_left.png": true,
    "classic_omega.json": JSON.stringify({ left: "classic_omega_left.png" }),
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  const r = characterAssets.resolveCharacterSprite(asset, "right");
  assert.equal(r.path, "assets/characters/classic_omega_left.png");
  assert.equal(r.resolvedDirection, "left");
  assert.equal(r.fallbackUsed, true);
  assert.equal(r.flip, true);
});

test("Left/Right fall all the way to the legacy baseline when nothing else is configured", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const [asset] = await characterAssets.discoverCharacterAssets();
  for (const dir of ["left", "right"]) {
    const r = characterAssets.resolveCharacterSprite(asset, dir);
    assert.equal(r.path, "assets/characters/classic_omega.png");
    assert.equal(r.resolvedDirection, "front");
    assert.equal(r.fallbackUsed, true);
    assert.equal(r.flip, false);
  }
});

test("a nonexistent configured Back/Left/Right file is dropped at discovery time — never a broken path", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega.json": JSON.stringify({ back: "does_not_exist.png", left: "also_missing.png" }),
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.back, null);
  assert.equal(asset.sprites.left, null);
  // still resolves to SOMETHING (the baseline), never an empty/broken sprite
  const back = characterAssets.resolveCharacterSprite(asset, "back");
  assert.equal(back.path, "assets/characters/classic_omega.png");
});

test("an asset with no sprite metadata AND no baseline resolves to null, not a crash", () => {
  const r = characterAssets.resolveCharacterSprite({ characterId: "ghost", sprites: {}, frontImage: null }, "left");
  assert.deepEqual(r, { path: null, requestedDirection: "left", resolvedDirection: "left", fallbackUsed: true, flip: false });
  // undefined asset entirely — still never throws
  assert.equal(characterAssets.resolveCharacterSprite(undefined, "front").path, null);
});

test("discoverCharacterImageFiles: every PNG in the flat root and one level into each folder, never elsewhere", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_alpha.png": true,
    "socrates/": { "front.png": true, "portrait.png": true, "notes.txt": "skip me" },
  });
  const files = await characterAssets.discoverCharacterImageFiles();
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, [
    "assets/characters/classic_alpha.png",
    "assets/characters/classic_omega.png",
    "assets/characters/socrates/front.png",
    "assets/characters/socrates/portrait.png",
  ]);
  assert.equal(files.find((f) => f.path.endsWith("classic_omega.png")).folder, null);
  assert.equal(files.find((f) => f.path.endsWith("front.png")).folder, "assets/characters/socrates");
});

test("saveCharacterAssetSprites: writes a sidecar for a flat asset, round-trips through discovery", async () => {
  await makeAssetsDir({ "classic_omega.png": true, "classic_omega_back.png": true });
  const updated = await characterAssets.saveCharacterAssetSprites("classic_omega", { back: "assets/characters/classic_omega_back.png" });
  assert.equal(updated.sprites.back, "assets/characters/classic_omega_back.png");
  const [reloaded] = await characterAssets.discoverCharacterAssets();
  assert.equal(reloaded.sprites.back, "assets/characters/classic_omega_back.png");
  assert.equal(reloaded.hasMetadata, true);
});

test("saveCharacterAssetSprites: Clear (null) removes the key; clearing everything removes the sidecar file entirely", async () => {
  await makeAssetsDir({ "classic_omega.png": true, "classic_omega_back.png": true });
  await characterAssets.saveCharacterAssetSprites("classic_omega", { back: "assets/characters/classic_omega_back.png" });
  await characterAssets.saveCharacterAssetSprites("classic_omega", { back: null });
  const [reloaded] = await characterAssets.discoverCharacterAssets();
  assert.equal(reloaded.sprites.back, null);
  await assert.rejects(fs.access(path.join(tmpRoot, "classic_omega.json")));
});

test("saveCharacterAssetSprites: writes into character.json for a folder asset, preserving existing metadata", async () => {
  await makeAssetsDir({
    "socrates/": {
      "character.json": JSON.stringify({ displayName: "Socrates of Athens", front: "front.png" }),
      "front.png": true,
      "left.png": true,
    },
  });
  await characterAssets.saveCharacterAssetSprites("socrates", { left: "assets/characters/socrates/left.png" });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.displayName, "Socrates of Athens", "existing metadata untouched");
  assert.equal(asset.sprites.left, "assets/characters/socrates/left.png");
  assert.equal(asset.frontImage, "assets/characters/socrates/front.png", "existing front override untouched");
});

test("saveCharacterAssetSprites: rejects a reference to a file that doesn't exist (never silently accepted, never traversal)", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await assert.rejects(
    characterAssets.saveCharacterAssetSprites("classic_omega", { back: "assets/characters/../../etc/passwd" }),
    /does not exist/,
  );
  await assert.rejects(characterAssets.saveCharacterAssetSprites("classic_omega", { back: "assets/characters/nope.png" }), /does not exist/);
});

test("saveCharacterAssetSprites: unknown characterId is rejected, not silently ignored", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await assert.rejects(characterAssets.saveCharacterAssetSprites("no_such_character", { back: null }), /No Character Asset/);
});

// ------------------------------------------------- Speech Bubble Mapping v1

test("DEFAULT_BUBBLE_STYLE: the exact default per the task's own table", () => {
  assert.deepEqual(characterAssets.DEFAULT_BUBBLE_STYLE, {
    pre_thinking: "thought",
    vault_gathering: "thought",
    scholar_thinking: "thought",
    scholar_answering: "dialogue",
    grand_sage_gathering: "thought",
    grand_sage_answering: "dialogue",
    post_answering: "thought",
    // Clickable NPC interaction: a click is the player addressing the
    // Character directly, so an untagged CLICKED line speaks aloud.
    clicked: "dialogue",
  });
  assert.deepEqual(characterAssets.SPEECH_STATES, Object.keys(characterAssets.DEFAULT_BUBBLE_STYLE));
});

test("untagged entry falls back to the state's DEFAULT_BUBBLE_STYLE — pre_thinking -> thought, scholar_answering -> dialogue", async () => {
  const { parseBubbleMarkdown, pickRandomBubbleEntry } = await import("../src/services/bubbleMarkdown.js");
  const resolveStyle = (picked, state) => (characterAssets.BUBBLE_STYLES.includes(picked.style) ? picked.style : characterAssets.DEFAULT_BUBBLE_STYLE[state]);

  const prePicked = pickRandomBubbleEntry(parseBubbleMarkdown("Alpha wonders quietly."), {});
  assert.equal(resolveStyle(prePicked, "pre_thinking"), "thought");

  const answerPicked = pickRandomBubbleEntry(parseBubbleMarkdown("I believe the answer is clear."), {});
  assert.equal(resolveStyle(answerPicked, "scholar_answering"), "dialogue");
});

test("loading a Character Asset with no explicit mapping never force-writes metadata", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(asset.speechBubbleMapping, {});
  await assert.rejects(fs.access(path.join(tmpRoot, "classic_omega.json")), "no sidecar was created just by discovery");
});

test("Speech Bubble Mapping persists through save + reload (flat asset) — discovered view is source-only, style is no longer a per-state field", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await makeDialogueDir({ "pre_thinking.md": "🤔\nHmm..." });
  const updated = await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", {
    pre_thinking: { source: "assets/dialogue/bubbles/pre_thinking.md" },
  });
  assert.deepEqual(updated.speechBubbleMapping.pre_thinking, { source: "assets/dialogue/bubbles/pre_thinking.md" });
  const [reloaded] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(reloaded.speechBubbleMapping.pre_thinking, { source: "assets/dialogue/bubbles/pre_thinking.md" });
});

test("Speech Bubble Mapping persists through save + reload (folder asset), existing metadata preserved", async () => {
  await makeAssetsDir({ "socrates/": { "character.json": JSON.stringify({ displayName: "Socrates" }), "front.png": true } });
  await makeDialogueDir({ "scholar_answering.md": "I think there is another way." });
  await characterAssets.saveCharacterAssetSpeechMapping("socrates", {
    scholar_answering: { source: "assets/dialogue/bubbles/scholar_answering.md" },
  });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.displayName, "Socrates", "existing metadata untouched");
  assert.deepEqual(asset.speechBubbleMapping.scholar_answering, { source: "assets/dialogue/bubbles/scholar_answering.md" });
});

test("Sprite Set survives a Speech Mapping save, and vice versa — the two save paths never clobber each other", async () => {
  await makeAssetsDir({ "classic_omega.png": true, "classic_omega_back.png": true });
  await makeDialogueDir({ "pre_thinking.md": "🤔" });
  await characterAssets.saveCharacterAssetSprites("classic_omega", { back: "assets/characters/classic_omega_back.png" });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/pre_thinking.md" } });
  let [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.back, "assets/characters/classic_omega_back.png", "Sprite Set survived the Speech Mapping save");
  assert.equal(asset.speechBubbleMapping.pre_thinking.source, "assets/dialogue/bubbles/pre_thinking.md");

  // Now save Sprite Set again (e.g. clearing Back) — Speech Mapping must survive.
  await characterAssets.saveCharacterAssetSprites("classic_omega", { back: null });
  [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.back, null);
  assert.equal(asset.speechBubbleMapping.pre_thinking.source, "assets/dialogue/bubbles/pre_thinking.md", "Speech Mapping survived the Sprite Set save");
});

test("unknown/future Character Asset metadata survives a Speech Mapping save (never reconstructed from known fields only)", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega.json": JSON.stringify({ someFutureField: { nested: true } }),
  });
  await makeDialogueDir({ "pre_thinking.md": "🤔" });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { style: "thought" } });
  const raw = JSON.parse(await fs.readFile(path.join(tmpRoot, "classic_omega.json"), "utf8"));
  assert.deepEqual(raw.someFutureField, { nested: true });
  assert.equal(raw.speechBubbleMapping.pre_thinking.style, "thought", "the write path still tolerates an explicit style — it just isn't surfaced by discovery anymore");
});

test("a legacy style-only entry (no source) writes successfully but is not surfaced by discovery — style alone is no longer a first-class field", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const updated = await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { scholar_thinking: { style: "thought" } });
  assert.equal(updated.speechBubbleMapping.scholar_thinking, undefined, "no source means nothing to surface at the new schema level");
  const raw = JSON.parse(await fs.readFile(path.join(tmpRoot, "classic_omega.json"), "utf8"));
  assert.equal(raw.speechBubbleMapping.scholar_thinking.style, "thought", "the raw file still records what was explicitly sent — not destructively stripped");
});

test("clearing a state (null) removes it; clearing every state removes the sidecar entirely", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await makeDialogueDir({ "pre_thinking.md": "🤔" });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/pre_thinking.md" } });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: null });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(asset.speechBubbleMapping, {});
  await assert.rejects(fs.access(path.join(tmpRoot, "classic_omega.json")));
});

test("a previously-saved source that no longer exists is flagged missing, not silently erased — and a stray legacy style field on disk doesn't break it or get echoed back", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega.json": JSON.stringify({ speechBubbleMapping: { pre_thinking: { style: "thought", source: "assets/dialogue/bubbles/gone.md" } } }),
  });
  await makeDialogueDir({}); // gone.md does not exist
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(asset.speechBubbleMapping.pre_thinking, { source: "assets/dialogue/bubbles/gone.md", sourceMissing: true });
});

test("saveCharacterAssetSpeechMapping rejects an absolute path, traversal, and a non-.md file", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await makeDialogueDir({ "pre_thinking.md": "🤔", "notes.txt": "not markdown" });
  await assert.rejects(
    characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "D:\\Projects\\aether-library\\secret.md" } }),
    /Invalid MD Source/,
  );
  await assert.rejects(
    characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/../../../etc/passwd.md" } }),
    /Invalid MD Source/,
  );
  await assert.rejects(characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/notes.txt" } }), /Invalid MD Source/);
});

test("saveCharacterAssetSpeechMapping rejects a source that doesn't exist under the approved root", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await makeDialogueDir({});
  await assert.rejects(
    characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/nope.md" } }),
    /does not exist/,
  );
});

test("saveCharacterAssetSpeechMapping rejects an invalid style and an unknown state key is simply ignored (not a schema error)", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await assert.rejects(characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { style: "angry" } }), /Invalid Bubble Style/);
  // an unrecognized state key isn't one of SPEECH_STATES, so it's never even inspected
  const updated = await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { not_a_real_state: { style: "thought" } });
  assert.deepEqual(updated.speechBubbleMapping, {});
});

test("partial per-state update: a caller still sending style leaves it on disk untouched by a source-only save (write path stays tolerant), but discovery only ever surfaces source", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await makeDialogueDir({ "pre_thinking.md": "🤔", "other.md": "💭" });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { style: "thought", source: "assets/dialogue/bubbles/pre_thinking.md" } });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { style: "dialogue" } }); // source omitted entirely
  let [asset] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(asset.speechBubbleMapping.pre_thinking, { source: "assets/dialogue/bubbles/pre_thinking.md" });
  let raw = JSON.parse(await fs.readFile(path.join(tmpRoot, "classic_omega.json"), "utf8"));
  assert.equal(raw.speechBubbleMapping.pre_thinking.style, "dialogue");

  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/other.md" } }); // style omitted
  [asset] = await characterAssets.discoverCharacterAssets();
  assert.deepEqual(asset.speechBubbleMapping.pre_thinking, { source: "assets/dialogue/bubbles/other.md" });
  raw = JSON.parse(await fs.readFile(path.join(tmpRoot, "classic_omega.json"), "utf8"));
  assert.equal(raw.speechBubbleMapping.pre_thinking.style, "dialogue", "style field on disk survives a source-only save since the update payload never mentioned it");
});

// --------------------------------------------------- Unified Speech Set

test("loading a Character Asset with no speechBubbleSet configured yields null, never force-writes metadata", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.speechBubbleSet, null);
  await assert.rejects(fs.access(path.join(tmpRoot, "classic_omega.json")), "no sidecar was created just by discovery");
});

test("Speech Set metadata persists through save + reload (flat asset)", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  const updated = await characterAssets.saveCharacterAssetSpeechSet("classic_omega", "classic_alpha");
  assert.equal(updated.speechBubbleSet, "classic_alpha");
  const [reloaded] = await characterAssets.discoverCharacterAssets();
  assert.equal(reloaded.speechBubbleSet, "classic_alpha");
});

test("Speech Set metadata persists through save + reload (folder asset), existing metadata preserved", async () => {
  await makeAssetsDir({ "socrates/": { "character.json": JSON.stringify({ displayName: "Socrates" }), "front.png": true } });
  await characterAssets.saveCharacterAssetSpeechSet("socrates", "socrates");
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.displayName, "Socrates", "existing metadata untouched");
  assert.equal(asset.speechBubbleSet, "socrates");
});

test("saveCharacterAssetSpeechSet normalizes an arbitrary label the same way characterId/roleId are normalized", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await characterAssets.saveCharacterAssetSpeechSet("classic_omega", "  Classic Alpha!! ");
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.speechBubbleSet, "classic_alpha");
});

test("saveCharacterAssetSpeechSet rejects a value that normalizes to empty, not silently cleared", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await assert.rejects(characterAssets.saveCharacterAssetSpeechSet("classic_omega", "@@@"), /Invalid Speech Set/);
});

test("saveCharacterAssetSpeechSet(null) clears the field; clearing the only metadata removes the sidecar entirely", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await characterAssets.saveCharacterAssetSpeechSet("classic_omega", "classic_alpha");
  await characterAssets.saveCharacterAssetSpeechSet("classic_omega", null);
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.speechBubbleSet, null);
  await assert.rejects(fs.access(path.join(tmpRoot, "classic_omega.json")));
});

test("Sprite Set survives a Speech Set save, and vice versa — the two save paths never clobber each other", async () => {
  await makeAssetsDir({ "classic_omega.png": true, "classic_omega_back.png": true });
  await characterAssets.saveCharacterAssetSprites("classic_omega", { back: "assets/characters/classic_omega_back.png" });
  await characterAssets.saveCharacterAssetSpeechSet("classic_omega", "classic_omega");
  let [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.back, "assets/characters/classic_omega_back.png", "Sprite Set survived the Speech Set save");
  assert.equal(asset.speechBubbleSet, "classic_omega");

  await characterAssets.saveCharacterAssetSprites("classic_omega", { back: null });
  [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.sprites.back, null);
  assert.equal(asset.speechBubbleSet, "classic_omega", "Speech Set survived the Sprite Set save");
});

test("unknown/future Character Asset metadata survives a Speech Set save (never reconstructed from known fields only)", async () => {
  await makeAssetsDir({
    "classic_omega.png": true,
    "classic_omega.json": JSON.stringify({ someFutureField: { nested: true } }),
  });
  await characterAssets.saveCharacterAssetSpeechSet("classic_omega", "classic_omega");
  const raw = JSON.parse(await fs.readFile(path.join(tmpRoot, "classic_omega.json"), "utf8"));
  assert.deepEqual(raw.someFutureField, { nested: true });
  assert.equal(raw.speechBubbleSet, "classic_omega");
});

test("old per-state speechBubbleMapping survives untouched by a Speech Set save, and vice versa — deprecated, not destroyed", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await makeDialogueDir({ "pre_thinking.md": "🤔" });
  await characterAssets.saveCharacterAssetSpeechMapping("classic_omega", { pre_thinking: { source: "assets/dialogue/bubbles/pre_thinking.md" } });
  await characterAssets.saveCharacterAssetSpeechSet("classic_omega", "classic_alpha");
  const [asset] = await characterAssets.discoverCharacterAssets();
  assert.equal(asset.speechBubbleSet, "classic_alpha");
  assert.deepEqual(asset.speechBubbleMapping.pre_thinking, { source: "assets/dialogue/bubbles/pre_thinking.md" }, "old per-state mapping is deprecated (ignored by the runtime priority order) but never destroyed on disk");
});

test("saveCharacterAssetSpeechSet: unknown characterId is rejected, not silently ignored", async () => {
  await makeAssetsDir({ "classic_omega.png": true });
  await assert.rejects(characterAssets.saveCharacterAssetSpeechSet("no_such_character", "classic_alpha"), /No Character Asset/);
});
