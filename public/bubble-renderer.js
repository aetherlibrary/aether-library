// Character Bubble Renderer — the ONE runtime component every future
// dialogue system reuses (Mentor Mode, Today's Host Scholar, idle speech,
// scripted events, tutorials, interaction, NPC conversations). Foundation
// version: one bubble per character, plain text, no queue/animation/AI —
// those systems layer ON TOP of this API later, never fork it.
//
// PUBLIC API (global, same convention as the rest of this classic-script
// codebase — assets.js/app.js share one global scope, no module system):
//
//   showCharacterBubble(characterId, { type: "dialogue"|"thought", text })
//   hideCharacterBubble(characterId)
//   updateCharacterBubble(characterId)   // reposition/re-read config
//
// characterId is the SAME identifier moveCharacterToSlot already accepts:
// the def's runtime characterId ("classic_omega") or its Scene Object id
// ("classic-omega") — no character is ever hardcoded here.
//
// ARCHITECTURE:
//   - Bubbles live in a DEDICATED #bubble-layer inside .library-scene —
//     never inside a character's own DOM. Characters and bubbles stay
//     separate runtime objects; a bubble derives its position FROM the
//     character def's world/anchor data on every update, duplicating no
//     transform state of its own.
//   - Position updates ride the EXISTING styling pipeline: app.js's
//     applySceneObjectStyle (the one styling path every movement, drag,
//     nudge, undo, and editor edit already funnels through) calls
//     window.__updateCharacterBubbleFor(def) at its end. No second
//     rendering/update loop exists.
//   - The bubble texture is a 9-SLICE: CSS border-image (slice 25% + fill)
//     — corners never stretch, edges stretch along their axis, the center
//     fills, so ANY dialogue length works and the PNG itself never needs
//     manual resizing. Size is fully automatic: max-width + word-wrap,
//     height from content.
//   - Positioning is % of the scene (the same normalized 1920×1080
//     fraction space every scene object uses), so bubbles survive window
//     resizes/fullscreen exactly like sprites do. Text renders at CSS px
//     (like the rest of the app's UI text) for readability at any scene
//     scale.
//
// Per-character placement comes from the def's PERSISTED bubble config
// (def.bubble — authored in the Character Inspector, sanitized in
// src/services/sceneLayout.js): dialogueBackground/thoughtBackground pick
// the 9-slice asset, offsetX/offsetY (scene px) and anchor tune placement
// per sprite.

(() => {
  "use strict";

  const BUBBLE_SCENE_W = 1920;
  const BUBBLE_SCENE_H = 1080;

  // The one configurable layout knob this version exposes: how wide a
  // bubble may grow (CSS px) before text wraps. Height is always automatic.
  const BUBBLE_MAX_WIDTH_PX = 240;

  // Above every character/prop depth band (sceneDepthZ maxes out around
  // 500k), below the book hotspot (1000001) and the dev editor overlay
  // (2000000) — bubbles float over the world, never over the UI.
  const BUBBLE_LAYER_Z = 900000;

  // Fallback asset when a character has no authored bubble config yet —
  // the first shipped 9-slice. A missing/broken authored asset falls back
  // here too rather than showing a broken-image frame.
  const BUBBLE_DEFAULT_ASSET = "assets/ui/bubble/bubble_dialogue_01.png";

  // Active bubbles, keyed by the RESOLVED def.id (one bubble per character
  // in this version — a future queue system manages "what to show next"
  // above this API, never inside it). Value: { el, textEl, type, text }.
  const activeBubbles = new Map();

  // --------------------------------------------------------------- lookup

  // Same resolution rule as moveCharacterToSlot (app.js): runtime
  // characterId first, Scene Object id second. SCENE_OBJECTS is app.js's
  // global — resolved at call time, so script load order doesn't matter.
  function resolveCharacterDef(characterId) {
    if (typeof SCENE_OBJECTS === "undefined") return null;
    return SCENE_OBJECTS.find((d) => d.characterId === characterId || d.id === characterId) || null;
  }

  // Effective bubble config with defaults — mirrors the Character
  // Inspector's own bubbleConfig (devtools/scene-editor.js) and the
  // sanitizer defaults (sceneLayout.js); absent def.bubble is a full
  // default, never an error.
  function effectiveBubbleConfig(def) {
    const b = def.bubble || {};
    return {
      dialogueBackground: typeof b.dialogueBackground === "string" ? b.dialogueBackground : "",
      thoughtBackground: typeof b.thoughtBackground === "string" ? b.thoughtBackground : "",
      textFont: typeof b.textFont === "string" ? b.textFont : "",
      offsetX: typeof b.offsetX === "number" ? b.offsetX : 0,
      offsetY: typeof b.offsetY === "number" ? b.offsetY : 0,
      anchor: typeof b.anchor === "string" && b.anchor ? b.anchor : "sprite_top_center",
    };
  }

  function assetForType(cfg, type) {
    const chosen = type === "thought" ? cfg.thoughtBackground : cfg.dialogueBackground;
    return chosen || BUBBLE_DEFAULT_ASSET;
  }

  // ---------------------------------------------------------------- layer

  // The dedicated bubble layer — a sibling of the character sprites inside
  // .library-scene (so it pans/zooms/scales with the scene), never a child
  // of any character element. Created lazily on first use; idempotent.
  function ensureBubbleLayer() {
    let layer = document.getElementById("bubble-layer");
    if (layer) return layer;
    const scene = document.querySelector(".library-scene");
    if (!scene) return null;
    layer = document.createElement("div");
    layer.id = "bubble-layer";
    layer.style.zIndex = String(BUBBLE_LAYER_Z);
    scene.appendChild(layer);
    return layer;
  }

  // ------------------------------------------------------------- position

  // The anchor point the bubble's bottom-center attaches to, in scene
  // fractions. "sprite_top_center" (the one sanctioned value today — see
  // sceneLayout.js's sanitizeBubble) = the top-center of the sprite's
  // rendered box; unknown anchor names fall back to it rather than failing.
  // Derived from the SAME def fields applySceneObjectStyle positions the
  // sprite with (world/anchor/width/flipX + the img's natural aspect) —
  // the character's transform is read, never duplicated.
  function bubbleAnchorPoint(def, el) {
    const eAx = def.flipX ? 1 - def.anchor.x : def.anchor.x;
    const boxHFrac = def.width * (el.naturalHeight / el.naturalWidth) * (BUBBLE_SCENE_W / BUBBLE_SCENE_H);
    return {
      x: def.world.x + (0.5 - eAx) * def.width,
      y: def.world.y - def.anchor.y * boxHFrac,
    };
  }

  function positionBubble(def, entry) {
    const el = document.getElementById(`scene-${def.id}`);
    if (!el) {
      entry.el.style.display = "none";
      return;
    }
    // The sprite's natural size drives the box-height math — if the img
    // hasn't decoded yet, hide for now and re-run once it loads (one-shot;
    // the load listener self-removes).
    if (!el.naturalWidth) {
      entry.el.style.display = "none";
      el.addEventListener("load", () => updateCharacterBubble(def.characterId || def.id), { once: true });
      return;
    }
    const cfg = effectiveBubbleConfig(def);
    const p = bubbleAnchorPoint(def, el); // anchor fallback: sprite_top_center
    entry.el.style.display = "";
    entry.el.style.left = `${(p.x + cfg.offsetX / BUBBLE_SCENE_W) * 100}%`;
    entry.el.style.top = `${(p.y + cfg.offsetY / BUBBLE_SCENE_H) * 100}%`;

    const asset = assetForType(cfg, entry.type);
    if (entry.asset !== asset) {
      entry.asset = asset;
      applyBubbleAsset(entry, asset);
    }
  }

  // Applies a 9-slice texture, probing it first so a missing/broken file
  // falls back to the shipped default frame instead of rendering a
  // frameless floating text block (border-image gives no error signal of
  // its own — a plain Image() probe does). The entry.asset guard drops a
  // stale probe result if the asset changed again meanwhile.
  function applyBubbleAsset(entry, asset) {
    const probe = new Image();
    probe.onload = () => {
      if (entry.asset === asset) entry.el.style.borderImageSource = `url("/${asset}")`;
    };
    probe.onerror = () => {
      if (entry.asset !== asset) return;
      console.warn(`[bubble] bubble asset missing: ${asset} — using the default frame`);
      entry.el.style.borderImageSource = `url("/${BUBBLE_DEFAULT_ASSET}")`;
    };
    probe.src = `/${asset}`;
  }

  // ------------------------------------------------------------ public API

  function showCharacterBubble(characterId, options) {
    const def = resolveCharacterDef(characterId);
    if (!def) {
      console.warn(`[bubble] unknown character: ${characterId}`);
      return;
    }
    const layer = ensureBubbleLayer();
    if (!layer) return;

    const type = options?.type === "thought" ? "thought" : "dialogue";
    const text = typeof options?.text === "string" ? options.text : "";

    let entry = activeBubbles.get(def.id);
    if (!entry) {
      const el = document.createElement("div");
      el.className = "character-bubble";
      // Addressable from outside without exporting `activeBubbles`: callers
      // that need the element itself (the clicked-dialogue fade-out in
      // app.js) look it up by this attribute rather than reaching into this
      // module's private state or guessing at DOM order.
      el.dataset.character = def.id;
      el.style.maxWidth = `${BUBBLE_MAX_WIDTH_PX}px`;
      const textEl = document.createElement("div");
      textEl.className = "character-bubble-text";
      el.appendChild(textEl);
      layer.appendChild(el);
      entry = { el, textEl, type, text, asset: null };
      activeBubbles.set(def.id, entry);
    }
    entry.type = type;
    entry.text = text;
    entry.textEl.textContent = text; // plain text only — never HTML/markdown
    positionBubble(def, entry);
  }

  function hideCharacterBubble(characterId) {
    const def = resolveCharacterDef(characterId);
    const key = def ? def.id : characterId;
    const entry = activeBubbles.get(key);
    if (!entry) return;
    entry.el.remove();
    activeBubbles.delete(key);
  }

  function updateCharacterBubble(characterId) {
    const def = resolveCharacterDef(characterId);
    if (!def) return;
    const entry = activeBubbles.get(def.id);
    if (entry) positionBubble(def, entry);
  }

  // The runtime integration hook: applySceneObjectStyle (app.js) calls this
  // for every def it styles, so an active bubble follows its character
  // through movement/drag/undo/editor edits with zero extra update loops.
  // A def with no active bubble is a no-op.
  function updateCharacterBubbleFor(def) {
    const entry = activeBubbles.get(def.id);
    if (entry) positionBubble(def, entry);
  }

  // Globals — window.* for the cross-file hooks (same convention as
  // window.__refreshCollisionDebug / window.__positionAllowedForMovement).
  window.showCharacterBubble = showCharacterBubble;
  window.hideCharacterBubble = hideCharacterBubble;
  window.updateCharacterBubble = updateCharacterBubble;
  window.__updateCharacterBubbleFor = updateCharacterBubbleFor;
})();
