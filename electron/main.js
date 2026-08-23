// Aether Library — Electron main process (Milestone 1: desktop runtime only).
//
// WHAT THIS IS. The thinnest possible desktop shell around the EXISTING
// Express application. The backend is imported unchanged and keeps serving the
// same HTTP API on 127.0.0.1; the BrowserWindow is just a browser pointed at
// it. Nothing here duplicates, rewrites or proxies application logic, and no
// route becomes IPC.
//
// WHY IN-PROCESS. Express runs inside THIS process rather than a spawned child.
// A child would mean a second Node runtime to ship and an orphan-process
// problem to solve on every exit path; in-process, quitting Electron ends the
// server because it ends the process that owns it.
//
// THE ORDERING CONTRACT. Everything the backend reads from the environment is
// assigned BEFORE the dynamic import of src/server.js — exactly the reason
// src/start.js exists and uses import() instead of a static import: a static
// import is hoisted and would evaluate src/config.js before any assignment
// here could run. Same principle, one level up.

import { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Fixes the application name, and with it app.getPath("userData").
//
// WHY THIS IS NOT COSMETIC. Electron only reads the name from package.json
// when it is handed an application DIRECTORY; `electron electron/main.js`
// passes a FILE, so without this the name stays the built-in default and user
// data lands in %APPDATA%\Electron — a folder shared with every other
// unpackaged Electron app on the machine. Setting it explicitly also makes the
// dev run and a future packaged build agree on ONE location, which matters
// because the API keys and Archives written there have to survive updates:
// moving this path after release would be a data migration, not a rename.
app.setName("Aether Library");

// Only http/https/mailto ever reach the OS. Anything else (file:, and the
// shell-adjacent schemes Windows registers) is dropped rather than handed to
// shell.openExternal, which would happily launch it.
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// Readiness polling bounds. Finite by construction — never an open-ended loop.
const READY_TIMEOUT_MS = 20_000;
const READY_INTERVAL_MS = 200;

// The Windows application icon. Packaged builds get the icon from the
// executable itself (electron-builder stamps it in), but an unpackaged
// `npm run electron:dev` run does not, so the window and taskbar would fall
// back to Electron's default. Setting it explicitly makes both runs identical.
const APP_ICON = path.join(here, "..", "assets", "app-icons", "app_icon.ico");

// ----------------------------------------------------------- window modes
//
// The three modes the Settings UI has always offered (public/index.html's
// Display section, localized in both packs). The list is the WHITELIST used to
// validate anything arriving over IPC — an unknown string is rejected rather
// than passed to a BrowserWindow method.
const WINDOW_MODES = ["windowed", "fullscreen", "borderless"];
const DEFAULT_WINDOW_MODE = "windowed"; // first launch: never fullscreen

// Desktop-only preferences. Deliberately NOT .env.local: that file is the
// SERVER's settings store, read by src/config.js and shipped to the browser
// through publicConfig(). Window Mode means nothing to the backend and nothing
// to browser mode, so putting it there would couple the web build to an
// Electron-only concern. A tiny JSON file owned by the shell keeps the
// coupling at zero. It sits in userData, so it survives updates and uninstall
// exactly like the rest of the user's data.
let prefsPath = null;
let currentWindowMode = DEFAULT_WINDOW_MODE;

// Always on Top. Independent of Window Mode — it composes with all three, and
// it survives the window recreation that Borderless requires.
const DEFAULT_ALWAYS_ON_TOP = false;
let alwaysOnTop = DEFAULT_ALWAYS_ON_TOP;

// The port this launch is serving on, remembered so the next launch can reuse
// it and keep the renderer's origin — and its localStorage — stable.
let currentPort = null;

// The origin the window loads. Held at module scope because recreating the
// window needs it again, long after start() has returned.
let appOrigin = null;

// True while a window is being swapped out. window-all-closed fires when the
// OLD window closes, and without this guard the application would quit
// mid-transition instead of adopting the new window.
let recreating = false;

// Whether the CURRENT window was built frameless. Borderless is the only mode
// that needs it, and `frame` is a construction-only option (see below).
let currentFrameless = false;

// Last known WINDOWED bounds, so leaving fullscreen/borderless returns the
// window to the place and size it had rather than to the default. In-memory
// only — persistent X/Y restoration is deliberately out of scope.
//
// KEPT LIVE, not captured once. It used to be written a single time, from the
// constructor's own geometry in buildWindow(), and never updated again — so it
// permanently described where the window OPENED, not where the user had since
// put it. Anything that re-applied it therefore dragged a hand-placed window
// back to its launch rectangle. See rememberWindowedBounds().
let windowedBounds = null;

// True while THIS module is deliberately moving the window. The move/resize
// events such a placement causes are the application placing the window, not
// the user placing it, and recording them as windowed bounds would be wrong in
// the one case that matters: leaving fullscreen emits resize BEFORE the
// leave-full-screen callback runs, so tracking it would overwrite the very
// rectangle that callback is about to restore.
let placingWindow = false;

// Last useful BORDERLESS WINDOWED bounds. Unlike windowedBounds this one is
// persisted: a borderless window is a placed utility window (think PureRef),
// so where the user put it and how big they made it is the whole point, and
// losing it on every restart would be the feature failing at its job.
let borderlessBounds = null;

let mainWindow = null;

// Accepts only a complete, finite, positive-sized rectangle. Anything else —
// a hand-edited file, a partially written one, a shape from a future version —
// is discarded in favour of the fallback chain rather than fed to setBounds.
function validBounds(b) {
  if (!b || typeof b !== "object") return null;
  const { x, y, width, height } = b;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width < 1 || height < 1) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// Keeps saved bounds reachable when the monitor layout has changed since they
// were written — an unplugged second screen otherwise leaves the window at
// coordinates no display covers, which for a FRAMELESS window means no title
// bar to drag it back with. Deliberately not a window manager: it finds the
// display nearest the saved rectangle and nudges the rectangle inside that
// display's work area, preserving size wherever it fits.
function clampToVisibleDisplay(b) {
  const rect = validBounds(b);
  if (!rect) return null;

  // If any display already contains the rectangle's centre, it is reachable.
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return centre.x >= a.x && centre.x < a.x + a.width && centre.y >= a.y && centre.y < a.y + a.height;
  });
  if (onScreen) return rect;

  const area = screen.getDisplayMatching(rect).workArea;
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(rect.y, area.y), area.y + area.height - height),
  };
}

// How long the window must sit still before its placement is written.
//
// WHY A DEBOUNCE RATHER THAN THE SETTLED EVENTS. Electron documents `moved`
// and `resized` as the once-per-gesture Windows events, and listening only to
// those would be the tidier design — but they were observed NOT firing for a
// move this build could actually produce, while the continuous `move`/`resize`
// pair fired reliably. Feeding every one of them into a debounce is what makes
// the save independent of which event a given Windows/Electron combination
// chooses to emit, while still collapsing a whole drag into a single write.
const BORDERLESS_SAVE_DEBOUNCE_MS = 400;
let borderlessSaveTimer = null;

function scheduleBorderlessSave(win) {
  if (currentWindowMode !== "borderless") return;
  clearTimeout(borderlessSaveTimer);
  borderlessSaveTimer = setTimeout(() => rememberBorderlessBounds(win), BORDERLESS_SAVE_DEBOUNCE_MS);
}

// Records where the borderless window currently is. Writes only when the
// rectangle actually changed, so a gesture that ends where it started costs
// nothing.
function rememberBorderlessBounds(win) {
  clearTimeout(borderlessSaveTimer);
  if (currentWindowMode !== "borderless") return;
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
  const next = validBounds(win.getBounds());
  if (!next) return;
  // Never persist a rectangle that is off every display. A borderless window
  // out there is always an artifact — a z-order jump, a display being
  // unplugged — never somewhere the user chose to put it, and saving it would
  // make a one-off glitch permanent. clampToVisibleDisplay returns the SAME
  // rectangle when it is already reachable, so a difference here means it was
  // not.
  const reachable = clampToVisibleDisplay(next);
  if (!reachable || reachable.x !== next.x || reachable.y !== next.y) return;
  const same =
    borderlessBounds &&
    borderlessBounds.x === next.x &&
    borderlessBounds.y === next.y &&
    borderlessBounds.width === next.width &&
    borderlessBounds.height === next.height;
  if (same) return; // nothing changed — no write
  borderlessBounds = next;
  writePrefs();
}

// Keeps `windowedBounds` describing where the FRAMED window actually is, for
// as long as it is the windowed one.
//
// Unlike rememberBorderlessBounds this writes nothing to disk and needs no
// debounce: it is a variable assignment, so running it on every geometry event
// costs nothing and there is no write to collapse. Windowed placement stays
// in-memory by design — only Borderless persists across launches.
function rememberWindowedBounds(win) {
  if (placingWindow) return; // an application placement, not the user's
  if (currentWindowMode !== "windowed") return;
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
  const next = validBounds(win.getBounds());
  if (next) windowedBounds = next;
}

// Reads BOTH preferences, each validated independently so one bad value never
// discards the other. A file written by an earlier build contains only
// windowMode; the missing alwaysOnTop simply defaults to false.
function readPrefs() {
  try {
    // The BOM strip is not theoretical: this file is plain JSON in a folder a
    // user can open, and Notepad writes UTF-8 WITH a BOM by default, which
    // JSON.parse rejects. Without this, hand-editing the mode silently reverts
    // it to windowed. writePrefs itself never emits one.
    const raw = JSON.parse(fs.readFileSync(prefsPath, "utf8").replace(/^﻿/, ""));
    return {
      windowMode: WINDOW_MODES.includes(raw?.windowMode) ? raw.windowMode : DEFAULT_WINDOW_MODE,
      // Strictly boolean: a truthy string like "false" must not read as on.
      alwaysOnTop: raw?.alwaysOnTop === true,
      // Absent in every file written before Borderless Windowed existed, which
      // is exactly the backward-compatible case: null simply means "no saved
      // placement yet", and the fallback chain in applyWindowGeometry takes
      // over. A malformed rectangle is treated the same way.
      borderlessBounds: validBounds(raw?.borderlessBounds),
      // The port the renderer was last served from — see resolveStablePort.
      // Absent in files written before this was remembered, which just means
      // "pick one and start remembering". Only a plausible, non-privileged
      // port is accepted; anything else is treated as absent.
      port: validPort(raw?.port),
    };
  } catch {
    // Missing or corrupt — first launch defaults.
    return { windowMode: DEFAULT_WINDOW_MODE, alwaysOnTop: DEFAULT_ALWAYS_ON_TOP, borderlessBounds: null, port: null };
  }
}

// A saved port is only usable if it is a whole number in the unprivileged
// range. Anything else (a string, a float, 0, 80) falls back to null so a
// hand-edited file cannot make startup fail.
function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : null;
}

function writePrefs() {
  try {
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
    const body = { windowMode: currentWindowMode, alwaysOnTop };
    // Only written once there is something to remember, so the file keeps its
    // previous shape for anyone who never uses Borderless.
    if (borderlessBounds) body.borderlessBounds = borderlessBounds;
    // Keeps the renderer's origin — and therefore its localStorage — stable
    // across launches. Written from the same place as everything else here so
    // there is one prefs writer, not two.
    if (currentPort) body.port = currentPort;
    fs.writeFileSync(prefsPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  } catch (err) {
    // A preference that cannot be saved must not take the application down.
    console.error("[electron] could not save desktop preferences:", err.message);
  }
}

// One payload, one shape — what the preload caches and what every push sends.
function prefsSnapshot() {
  return { windowMode: currentWindowMode, alwaysOnTop };
}

function notifyRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("aether:prefs:changed", prefsSnapshot());
  }
}

function applyAlwaysOnTop(win) {
  if (!win || win.isDestroyed()) return;

  // WHY THE BOUNDS ARE CAPTURED AND PUT BACK.
  // On a FRAMELESS window, turning always-on-top OFF was observed to move the
  // window a long way off-screen (292,200 -> -2925,229 on this machine) — a
  // Windows z-order reshuffle, not anything the user did. On a framed window
  // that is merely annoying; on a borderless one it is unrecoverable, because
  // there is no title bar left on screen to drag it back with. Re-applying the
  // rectangle the window already had turns the jump into a no-op.
  const before = win.isFullScreen() ? null : validBounds(win.getBounds());

  win.setAlwaysOnTop(alwaysOnTop);
  // Nudge the z-order. Setting the flag alone does not always re-sort an
  // already-visible window on Windows; moveTop() forces the update, and is a
  // no-op when the flag did take on its own.
  if (alwaysOnTop) win.moveTop();

  if (!before || win.isDestroyed()) return;
  const after = validBounds(win.getBounds());
  if (after && (after.x !== before.x || after.y !== before.y)) win.setBounds(before);
}

function setAlwaysOnTop(enabled) {
  // Boolean only. Anything else is rejected outright rather than coerced —
  // "false" and 0 must not become a state change.
  if (typeof enabled !== "boolean") return alwaysOnTop;
  alwaysOnTop = enabled;
  applyAlwaysOnTop(mainWindow);
  writePrefs();
  notifyRenderer();
  return alwaysOnTop;
}

// Borderless is the only mode that needs a frameless window.
const needsFrameless = (mode) => mode === "borderless";

// Released on the NEXT TICK, never synchronously: setBounds' own move/resize
// events are delivered asynchronously, so clearing the flag inline would let
// the tail of a placement through as if the user had made it.
function endPlacement() {
  setTimeout(() => {
    placingWindow = false;
  }, 0);
}

// Positions/sizes an EXISTING window for a mode. Frame state is not its
// business — that is decided at construction, see swapWindow below.
function applyWindowGeometry(win, mode) {
  if (!win || win.isDestroyed()) return;
  placingWindow = true;

  if (mode === "fullscreen") {
    if (!win.isFullScreen()) win.setFullScreen(true);
    endPlacement();
    return;
  }

  const place = () => {
    if (win.isDestroyed()) {
      endPlacement();
      return;
    }
    if (mode === "borderless") {
      // BORDERLESS WINDOWED: an ordinary, placed, resizable desktop window
      // that simply has no frame — not a work-area fill and not fullscreen.
      // Nothing here maximizes it or reaches for the display size.
      //
      // Fallback chain: where the user last put it -> the size the framed
      // window currently has (so it opens exactly where the app already was,
      // rather than jumping) -> leave the constructor's default alone.
      const target = clampToVisibleDisplay(borderlessBounds) || validBounds(windowedBounds);
      if (target) win.setBounds(target);
      endPlacement();
      return;
    }
    // windowed — restore the remembered size if we have one. Borderless bounds
    // are deliberately NOT a fallback here: they describe a different window.
    if (windowedBounds) win.setBounds(windowedBounds);
    endPlacement();
  };

  if (win.isFullScreen()) {
    // Windows restores its OWN pre-fullscreen bounds as part of leaving
    // fullscreen, and it does so after a synchronous setBounds here would have
    // run — which silently undid the restore and left the window at an
    // arbitrary size. Placing it once the transition has actually finished is
    // what makes "return to the size you had" reliable.
    win.once("leave-full-screen", place);
    win.setFullScreen(false);
    return;
  }

  place();
}

// Replaces the window with one built at the requested frame state.
//
// WHY RECREATION IS UNAVOIDABLE. `frame` is a BrowserWindow CONSTRUCTION
// option; Electron exposes no runtime setter, so a genuinely chromeless
// window cannot be reached by mutating the current one.
//
// WHY IT IS SAFE HERE — this was verified against the app, not assumed:
//   * The active Session lives in the SERVER's memory (services/
//     sessionEngine.js's `current`; see the sessionRecovery.js header). The
//     server runs in THIS process and is untouched by a window swap, so the
//     discussion itself is never at risk.
//   * app.js's boot line is
//         loadStatus().then(restoreSession).finally(restoreComposerDraft)
//     so rehydrating after a load is the application's normal, supported
//     path — not something invented for this feature. It restores the live
//     Session, the conversation, the Scholar assignment and the Vault state.
//   * Unsent composer text is written to localStorage on input
//     (scheduleDraftSave), which survives a reload and is restored by
//     restoreComposerDraft().
// The new window is created and shown BEFORE the old one closes, so there is
// no moment with zero windows — that ordering is what keeps window-all-closed
// from quitting the app mid-transition, alongside the `recreating` guard.
function swapWindow(frameless) {
  const old = mainWindow;
  // Leaving Borderless destroys the window that knows where it was, so capture
  // its placement before it goes.
  if (currentFrameless && old && !old.isDestroyed()) {
    const outgoing = validBounds(old.getBounds());
    if (outgoing) borderlessBounds = outgoing;
  }
  recreating = true;
  try {
    const next = buildWindow({ frameless });
    mainWindow = next;
    currentFrameless = frameless;
    if (old && !old.isDestroyed()) old.destroy();
    return next;
  } finally {
    recreating = false;
  }
}

// The one place the mode changes. Remembers the outgoing windowed size,
// swaps the window if the frame state has to change, applies geometry,
// persists and tells the renderer so its cached value cannot drift.
function setWindowMode(mode) {
  if (!WINDOW_MODES.includes(mode)) return currentWindowMode;

  // A REQUEST FOR THE MODE THE WINDOW IS ALREADY IN CHANGES NOTHING.
  //
  // Saving Settings always re-sends Window Mode, changed or not — see
  // saveSettings() in public/app.js, which calls shell.setWindowMode() on every
  // successful save because Window Mode is a shell setting that never travels
  // in the /api/settings payload. That made an unrelated save (a theme, an API
  // key) run the full mode change, and applyWindowGeometry()'s windowed branch
  // then put the window back at `windowedBounds`, moving a window the user had
  // deliberately dragged elsewhere. Reported on macOS; the code is shared, so
  // Windows did exactly the same thing.
  //
  // There is genuinely nothing to do here: the persisted mode already equals
  // the requested one, and the renderer's cached copy is the value it just
  // sent. Returning early leaves x/y AND width/height untouched, which is the
  // contract — geometry only ever moves when the user actually changes a
  // setting that requires it.
  if (mode === currentWindowMode && needsFrameless(mode) === currentFrameless) return currentWindowMode;

  const win = mainWindow;
  // Capture the windowed size BEFORE anything changes, so returning to
  // Windowed later lands on the size the user actually had.
  if (currentWindowMode === "windowed" && mode !== "windowed" && win && !win.isDestroyed() && !win.isFullScreen()) {
    windowedBounds = win.getBounds();
  }

  currentWindowMode = mode;

  const frameless = needsFrameless(mode);
  const swapped = frameless !== currentFrameless;
  const target = swapped ? swapWindow(frameless) : win;

  // A swapped-in window is built for this mode and finishes the job itself in
  // ready-to-show (geometry, always-on-top, then show). Applying either here
  // as well would race its first paint, which is what left a new window
  // sized-but-not-fullscreen.
  if (!swapped) {
    applyWindowGeometry(target, mode);
    applyAlwaysOnTop(target);
  }
  writePrefs();
  notifyRenderer();
  return currentWindowMode;
}

// ---------------------------------------------------------------- port pick
//
// The backend's own default is the fixed 8477, which is fine for `npm start`
// but wrong for a desktop app: a second copy of anything already on that port
// makes startup fail. config.js resolves `Number(env("PORT")) || 8477`, so
// PORT=0 would fall back to 8477 rather than meaning "any free port" — the
// concrete number therefore has to be chosen out here and passed in.
//
// Probe-then-close leaves a theoretical window where another process could
// take the port first. That is the standard trade-off for this technique; the
// window is microseconds, the single-instance lock removes the realistic
// cause, and the readiness check below turns any loss into a clean error
// rather than a hang.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

// Can we still have the port we used last time? Resolves false rather than
// throwing, because "someone else has it" is an ordinary outcome here.
function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close((err) => resolve(!err)));
  });
}

// THE PORT IS PART OF THE RENDERER'S IDENTITY, not just a connection detail.
//
// The window loads http://127.0.0.1:<port>, and the browser partitions
// localStorage by ORIGIN — scheme, host AND port. A fresh random port on every
// launch therefore handed the renderer a brand-new, empty localStorage each
// time, which silently reset every piece of state the UI keeps there:
// aether.tutorialSeen (so the guided tutorial replayed on every launch), the
// two setup-hint flags, the session-recovery pointer, the model-failure
// memory, the composer drafts and the Quick Actions toggle.
//
// So the port is remembered like any other desktop preference. Reusing it
// keeps the origin stable, which is what makes all of that state persist —
// no second storage system, and nothing for the renderer to know about.
//
// If the remembered port is taken (another program claimed it while we were
// closed), a new one is chosen and saved. That single launch starts from a
// fresh origin; every launch after it is stable again. Falling back is
// strictly better than failing to start.
async function resolveStablePort(savedPort) {
  if (savedPort && (await portIsFree(savedPort))) return savedPort;
  return findFreePort();
}

// ------------------------------------------------------------- readiness
//
// Importing src/server.js returns as soon as the module finishes evaluating,
// which is BEFORE app.listen() has bound the socket. Loading the window at
// that moment races the server and shows an error page. Poll /api/health —
// the one always-on route outside the dev-tools gate — until it answers.
function waitForServer(port) {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/health", timeout: 1_000 },
        (res) => {
          res.resume(); // drain, so the socket can be reused/closed
          if (res.statusCode === 200) resolve();
          else retry();
        }
      );
      req.on("timeout", () => req.destroy()); // surfaces as an "error" -> retry
      req.on("error", retry);
    };

    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Express did not become ready on 127.0.0.1:${port} within ${READY_TIMEOUT_MS} ms`));
        return;
      }
      setTimeout(attempt, READY_INTERVAL_MS);
    };

    attempt();
  });
}

// -------------------------------------------------------------- externals
function openExternal(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return; // unparseable — ignore rather than guess
  }
  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return;
  shell.openExternal(url);
}

// ----------------------------------------------------------------- window
// Builds a window at a given frame state and wires every handler to it.
// Called for the first window and again for each Borderless transition, so
// nothing may assume it runs only once.
function buildWindow({ frameless }) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    icon: APP_ICON,
    // The whole point of Borderless Windowed: no title bar, no native border,
    // while everything else about it stays an ordinary desktop window.
    frame: !frameless,
    // Stated rather than left to the defaults, because they are the feature:
    // a frameless window on Windows keeps its resize borders and remains
    // movable, which is what makes Borderless a placeable utility window
    // instead of a fixed panel. Windows Snap keeps working for the same
    // reason — it is driven by these, not by the title bar.
    resizable: true,
    movable: true,
    // Fullscreen is requested at CONSTRUCTION rather than by calling
    // setFullScreen on a window that has not been shown yet — that call is
    // unreliable before first paint and would silently leave a swapped-in
    // window merely windowed.
    fullscreen: currentWindowMode === "fullscreen",
    // Same reasoning for Always on Top: requesting it at construction means a
    // window swapped in for Borderless is created already on top, rather than
    // appearing behind whatever it was above and being raised a moment later.
    alwaysOnTop,
    // Avoid the white flash: the Start Menu paints before the window appears.
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Windowed bounds are only meaningful for a framed window. Seed them from
  // the constructor's geometry so there is something to return to before the
  // user has touched anything...
  if (!frameless && !windowedBounds) windowedBounds = win.getBounds();
  // ...and then keep them CURRENT. Without this the seed above was the only
  // value ever recorded, so `windowedBounds` described the launch rectangle
  // forever and re-applying it moved a hand-placed window back to it.
  if (!frameless) {
    for (const event of ["move", "moved", "resize", "resized"]) {
      win.on(event, () => rememberWindowedBounds(win));
    }
  }

  // Borderless placement is remembered from the window's own geometry events.
  // All four feed one debounce (see BORDERLESS_SAVE_DEBOUNCE_MS): `moved` and
  // `resized` are the once-per-gesture pair when Windows emits them, and
  // `move`/`resize` are the continuous stream that always does. A whole drag
  // therefore collapses into a single write.
  if (frameless) {
    for (const event of ["move", "moved", "resize", "resized"]) {
      win.on(event, () => scheduleBorderlessSave(win));
    }
    // Closing is the other way a placement is lost: a pending debounce would
    // never fire, so capture synchronously on the way out.
    win.on("close", () => rememberBorderlessBounds(win));
  }

  win.once("ready-to-show", () => {
    // Geometry before the first paint, so a user who quit in fullscreen does
    // not see a windowed frame flash first.
    applyWindowGeometry(win, currentWindowMode);
    win.show();
    // Re-asserted AFTER show: showing a window re-enters it into the z-order,
    // so requesting always-on-top beforehand can be undone by the show itself.
    applyAlwaysOnTop(win);
  });

  // Leaving fullscreen by any route other than Settings (F11 below, or the
  // window manager) must not leave the saved mode claiming "fullscreen" —
  // otherwise Settings would show a mode the window is not in, and the next
  // launch would restore the wrong one.
  win.on("leave-full-screen", () => {
    if (currentWindowMode === "fullscreen") setWindowMode("windowed");
  });

  wireWindow(win);
  win.loadURL(appOrigin);
  return win;
}

function wireWindow(win) {
  // F11 recovery, and the ONLY way out of Borderless from the keyboard: a
  // frameless window has no close/minimize/restore buttons, so this is what
  // guarantees the mode can never trap the user. Removing the application
  // menu also removed Electron's default View -> Toggle Full Screen
  // accelerator, so without this the key Windows users reach for would
  // silently do nothing.
  //
  // From Borderless it returns to Windowed (a framed window with its title
  // bar back) rather than to Fullscreen, because recovery is the point.
  //
  // Window-scoped via before-input-event — NOT globalShortcut, which would
  // capture the key system-wide. Escape is deliberately NOT bound: the
  // application relies on Escape being the browser closing its <dialog>
  // elements (see closeSettingsDialogs in app.js).
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "F11") return;
    event.preventDefault();
    const leaving = win.isFullScreen() || currentWindowMode === "borderless";
    setWindowMode(leaving ? "windowed" : "fullscreen");
  });

  // Only clear the shared reference if THIS window is still the current one:
  // a Borderless transition destroys the outgoing window after the incoming
  // one is already installed, and that must not null it out.
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  // public/app.js opens product links with window.open(url, "_blank", …).
  // Without this, Electron answers that by creating a second BrowserWindow —
  // a chromeless in-app browser. Hand every allowed scheme to the system
  // browser instead and always deny the popup. Kept here rather than in
  // app.js so the web build keeps its normal behaviour untouched.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  // Top-level navigation away from the app's own origin — including the
  // `window.location.href = url` path app.js uses for mailto: — leaves the
  // application unreachable inside its own window. Send it outward instead.
  win.webContents.on("will-navigate", (event, url) => {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === appOrigin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin) return;
    event.preventDefault();
    openExternal(url);
  });
}

// --------------------------------------------------------- application menu
//
// WINDOWS: no menu at all, exactly as before. Aether Library has no use for
// File/Edit/View/Window there, and its accelerators (Ctrl+R reload, the
// devtools toggle) are not behaviour a shipped desktop app should expose. The
// native title bar is untouched — minimize, maximize/restore and close remain.
//
// macOS: a menu is NOT optional. The standard edit roles are what BIND the
// system shortcuts, so with a null menu Cmd+C/V/X/A/Z do nothing at all — and
// the very first thing a new user must do is paste an API key into AI Config.
// Cmd+Q and Cmd+W would be dead too, leaving no keyboard way to quit.
//
// Built from ROLES rather than hand-written click handlers so the items get
// their native labels, ordering, and localisation for free. Deliberately only
// three menus: appMenu, editMenu and windowMenu. There is NO View menu, which
// is what keeps Reload and Toggle Developer Tools off the shipped build —
// matching what Windows already hides.
function installApplicationMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      // Cmd+Q, Hide, Services, About — all standard, all free with the role.
      { role: "appMenu" },
      // Cmd+C / V / X / A / Z / Shift+Z. The reason this function exists.
      { role: "editMenu" },
      // Cmd+W (close), Cmd+M (minimize), Zoom.
      { role: "windowMenu" },
    ])
  );
}

// ------------------------------------------------------------------ start
async function start() {
  const userData = app.getPath("userData");

  installApplicationMenu();

  // Desktop preferences live beside the rest of the user's data. Read BEFORE
  // the port is chosen: the remembered port is one of them, and reusing it is
  // what keeps the renderer's origin stable across launches.
  prefsPath = path.join(userData, "desktop-preferences.json");
  const saved = readPrefs();
  currentWindowMode = saved.windowMode;
  alwaysOnTop = saved.alwaysOnTop;
  const port = await resolveStablePort(saved.port);
  currentPort = port;
  // Persist immediately on first launch, or when the remembered port had to
  // change — so the very next launch is already stable.
  if (saved.port !== port) writePrefs();
  borderlessBounds = saved.borderlessBounds;

  // Narrow IPC surface: one readable snapshot and two writable values. No
  // BrowserWindow method is reachable from the renderer, and both setters
  // validate before anything touches the window.
  //
  // The getter is SYNCHRONOUS because the frontend contract is synchronous —
  // openSettings() calls `shell.getWindowMode() || "windowed"` inline. It is
  // read once when the preload initializes, not on a hot path. Returning both
  // preferences together keeps that to a single blocking call.
  ipcMain.on("aether:prefs:get", (event) => {
    event.returnValue = prefsSnapshot();
  });

  ipcMain.handle("aether:window-mode:set", (_event, mode) => {
    if (typeof mode !== "string" || !WINDOW_MODES.includes(mode)) {
      return currentWindowMode; // unknown mode: rejected, state unchanged
    }
    return setWindowMode(mode);
  });

  ipcMain.handle("aether:always-on-top:set", (_event, enabled) => {
    // Boolean only — setAlwaysOnTop rejects anything else rather than
    // coercing it, so "false" or 0 can never read as a state change.
    return setAlwaysOnTop(enabled);
  });

  // ---- everything below MUST precede the server import (see header) ----

  // Unconditionally production, matching src/start.js's contract: the F8
  // Scene Editor, the /dev static mount and every /api/dev/* route stay
  // unreachable regardless of any stray NODE_ENV in the user's environment.
  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);

  // Redirect the two paths the SHIPPED app writes to. Both already support an
  // environment override in the backend, so this needs no code change there:
  //   settings.js  -> envFilePath   (ENV_FILE_PATH)  — API keys, all settings
  //   archives.js  -> ARCHIVE_DIR                    — saved discussions
  // Their defaults sit inside the project directory, which for an installed
  // application is read-only and is replaced wholesale on update. The Vault
  // is deliberately NOT redirected: it is a user-chosen folder that already
  // lives outside the application.
  process.env.ENV_FILE_PATH = path.join(userData, ".env.local");
  process.env.ARCHIVE_DIR = path.join(userData, "archives");

  // The existing Express application, imported and otherwise untouched.
  await import("../src/server.js");

  await waitForServer(port);

  appOrigin = `http://127.0.0.1:${port}`;
  // The saved mode decides the frame state of the FIRST window, so restoring
  // Borderless on launch costs no swap at all.
  currentFrameless = needsFrameless(currentWindowMode);
  mainWindow = buildWindow({ frameless: currentFrameless });
}

// ---------------------------------------------------------------- lifecycle
//
// One instance, therefore one Express server, therefore one port. Without the
// lock a second launch reaches app.listen() on an already-bound port and dies
// with an unhandled EADDRINUSE, because server.js attaches no "error" handler.
if (!app.requestSingleInstanceLock()) {
  // Losing the lock means a copy is already running: quit before any
  // environment variable is set and before the server is imported.
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Windows: closing the window ends the application. Express goes with it,
  // since it lives in this process — no child to reap, no port left held.
  // …except while a Borderless transition is swapping one window for another,
  // when "no windows" is a momentary state rather than the user leaving.
  app.on("window-all-closed", () => {
    if (recreating) return;
    // macOS: closing the last window is NOT quitting. Cmd+W leaves the app
    // running in the Dock and Cmd+Q is what ends it, so quitting here would be
    // the app disobeying the platform. Express keeps running in this process,
    // which is what makes the Dock reopen below instant rather than a restart.
    if (process.platform === "darwin") return;
    app.quit();
  });

  // macOS: clicking the Dock icon with no windows open reopens one. Only
  // meaningful once start() has resolved — appOrigin is what a window loads,
  // and before that there is nothing to show.
  app.on("activate", () => {
    if (process.platform !== "darwin") return;
    if (!appOrigin || recreating) return;
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = buildWindow({ frameless: currentFrameless });
  });

  app.whenReady().then(start).catch((err) => {
    // A desktop user gets no console, so say something visible before exiting.
    console.error("[electron] Aether Library failed to start:", err);
    dialog.showErrorBox("Aether Library could not start", String(err?.message || err));
    app.quit();
  });
}
