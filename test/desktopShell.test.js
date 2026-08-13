// The DESKTOP SHELL CONTRACT — Electron packaging identity, the Window Mode
// bridge, and the security posture of the renderer.
//
// These are source/config assertions on purpose. Driving a real BrowserWindow
// would mean standing up Electron inside the test runner for behaviour that is
// verified by hand on the packaged build; what is worth pinning here is the
// stuff that silently rots: the mode whitelist drifting from the <option>
// values it validates, the renderer's isolation flags being relaxed to make
// something easier, or the packaging identity changing under a future edit.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";

const read = async (rel) => (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

// "This file must not do X" has to be asserted against CODE, not prose — the
// comments here explain at length why certain APIs are avoided, and naming
// them is exactly what a naive search would trip over.
const codeOnly = (src) => src.replace(/^\s*\/\/.*$/gm, "");

const main = await read("../electron/main.js");
const preload = await read("../electron/preload.cjs");
const builder = await read("../electron-builder.yml");
const indexHtml = await read("../public/index.html");
const appJs = await read("../public/app.js");
const css = await read("../public/style.css");
const pkg = JSON.parse(await read("../package.json"));

// ------------------------------------------------------- window mode values

test("the mode whitelist, the Settings options and the locale labels all agree", async () => {
  const whitelist = main.match(/const WINDOW_MODES = \[([^\]]+)\]/)[1]
    .split(",")
    .map((s) => s.trim().replace(/"/g, ""))
    .filter(Boolean);
  assert.deepEqual(whitelist, ["windowed", "fullscreen", "borderless"]);

  // The <select> the user actually operates must offer exactly those values —
  // an option the whitelist rejects would look like a silent no-op.
  const select = indexHtml.slice(
    indexHtml.indexOf('id="display-window-mode"'),
    indexHtml.indexOf("</select>", indexHtml.indexOf('id="display-window-mode"'))
  );
  const options = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, whitelist, "Settings offers a mode the shell would reject");

  // Both locales carry a label for every mode, and for Always on Top.
  for (const locale of ["en", "zh-TW"]) {
    const strings = (await import(`../src/locales/${locale}.js`)).default.strings;
    for (const key of ["windowModeWindowed", "windowModeFullscreen", "windowModeBorderless", "alwaysOnTop"]) {
      assert.equal(typeof strings[key], "string", `${locale} is missing ${key}`);
      assert.ok(strings[key].length > 0, `${locale} ${key} is blank`);
    }
  }
});

test("browser mode exposes no desktop capability at all", () => {
  // Both controls ship disabled in the markup, so a browser user never sees an
  // enabled control that would do nothing.
  const display = indexHtml.slice(indexHtml.indexOf('id="display-section"'), indexHtml.indexOf("</fieldset>", indexHtml.indexOf('id="display-section"')));
  assert.match(display, /id="display-window-mode"[^>]*\sdisabled/);
  assert.match(display, /id="display-always-on-top"[^>]*\sdisabled/);

  // They are enabled ONLY by the presence of a shell, never by a config flag.
  assert.match(appJs, /els\.display\.windowMode\.disabled = !shell;/);
  assert.match(appJs, /els\.display\.alwaysOnTop\.disabled = !shell;/);

  // The global is defined by the preload alone — the web build never sets it.
  const appOnly = appJs.replace(/window\.__aetherDesktop \? window\.__aetherDesktop : null/, "");
  assert.doesNotMatch(appOnly, /window\.__aetherDesktop\s*=/);
});

test("first launch is windowed with Always on Top off", () => {
  assert.match(main, /const DEFAULT_WINDOW_MODE = "windowed"/);
  assert.match(main, /const DEFAULT_ALWAYS_ON_TOP = false/);
  // …and an unreadable or corrupt preferences file falls back to BOTH
  // defaults rather than to whatever was last attempted.
  assert.match(
    main,
    /catch \{[\s\S]{0,120}?return \{ windowMode: DEFAULT_WINDOW_MODE, alwaysOnTop: DEFAULT_ALWAYS_ON_TOP, borderlessBounds: null \};/
  );
});

test("an unknown mode is rejected rather than reaching the window", () => {
  // The IPC setter validates before doing anything.
  assert.match(main, /if \(typeof mode !== "string" \|\| !WINDOW_MODES\.includes\(mode\)\)/);
  // setWindowMode itself refuses too, so no internal caller can bypass it.
  assert.match(main, /function setWindowMode[\s\S]{0,200}?if \(!WINDOW_MODES\.includes\(mode\)\) return currentWindowMode;/);
});

// ------------------------------------------------------------- the bridge

test("the bridge exposes exactly the four members the frontend looks for", () => {
  // app.js detects the shell by this global and calls the getters
  // synchronously; the names are a contract, not an implementation detail.
  assert.match(appJs, /window\.__aetherDesktop \? window\.__aetherDesktop : null/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("__aetherDesktop"/);

  const exposed = preload.slice(preload.indexOf('exposeInMainWorld("__aetherDesktop"'));
  const members = [...exposed.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(members.sort(), ["getAlwaysOnTop", "getWindowMode", "setAlwaysOnTop", "setWindowMode"]);

  // ipcRenderer must never itself cross the boundary.
  assert.doesNotMatch(codeOnly(preload), /exposeInMainWorld\([^)]*ipcRenderer/);
});

// -------------------------------------------------------------- always on top

test("Always on Top accepts only a boolean, and defaults to off", () => {
  assert.match(main, /const DEFAULT_ALWAYS_ON_TOP = false/);
  // Strict boolean check — "false", 0 and 1 must not become state changes.
  assert.match(main, /function setAlwaysOnTop\(enabled\) \{[\s\S]{0,400}?if \(typeof enabled !== "boolean"\) return alwaysOnTop;/);
  // It reaches the window through the native API, never through CSS.
  assert.match(main, /win\.setAlwaysOnTop\(alwaysOnTop\)/);
});

test("a preferences file without alwaysOnTop reads as false", () => {
  // Backward compatibility with files written by the previous build, which
  // contained only { "windowMode": ... }. `=== true` is what guarantees a
  // missing key (and any non-boolean) resolves to off.
  assert.match(main, /alwaysOnTop: raw\?\.alwaysOnTop === true/);
  // Each preference is validated independently, so one bad value cannot
  // discard the other.
  assert.match(main, /windowMode: WINDOW_MODES\.includes\(raw\?\.windowMode\) \? raw\.windowMode : DEFAULT_WINDOW_MODE/);
});

test("both preferences persist together, and Always on Top survives recreation", () => {
  // One file, one write path, both values.
  assert.match(main, /const body = \{ windowMode: currentWindowMode, alwaysOnTop \};/);
  assert.match(main, /desktop-preferences\.json/);
  // Survives the Borderless swap two ways: a window is CONSTRUCTED with the
  // current value, and it is re-asserted once the window has been shown
  // (showing re-enters a window into the z-order).
  const ctor = main.slice(main.indexOf("const win = new BrowserWindow({"), main.indexOf("webPreferences:"));
  assert.match(ctor, /^\s*alwaysOnTop,$/m, "the window must be built with the current value");
  assert.match(main, /win\.show\(\);\s*(\/\/[^\n]*\n\s*)*applyAlwaysOnTop\(win\);/, "re-asserted after show");
});

test("Settings applies both preferences from the one existing Save", () => {
  const save = appJs.slice(appJs.indexOf("async function saveSettings"), appJs.indexOf("// ------------------------------------------------------------------- archives"));
  assert.match(save, /shell\.setAlwaysOnTop\(els\.display\.alwaysOnTop\.checked\)/);
  assert.match(save, /shell\.setWindowMode\(els\.display\.windowMode\.value\)/);
  // Neither may enter the backend payload.
  assert.doesNotMatch(codeOnly(save), /alwaysOnTop:|payload\.alwaysOnTop/);
});

// ---------------------------------------------------------- true borderless

test("Borderless is genuinely frameless, and only it needs a new window", () => {
  assert.match(main, /const needsFrameless = \(mode\) => mode === "borderless";/);
  // frame is a construction option, so the frame state is passed in at build.
  assert.match(main, /frame: !frameless/);
  // The swap installs the new window before destroying the old one, and the
  // quit-on-last-window handler stands down while it happens.
  assert.match(main, /if \(old && !old\.isDestroyed\(\)\) old\.destroy\(\);/);
  assert.match(main, /if \(recreating\) return;/);
});

test("Borderless is a WINDOW, not a fullscreen or work-area fill", () => {
  // The behaviour this replaced: it used to be sized to the display work area,
  // which made it a maximized panel rather than a placeable utility window.
  assert.doesNotMatch(codeOnly(main), /setBounds\(display\.workArea\)/, "must not fill the work area");
  assert.doesNotMatch(codeOnly(main), /\bmaximize\(\)/, "must not maximize itself");
  // setFullScreen is reachable ONLY from the fullscreen branch.
  const geometry = main.slice(main.indexOf("function applyWindowGeometry"), main.indexOf("function swapWindow"));
  const fsCalls = [...geometry.matchAll(/setFullScreen\(true\)/g)];
  assert.equal(fsCalls.length, 1, "exactly one setFullScreen(true), in the fullscreen branch");
  assert.match(geometry, /if \(mode === "fullscreen"\) \{\s*if \(!win\.isFullScreen\(\)\) win\.setFullScreen\(true\);/);
  // ...and it stays an ordinary desktop window in every other respect.
  assert.match(main, /resizable: true/);
  assert.match(main, /movable: true/);
  assert.match(main, /minWidth: 960/);
  assert.match(main, /minHeight: 640/);
});

test("the stored mode value is unchanged, so no preferences file needs migrating", () => {
  // The label changed; the persisted value must not. A rename here would
  // silently reset every existing user to Windowed.
  assert.match(main, /const WINDOW_MODES = \["windowed", "fullscreen", "borderless"\]/);
  assert.doesNotMatch(main, /borderless-windowed|borderless-fullscreen/);
  assert.doesNotMatch(indexHtml, /borderless-windowed|borderless-fullscreen/);
  assert.match(indexHtml, /<option value="borderless">Borderless Windowed<\/option>/);
});

test("borderless bounds are persisted, validated, and recovered when off-screen", () => {
  // Every geometry event feeds ONE debounce, so a whole drag collapses into a
  // single write no matter which of them Windows chooses to emit — `moved`
  // and `resized` were observed not firing for moves this build can produce.
  assert.match(main, /for \(const event of \["move", "moved", "resize", "resized"\]\)/);
  assert.match(main, /win\.on\(event, \(\) => scheduleBorderlessSave\(win\)\)/);
  assert.match(main, /const BORDERLESS_SAVE_DEBOUNCE_MS = \d+;/);
  // A pending debounce would never fire on the way out, so close is direct.
  assert.match(main, /win\.on\("close", \(\) => rememberBorderlessBounds\(win\)\)/);
  // An off-screen rectangle is never written — it is always an artifact.
  assert.match(main, /if \(!reachable \|\| reachable\.x !== next\.x \|\| reachable\.y !== next\.y\) return;/);
  // Toggling always-on-top must not relocate the window; a frameless one has
  // no title bar to drag back.
  assert.match(main, /const before = win\.isFullScreen\(\) \? null : validBounds\(win\.getBounds\(\)\);/);
  assert.match(main, /if \(after && \(after\.x !== before\.x \|\| after\.y !== before\.y\)\) win\.setBounds\(before\);/);
  // ...and captured before the window that knows them is destroyed.
  assert.match(main, /if \(currentFrameless && old && !old\.isDestroyed\(\)\)/);

  // Every rectangle is validated before it reaches setBounds.
  assert.match(main, /function validBounds\(b\)/);
  assert.match(main, /if \(!\[x, y, width, height\]\.every\(\(n\) => Number\.isFinite\(n\)\)\) return null;/);
  assert.match(main, /if \(width < 1 \|\| height < 1\) return null;/);
  // A monitor change must not strand a window that has no title bar to grab.
  assert.match(main, /function clampToVisibleDisplay\(b\)/);
  assert.match(main, /screen\.getAllDisplays\(\)/);

  // Absent bounds stay absent — an older file is read, not rejected.
  assert.match(main, /borderlessBounds: validBounds\(raw\?\.borderlessBounds\)/);
  assert.match(main, /if \(borderlessBounds\) body\.borderlessBounds = borderlessBounds;/);

  // Fallback order: saved placement, then the framed window's current size.
  assert.match(main, /clampToVisibleDisplay\(borderlessBounds\) \|\| validBounds\(windowedBounds\)/);
  // Returning to Windowed must not adopt the borderless rectangle.
  const geometry = main.slice(main.indexOf("function applyWindowGeometry"), main.indexOf("function swapWindow"));
  const windowedBranch = geometry.slice(geometry.indexOf("// windowed —"));
  assert.doesNotMatch(windowedBranch, /borderlessBounds/);
});

test("the drag strip exists, is desktop-only, and covers nothing interactive", () => {
  // Present in the markup at all times, inert without the body class.
  assert.match(indexHtml, /<div id="desktop-drag-strip" aria-hidden="true"><\/div>/);
  assert.match(css, /#desktop-drag-strip \{ display: none; \}/, "inert by default");

  const strip = css.slice(css.indexOf("body.desktop-borderless #desktop-drag-strip {"));
  assert.match(strip.slice(0, 400), /-webkit-app-region: drag;/);
  assert.match(strip.slice(0, 400), /height: 10px;/, "a strip, not a region");

  // Only the shell can switch it on, and only for this one mode.
  assert.match(appJs, /document\.body\.classList\.toggle\("desktop-borderless", borderless\)/);
  assert.match(appJs, /shell\.getWindowMode\(\) === "borderless"/);
  assert.match(appJs, /const shell = desktopShell\(\);[\s\S]{0,200}?Boolean\(shell\)/);
  // Controls stay clickable even if something later grows into the strip.
  assert.match(css, /-webkit-app-region: no-drag;/);
  // The whole application is never draggable.
  assert.doesNotMatch(css, /^body \{[^}]*-webkit-app-region: drag/m);
});

test("F11 always leads back to a framed, usable window", () => {
  // A frameless window has no close/minimize buttons, so Borderless must be
  // escapable from the keyboard or it can trap the user.
  const handler = main.slice(main.indexOf('input.key !== "F11"'), main.indexOf('input.key !== "F11"') + 400);
  assert.match(handler, /currentWindowMode === "borderless"/);
  assert.match(handler, /setWindowMode\(leaving \? "windowed" : "fullscreen"\)/);
});

test("Window Mode is a shell setting and never becomes a server setting", () => {
  // It must not ride along in the /api/settings payload, and the backend must
  // stay unaware of it — browser mode cannot depend on Electron-only state.
  const save = appJs.slice(appJs.indexOf("async function saveSettings"), appJs.indexOf("// ------------------------------------------------------------------- archives"));
  assert.doesNotMatch(codeOnly(save), /payload\.windowMode|windowMode:/, "windowMode must not be in the settings payload");
  assert.match(save, /shell\.setWindowMode\(els\.display\.windowMode\.value\)/);
  // Guarded on the control being enabled, which is exactly the browser case.
  assert.match(save, /!els\.display\.windowMode\.disabled/);
});

// ------------------------------------------------------------- the renderer

test("the renderer stays isolated — none of this relaxes the sandbox", () => {
  const code = codeOnly(main);
  assert.match(code, /contextIsolation: true/);
  assert.match(code, /nodeIntegration: false/);
  assert.match(code, /sandbox: true/);
  assert.doesNotMatch(code, /contextIsolation: false/);
  assert.doesNotMatch(code, /nodeIntegration: true/);
  assert.doesNotMatch(code, /sandbox: false/);
  assert.doesNotMatch(code, /webSecurity: false/);
});

test("the default application menu is removed, and Escape is left alone", () => {
  const code = codeOnly(main);
  assert.match(code, /Menu\.setApplicationMenu\(null\)/);
  // Removing the menu removes F11, so the shell rebinds it for recovery —
  // window-scoped, never a global shortcut.
  assert.match(code, /before-input-event/);
  assert.doesNotMatch(code, /globalShortcut/);
  // Escape must stay with the page: the app relies on it closing <dialog>.
  assert.doesNotMatch(code, /input\.key === "Escape"/);
});

// --------------------------------------------------------- packaging identity

test("packaging identity is stable and user data is never deleted on uninstall", () => {
  assert.match(builder, /^appId: app\.aetherlibrary\.desktop$/m);
  assert.match(builder, /^productName: Aether Library$/m);
  assert.match(builder, /^asar: false$/m);
  assert.match(builder, /^\s+icon: assets\/app-icons\/app_icon\.ico$/m);
  // The data-loss switch. Flipping this silently destroys every user's API
  // settings and their entire Archives history on uninstall or update.
  assert.match(builder, /^\s+deleteAppDataOnUninstall: false$/m);
  // The desktop entry must remain the production-forcing one.
  assert.equal(pkg.main, "electron/main.js");
});

test("the packaged file whitelist still carries every runtime root", () => {
  for (const entry of ["electron/**/*", "src/**/*", "public/**/*", "assets/**/*", "config/**/*", "data/scene-layout.json", "package.json"]) {
    assert.ok(builder.includes(`- ${entry}`), `packaging is missing ${entry}`);
  }
  // data/ is whitelisted as ONE file — the rest is machine-local user data.
  assert.doesNotMatch(builder, /- data\/\*\*/);
});

// ------------------------------------------------------------------- the icon

test("the Windows icon is a real multi-resolution ICO, not a renamed PNG", () => {
  const ico = readFileSync(new URL("../assets/app-icons/app_icon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(0), 0, "ICONDIR reserved field");
  assert.equal(ico.readUInt16LE(2), 1, "type must be 1 (icon)");

  const count = ico.readUInt16LE(4);
  assert.ok(count >= 5, `expected several sizes, found ${count}`);

  const sizes = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const declared = ico.readUInt8(e) || 256;
    const offset = ico.readUInt32LE(e + 12);
    // Each entry must be its own image, at the size the directory claims —
    // a renamed PNG would have one entry, or entries pointing at one payload.
    assert.equal(
      ico.subarray(offset, offset + 8).toString("hex"),
      "89504e470d0a1a0a",
      `entry ${i} is not a PNG payload`
    );
    assert.equal(ico.readUInt32BE(offset + 16), declared, `entry ${i} pixel width disagrees with the directory`);
    sizes.push(declared);
  }
  assert.deepEqual([...new Set(sizes)].sort((a, b) => a - b), sizes.sort((a, b) => a - b), "duplicate sizes");
  assert.ok(sizes.includes(16) && sizes.includes(256), "16 and 256 are the two Windows actually needs most");
});
