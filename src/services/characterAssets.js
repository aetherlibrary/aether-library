// Character Asset discovery — the data side of the Scene Editor's Character
// Role Roster (Phase 1 of the Character management architecture).
//
// A CHARACTER ASSET is a reusable character package under assets/characters/,
// independent of any scene. It is one of three deliberately separate concepts:
//   - Role Definition        — scene-level slot ("sage"), persisted in
//                              scene-layout.json (see sanitizeCharacterRoles
//                              in sceneLayout.js)
//   - Character Asset        — THIS: the reusable character itself
//   - Scene Character Instance — how an assigned asset appears in ONE scene
//                              (the existing kind:"npc" Scene Object + its
//                              persisted per-scene fields — transform,
//                              shadow, foot collider, movement, bubble…)
//
// Discovery supports BOTH layouts, no folder migration forced:
//   flat file  (current)   assets/characters/classic_omega.png
//   folder     (future)    assets/characters/classic_omega/
//                            character.json   (optional metadata)
//                            front.png        (baseline front image)
//                            portrait.png     (optional 1:1 profile art)
//                            animations/      (future phase)
//
// character.json, when present, is authoritative metadata:
//   { characterId?, displayName?, front?, portrait?, back?, left?, right?,
//     visualStates? }
// Absent metadata is INFERRED from the folder/file (never an error).
//
// Baseline front image resolution (the mandatory visual fallback — a
// character must never be previewable as "nothing" just because animation
// data is absent). Order, per spec:
//   explicit front from character.json  >  front.png  >  <folder>.png  >
//   first PNG in the folder (sorted)    >  none (missing: true — the UI
//   shows a visible placeholder, never a broken image)
// Portrait (profile-only UI): explicit portrait from character.json >
// portrait.png > null (UI falls back to the front image).
//
// Basic directional Sprite Set (Front/Back/Left/Right — NOT animation):
// `sprites: { front, back, left, right }`, ALWAYS present (same
// always-there-even-if-empty convention as visualStates below), each entry
// either a project-relative path or null. This is Character Asset metadata
// (reusable across every scene), never Scene Instance data — see
// resolveCharacterSprite for the runtime fallback chain and
// saveCharacterAssetSprites for how it's authored/persisted. `sprites.front`
// is null unless the user EXPLICITLY chose a front image distinct from the
// legacy baseline — frontImage above remains the resolved/effective value
// either way, so a legacy single-image asset is never seen as "having
// duplicate metadata" just because Front happens to display something.
//
// For a FOLDER asset, back/left/right (like front/portrait) come from
// character.json and must name a file that actually exists in the folder.
// For a FLAT-FILE asset (the current, only-in-production layout —
// classic_omega.png), there is no folder to hold character.json — the
// SAME shape lives instead in a sidecar JSON sitting next to the PNG
// (classic_omega.json). This is the smallest compatible extension: no
// migration, no renamed/moved files, existing flat assets keep working
// untouched until a sidecar is explicitly written (which only happens
// when the user actually assigns a directional sprite through the editor).
//
// visualStates is a METADATA-ONLY container reserved for the future
// animation phase (postures -> activities -> directional frames). Nothing
// reads it at runtime yet; discovery just carries it through so authored
// files survive round-trips. Default: { standing: {}, sitting: {} }.
//
// All paths returned are PROJECT-RELATIVE ("assets/characters/…") — never
// absolute machine paths (they end up in scene data and previews).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Same env override the Character Registry uses — tests point both at one
// scratch folder and never touch the real assets.
function charactersDir() {
  return process.env.CHARACTER_ASSETS_DIR
    ? path.resolve(process.env.CHARACTER_ASSETS_DIR)
    : path.join(projectRoot, "assets", "characters");
}

const CHARACTER_ID_RE = /^[a-z0-9_]+$/;

// Normalizes an arbitrary label/folder name into a stable machine id:
// lowercase, [a-z0-9_] only, collapsed/trimmed underscores. Shared rule for
// character ids AND role ids (sceneLayout.js re-exports it for roles) — one
// vocabulary for every stable identifier this feature mints.
export function normalizeStableId(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function relPath(...parts) {
  return ["assets", "characters", ...parts].join("/");
}

// The default future-animation container (Part 9): posture keys only,
// deliberately open — additional postures/activities may be added later
// without a schema change (any object shape is carried through).
function defaultVisualStates() {
  return { standing: {}, sitting: {} };
}

function sanitizeVisualStates(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultVisualStates();
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : defaultVisualStates();
}

async function readCharacterJson(folderAbs) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(folderAbs, "character.json"), "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null; // absent or unparseable — inference takes over, never an error
  }
}

// Basic directional Sprite Set (Front/Back/Left/Right): pulls back/left/
// right out of authored metadata, each validated against the actual file
// list — same "must exist to count" rule front/portrait already follow, so
// a typo'd reference never produces a broken preview. `front` is picked up
// too, but ONLY as an explicit override (Part 6) — it does not fall back to
// the inferred baseline here; that stays frontImage's job, so a legacy
// asset with no authored metadata gets sprites.front === null, never a
// duplicate copy of its own baseline path.
function sanitizeSpriteSet(meta, files, toPath) {
  const pick = (key) => {
    const v = meta && typeof meta[key] === "string" ? meta[key] : null;
    return v && files.includes(v) ? toPath(v) : null;
  };
  return { front: pick("front"), back: pick("back"), left: pick("left"), right: pick("right") };
}

// Sidecar metadata for a FLAT-FILE Character Asset (classic_omega.png ->
// classic_omega.json, same basename, sitting right next to it) — the
// smallest compatible extension of character.json's shape to a layout that
// has no folder to hold it. Absent/unparseable is never an error, same as
// readCharacterJson.
async function readFlatSidecarJson(fileBase) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(charactersDir(), `${fileBase}.json`), "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

// ------------------------------------------ Speech Bubble Mapping
//
// TWO generations of this metadata now coexist on purpose (Part 15/16 of
// the unified-Speech-Set migration) — DEPRECATED vs ACTIVE, never fighting:
//
//   ACTIVE (preferred, new authoring):
//     speechBubbleSet: "classic_alpha"  — a single Character-level identity.
//     Runtime resolves speechBubbleSet + locale -> ONE localized unified MD
//     document (assets/dialogue/bubbles/<speechBubbleSet>_<locale>.md,
//     see bubbleMarkdown.js's speechDocumentPath/resolveSpeechDocument),
//     containing every state's pool as its own "## STATE" H2 section
//     (parseCharacterSpeechMarkdown). A Character/Speech Set — NOT a Role —
//     owns this, so classic_alpha and christmas_alpha can speak completely
//     differently while occupying the same Role.
//
//   DEPRECATED (still read, no longer authored):
//     speechBubbleMapping: { [state]: { source?: "assets/dialogue/bubbles/
//     <file>.md" } } — one separate flat MD file PER STATE. Still fully
//     functional as a FALLBACK: whenever a Character Asset has no
//     speechBubbleSet configured, the runtime resolves speech exactly the
//     old way (parseBubbleMarkdown, one file = one state's pool). The
//     moment speechBubbleSet IS configured, this old mapping is completely
//     ignored — the two never partially combine for one Character.
//
// Both live in the same Character Asset metadata file as Sprite Set (see
// mutateCharacterAssetMetadata), NEVER Role Definition or Scene Instance
// data. Every state entry / speechBubbleSet is OPTIONAL.
//
// Per-entry style (still in effect, unaffected by the Speech Set migration):
// Bubble Style ("thought"/"dialogue") lives on each individual line inside
// whichever MD pool is in play (an optional "[thought]"/"[dialogue]" tag,
// parsed by bubbleMarkdown.js). An untagged line falls back to
// DEFAULT_BUBBLE_STYLE[state] below — the ONE authoritative per-state
// default table, consulted by both runtime pipelines (F8 + production) and
// never duplicated with different values. A `style` field saved by an even
// older version of this feature may still be sitting in some character.json
// on disk — sanitizeSpeechMappingEntry simply never reads it anymore
// (ignored, not migrated/stripped — see its own comment below).
export const SPEECH_STATES = [
  "pre_thinking",
  "vault_gathering",
  "scholar_thinking",
  "scholar_answering",
  "grand_sage_gathering",
  "grand_sage_answering",
  "post_answering",
  "clicked",
];
export const BUBBLE_STYLES = ["thought", "dialogue"];
export const DEFAULT_BUBBLE_STYLE = {
  pre_thinking: "thought",
  vault_gathering: "thought",
  scholar_thinking: "thought",
  scholar_answering: "dialogue",
  grand_sage_gathering: "thought",
  grand_sage_answering: "dialogue",
  post_answering: "thought",
  // A click is the player addressing the Character directly, so an untagged
  // CLICKED line speaks aloud rather than thinking.
  clicked: "dialogue",
};

// The approved root for Speech Bubble MD content (Part 4) — GLOBAL, shared
// by every Character Asset (unlike Sprite Set images, which live per-asset
// under assets/characters/). Overridable for tests via the same
// env-var-per-service convention as charactersDir()/REGISTRY_PATH.
function dialogueBubblesDir() {
  return process.env.DIALOGUE_BUBBLES_DIR ? path.resolve(process.env.DIALOGUE_BUBBLES_DIR) : path.join(projectRoot, "assets", "dialogue", "bubbles");
}
const DIALOGUE_REL_PREFIX = "assets/dialogue/bubbles/";

// Shape-only validation (no filesystem access) — accepts either the bare
// filename or the full project-relative form (what the picker returns),
// rejects anything that isn't a plain "<name>.md" directly inside the
// approved root: absolute paths, "../" traversal, a nested subdirectory, or
// a non-.md extension. Returns the normalized full project-relative form,
// or null. Kept separate from the real existence check (dialogueFileExists)
// so a well-formed-but-currently-missing reference can be recognized
// distinctly from a malformed/malicious one (Part 10: show missing, never
// silently erase; a malformed value is never something we echo back at all).
function normalizeDialogueRef(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const trimmed = v.trim().replace(/\\/g, "/");
  if (path.isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) return null;
  const bare = trimmed.startsWith(DIALOGUE_REL_PREFIX) ? trimmed.slice(DIALOGUE_REL_PREFIX.length) : trimmed;
  if (!bare || bare.includes("/") || bare.includes("..")) return null;
  if (!bare.toLowerCase().endsWith(".md")) return null;
  return `${DIALOGUE_REL_PREFIX}${bare}`;
}

async function dialogueFileExists(normalizedRef) {
  try {
    const stat = await fs.stat(path.join(dialogueBubblesDir(), normalizedRef.slice(DIALOGUE_REL_PREFIX.length)));
    return stat.isFile();
  } catch {
    return false;
  }
}

// Discovery-time sanitizer for ONE state's authored entry. `style` is no
// longer a first-class per-state field — it's read straight from `rawEntry`
// never at all, on purpose (an old saved `style` value is safely ignored,
// not migrated or stripped: this function only shapes the in-memory
// discovery view, it never writes anything, so an old file keeps whatever
// stray `style` key it already has until some unrelated save happens to
// touch that character — and even then, saveCharacterAssetSpeechMapping
// below only ever touches a field the caller explicitly sends). Unlike
// Sprite Set (which silently drops an invalid back/left/right reference),
// Part 10 requires a previously-saved-but-now-missing source to be
// reported, not erased — so a well-formed reference whose file is
// currently absent is kept, flagged `sourceMissing: true`, rather than
// nulled out. A malformed value (fails normalizeDialogueRef) is dropped —
// there's nothing legitimate to preserve or flag there.
async function sanitizeSpeechMappingEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== "object") return null;
  const normalized = normalizeDialogueRef(rawEntry.source);
  if (!normalized) return null;
  if (await dialogueFileExists(normalized)) return { source: normalized };
  return { source: normalized, sourceMissing: true };
}

async function sanitizeSpeechBubbleMapping(rawMapping) {
  const raw = rawMapping && typeof rawMapping === "object" && !Array.isArray(rawMapping) ? rawMapping : {};
  const out = {};
  for (const state of SPEECH_STATES) {
    const entry = await sanitizeSpeechMappingEntry(raw[state]);
    if (entry) out[state] = entry;
  }
  return out;
}

// Discovery-time sanitizer for the ACTIVE Speech Set identity. Deliberately
// NO filesystem/existence check here (unlike the old per-state `source`) —
// which localized document actually resolves depends on the RUNTIME locale
// (see bubbleMarkdown.js's resolveSpeechDocument), so a Speech Set with a
// temporarily-missing file for the current locale is still a perfectly
// valid identity, not an error at discovery time. Same normalizeStableId
// vocabulary as characterId/roleId — one shared id format across the app.
function sanitizeSpeechBubbleSet(raw) {
  if (typeof raw !== "string") return null;
  const id = normalizeStableId(raw);
  return id || null;
}

// One folder-style Character Asset. `folderName` is the directory under
// assets/characters/.
async function discoverFolderAsset(folderName) {
  const folderAbs = path.join(charactersDir(), folderName);
  let files = [];
  try {
    files = (await fs.readdir(folderAbs, { withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return null;
  }
  const pngs = files.filter((f) => f.toLowerCase().endsWith(".png")).sort();
  const meta = await readCharacterJson(folderAbs);

  const characterId = normalizeStableId(meta?.characterId) || normalizeStableId(folderName) || folderName;

  // Baseline front image — the spec's resolution order, first hit wins.
  // A metadata-named file must actually exist to count (a typo'd
  // character.json must not produce a broken preview when a real fallback
  // is sitting right next to it).
  const metaFront = typeof meta?.front === "string" && files.includes(meta.front) ? meta.front : null;
  const frontFile =
    metaFront ||
    (files.includes("front.png") ? "front.png" : null) ||
    (files.includes(`${folderName}.png`) ? `${folderName}.png` : null) ||
    pngs[0] ||
    null;

  const metaPortrait = typeof meta?.portrait === "string" && files.includes(meta.portrait) ? meta.portrait : null;
  const portraitFile = metaPortrait || (files.includes("portrait.png") ? "portrait.png" : null);

  return {
    characterId,
    displayName: typeof meta?.displayName === "string" && meta.displayName.trim() ? meta.displayName.trim() : folderName,
    folder: relPath(folderName),
    frontImage: frontFile ? relPath(folderName, frontFile) : null,
    portraitImage: portraitFile ? relPath(folderName, portraitFile) : null,
    sprites: sanitizeSpriteSet(meta, files, (f) => relPath(folderName, f)),
    speechBubbleMapping: await sanitizeSpeechBubbleMapping(meta?.speechBubbleMapping),
    speechBubbleSet: sanitizeSpeechBubbleSet(meta?.speechBubbleSet),
    visualStates: sanitizeVisualStates(meta?.visualStates),
    hasMetadata: !!meta,
    // No resolvable front image at all — the UI must show a visible
    // missing-asset placeholder for this entry, never hide it or break.
    missing: !frontFile,
  };
}

// One flat-file Character Asset (the CURRENT structure — classic_omega.png).
// The file IS its own baseline front image; portrait stays unavailable
// until the file graduates to a folder, but Front/Back/Left/Right (Part
// 2's backward-compatibility requirement) work today via an optional
// sidecar JSON (classic_omega.json) — see readFlatSidecarJson. `flatPngs`
// is every PNG in the shared flat root, passed in once by the caller so a
// directional reference can point at any sibling flat PNG (matching the
// task's own example: classic_omega_back.png sitting right next to
// classic_omega.png) — same "must exist to count" validation as folders.
async function discoverFileAsset(fileName, flatPngs) {
  const base = fileName.replace(/\.png$/i, "");
  const meta = await readFlatSidecarJson(base);
  const sprites = sanitizeSpriteSet(meta, flatPngs, (f) => relPath(f));
  return {
    characterId: normalizeStableId(base) || base,
    displayName: base,
    folder: relPath(), // the shared flat root — no per-character folder yet
    // Part 6 — an explicit Front override (sidecar `front`) takes priority
    // over the flat file's own legacy baseline, same rule the folder case
    // already follows for meta.front.
    frontImage: sprites.front || relPath(fileName),
    portraitImage: null,
    sprites,
    speechBubbleMapping: await sanitizeSpeechBubbleMapping(meta?.speechBubbleMapping),
    speechBubbleSet: sanitizeSpeechBubbleSet(meta?.speechBubbleSet),
    visualStates: defaultVisualStates(),
    hasMetadata: !!meta,
    missing: false,
  };
}

// Every discovered Character Asset, folders and flat PNGs alike, sorted by
// characterId. Duplicate characterIds keep the FIRST entry (folder entries
// are scanned before flat files, so a folder that supersedes an old flat
// PNG of the same name wins deterministically).
export async function discoverCharacterAssets() {
  let entries = [];
  try {
    entries = await fs.readdir(charactersDir(), { withFileTypes: true });
  } catch {
    return []; // no characters dir — an empty roster is not an error
  }
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const pngFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png"))
    .map((e) => e.name)
    .sort();

  const out = [];
  const seen = new Set();
  for (const folder of folders) {
    const asset = await discoverFolderAsset(folder);
    if (asset && !seen.has(asset.characterId)) {
      seen.add(asset.characterId);
      out.push(asset);
    }
  }
  for (const file of pngFiles) {
    const asset = await discoverFileAsset(file, pngFiles);
    if (!seen.has(asset.characterId)) {
      seen.add(asset.characterId);
      out.push(asset);
    }
  }
  return out.sort((a, b) => a.characterId.localeCompare(b.characterId));
}

// Basic directional Sprite Set (Part 8) — THE one authoritative fallback
// resolver; every Character sprite resolution (Sprite Set previews, and
// eventually any runtime directional wiring) is meant to call this instead
// of re-deriving its own fallback order. Pure — takes an already-discovered
// asset object, no filesystem access, never throws.
//
// Fallback chains (exact spec order):
//   front: front -> baseline (frontImage) -> none
//   back:  back  -> front -> baseline -> none
//   left:  left  -> right+flip -> front -> baseline -> none
//   right: right -> left+flip  -> front -> baseline -> none
// "none" means path: null — the caller shows a placeholder, never crashes
// and never lets the Character disappear (Part 12).
export function resolveCharacterSprite(asset, direction) {
  const req = ["front", "back", "left", "right"].includes(direction) ? direction : "front";
  const sprites = (asset && asset.sprites) || {};
  const baseline = (asset && asset.frontImage) || null;
  const opposite = req === "left" ? "right" : req === "right" ? "left" : null;

  const chain = [{ dir: req, path: sprites[req], flip: false }];
  if (opposite) chain.push({ dir: opposite, path: sprites[opposite], flip: true });
  if (req !== "front") chain.push({ dir: "front", path: sprites.front, flip: false });
  chain.push({ dir: "front", path: baseline, flip: false });

  for (const step of chain) {
    if (step.path) {
      return {
        path: step.path,
        requestedDirection: req,
        resolvedDirection: step.dir,
        fallbackUsed: !(step.dir === req && !step.flip),
        flip: step.flip,
      };
    }
  }
  return { path: null, requestedDirection: req, resolvedDirection: req, fallbackUsed: true, flip: false };
}

// Every PNG discoverable under assets/characters/ — the flat root AND one
// level inside each folder — for the Sprite Set picker (Part 5). Never
// recurses further, never leaves charactersDir(), never returns an
// absolute path. `folder` is null for a flat-root file.
export async function discoverCharacterImageFiles() {
  const root = charactersDir();
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return out; // no characters dir — an empty list is not an error
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith(".png")) {
      out.push({ path: relPath(e.name), filename: e.name, folder: null });
    }
  }
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const folderName of folders) {
    let files = [];
    try {
      files = (await fs.readdir(path.join(root, folderName), { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      continue;
    }
    for (const f of files.filter((n) => n.toLowerCase().endsWith(".png")).sort()) {
      out.push({ path: relPath(folderName, f), filename: f, folder: relPath(folderName) });
    }
  }
  return out;
}

// Locates which underlying storage backs a discovered characterId — a
// FOLDER (character.json) or a FLAT file (a sidecar JSON) — by re-deriving
// characterId the SAME way discovery does, straight from the raw folder/
// file name, never from a resolved (possibly already-overridden) field on
// a previously-discovered asset object. Returns null for a stale/unknown id.
async function locateCharacterAssetSource(characterId) {
  const root = charactersDir();
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const folderName of folders) {
    const folderAbs = path.join(root, folderName);
    let files = [];
    try {
      files = (await fs.readdir(folderAbs, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      continue;
    }
    const meta = await readCharacterJson(folderAbs);
    const id = normalizeStableId(meta?.characterId) || normalizeStableId(folderName) || folderName;
    if (id === characterId) return { kind: "folder", folderName, folderAbs, files };
  }
  const pngFiles = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png")).map((e) => e.name);
  for (const fileName of pngFiles) {
    const base = fileName.replace(/\.png$/i, "");
    const id = normalizeStableId(base) || base;
    if (id === characterId) return { kind: "flat", fileName, base, flatPngs: pngFiles };
  }
  return null;
}

// Shared low-level metadata writer (Part 14/15 — "reuse the persistence
// architecture already implemented for Sprite Set... do not reconstruct
// the JSON from only fields known to this task"). Locates the asset's
// underlying storage, reads whatever metadata is CURRENTLY there (fresh
// every call, never a stale in-memory copy), lets `mutate(meta, source)`
// change ONLY the field(s) it cares about — Sprite Set's front/back/left/
// right, Speech Bubble Mapping's speechBubbleMapping, or any future
// metadata neither of them knows about — then writes the WHOLE merged
// object back. `mutate` may be async and may throw (a thrown error is
// simply never written — nothing reaches disk until `mutate` returns
// cleanly). Both saveCharacterAssetSprites and
// saveCharacterAssetSpeechMapping funnel through this ONE write path.
async function mutateCharacterAssetMetadata(characterId, mutate) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  const id = normalizeStableId(characterId);
  if (!id) throw err(400, "A Character ID is required.");
  const source = await locateCharacterAssetSource(id);
  if (!source) throw err(404, `No Character Asset "${characterId}" was found.`);

  if (source.kind === "folder") {
    const meta = (await readCharacterJson(source.folderAbs)) || {};
    await mutate(meta, source);
    await fs.mkdir(source.folderAbs, { recursive: true });
    await fs.writeFile(path.join(source.folderAbs, "character.json"), JSON.stringify(meta, null, 2), "utf8");
  } else {
    const meta = (await readFlatSidecarJson(source.base)) || {};
    await mutate(meta, source);
    const sidecarPath = path.join(charactersDir(), `${source.base}.json`);
    if (Object.keys(meta).length) {
      await fs.writeFile(sidecarPath, JSON.stringify(meta, null, 2), "utf8");
    } else {
      // Nothing left to say — remove an empty sidecar rather than leaving
      // a stray "{}" file behind; clearing every known field should leave
      // a legacy flat asset exactly as untouched as before it ever had one.
      await fs.rm(sidecarPath, { force: true });
    }
  }

  const assets = await discoverCharacterAssets();
  return assets.find((a) => a.characterId === id) || null;
}

// Validates + persists a Basic directional Sprite Set edit (Part 10/11).
// `updates` is { front?, back?, left?, right? } — each present key is
// either a project-relative path (must resolve to a REAL file this
// Character Asset can see — its own folder, or the shared flat root; a
// name that doesn't match any real file is rejected outright, which also
// rules out traversal, since ".." or an absolute path can never equal a
// literal entry in a real directory listing) or explicit `null` (Clear —
// removes the key from authored metadata entirely, distinguishing "never
// configured" from "resolved to nothing"). Returns the freshly
// re-discovered asset so the caller can replace its in-memory copy
// atomically. Never touches Scene Instance data (scene-layout.json) —
// Sprite Set is Character Asset metadata, persisted here independently.
export async function saveCharacterAssetSprites(characterId, updates) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  const DIRECTIONS = ["front", "back", "left", "right"];
  const toBare = (v, prefix) => (v.startsWith(`${prefix}/`) ? v.slice(prefix.length + 1) : v);

  return mutateCharacterAssetMetadata(characterId, (meta, source) => {
    const prefix = source.kind === "folder" ? relPath(source.folderName) : relPath();
    const validFiles = source.kind === "folder" ? source.files : source.flatPngs;
    for (const dir of DIRECTIONS) {
      if (!updates || !(dir in updates)) continue;
      const v = updates[dir];
      if (v === null) {
        delete meta[dir];
        continue;
      }
      if (typeof v !== "string" || !v.trim()) throw err(400, `Invalid ${dir} sprite reference.`);
      const bare = toBare(v.trim(), prefix);
      if (!validFiles.includes(bare)) {
        throw err(400, `"${v}" does not exist in assets/characters/${source.kind === "folder" ? source.folderName + "/" : ""}.`);
      }
      meta[dir] = bare;
    }
  });
}

// Validates + persists a Speech Bubble Mapping edit (Part 14/15). `updates`
// is { [state]: {style?, source?} | null } — a `null` entry clears that
// state's mapping entirely; otherwise `style`/`source` are each
// independently optional within the entry: present-and-null clears just
// that field, present-and-valid sets it, ABSENT leaves whatever was
// already there untouched (so the caller never has to resend a field it
// didn't change). `source` must resolve to a REAL .md file directly under
// the approved assets/dialogue/bubbles/ root (Part 4) — never a directory
// traversal, absolute path, or non-.md file. Sprite Set / any other
// existing metadata on this asset is left completely untouched (shared
// mutateCharacterAssetMetadata reads-merges-writes the WHOLE object).
//
// `style` is now vestigial — the current editor UI never sends it (Bubble
// Style is chosen per MD entry, not per state, see bubbleMarkdown.js) — but
// this write path still tolerates it exactly as before rather than
// rejecting it outright, so an old saved `style` value is only ever
// touched if a caller explicitly sends that key, never silently stripped
// by an unrelated source-only save.
export async function saveCharacterAssetSpeechMapping(characterId, updates) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  return mutateCharacterAssetMetadata(characterId, async (meta) => {
    const mapping = meta.speechBubbleMapping && typeof meta.speechBubbleMapping === "object" ? { ...meta.speechBubbleMapping } : {};
    for (const state of SPEECH_STATES) {
      if (!updates || !(state in updates)) continue;
      const v = updates[state];
      if (v === null) {
        delete mapping[state];
        continue;
      }
      if (!v || typeof v !== "object") throw err(400, `Invalid mapping for "${state}".`);
      const existing = mapping[state] && typeof mapping[state] === "object" ? { ...mapping[state] } : {};
      if ("style" in v) {
        if (v.style === null) delete existing.style;
        else if (BUBBLE_STYLES.includes(v.style)) existing.style = v.style;
        else throw err(400, `Invalid Bubble Style for "${state}".`);
      }
      if ("source" in v) {
        if (v.source === null) {
          delete existing.source;
          delete existing.sourceMissing;
        } else {
          const normalized = normalizeDialogueRef(v.source);
          if (!normalized) throw err(400, `Invalid MD Source for "${state}": "${v.source}".`);
          if (!(await dialogueFileExists(normalized))) throw err(400, `"${normalized}" does not exist under assets/dialogue/bubbles/.`);
          existing.source = normalized;
          delete existing.sourceMissing; // a freshly-validated source is no longer "missing"
        }
      }
      if (Object.keys(existing).length) mapping[state] = existing;
      else delete mapping[state];
    }
    if (Object.keys(mapping).length) meta.speechBubbleMapping = mapping;
    else delete meta.speechBubbleMapping;
  });
}

// Validates + persists the ACTIVE Speech Set identity — the ONLY write path
// for the new unified-document authoring model. `speechSet` is either a
// non-empty string (normalized through the same normalizeStableId rule as
// characterId/roleId — garbage input that normalizes to "" is rejected, not
// silently cleared) or explicit `null` (clears the field). Deliberately NO
// existence check here — unlike the old per-state `source`, a Speech Set's
// actual file resolves per-locale at RUNTIME (see bubbleMarkdown.js's
// resolveSpeechDocument), so there's no single "the file" to validate
// against at save time. The old speechBubbleMapping is left completely
// untouched by this function — configuring a Speech Set does not erase it
// (Part 16: deprecated, not destroyed); it simply stops being consulted at
// read time once speechBubbleSet is present (see the runtime resolution
// order documented in triggerCharacterSpeechState, both F8 and production).
export async function saveCharacterAssetSpeechSet(characterId, speechSet) {
  const err = (status, message) => Object.assign(new Error(message), { status });
  if (speechSet !== null && typeof speechSet !== "string") throw err(400, "Invalid Speech Set.");
  return mutateCharacterAssetMetadata(characterId, (meta) => {
    if (speechSet === null) {
      delete meta.speechBubbleSet;
      return;
    }
    const id = normalizeStableId(speechSet);
    if (!id) throw err(400, `Invalid Speech Set: "${speechSet}".`);
    meta.speechBubbleSet = id;
  });
}
