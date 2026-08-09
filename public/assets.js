// Central asset map — the ONLY place UI art paths are defined.
// Loaded before app.js; consumed there (img src + CSS custom properties).
//
// Production art lives in <project>/assets/ (served at /assets/ by the
// server) and is never edited by code: artists replace files, not code.
// Folder names are all-lowercase on disk (assets/characters/,
// assets/props/) — URLs must match them exactly so the app also works on
// case-sensitive deployments.
// NO BACKGROUND ART IS DEFINED HERE ANY MORE — both backgrounds are authored:
//
//   the LIBRARY background  -> the Scene owns it (sceneMeta.background in
//                              data/scene-layout.json, F8 Map tab)
//   the START MENU background -> the app shell owns it
//                              (config/app-shell.json, F8 Content tab)
//
// A constant here would be a second owner and would silently win over the
// author's choice. Both are applied in app.js from their own always-on route
// (/api/scene-layout and /api/app-shell).
window.ASSETS = {
  // core_book is a normal Asset Registry entry (assets/props/core_book.png,
  // asset_uid asset_core_book_c57100) and scene-config Scene Object
  // (instance_id "core_book_01" in assets/scenes/classic_library.json),
  // resolved through the SAME loadSceneProps()/createSceneObjectElement()
  // path as every other prop — no entry needed here. (A coreBook entry
  // used to live here, feeding the old hardcoded #book-hotspot ghost-book
  // CSS background — removed along with that layer; see style.css.)
  // Classic Library cast & props (scene objects — see SCENE_OBJECTS in app.js).
  // classicOmega is the default playable character (Character Asset id
  // "classic_omega" — see src/services/characterRegistry.js).
  classicOmega: "/assets/characters/classic_omega.png",
  podium: "/assets/props/podium.png",
  // Shared ground-shadow sheet, auto-attached under every character/prop
  // (see the ground-shadows section in app.js).
  shadowMedium: "/assets/shared/shadows/shadow_medium.png",
};
