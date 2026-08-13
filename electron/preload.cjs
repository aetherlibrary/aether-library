// Aether Library — Electron preload.
//
// SCOPE. The frontend talks to the backend over HTTP against its own origin
// (public/app.js uses relative fetch paths only), so nothing about the
// application's data flow passes through here. The ONLY things exposed are the
// two desktop capabilities the browser genuinely cannot provide: Window Mode
// and Always on Top, both of which public/index.html has always rendered and
// app.js has always kept disabled until a shell appeared.
//
// The shape is not invented — it is what the existing frontend already looks
// for. app.js: `window.__aetherDesktop` for capability detection, and
// `shell.getWindowMode()` called SYNCHRONOUSLY inside openSettings(). That is
// why both preferences are cached here rather than fetched per call: ONE
// synchronous read at load returns the whole snapshot, then the getters return
// in-memory values immediately.
//
// No Node and no Electron API reaches the page. contextBridge copies plain
// values across the isolation boundary; ipcRenderer itself is never exposed.
//
// WHY .cjs AND NOT .js. package.json declares "type": "module", so a .js file
// here would be loaded as ESM — and a preload running under `sandbox: true`
// must be CommonJS.

const { contextBridge, ipcRenderer } = require("electron");

const DEFAULTS = { windowMode: "windowed", alwaysOnTop: false };

let cached = { ...DEFAULTS };

function adopt(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (typeof snapshot.windowMode === "string" && snapshot.windowMode) {
    cached.windowMode = snapshot.windowMode;
  }
  if (typeof snapshot.alwaysOnTop === "boolean") {
    cached.alwaysOnTop = snapshot.alwaysOnTop;
  }
}

try {
  adopt(ipcRenderer.sendSync("aether:prefs:get"));
} catch {
  // Main not answering: keep the safe defaults rather than failing to load.
}

// Preferences can change without the renderer asking — F11, or the window
// manager leaving fullscreen. Main pushes the new snapshot so the cached copy
// cannot drift from what the window is actually doing. This also survives the
// window recreation a Borderless switch performs: the new window runs this
// preload again and re-reads the snapshot from scratch.
ipcRenderer.on("aether:prefs:changed", (_event, snapshot) => adopt(snapshot));

contextBridge.exposeInMainWorld("__aetherDesktop", {
  // Both getters are synchronous by contract — see above.
  getWindowMode: () => cached.windowMode,
  getAlwaysOnTop: () => cached.alwaysOnTop,

  // Both setters return the value actually in effect, which is NOT necessarily
  // the one requested: main rejects anything outside its whitelist (mode) or
  // anything that is not a boolean (alwaysOnTop) and returns current state.
  setWindowMode: async (mode) => {
    const applied = await ipcRenderer.invoke("aether:window-mode:set", mode);
    if (typeof applied === "string" && applied) cached.windowMode = applied;
    return cached.windowMode;
  },

  setAlwaysOnTop: async (enabled) => {
    const applied = await ipcRenderer.invoke("aether:always-on-top:set", enabled);
    if (typeof applied === "boolean") cached.alwaysOnTop = applied;
    return cached.alwaysOnTop;
  },
});
