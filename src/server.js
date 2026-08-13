// Aether Library — local server (scaffold).
// Serves the UI from public/ and exposes the API the frontend talks to.
// Binds to 127.0.0.1 only: this is a local app, never exposed to the network.

import path from "node:path";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import { config, publicConfig, setSceneTheme } from "./config.js";
import { providers } from "./providers/index.js";
import {
  runCouncil,
  runSessionEvents,
  retryScholar,
  regenerateJudgeRuling,
  precheckCouncil,
  getActiveRun,
  publicRunState,
  requestStopActiveRun,
  submitFailureDecision,
  RUN_IN_PROGRESS_MESSAGE,
  RUN_IN_PROGRESS_CODE,
} from "./services/council.js";
import {
  getActiveSession,
  resetSession,
  saveActiveSessionToVault,
} from "./services/sessionEngine.js";
import { sessionChatReply } from "./services/sessionChat.js";
import { saveSettings } from "./services/settings.js";
import { vaultStatus, listTopLevelFolders, writeTestDraft } from "./services/vault.js";
import {
  pickFolder,
  openFolder,
  connectVault,
  connectObsidianVault,
  setObsidianIntegration,
  setObsidianAutoExport,
} from "./services/vaultConnection.js";
import { exportActiveSessionToObsidian, exportArchiveToObsidian, obsidianAutoExportEnabled } from "./services/obsidianExport.js";
import { loadSceneLayout, saveSceneLayout } from "./services/sceneLayout.js";
import { loadSceneConfig, saveSceneConfig } from "./services/sceneConfig.js";
import {
  loadSceneContent,
  saveSceneContent,
  runtimeSceneContent,
} from "./services/sceneContent.js";
import {
  listResources,
  loadTutorialResource,
  loadLearnResource,
  relativeResourcePath,
  resourcePath,
  isValidResourceId,
  RESOURCE_KINDS,
} from "./services/contentResources.js";
import {
  loadWorldContent,
  saveWorldContent,
  sceneWorldIdentityPacks,
  sceneWorldFromPreset,
  sceneWorldToPreset,
  runtimeSceneWorld,
  listWorldPresets,
  getWorldPreset,
  saveWorldPreset,
} from "./services/worldContent.js";
import { setWorldIdentity } from "./localization.js";
import { loadProductConfig, runtimeProduct, PRODUCT_CONFIG_PATH } from "./services/productConfig.js";
import { openPathInOs } from "./services/devOpen.js";
import {
  sanitizeBackgroundPath,
  sanitizeStartMenuBackgroundPath,
  sanitizeAppIconPath,
  BACKGROUND_EXTENSIONS,
  BACKGROUND_SKIP_DIR_PREFIX,
  START_MENU_ROOT,
  APP_ICON_ROOT,
} from "./services/assetPaths.js";
import { loadAppShell, saveAppShell, runtimeAppShell } from "./services/appShell.js";
import { pickSceneFileToOpen, pickSceneFileToSave, pickImageFileToOpen } from "./services/nativeFileDialog.js";
import { importImage, IMAGE_EXTENSIONS } from "./services/imageImport.js";
import { generatedShadowPath, sanitizeGeneratedShadowPath } from "./services/shadowPresets.js";
import {
  readSceneFile,
  writeSceneFile,
  auditSceneAssets,
  blankSceneDocument,
  exportCurrentSceneDocument,
  listRecentScenes,
  rememberRecentScene,
  forgetRecentScene,
  ALS_FORMAT,
  ALS_VERSION,
} from "./services/sceneFile.js";
// Default Scene: which ALS the runtime loads on startup. resolveRuntimeScene()
// is the ONE place that decides what the runtime's Scene is — see
// docs/default-scene-ownership.md.
import {
  resolveRuntimeScene,
  describeDefaultScene,
  setDefaultScene,
  clearDefaultScene,
} from "./services/runtimeScene.js";
import { syncAssetRegistry, updateAssetId, updatePlacementLimit } from "./services/assetRegistry.js";
import { syncCharacterRegistry, updateCharacterId } from "./services/characterRegistry.js";
import {
  discoverCharacterAssets,
  discoverCharacterImageFiles,
  saveCharacterAssetSprites,
  saveCharacterAssetSpeechMapping,
  saveCharacterAssetSpeechSet,
} from "./services/characterAssets.js";
import { extractDocument, extractUrl } from "./services/materials.js";
import { listArchiveThreads, getArchive, deleteArchive, archiveSession, archiveContinuationText } from "./services/archives.js";
import { intersectWithCatalog, modelMetadataMap } from "./config/supported-models.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
// Session materials (pasted screenshots, uploaded files) travel as base64
// inside JSON, so the body limit must fit a few images.
app.use(express.json({ limit: "32mb" }));
app.use(express.static(path.join(projectRoot, "public")));
// Production art (backgrounds, future sprites) lives outside public/ so
// artists can replace files without touching app code. public/assets/ (the
// generated book sprite) is checked first by the static mount above.
app.use("/assets", express.static(path.join(projectRoot, "assets")));

// DEV-ONLY tooling (the F8 Scene Editor — devtools/ at the project root,
// deliberately OUTSIDE public/). Nothing in this block exists in a
// production run (NODE_ENV=production): the files aren't served, the layout
// API isn't registered, and the frontend never learns the editor exists
// (publicConfig reports devTools: false, so it never injects the script or
// its F8 shortcut).
if (config.devTools) {
  app.use("/dev", express.static(path.join(projectRoot, "devtools")));

  // Project asset browser for the Scene Editor (e.g. picking a shadow PNG):
  // recursively lists files under assets/ as PROJECT-RELATIVE paths
  // ("assets/shared/shadows/shadow_medium.png") — never absolute machine
  // paths. Read-only, never escapes the assets directory.
  app.get("/api/dev/assets", async (req, res) => {
    const exts = String(req.query.ext || "png")
      .split(",")
      .map((e) => `.${e.trim().toLowerCase().replace(/^\./, "")}`);
    const assetsRoot = path.join(projectRoot, "assets");
    const out = [];
    async function walk(dir) {
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (exts.includes(path.extname(e.name).toLowerCase())) {
          out.push(path.relative(projectRoot, full).split(path.sep).join("/"));
        }
      }
    }
    await walk(assetsRoot);
    res.json({ assets: out.sort() });
  });

  // Selectable Scene backgrounds. A DEDICATED route rather than a directory
  // parameter on /api/dev/assets above: restricting the picker to
  // assets/background/ is a product rule, not a caller's filter preference,
  // and a parameter could be widened by any future caller.
  //
  // Directories whose name begins with "_" are skipped — they hold authoring
  // material, not runtime art (assets/background/_guides/ carries the artist's
  // placement composite, which must never be selectable as a background).
  // Walks an assets/ directory and returns project-relative, POSIX-separated
  // paths for every runtime-renderable image, so what a picker offers is
  // byte-identical to what its schema will accept on save.
  //
  // `skipDir` decides which sub-directories are not part of THIS asset domain:
  // "_"-prefixed folders are authoring material everywhere (assets/background/
  // _guides/ holds the artist's placement composite), and the Scene picker
  // additionally skips the start-menu domain — see below.
  async function listBackgroundImages(root, skipDir = () => false) {
    const out = [];
    async function walk(dir) {
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return; // an unreadable sub-directory yields no options, never a 500
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(projectRoot, full).split(path.sep).join("/");
        if (e.isDirectory()) {
          if (e.name.startsWith(BACKGROUND_SKIP_DIR_PREFIX)) continue;
          if (skipDir(`${rel}/`)) continue;
          await walk(full);
        } else if (BACKGROUND_EXTENSIONS.includes(path.extname(e.name).toLowerCase())) {
          out.push(rel);
        }
      }
    }
    await walk(root);
    return out;
  }

  app.get("/api/dev/backgrounds", async (_req, res) => {
    // The start-menu directory is a DIFFERENT asset domain with its own field,
    // its own document and its own picker. Excluding it here keeps the two
    // ownership paths visibly separate in the editor rather than offering the
    // start screen's art as a candidate library map.
    const found = await listBackgroundImages(
      path.join(projectRoot, "assets", "background"),
      (rel) => rel === START_MENU_ROOT
    );
    // Re-validated through the schema's own sanitizer: the listing can never
    // offer a value the Scene would then reject.
    res.json({ backgrounds: found.map(sanitizeBackgroundPath).filter(Boolean).sort() });
  });

  // Selectable START SCREEN backgrounds — a separate domain from the Scene's,
  // rooted one level deeper and validated by its own sanitizer.
  app.get("/api/dev/start-menu-backgrounds", async (_req, res) => {
    const found = await listBackgroundImages(path.join(projectRoot, "assets", "background", "start-menu"));
    res.json({ backgrounds: found.map(sanitizeStartMenuBackgroundPath).filter(Boolean).sort() });
  });

  // Import an image from anywhere on the author's machine into the project.
  //
  // The DESTINATION ROOT is decided HERE, from a fixed allowlist — never sent
  // by the client. A caller can only name which known domain it is importing
  // into, so no request can aim the copy at an arbitrary folder. Map Background
  // becomes one more entry in this table when its task comes.
  // Selectable application icons. A DEDICATED route for the same reason the
  // start-menu one exists: restricting the Start Menu Icon picker to
  // assets/app-icons/ is a product rule, not a caller's filter preference.
  // Listing it separately is also what keeps the icon out of the Background
  // and Title Image dropdowns, which read the start-menu route above.
  app.get("/api/dev/app-icons", async (_req, res) => {
    const found = await listBackgroundImages(path.join(projectRoot, "assets", "app-icons"));
    res.json({ icons: found.map(sanitizeAppIconPath).filter(Boolean).sort() });
  });

  const IMPORT_ROOTS = { "start-menu-background": START_MENU_ROOT, "app-icon": APP_ICON_ROOT };

  app.post("/api/dev/import-image", async (req, res) => {
    try {
      const root = IMPORT_ROOTS[req.body?.kind];
      if (!root) throw Object.assign(new Error("Unknown import kind."), { status: 400 });
      const result = await importImage(req.body?.path, { root, extensions: IMAGE_EXTENSIONS });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // The native image picker — the SAME dialog service Open/Save As use, asked
  // for a different file kind. There is no second picker implementation.
  app.post("/api/dev/image-dialog", async (_req, res) => {
    try {
      res.json(await pickImageFileToOpen({}));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Authoring the application shell. Deliberately NOT part of the Scene's Save
  // Layout payload: the start screen must not travel with a Scene, so it is
  // written on its own, immediately, through its own document.
  app.post("/api/dev/app-shell", async (req, res) => {
    try {
      res.json(await saveAppShell(req.body));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------- Auto Shadow Generation
  // The PIXELS are made in the browser (F8, Canvas 2D) — the project has no
  // server-side image library and needs none. This route only validates the
  // finished PNG and writes it atomically.
  //
  // The output path is DERIVED SERVER-SIDE from the asset id and preset, never
  // taken from the client, so a generated Shadow can only ever land under
  // assets/shadows/generated/.
  app.post("/api/dev/shadow/generate", async (req, res) => {
    try {
      const rel = generatedShadowPath(req.body?.assetId, req.body?.preset, req.body?.fallbackId);
      if (!rel || !sanitizeGeneratedShadowPath(rel)) {
        return res.status(400).json({ error: "That object has no usable asset identity for a generated Shadow." });
      }
      const dataUrl = String(req.body?.png || "");
      const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) return res.status(400).json({ error: "Expected a base64 PNG data URL." });
      const bytes = Buffer.from(match[1], "base64");
      // Real PNG magic, and a sane cap — a Shadow mask is small.
      const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
        return res.status(400).json({ error: "That is not a PNG." });
      }
      if (bytes.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Generated Shadow is too large." });

      const target = path.join(projectRoot, rel);
      const dir = path.dirname(target);
      await fsp.mkdir(dir, { recursive: true });
      // Atomic: temp in the same directory, verify, then rename. A failed
      // generation can never leave a half-written PNG over a good one.
      const temp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
      try {
        await fsp.writeFile(temp, bytes);
        const back = await fsp.readFile(temp);
        if (back.length !== bytes.length || !back.subarray(0, 8).equals(PNG_MAGIC)) {
          throw new Error("verification failed");
        }
        await fsp.rename(temp, target);
      } catch (err) {
        await fsp.rm(temp, { force: true }).catch(() => {});
        throw err;
      }
      res.json({ asset: rel, bytes: bytes.length });
    } catch (err) {
      res.status(500).json({ error: `Could not save the generated Shadow: ${err.message}` });
    }
  });

  // ------------------------------------------------------- ALS Scene files
  // Aether Library Scene (.als) — the complete saved state of one map, stored
  // OUTSIDE the project wherever the author wants. DEV-ONLY, every one of
  // them: a production build has no Scene authoring at all.
  //
  // Opening loads into the editor's memory only. Nothing here writes
  // data/scene-layout.json or assets/scenes/*.json — the existing Save Layout
  // action remains the runtime-publishing path (docs/als-scene-file-v1.md §4).
  const sceneFileError = (res, err) => res.status(err.status || 500).json({ error: err.message });

  // The native OS Open / Save As dialog. Blocks while the dialog is up (a
  // human is looking at it), which is why it has its own generous timeout.
  // 501 means "no native dialog on this machine" — the editor then falls back
  // to the typed-path prompt rather than losing the ability to save at all.
  app.post("/api/dev/scene-file/dialog", async (req, res) => {
    try {
      const mode = req.body?.mode === "save" ? "save" : "open";
      const options = { currentPath: req.body?.currentPath, sceneName: req.body?.sceneName };
      const result = mode === "save" ? await pickSceneFileToSave(options) : await pickSceneFileToOpen(options);
      res.json(result);
    } catch (err) {
      sceneFileError(res, err);
    }
  });

  // A blank Scene: no background, no objects, no props, no zones.
  app.get("/api/dev/scene-file/new", (_req, res) => {
    res.json({ document: blankSceneDocument(), format: ALS_FORMAT, version: ALS_VERSION });
  });

  // The project's CURRENT split runtime files as one ALS document — the
  // migration bridge that turns the existing Classic Scene into a .als
  // without losing anything. Reads only.
  app.get("/api/dev/scene-file/export", async (_req, res) => {
    try {
      res.json({ document: await exportCurrentSceneDocument() });
    } catch (err) {
      sceneFileError(res, err);
    }
  });

  app.get("/api/dev/scene-file/open", async (req, res) => {
    try {
      const result = await readSceneFile(req.query.path);
      // Remembered only on a SUCCESSFUL open, so a bad path never enters the
      // recent list.
      const recent = await rememberRecentScene(result.path);
      res.json({ ...result, recent });
    } catch (err) {
      sceneFileError(res, err);
    }
  });

  app.post("/api/dev/scene-file/save", async (req, res) => {
    try {
      const result = await writeSceneFile(req.body?.path, req.body?.document);
      const assets = await auditSceneAssets(result.document);
      const recent = await rememberRecentScene(result.path);
      res.json({ ...result, assets, recent });
    } catch (err) {
      sceneFileError(res, err);
    }
  });

  app.get("/api/dev/scene-file/recent", async (_req, res) => {
    res.json({ recent: await listRecentScenes() });
  });

  app.delete("/api/dev/scene-file/recent", async (req, res) => {
    res.json({ recent: await forgetRecentScene(req.query.path) });
  });

  // The editable scene layout (object placements + zones) — see
  // src/services/sceneLayout.js for the document shape and zone priority.
  // Resolved through resolveRuntimeScene() — the SAME source the always-on
  // /api/scene-layout serves. This is what makes the Current File coupling safe
  // (docs/default-scene-ownership.md §6): when a Default Scene loaded, F8's
  // in-memory Scene IS that file's content, so adopting its path cannot make
  // Save overwrite a good ALS with something else.
  app.get("/api/dev/scene-layout", async (_req, res) => {
    try {
      res.json((await resolveRuntimeScene()).layout);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------- Default Scene (dev)
  // Configuring the Default Scene is AUTHORING and lives inside this devTools
  // gate; READING it is runtime and happens in resolveRuntimeScene(), which the
  // always-on Scene routes above use. A production run therefore renders a
  // configured Default Scene but 404s all three of these.
  app.get("/api/dev/default-scene", async (_req, res) => {
    try {
      res.json(await describeDefaultScene());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Validated by readSceneFile() BEFORE the path is stored, so an unopenable or
  // future-version .als can never become the Default Scene.
  app.post("/api/dev/default-scene", async (req, res) => {
    try {
      await setDefaultScene(req.body?.path);
      res.json(await describeDefaultScene());
    } catch (err) {
      sceneFileError(res, err);
    }
  });

  app.delete("/api/dev/default-scene", async (_req, res) => {
    try {
      await clearDefaultScene();
      res.json(await describeDefaultScene());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save Layout: persists without restarting anything — the editor applies
  // the same data live and re-applies it on the next dev page load.
  app.post("/api/dev/scene-layout", async (req, res) => {
    try {
      const layout = await saveSceneLayout(req.body);
      // The Scene owns the world, so saving the Scene is what applies world
      // edits: identityFor() picks up the new names immediately, no restart.
      setWorldIdentity(sceneWorldIdentityPacks(layout.world), layout.world.customNames);
      // Same for the Workspace theme — the next /api/config carries it, which
      // is what the editor's post-save refresh already reloads.
      setSceneTheme(layout.world.theme);
      res.json({ saved: true, layout });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Developer Asset Registry: GET syncs (scans assets/props/ and
  // auto-registers new PNGs — idempotent, uids immutable); the asset-id
  // route renames only the editable id. Production has none of this: the
  // packaged registry file is the only asset source.
  app.get("/api/dev/asset-registry", async (_req, res) => {
    try {
      res.json(await syncAssetRegistry());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/dev/asset-registry/asset-id", async (req, res) => {
    try {
      res.json({ saved: true, asset: await updateAssetId(req.body?.asset_uid, req.body?.asset_id) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
  // Player placement limit — Asset-definition metadata for the future
  // Player Customization Mode. Stored here, never enforced by the F8 editor.
  app.post("/api/dev/asset-registry/placement-limit", async (req, res) => {
    try {
      res.json({ saved: true, asset: await updatePlacementLimit(req.body?.asset_uid, req.body?.placementLimit ?? null) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Developer Character Registry — SEPARATE from the Prop Asset Registry
  // above (see services/characterRegistry.js): scans assets/characters/ and
  // auto-registers new PNGs under their own uid/id namespace, so future
  // playable characters and NPCs get an approved-asset identity without
  // touching engine code.
  app.get("/api/dev/character-registry", async (_req, res) => {
    try {
      res.json(await syncCharacterRegistry());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/dev/character-registry/asset-id", async (req, res) => {
    try {
      res.json({ saved: true, asset: await updateCharacterId(req.body?.asset_uid, req.body?.asset_id) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Character Asset discovery (Character Role Roster, Phase 1): every
  // reusable character package under assets/characters/ — folder-style
  // (character.json/front.png/portrait.png) and current flat PNGs alike.
  // Read-only; see src/services/characterAssets.js for the resolution rules.
  app.get("/api/dev/character-assets", async (_req, res) => {
    try {
      res.json({ assets: await discoverCharacterAssets() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Basic directional Sprite Set (Front/Back/Left/Right) — Character Asset
  // metadata, independent of any scene. The picker's candidate list: every
  // PNG discoverable under assets/characters/, read-only.
  app.get("/api/dev/character-assets/images", async (_req, res) => {
    try {
      res.json({ images: await discoverCharacterImageFiles() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  // Writes into character.json (folder assets) or a sidecar JSON next to a
  // flat PNG (see characterAssets.js) — never scene-layout.json. Body:
  // { front?, back?, left?, right? }, each a project-relative path or null
  // (Clear). Returns the freshly re-discovered asset.
  app.post("/api/dev/character-assets/:characterId/sprites", async (req, res) => {
    try {
      const asset = await saveCharacterAssetSprites(req.params.characterId, req.body || {});
      res.json({ saved: true, asset });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Speech Bubble Mapping v1 — Character Asset personality/content metadata
  // (see characterAssets.js's own header comment for the full model). No
  // new discovery endpoint for .md files: the picker reuses the EXISTING
  // generic /api/dev/assets?ext=md browser above, filtered client-side to
  // the approved assets/dialogue/bubbles/ root. Writes into character.json
  // or the flat sidecar, same file Sprite Set already writes into.
  app.post("/api/dev/character-assets/:characterId/speech-mapping", async (req, res) => {
    try {
      const asset = await saveCharacterAssetSpeechMapping(req.params.characterId, req.body || {});
      res.json({ saved: true, asset });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Unified Speech Set (replaces per-state speech-mapping as the ACTIVE
  // authoring path — see characterAssets.js's own header comment). Body:
  // { speechSet: string | null }. Writes into the same character.json/
  // sidecar file, via the same mutateCharacterAssetMetadata read-merge-write
  // path — never touches speechBubbleMapping/sprites/any other field.
  app.post("/api/dev/character-assets/:characterId/speech-set", async (req, res) => {
    try {
      const asset = await saveCharacterAssetSpeechSet(req.params.characterId, req.body?.speechSet ?? null);
      res.json({ saved: true, asset });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // -------------------------------------------------- World Content (F8 World tab)
  // The world's DISPLAY identity (what the characters are called). Engine ids
  // are never authored here — see services/worldContent.js. A save re-applies
  // the identity immediately, so About/prompts/tabs pick it up without a
  // restart.
  app.get("/api/dev/world", async (_req, res) => {
    try {
      res.json(await loadWorldContent());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  // Writes the world TEMPLATE file. It deliberately does NOT re-point the
  // running identity any more: the runtime reads the Scene's own world
  // snapshot, so editing a template can never change a Scene that already
  // copied it. Saving the Scene is what applies world edits.
  app.post("/api/dev/world", async (req, res) => {
    try {
      const content = await saveWorldContent(req.body);
      res.json({ saved: true, content });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // World Presets — copy sources, exactly like UI Presets: no live reference,
  // no inheritance, and an existing preset is never silently overwritten.
  app.get("/api/dev/world-presets", async (_req, res) => {
    try {
      res.json({ presets: await listWorldPresets() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/dev/world-presets/:id", async (req, res) => {
    try {
      const preset = await getWorldPreset(req.params.id);
      if (!preset) return res.status(404).json({ error: "World preset not found." });
      // `sceneWorld` is the preset already converted to the Scene-owned
      // snapshot the editor copies in. Done here so the preset -> Scene
      // mapping exists in exactly one place, not mirrored in the editor.
      res.json({ preset, sceneWorld: sceneWorldFromPreset(preset) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
  app.post("/api/dev/world-presets/:id", async (req, res) => {
    try {
      // A preset is saved FROM the Scene's world snapshot (`sceneWorld`);
      // `content` remains accepted for a preset-shaped body.
      const source = req.body?.sceneWorld
        ? sceneWorldToPreset(req.body.sceneWorld, req.params.id)
        : req.body?.content;
      const preset = await saveWorldPreset(req.params.id, source, {
        overwrite: req.body?.overwrite === true,
      });
      res.json({ saved: true, preset });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.status === 409 ? "preset_exists" : null });
    }
  });

  // -------------------------------------------- Scene Content (F8 Content tab)
  // A Scene remembers only which content RESOURCE it uses — an id, never a
  // path (see services/sceneContent.js). About text and official links are
  // NOT here: they are global product configuration.
  app.get("/api/dev/scene-content", async (_req, res) => {
    try {
      res.json(await loadSceneContent());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/dev/scene-content", async (req, res) => {
    try {
      res.json({ saved: true, content: await saveSceneContent(req.body) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // The selectable content resources of a kind, with their PROJECT-RELATIVE
  // locations (never absolute machine paths). Listing is restricted to the
  // approved roots by contentResources.js; an unknown kind is a 400.
  app.get("/api/dev/content-resources/:kind", async (req, res) => {
    try {
      const kind = req.params.kind;
      if (!RESOURCE_KINDS.includes(kind)) return res.status(400).json({ error: "Unknown content kind." });
      res.json({ kind, resources: await listResources(kind) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Where a resource lives, for the Content panel's Open File / Copy Path.
  // Resolves ONLY inside the approved root, and returns a project-relative
  // path — there is no arbitrary-file access here.
  app.get("/api/dev/content-resources/:kind/:id/path", (req, res) => {
    try {
      const { kind, id } = req.params;
      if (!RESOURCE_KINDS.includes(kind)) return res.status(400).json({ error: "Unknown content kind." });
      if (!isValidResourceId(id)) return res.status(400).json({ error: "Invalid resource id." });
      res.json({ kind, id, path: relativeResourcePath(kind, id) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // F8 Content tab: hand a content file to the OS (Open) or show it selected
  // in the file manager (Reveal). DEV-ONLY, inside this devTools gate.
  //
  // The client sends a KIND, never a path: the absolute target is resolved
  // here from the same validated resolvers the runtime uses, so this adds no
  // arbitrary-file access on top of the existing path route above. Product is
  // its own kind because it lives in config/, not the content root.
  app.post("/api/dev/content-open", async (req, res) => {
    try {
      const kind = String(req.body?.kind || "");
      const reveal = req.body?.reveal === true;
      let target;
      if (kind === "product") {
        target = PRODUCT_CONFIG_PATH;
      } else if (RESOURCE_KINDS.includes(kind)) {
        const id = String(req.body?.id || "");
        if (!isValidResourceId(id)) return res.status(400).json({ error: "Invalid resource id." });
        // Throws on anything unsafe — same validation as the path route.
        target = resourcePath(kind, id);
      } else if (kind === "background") {
        // The Scene's background. `id` is a project-relative path, and the
        // SAME sanitizer the schema uses decides whether it is one — a caller
        // cannot reach outside assets/background/ or name an unsupported
        // format, so no absolute path from the client ever becomes a target.
        const rel = sanitizeBackgroundPath(req.body?.id);
        if (!rel) return res.status(400).json({ error: "Invalid background path." });
        target = path.join(projectRoot, rel);
      } else if (kind === "generated-shadow") {
        // A generated Shadow PNG. Its own root, its own sanitizer — never the
        // Scene background's, so the two domains cannot be confused.
        const rel = sanitizeGeneratedShadowPath(req.body?.id);
        if (!rel) return res.status(400).json({ error: "Invalid generated Shadow path." });
        target = path.join(projectRoot, rel);
      } else if (kind === "start-menu-background") {
        // The start screen's art. A SEPARATE kind with its own, tighter root —
        // never the Scene's sanitizer, so the two can never be confused.
        const rel = sanitizeStartMenuBackgroundPath(req.body?.id);
        if (!rel) return res.status(400).json({ error: "Invalid start menu background path." });
        target = path.join(projectRoot, rel);
      } else {
        return res.status(400).json({ error: "Unknown content kind." });
      }
      res.json(await openPathInOs(target, { reveal }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // The scene's own object list — the Scene Editor writes prop instances
  // (x/y/scale/flipX) to assets/scenes/classic_library.json. READING goes
  // through resolveRuntimeScene() so a Default Scene's props reach the editor,
  // matching what /api/scene-config serves the runtime.
  app.get("/api/dev/scene-config", async (_req, res) => {
    try {
      res.json((await resolveRuntimeScene()).config);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/dev/scene-config", async (req, res) => {
    try {
      res.json({ saved: true, config: await saveSceneConfig(req.body) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "aether-library", version: "1.1.0" });
});

// ---------------------------------------------------------------------
// Character Runtime Bridge (production-safe, ALWAYS registered — outside
// the config.devTools gate above). Read-only mirrors of the dev-only Scene
// Editor routes, exposing exactly the same persisted data (never a second
// schema, never a write path) so the normal game client can resolve Role ->
// live Character Scene Instance -> Speech Bubble Mapping the same way the
// F8 editor already does, without depending on F8 state or /api/dev/*.
// ---------------------------------------------------------------------

// The SAME scene-layout.json loadSceneLayout() already reads for the F8
// editor (objects/zones/characterSlots/characterRoles/sceneMeta) — read
// only, no save route mirrored here. The production client applies the
// npc-relevant subset itself (see public/app.js) rather than this route
// pre-filtering it, so the shape stays identical to the dev route's.
// Resolved through resolveRuntimeScene(), so a configured Default Scene is
// served here instead of data/scene-layout.json — the SAME data F8 sees, and
// the same ALS parser/version gate that Open uses. With no Default Scene
// configured this is byte-identical to the previous loadSceneLayout() response.
app.get("/api/scene-layout", async (_req, res) => {
  try {
    res.json((await resolveRuntimeScene()).layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scene props for the SHIPPING app. NEW as a route: props used to be fetched
// straight off the /assets static mount, which cannot be resolved per request —
// so a Default Scene's props could never have reached the runtime. Serving them
// here also means SCENE_CONFIG_PATH is finally honoured by the client, closing
// a test-isolation hole where scratch runs were shown the real project's props.
app.get("/api/scene-config", async (_req, res) => {
  try {
    res.json((await resolveRuntimeScene()).config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The SAME discoverCharacterAssets() the F8 Character Assets browser uses —
// read-only (no sprites/speech-mapping SAVE route mirrored here). Already
// safe to expose as-is: project-relative paths only, no filesystem access
// beyond assets/characters/, no authoring capability.
app.get("/api/character-assets", async (_req, res) => {
  try {
    res.json({ assets: await discoverCharacterAssets() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scene UI Content for the SHIPPING app — read-only, always available (never
// behind the devTools gate), and passed through runtimeSceneUi() so it can
// carry only sanitized content: no dev metadata, no filesystem path, no
// preset bookkeeping, and no link that failed URL validation. A missing
// content file returns the defaults, which is exactly the product's current
// behaviour (real About copy, every outbound link disabled).
// Scene Content for the SHIPPING app: the resource ids it should load.
app.get("/api/scene-content", async (_req, res) => {
  try {
    res.json(runtimeSceneContent((await resolveRuntimeScene()).content));
  } catch (err) {
    console.error("[scene-content] falling back to defaults:", err.message);
    res.json(runtimeSceneContent(null));
  }
});

// The Tutorial resource the Scene selects — sanitized, disabled steps already
// removed, so the client never has to filter. Read-only and always available.
app.get("/api/content/tutorial", async (req, res) => {
  try {
    const requested = typeof req.query.id === "string" ? req.query.id : "";
    const scene = runtimeSceneContent(await loadSceneContent());
    const id = isValidResourceId(requested) ? requested : scene.content.tutorial;
    const resource = await loadTutorialResource(id);
    res.json({
      id: resource.id,
      missing: Boolean(resource.missing),
      steps: resource.steps
        .filter((s) => s.enabled)
        .map(({ id: stepId, target, title, body, previewImage }) => ({ id: stepId, target, title, body, previewImage })),
    });
  } catch (err) {
    console.error("[content] tutorial fallback:", err.message);
    res.status(500).json({ error: "Could not load the tutorial resource." });
  }
});

// The GLOBAL Learn guide. Never varies by Scene or World.
app.get("/api/content/learn", async (_req, res) => {
  try {
    const product = await loadProductConfig();
    const resource = await loadLearnResource(product.learn);
    res.json({ id: resource.id, missing: Boolean(resource.missing), locales: resource.locales });
  } catch (err) {
    console.error("[content] learn fallback:", err.message);
    res.status(500).json({ error: "Could not load the learn resource." });
  }
});

// The active world's display identity for the SHIPPING app — read-only,
// always available. publicConfig().identity already carries the resolved
// names (identityFor reads World Content), so this route exists for
// surfaces that want the world itself: its id, display name and library
// naming. Contains no filesystem path and no preset bookkeeping.
app.get("/api/world", async (_req, res) => {
  try {
    const layout = await loadSceneLayout();
    res.json(runtimeSceneWorld(layout.world));
  } catch (err) {
    console.error("[world] falling back to the Classic default:", err.message);
    res.json(runtimeSceneWorld(null));
  }
});

// The PRODUCT's own identity and official links — read-only, always
// available, and the ONLY source of these values. Deliberately not part of
// Scene UI Content or World Content: loading someone else's Scene or preset
// must never be able to repoint "Official Website" or "Support" (§6).
// There is no write route at all; the file is edited by hand.
app.get("/api/product", async (_req, res) => {
  try {
    res.json(runtimeProduct(await loadProductConfig()));
  } catch (err) {
    console.error("[product] falling back to defaults:", err.message);
    res.json(runtimeProduct(null));
  }
});

// The application SHELL's presentation — currently the start screen's
// background. Read-only and always available, like /api/product above, so the
// shipping client needs no dev route to render its own start screen.
// Separate from the Scene's background on purpose (§9): entering or switching
// a Scene must never change what the start screen looks like.
app.get("/api/app-shell", async (_req, res) => {
  try {
    res.json(runtimeAppShell(await loadAppShell()));
  } catch (err) {
    console.error("[app-shell] falling back to defaults:", err.message);
    res.json(runtimeAppShell(null));
  }
});

// F8 Product panel: WHERE the file lives, so it can be opened and edited by
// hand. Dev-only, and it exposes a path the developer already owns — never
// to the shipping client.
if (config.devTools) {
  app.get("/api/dev/product-path", (_req, res) => {
    res.json({ path: PRODUCT_CONFIG_PATH });
  });
}

// Safe config for the UI: never includes API keys.
app.get("/api/config", (_req, res) => {
  res.json(publicConfig());
});

// Save settings from the UI into .env.local (created if missing) and
// hot-reload config. Keys are write-only; the response never contains them.
app.post("/api/settings", (req, res, next) => {
  try {
    const { updated } = saveSettings(req.body || {});
    res.json({ updated, config: publicConfig() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Model discovery: live model list from the provider's API (no completion
// tokens spent). configuredModelAvailable tells the UI whether the currently
// configured model is valid for this API key.
app.get("/api/models/:provider", async (req, res) => {
  const provider = providers[req.params.provider];
  if (!provider) {
    return res.status(404).json({ error: `Unknown provider: ${req.params.provider}` });
  }
  if (!provider.isConfigured()) {
    return res.status(400).json({ error: `${provider.label}: no API key configured.` });
  }
  try {
    // The RAW list — everything this API key can technically reach, already
    // trimmed of non-text families by the provider module itself. Used only
    // to check the currently-configured model's own availability, which must
    // stay accurate even for a model the curated catalog doesn't list (e.g.
    // a deliberate .env.local override).
    const rawModels = await provider.listModels();
    const configuredModel = provider.model();
    // An alias like "claude-sonnet-4-5" is valid when the list carries the
    // dated snapshot "claude-sonnet-4-5-20250929" (or an "@version" variant).
    // Plain prefix matching is NOT enough: "gemini-3.1-pro-preview" is a
    // different model than "gemini-3.1-pro".
    const available =
      rawModels.includes(configuredModel) ||
      rawModels.some(
        (m) =>
          m.startsWith(`${configuredModel}@`) ||
          (m.startsWith(`${configuredModel}-`) && /^\d{8}$/.test(m.slice(configuredModel.length + 1)))
      );
    // Refresh Model List only ever shows the CURATED subset (see
    // src/config/supported-models.js) — passing every provider-listed model
    // straight through turns the picker into a raw API explorer (~76 entries
    // for OpenAI) full of previews, legacy, and specialized models nobody
    // should pick by default.
    const models = intersectWithCatalog(rawModels, provider.id);
    const modelInfo = modelMetadataMap(provider.id);
    res.json({
      provider: provider.id,
      models,
      modelInfo,
      configuredModel,
      configuredModelAvailable: available,
    });
  } catch (err) {
    // err.status is the real HTTP status the provider returned (401/403/404/
    // 429/5xx — see httpError() in src/providers/errors.js); err.code carries
    // "timeout"/"network" for a fetch-layer failure that never got a real
    // response. Forwarding both (instead of a flat 502) is what lets the
    // frontend show "quota exceeded" vs. "invalid key" vs. "not found"
    // instead of a generic message for every failure.
    res.status(err.status || 502).json({ error: err.message, code: err.code || null });
  }
});

app.get("/api/vault/status", async (_req, res) => {
  res.json(await vaultStatus());
});

app.get("/api/vault/folders", async (_req, res, next) => {
  try {
    res.json({ folders: await listTopLevelFolders() });
  } catch (err) {
    next(err);
  }
});

// The ONLY write path in the scaffold. Requires an explicit confirmation flag.
app.post("/api/vault/test-write", async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Pass { \"confirm\": true } to write a test draft." });
    }
    res.json({ written: true, ...(await writeTestDraft()) });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------- Vault Connection
// Picking, opening, and switching the connected Vault folder. See
// services/vaultConnection.js — this never touches Archives.

app.post("/api/vault/pick-folder", async (req, res) => {
  try {
    // `kind` selects a fixed server-side dialog prompt ("vault" | "obsidian").
    res.json(await pickFolder(req.body?.kind));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/vault/open", async (_req, res) => {
  try {
    res.json(await openFolder(config.vaultPath));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/vault/connect", async (req, res) => {
  try {
    const vault = await connectVault(req.body?.path);
    res.json({ connected: true, vault });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// OPTIONAL Obsidian integration — see connectObsidianVault(). `notObsidian`
// in the error payload lets the UI offer a confirm-and-retry with force.
app.post("/api/vault/obsidian/connect", async (req, res) => {
  try {
    const vault = await connectObsidianVault(req.body?.path, { force: Boolean(req.body?.force) });
    res.json({ connected: true, vault });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, notObsidian: err.notObsidian || undefined });
  }
});

// Opens the connected Obsidian vault folder in the OS file manager.
app.post("/api/vault/obsidian/open", async (_req, res) => {
  try {
    res.json(await openFolder(config.obsidianVaultPath));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Turns the integration on/off. Disabling never deletes the remembered path,
// exported files, or any user data. `needsPath` in the error payload tells
// the UI to open the folder picker instead.
app.post("/api/vault/obsidian/integration", async (req, res) => {
  try {
    const vault = await setObsidianIntegration(Boolean(req.body?.enabled));
    res.json({ vault });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, needsPath: err.needsPath || undefined });
  }
});

// Persists the automatic-export preference (shown only while enabled).
app.post("/api/vault/obsidian/auto-export", async (req, res) => {
  try {
    const vault = await setObsidianAutoExport(Boolean(req.body?.enabled));
    res.json({ vault });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ------------------------------------------------------------- Session API
// A Session begins when the user asks a question and stays active until the
// player Saves it to the Vault or Resets it. The Judge Chat / Scholar Chat
// belongs to the active Session.

// Parses run options from the request body: mode ("single" | "council"),
// the participating Scholar slots (1–3), the "Use Vault" option (only an
// explicit false disables Librarian retrieval — absent means on), and
// Continue Discussion's lineage claim (`continuation: {sourceSessionId,
// sourceThreadId}`, set by continueDiscussion() in app.js). Passed through
// as-is — continuationLineageFrom() in materials.js is the one place that
// decides whether to actually honor it.
function parseRunOptions(body) {
  const mode = body?.mode === "single" ? "single" : "council";
  let scholars = Array.isArray(body?.scholars) ? body.scholars.map(Number) : undefined;
  if (scholars) scholars = scholars.filter((n) => [1, 2, 3].includes(n));
  const continuation = body?.continuation && typeof body.continuation === "object" ? body.continuation : null;
  return { mode, scholars, materials: body?.materials, useVault: body?.useVault !== false, continuation };
}

// ---------------------------------------------------------- Session materials
// The input layer for attachments. Extraction happens at attach time so the
// composer can preview a material (and the player can remove it) before any
// Scholar sees it. Materials are temporary: they are never written to the
// Vault in this milestone.

// Readable text of one webpage (nav/ads/chrome stripped).
app.post("/api/materials/url", async (req, res) => {
  try {
    res.json(await extractUrl(req.body?.url));
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// Readable text of one uploaded document ({ name, data: base64 }).
app.post("/api/materials/extract", async (req, res) => {
  try {
    res.json(await extractDocument({ name: req.body?.name, data: req.body?.data }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Streams a run as NDJSON events ("librarian", "scholar_status"/"scholar"
// ×N, "judge" for council, then "session") so the UI updates tabs as answers
// arrive. Heartbeat "ping" events flow every HEARTBEAT_MS while the run is
// working so the client can use a short inactivity deadline (instead of one
// huge fixed timeout sized to the worst-case 600s file analysis) and still
// tell a healthy long run apart from a dead connection.
const HEARTBEAT_MS = 15_000;

async function streamSessionRun(question, options, res) {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (type, data) => res.write(JSON.stringify({ type, data }) + "\n");
  const heartbeat = setInterval(() => send("ping", {}), HEARTBEAT_MS);
  // The client dropping mid-run (page closed, aborted fetch) is its own
  // outcome — logged as user_cancelled, never conflated with a timeout.
  let finished = false;
  res.on("close", () => {
    if (!finished) console.log("[timeout] run stream closed by the client before completion (user_cancelled)");
  });
  try {
    await runSessionEvents(question, options, send);
    send("done", {});
  } catch (err) {
    console.error(err);
    send("error", { error: err.message });
  } finally {
    finished = true;
    clearInterval(heartbeat);
  }
  res.end();
}

// Sanitizes the optional manual-check `overrides` body field (Settings →
// "Check Models Now" validating the form's current, possibly-unsaved
// values instead of the saved runtime config — see precheckCouncil()'s own
// comment). Absent/malformed -> undefined, so precheckCouncil() falls back
// to its normal saved-config behavior untouched; the Send-flow gate never
// sends this field at all, so it is never affected by any of this.
function parsePrecheckOverrides(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const scholarSlots = Array.isArray(raw.scholarSlots)
    ? raw.scholarSlots
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          slot: Number(s.slot) || 0,
          provider: typeof s.provider === "string" ? s.provider : "",
          model: typeof s.model === "string" ? s.model : "",
          enabled: s.enabled !== false,
        }))
    : [];
  return {
    judgeProvider: typeof raw.judgeProvider === "string" ? raw.judgeProvider : "",
    judgeModel: typeof raw.judgeModel === "string" ? raw.judgeModel : "",
    scholarSlots,
  };
}

// Council Model Pre-check: a minimal, non-generating availability check for
// every participant (the requested/enabled Scholar slots + the Grand Sage)
// BEFORE any real Council run. Never creates or touches a Session — see
// precheckCouncil() in services/council.js. Body: { scholars: [1,2,3],
// overrides }. `scholars` (optional) defaults to the enabled slots, same
// resolution the real run uses. `overrides` (optional) checks an EXPLICIT
// participant configuration instead — see parsePrecheckOverrides() above.
// Mentor mode has no equivalent route — this is Council-only.
app.post("/api/council/precheck", async (req, res, next) => {
  try {
    let scholars = Array.isArray(req.body?.scholars) ? req.body.scholars.map(Number) : undefined;
    if (scholars) scholars = scholars.filter((n) => [1, 2, 3].includes(n));
    const overrides = parsePrecheckOverrides(req.body?.overrides);
    res.json(await precheckCouncil(scholars, overrides));
  } catch (err) {
    next(err);
  }
});

// Run Safety: reject a second initial run while one is still in flight, with
// a real HTTP 409 rather than a 200 stream whose first event is an error.
// runSessionEvents() enforces the same rule itself (it is the authority — see
// its Run Safety block); this only gives the duplicate request a clean status
// before any streaming headers are committed.
function rejectIfRunInProgress(res) {
  const active = getActiveRun();
  if (!active) return false;
  res.status(409).json({ error: RUN_IN_PROGRESS_MESSAGE, code: RUN_IN_PROGRESS_CODE, runId: active.runId });
  return true;
}

// Start a Session (streaming). Body: { question, mode, scholars: [1,2,3] }.
app.post("/api/session/run/stream", (req, res) => {
  const question = (req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Question is required." });
  if (rejectIfRunInProgress(res)) return;
  streamSessionRun(question, parseRunOptions(req.body), res);
});

// Start a Session (single response). Same body as the streaming variant.
app.post("/api/session/run", async (req, res) => {
  try {
    const question = (req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Question is required." });
    if (rejectIfRunInProgress(res)) return;
    res.json(await runSessionEvents(question, parseRunOptions(req.body)));
  } catch (err) {
    // err.status carries the engine's own 409 (duplicate run) instead of
    // being flattened to 500 by the generic error handler.
    res.status(err.status || 500).json({ error: err.message, code: err.code || null });
  }
});

// The active Session (question, mode, status, scholar results, ruling, chat,
// vault state, metadata). Lets the UI restore after a reload.
//
// `run` rides along whether or not a Session exists: the Session is only
// installed once the run FINISHES, so a page reloaded mid-generation would
// otherwise be indistinguishable from an idle app and would happily offer
// Send again. The question is echoed back so the reloaded page can show what
// is being worked on. Never includes materials or any answer content.
// `run` now also carries the runtime state machine (running /
// cancellation_requested / awaiting_failure_decision) and, while parked at
// the failure gate, which Scholars failed and why — everything a reloaded
// page needs to restore Stop, Stopping…, or the Continue/Stop decision UI.
// publicRunState() is the projection: the AbortController, the decision
// resolver and raw provider error text never leave the server.
app.get("/api/session", (_req, res) => {
  const run = publicRunState();
  const session = getActiveSession();
  if (!session) return res.json({ active: false, run });
  res.json({ active: true, session, run });
});

// Stop Generation. Idempotent and always 200: an active run, an
// already-stopping run, a run parked at the failure gate, and no run at all
// are all safe. Never resets the Session and never clears completed answers
// — Stop is not Reset. Returns immediately; the pipeline unwinds on its own.
app.post("/api/session/stop", (_req, res) => {
  res.json(requestStopActiveRun());
});

// The user's answer to the provider failure gate.
// Body: { runId, decision: "continue" | "stop" }. runId is validated against
// the CURRENT run so a stale page can never decide for a newer one.
app.post("/api/session/failure-decision", (req, res) => {
  try {
    res.json(submitFailureDecision(req.body?.runId, req.body?.decision));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || null });
  }
});

// Continue the active Session: one completion on the Judge (council) or the
// single Scholar. Never re-runs the council or queries other Scholars.
app.post("/api/session/chat", async (req, res) => {
  const message = (req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Message is required." });
  try {
    res.json(await sessionChatReply(message, req.body?.materials));
  } catch (err) {
    // code carries "timeout"/"network" for fetch-layer failures (see
    // src/providers/errors.js) that don't have an HTTP status of their own;
    // the frontend uses either to classify the failure without re-parsing
    // the message.
    res.status(err.status || 502).json({ error: err.message, code: err.code || null });
  }
});

// Save to Vault: persist the active Session through the active Vault Adapter.
// The native Aether Vault is ALWAYS the first and primary destination; the
// optional Obsidian auto-export below copies the saved note afterwards and a
// failure there never affects (or rolls back) the native save.
app.post("/api/session/save", async (_req, res) => {
  try {
    const session = await saveActiveSessionToVault();
    // Refresh the archive record so its Vault reference reflects this save.
    // Same session id -> upserts the existing record, never a duplicate.
    archiveSession(session).catch((err) =>
      console.error("[archives] failed to refresh archive after vault save:", err.message)
    );

    let obsidianExportError = null;
    if (obsidianAutoExportEnabled()) {
      try {
        await exportActiveSessionToObsidian();
      } catch (err) {
        obsidianExportError = err.message;
        console.error("[obsidian] auto-export failed (native save intact):", err.message);
      }
    }
    res.json({ saved: true, session, obsidianExportError });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Manual "Export to Obsidian": copies the saved native-Vault note into
// aether-vault/ inside the connected Obsidian vault.
app.post("/api/session/export-obsidian", async (_req, res) => {
  try {
    res.json({ exported: true, export: await exportActiveSessionToObsidian() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Re-runs exactly ONE failed Scholar of the active Session, reusing the
// session's cached context package (materials are never re-parsed or
// re-sent). Body (optional): { provider, model } — "change model and retry".
// The other Scholars' answers are untouched.
app.post("/api/session/scholar/:slot/retry", async (req, res) => {
  const slot = Number(req.params.slot);
  if (![1, 2, 3].includes(slot)) return res.status(400).json({ error: "Invalid scholar slot." });
  try {
    const scholar = await retryScholar(slot, {
      provider: typeof req.body?.provider === "string" ? req.body.provider : undefined,
      model: typeof req.body?.model === "string" ? req.body.model : undefined,
    });
    res.json({ key: `scholar${slot}`, scholar });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || undefined });
  }
});

// Regenerates ONLY the Grand Sage's ruling from the Scholars' answers as
// they stand now — used after a successful Scholar retry so the ruling can
// incorporate the recovered answer. Never re-runs any Scholar.
app.post("/api/session/judge/regenerate", async (_req, res) => {
  try {
    res.json({ judge: await regenerateJudgeRuling() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || undefined });
  }
});

// Reset Session: destroy the active Session. Nothing is written.
app.post("/api/session/reset", (_req, res) => {
  res.json({ reset: resetSession() });
});

// ------------------------------------------------------------- Archives API
// Local history of completed Sessions, kept separate from the Vault (see
// services/archives.js). Read-only browsing + delete; no editing.

// One row per discussion THREAD (Continue Discussion lineage), not one row
// per Session — see listArchiveThreads() in services/archives.js. A thread
// with a single Session carries exactly the same fields a plain archive
// summary always has, just wrapped in a one-item `sessions` array.
app.get("/api/archives", async (req, res, next) => {
  try {
    res.json({ archives: await listArchiveThreads(req.query.q) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/archives/:id", async (req, res, next) => {
  try {
    const archive = await getArchive(req.params.id);
    if (!archive) return res.status(404).json({ error: "Archive not found." });
    res.json({ archive });
  } catch (err) {
    next(err);
  }
});

// "Continue Discussion" (Archives detail action) — read-only: the archive's
// own saved Markdown, for the frontend to attach as previous-discussion
// context on a NEW session. Never mutates the archive, the Vault, or the
// active Session (see archiveContinuationText()).
app.get("/api/archives/:id/continue", async (req, res, next) => {
  try {
    const continuation = await archiveContinuationText(req.params.id);
    if (!continuation) return res.status(404).json({ error: "Archive not found." });
    res.json(continuation);
  } catch (err) {
    next(err);
  }
});

// Syncs one archived Session into the connected Obsidian vault — the same
// copy pipeline as the live export (see exportArchiveToObsidian). The archive
// record is kept; re-syncing updates the same note it produced before.
// `notConfigured` rides along on the 409 so the UI can show its "connect
// Obsidian first" prompt instead of a raw error.
app.post("/api/archives/:id/export-obsidian", async (req, res) => {
  try {
    res.json({ exported: true, export: await exportArchiveToObsidian(req.params.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, notConfigured: err.notConfigured || undefined });
  }
});

// Deletes only the archive record — never the Vault Markdown file the
// Session may also have been saved to (see services/archives.js), and never
// any Obsidian copy the archive was synced to.
app.delete("/api/archives/:id", async (req, res, next) => {
  try {
    const deleted = await deleteArchive(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Archive not found." });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---- Backwards-compatible council routes (mode "council", all enabled slots)

app.post("/api/council", async (req, res, next) => {
  try {
    const question = (req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Question is required." });
    if (rejectIfRunInProgress(res)) return;
    res.json(await runCouncil(question));
  } catch (err) {
    next(err);
  }
});

app.post("/api/council/stream", (req, res) => {
  const question = (req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Question is required." });
  if (rejectIfRunInProgress(res)) return;
  // failureGate off: this backwards-compatible route's clients know nothing
  // about POST /api/session/failure-decision, so parking the run would
  // deadlock them (see runCouncilEvents).
  streamSessionRun(question, { mode: "council", failureGate: false }, res);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Activate the world's display identity before serving. Everything that
// names a character — publicConfig().identity, the council prompts, the
// session identity snapshot, archives — reads identityFor(), so this single
// injection switches the whole product's display identity. A failure leaves
// the built-in Classic names in place rather than blocking startup.
loadSceneLayout()
  .then((layout) => {
    setWorldIdentity(sceneWorldIdentityPacks(layout.world), layout.world.customNames);
    setSceneTheme(layout.world.theme);
  })
  .catch((err) => console.error("[world] could not load the Scene world — using built-in names:", err.message));

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Aether Library running at http://127.0.0.1:${config.port}`);
  console.log(`Vault path: ${config.vaultPath || "(not connected)"}`);
});
