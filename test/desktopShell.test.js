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
  // …and an unreadable or corrupt preferences file falls back to EVERY
  // default rather than to whatever was last attempted. `port: null` means
  // "no remembered origin yet", which resolveStablePort reads as first launch.
  assert.match(
    main,
    /catch \{[\s\S]{0,160}?return \{ windowMode: DEFAULT_WINDOW_MODE, alwaysOnTop: DEFAULT_ALWAYS_ON_TOP, borderlessBounds: null, port: null \};/
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

// ============================================================ macOS arm64
//
// Apple Silicon is a supported public target as of v1.2. These pin the parts
// that are easy to break from Windows without noticing: the architecture list,
// the shared identity, and the two platform behaviours macOS requires but
// Windows does not.

test("macOS targets Apple Silicon only — no x64, no universal", () => {
  const mac = builder.slice(builder.indexOf("\nmac:"), builder.indexOf("\ndmg:"));
  assert.ok(mac.length > 0, "a mac section exists");
  assert.match(mac, /- target: dmg/);
  assert.match(mac, /- arm64/);
  // The whole point of the target choice: one architecture, one download.
  assert.doesNotMatch(mac, /- x64/, "Intel macOS is not a supported target");
  assert.doesNotMatch(mac, /universal/, "no universal binary");
});

test("Windows packaging is untouched by the macOS addition", () => {
  const win = builder.slice(builder.indexOf("\nwin:"), builder.indexOf("\n# ---"));
  assert.match(win, /- target: nsis/);
  assert.match(win, /- x64/);
  assert.match(win, /icon: assets\/app-icons\/app_icon\.ico/);
  // Windows and macOS builds are separate commands; neither emits the other's
  // artifacts as a side effect.
  assert.equal(pkg.scripts["electron:pack"], "electron-builder --win --x64 --dir");
  assert.equal(pkg.scripts["electron:build"], "electron-builder --win --x64");
  assert.match(pkg.scripts["electron:build:mac"], /--mac/);
  assert.match(pkg.scripts["electron:build:mac"], /--arm64/);
  assert.doesNotMatch(pkg.scripts["electron:build:mac"], /--win|--x64|universal/);
});

test("one application identity across platforms, and the DMG is named for it", () => {
  // appId doubles as the macOS bundle identifier — a second identity would
  // break signing continuity and read as a different app to the OS.
  assert.match(builder, /^appId: app\.aetherlibrary\.desktop$/m);
  const macCount = (builder.match(/^appId:/gm) || []).length;
  assert.equal(macCount, 1, "exactly one appId, shared by both platforms");
  assert.match(builder, /artifactName: Aether-Library-\$\{version\}-\$\{arch\}\.dmg/);
});

test("the macOS icon comes from the existing master art, not a new asset", () => {
  const mac = builder.slice(builder.indexOf("\nmac:"), builder.indexOf("\ndmg:"));
  assert.match(mac, /icon: assets\/app-icons\/app_icon_master\.png/);
});

test("Hardened Runtime is configured with the minimum entitlements and no credentials", async () => {
  const mac = builder.slice(builder.indexOf("\nmac:"), builder.indexOf("\ndmg:"));
  assert.match(mac, /hardenedRuntime: true/);
  assert.match(mac, /entitlements: build\/entitlements\.mac\.plist/);

  const plist = await read("../build/entitlements.mac.plist");
  assert.match(plist, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(plist, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
  // Nothing broader than Electron actually needs to run. Asserted against the
  // DECLARATIONS only: the file's comment explains at length which entitlements
  // are deliberately absent, and naming them is what a naive search trips over.
  const declared = plist.replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(declared, /app-sandbox/);
  assert.doesNotMatch(declared, /disable-library-validation/);
  assert.doesNotMatch(declared, /security\.network/);
  // Exactly two entitlements, so a broad one cannot be slipped in later.
  assert.equal((declared.match(/<key>/g) || []).length, 2);

  // No signing credentials may ever live in the repo.
  for (const secret of [/CSC_LINK/, /CSC_KEY_PASSWORD/, /APPLE_ID/, /APPLE_APP_SPECIFIC_PASSWORD/, /appleIdPassword/, /-----BEGIN/]) {
    assert.doesNotMatch(builder, secret, "signing credentials must not be committed");
    assert.doesNotMatch(plist, secret);
  }
});

test("macOS gets the menu roles its keyboard shortcuts depend on; Windows still gets none", () => {
  const code = codeOnly(main);
  // Windows behaviour is unchanged: no menu at all.
  assert.match(code, /if \(process\.platform !== "darwin"\) \{\s*Menu\.setApplicationMenu\(null\);/);
  // macOS binds Cmd+C/V/X/A/Z and Cmd+Q through these roles. Without them a
  // null menu leaves every one of those keys dead — including paste, which is
  // how an API key gets into AI Config.
  assert.match(code, /role: "appMenu"/);
  assert.match(code, /role: "editMenu"/);
  // Cmd+W is NOT among them, and this assertion used to claim it was: it
  // required `role: "windowMenu"`, which on macOS omits Close entirely. That
  // made the test enforce the very bug it looked like it was guarding. The
  // Window menu is now spelled out — see the macOS Cmd+W section below.
  assert.match(code, /label: "Window"/);
  assert.match(code, /role: "close"/);
  // Still no View menu, so Reload and Toggle Developer Tools stay off the
  // shipped build exactly as they are on Windows.
  assert.doesNotMatch(code, /role: "viewMenu"/);
  assert.doesNotMatch(code, /toggleDevTools|forceReload/);
});

test("macOS window lifecycle: last window closed keeps running, Dock reopens", () => {
  const code = codeOnly(main);
  // Closing the last window must not quit on macOS...
  assert.match(code, /if \(process\.platform === "darwin"\) return;\s*app\.quit\(\);/);
  // ...and the Dock icon brings a window back.
  assert.match(code, /app\.on\("activate"/);
  assert.match(code, /BrowserWindow\.getAllWindows\(\)\.length > 0\) return;/);
  // Windows still quits when the last window closes.
  assert.match(code, /app\.on\("window-all-closed"/);
});

test("the local backend stays localhost-only and in-process on every platform", async () => {
  const server = await read("../src/server.js");
  assert.match(server, /app\.listen\(config\.port, "127\.0\.0\.1"/);
  assert.doesNotMatch(server, /0\.0\.0\.0/);
  // Still imported into this process — no child, no second Node runtime.
  assert.match(main, /await import\("\.\.\/src\/server\.js"\)/);
  assert.doesNotMatch(codeOnly(main), /child_process|spawn\(|execFile\(/);
  // userData is resolved and exported BEFORE the server is imported, so the
  // backend never falls back to a path inside the app bundle.
  const startFn = main.slice(main.indexOf("async function start()"), main.indexOf('await import("../src/server.js")'));
  assert.match(startFn, /app\.getPath\("userData"\)/);
  assert.match(startFn, /process\.env\.ENV_FILE_PATH = path\.join\(userData/);
  assert.match(startFn, /process\.env\.ARCHIVE_DIR = path\.join\(userData/);
});

test("no Windows-only shell assumption is baked into the desktop shell", () => {
  const code = codeOnly(main);
  for (const windowsism of [/powershell/i, /cmd\.exe/i, /explorer\.exe/i, /\.exe\b/, /[A-Z]:\\\\/, /\\\\\\\\/]) {
    assert.doesNotMatch(code, windowsism, `desktop shell must not assume Windows: ${windowsism}`);
  }
  // External links go through Electron's own opener, never a shell command.
  assert.match(code, /shell\.openExternal\(url\)/);
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

// ============================================ origin stability / first launch
//
// THE REGRESSION THIS PINS. The window loads http://127.0.0.1:<port>, and the
// browser partitions localStorage by ORIGIN — scheme, host AND port. The shell
// originally chose a fresh random port on every launch, so every launch handed
// the renderer an empty localStorage and silently reset everything the UI keeps
// there. The visible symptom was the guided tutorial auto-starting on every
// launch of the installed EXE, but aether.tutorialSeen was only one of eight
// keys being wiped.
//
// The fix is to remember the port like any other desktop preference, so the
// origin is stable. That is why these live in the desktop suite: the bug was
// never in the tutorial code, which is identical in browser mode and correct.

test("the port is remembered, so the renderer's origin is stable across launches", () => {
  // Read as a preference alongside the others, and validated.
  assert.match(main, /port: validPort\(raw\?\.port\)/);
  assert.match(main, /function validPort\(value\) \{[\s\S]{0,200}?Number\.isInteger\(value\) && value >= 1024 && value <= 65535/);
  // Written by the SAME writer as every other preference — one prefs file,
  // one writer, no second storage system.
  assert.match(main, /if \(currentPort\) body\.port = currentPort;/);
  assert.equal((main.match(/function writePrefs\(/g) || []).length, 1, "still exactly one prefs writer");
});

test("a remembered port is reused when it is still free, and replaced when it is not", () => {
  const fn = main.slice(main.indexOf("async function resolveStablePort("), main.indexOf("// ------------------------------------------------------------- readiness"));
  assert.ok(fn.length > 0, "resolveStablePort exists");
  // Reuse first…
  assert.match(fn, /if \(savedPort && \(await portIsFree\(savedPort\)\)\) return savedPort;/);
  // …and never fail to start if it has been taken.
  assert.match(fn, /return findFreePort\(\);/);
  // The probe treats "taken" as an ordinary answer, not an exception.
  const probe = main.slice(main.indexOf("function portIsFree("), main.indexOf("// THE PORT IS PART OF THE RENDERER'S IDENTITY"));
  assert.match(probe, /probe\.on\("error", \(\) => resolve\(false\)\);/);
});

test("preferences are read BEFORE the port is chosen, and a new port is saved at once", () => {
  const fn = main.slice(main.indexOf("async function start()"), main.indexOf("await import(\"../src/server.js\")"));
  const prefsAt = fn.indexOf("const saved = readPrefs();");
  const portAt = fn.indexOf("await resolveStablePort(saved.port)");
  assert.ok(prefsAt > 0 && portAt > prefsAt, "the remembered port must be read before it can be reused");
  // First launch (or a port that had to change) persists immediately, so the
  // very next launch is already stable rather than stable-from-the-third.
  assert.match(fn, /if \(saved\.port !== port\) writePrefs\(\);/);
  // findFreePort is no longer called unconditionally at startup.
  assert.doesNotMatch(fn, /const port = await findFreePort\(\);/);
});

test("the tutorial's own first-launch rule is untouched by the fix", async () => {
  // The bug was the origin, not the gate. This stays exactly as it is in
  // browser mode: one localStorage flag, checked once on entry.
  assert.match(appJs, /const TUTORIAL_SEEN_KEY = "aether\.tutorialSeen";/);
  assert.match(appJs, /function maybeAutoStartTutorial\(\) \{\s*if \(hasSeenTutorial\(\)\) return;/);
  // Completing AND skipping both record it — neither path leaves it unset.
  const endFn = appJs.slice(appJs.indexOf("function endTutorial()"), appJs.indexOf("function tutorialNext()"));
  assert.match(endFn, /markTutorialSeen\(\);/);
  // Manual replay must NOT clear the flag — it replays from step 0 regardless.
  assert.doesNotMatch(appJs, /removeItem\(TUTORIAL_SEEN_KEY\)/, "replay must never reset first-launch state");
  // Nothing in the shell reaches into renderer storage to clear it either.
  assert.doesNotMatch(codeOnly(main), /clearStorageData|localStorage/);
});

// ------------------------------------------- saving Settings and the window
//
// THE BUG THESE PIN. Saving ANY setting moved the window back to where it had
// opened. Reported on a real M2 Mac, but nothing about it is macOS-specific:
// the whole path is shared, so Windows did the same thing.
//
// Two independent faults, both fixed, each pinned separately below:
//   1. saveSettings() re-sends the CURRENT Window Mode on every save (it is a
//      shell setting and never travels in the /api/settings payload), and
//      setWindowMode() ran the full mode change for it — including geometry.
//   2. `windowedBounds` was captured ONCE, from the constructor, and never
//      updated, so it permanently described the LAUNCH rectangle rather than
//      wherever the user had since dragged the window.
//
// These execute the real source rather than matching on it: the whole point is
// that setBounds must not be CALLED, which a regex cannot show.

// Runs the actual applyWindowGeometry + setWindowMode source against stubs, so
// the assertions are about behaviour. Everything the two functions reach that
// is not under test (the swap, prefs I/O, the renderer push, always-on-top) is
// replaced by a recorder.
// `isFullScreen` is the WINDOW's real state, deliberately separate from
// `currentWindowMode` (which is only what was last requested). The two
// disagreeing is the whole subject of the macOS fullscreen tests below.
function runWindowModeHarness({ mode, currentWindowMode, currentFrameless, windowedBounds, bounds, isFullScreen = false }) {
  const slice = (from, to) => main.slice(main.indexOf(from), main.indexOf(to));
  const source = slice("function applyWindowGeometry(win, mode)", "// Replaces the window with one built at the requested frame state.") +
    slice("function windowIsInMode(win, mode)", "// ---------------------------------------------------------------- port pick");

  const calls = { setBounds: [], setFullScreen: [], writePrefs: 0, notifyRenderer: 0, swapWindow: 0 };
  const win = {
    isDestroyed: () => false,
    isFullScreen: () => isFullScreen,
    isMinimized: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (b) => calls.setBounds.push(b),
    setFullScreen: (v) => calls.setFullScreen.push(v),
    once: () => {},
  };

  const state = { currentWindowMode, currentFrameless, windowedBounds, borderlessBounds: null, placingWindow: false };
  const factory = new Function(
    "state", "win", "calls", "WINDOW_MODES", "needsFrameless", "validBounds", "clampToVisibleDisplay",
    "endPlacement", "applyAlwaysOnTop", "writePrefs", "notifyRenderer", "swapWindow", "mainWindow",
    `
    let { currentWindowMode, currentFrameless, windowedBounds, borderlessBounds, placingWindow } = state;
    ${source}
    return (mode) => {
      const result = setWindowMode(mode);
      Object.assign(state, { currentWindowMode, currentFrameless, windowedBounds });
      return result;
    };
    `
  );

  const run = factory(
    state, win, calls,
    ["windowed", "fullscreen", "borderless"],
    (m) => m === "borderless",
    (b) => (b ? { ...b } : null),
    (b) => (b ? { ...b } : null),
    () => {},
    () => {},
    () => calls.writePrefs++,
    () => calls.notifyRenderer++,
    () => {
      calls.swapWindow++;
      return win;
    },
    win
  );

  return { result: run(mode), calls, state };
}

test("saving Settings with the mode unchanged never touches the window", () => {
  // The exact reproduction: a windowed app, saving an unrelated setting, which
  // re-sends "windowed". Nothing may be positioned or resized.
  const { result, calls } = runWindowModeHarness({
    mode: "windowed",
    currentWindowMode: "windowed",
    currentFrameless: false,
    // Deliberately NOT where the window is: this is the stale launch rectangle
    // the old code would have snapped back to.
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 2200, y: 640, width: 1180, height: 780 },
  });

  assert.equal(result, "windowed", "the mode in effect is still reported");
  assert.deepEqual(calls.setBounds, [], "x/y and width/height must both be left alone");
  assert.deepEqual(calls.setFullScreen, [], "no fullscreen transition either");
  assert.equal(calls.swapWindow, 0, "and no window recreation");
});

test("the same guard holds for Fullscreen and Borderless saves", () => {
  // Saving while in fullscreen must not re-enter fullscreen, and saving while
  // borderless must not re-place the borderless window.
  // The window must genuinely BE fullscreen for the skip to apply — see the
  // macOS tests below for why the recorded mode alone is not enough.
  const fs = runWindowModeHarness({
    mode: "fullscreen", currentWindowMode: "fullscreen", currentFrameless: false, isFullScreen: true,
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  });
  assert.equal(fs.result, "fullscreen");
  assert.deepEqual(fs.calls.setFullScreen, [], "already fullscreen — nothing to request");
  assert.deepEqual(fs.calls.setBounds, [], "and saving a setting must not drop out of fullscreen");

  const bl = runWindowModeHarness({
    mode: "borderless", currentWindowMode: "borderless", currentFrameless: true,
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 900, y: 300, width: 700, height: 500 },
  });
  assert.equal(bl.result, "borderless");
  assert.deepEqual(bl.calls.setBounds, [], "a placed borderless window stays where the user put it");
  assert.equal(bl.calls.swapWindow, 0, "the frame state already matches — no recreation");
});

test("a REAL mode change still applies geometry — the guard is not a blanket off-switch", () => {
  // Windowed -> Fullscreen: the user asked for this, so it must happen.
  const toFull = runWindowModeHarness({
    mode: "fullscreen", currentWindowMode: "windowed", currentFrameless: false,
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 300, y: 200, width: 1200, height: 800 },
  });
  assert.equal(toFull.result, "fullscreen");
  assert.deepEqual(toFull.calls.setFullScreen, [true], "Fullscreen still works");

  // Fullscreen -> Windowed restores the remembered placement.
  const toWindowed = runWindowModeHarness({
    mode: "windowed", currentWindowMode: "fullscreen", currentFrameless: false,
    windowedBounds: { x: 2200, y: 640, width: 1180, height: 780 },
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  });
  assert.deepEqual(toWindowed.calls.setBounds, [{ x: 2200, y: 640, width: 1180, height: 780 }]);

  // Windowed -> Borderless changes the frame state, so it recreates.
  const toBorderless = runWindowModeHarness({
    mode: "borderless", currentWindowMode: "windowed", currentFrameless: false,
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 300, y: 200, width: 1200, height: 800 },
  });
  assert.equal(toBorderless.calls.swapWindow, 1, "Borderless still recreates the window");
});

test("windowed bounds follow the user's own moves, not just the launch rectangle", () => {
  // Fault 2. The seed stays (there must be something to restore before the
  // user has touched anything), but it is no longer the only value recorded.
  assert.match(main, /if \(!frameless && !windowedBounds\) windowedBounds = win\.getBounds\(\);/);
  assert.match(main, /function rememberWindowedBounds\(win\)/);
  const build = main.slice(main.indexOf("function buildWindow("), main.indexOf("function wireWindow("));
  assert.match(
    build,
    /if \(!frameless\) \{\s*for \(const event of \["move", "moved", "resize", "resized"\]\) \{\s*win\.on\(event, \(\) => rememberWindowedBounds\(win\)\);/,
    "a framed window must report its own geometry changes"
  );

  // A deliberate placement by this module is not a user move. Leaving
  // fullscreen emits resize BEFORE the leave-full-screen callback restores the
  // bounds, so without this the restore would overwrite its own target.
  const remember = main.slice(main.indexOf("function rememberWindowedBounds(win)"), main.indexOf("// Reads BOTH preferences"));
  assert.match(remember, /if \(placingWindow\) return;/);
  assert.match(remember, /if \(currentWindowMode !== "windowed"\) return;/);
  assert.match(remember, /win\.isFullScreen\(\) \|\| win\.isMinimized\(\)/, "a minimized or fullscreen rectangle is not a placement");
  assert.match(main, /placingWindow = true;/);
  // Released a tick later, because setBounds' own events arrive asynchronously.
  assert.match(main, /function endPlacement\(\) \{\s*setTimeout\(\(\) => \{\s*placingWindow = false;/);

  // Windowed placement stays in memory. Only Borderless is persisted, and this
  // must not have quietly started writing a file on every drag.
  const prefs = main.slice(main.indexOf("function writePrefs()"), main.indexOf("function prefsSnapshot()"));
  assert.doesNotMatch(prefs, /windowedBounds/, "windowed placement is deliberately not persisted");
});

// ------------------------------------------------------ macOS fullscreen
//
// THE BUG THESE PIN. On a real M2 Mac the Fullscreen control did nothing
// visible — no crash, no error, while Windowed and Borderless both worked.
//
// The mechanism is a DESYNC plus a guard that trusted the wrong source.
// `currentWindowMode` records what was last REQUESTED, not what the window
// actually is, and on macOS those come apart easily: native fullscreen is an
// asynchronous window-manager transition that can be refused, and the green
// button / Ctrl+Cmd+F enter it without going through Settings at all. Once the
// record said "fullscreen" while the window was not, the no-op guard added
// with the window-position fix skipped every later request as redundant — so
// the control was not merely failing, it had become unrecoverable through the
// UI. Measured on real Electron 43.4.0: setFullScreen(true) is SYNCHRONOUS on
// Windows (isFullScreen() is already true on the next line), which is why the
// same code path never showed this there.

test("Fullscreen recovers when the recorded mode has desynced from the window", () => {
  // The exact reported state: the record claims fullscreen, the window is not.
  const { calls } = runWindowModeHarness({
    mode: "fullscreen",
    currentWindowMode: "fullscreen",
    currentFrameless: false,
    isFullScreen: false, // <- the window disagrees with the record
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 300, y: 200, width: 1200, height: 800 },
  });
  assert.deepEqual(calls.setFullScreen, [true], "the request must reach the window, not be skipped as redundant");
});

test("the no-op guard asks the WINDOW, not just the recorded mode", () => {
  const guard = main.slice(main.indexOf("function windowIsInMode(win, mode)"), main.indexOf("function setWindowMode(mode)"));
  // Fullscreen is answered by the window itself.
  assert.match(guard, /if \(mode === "fullscreen"\) return win\.isFullScreen\(\);/);
  // A fullscreen window is in NEITHER of the other two modes, whatever the
  // frame state says — otherwise a natively-fullscreened window would report
  // itself as "windowed" and the guard would skip the way back out.
  assert.match(guard, /if \(win\.isFullScreen\(\)\) return false;/);
  assert.match(guard, /return currentFrameless === needsFrameless\(mode\);/);
  // And the guard actually consults it.
  const setMode = main.slice(main.indexOf("function setWindowMode(mode)"), main.indexOf("// ---------------------------------------------------------------- port pick"));
  assert.match(
    setMode,
    /if \(mode === currentWindowMode && needsFrameless\(mode\) === currentFrameless && windowIsInMode\(win, mode\)\) \{/
  );
});

test("entering fullscreen outside Settings keeps the recorded mode truthful", () => {
  // The mirror of the existing leave-full-screen handler. Its absence is what
  // let the record drift on macOS, where the green button and Ctrl+Cmd+F are
  // ordinary ways to enter fullscreen.
  const build = main.slice(main.indexOf("function buildWindow("), main.indexOf("function wireWindow("));
  assert.match(build, /win\.on\("enter-full-screen", \(\) => \{/);
  const handler = build.slice(build.indexOf('win.on("enter-full-screen"'));
  assert.match(handler, /if \(currentWindowMode === "fullscreen"\) return;/, "already recorded — nothing to do");
  assert.match(handler, /currentWindowMode = "fullscreen";/);
  assert.match(handler, /writePrefs\(\);/);
  assert.match(handler, /notifyRenderer\(\);/, "the renderer's cached mode must not drift either");
  // Deliberately NOT setWindowMode(): the window has already made the
  // transition, so re-running geometry would re-apply a change that happened.
  assert.doesNotMatch(handler.slice(0, handler.indexOf("});")), /setWindowMode/);
  // The leave-full-screen handler still syncs the mode back — now behind the
  // close guard, so a window being CLOSED is not read as a mode change.
  assert.match(
    build,
    /win\.on\("leave-full-screen", \(\) => \{\s*if \(closing\) return;\s*if \(currentWindowMode === "fullscreen"\) setWindowMode\("windowed"\);/
  );
});

test("a swapped-in window re-asserts fullscreen after it is shown", () => {
  // Every window is built hidden to avoid the white flash, and macOS will not
  // take a fullscreen request for a window that is not on screen yet. The
  // constructor's `fullscreen` option covers a normal launch; a window swapped
  // in for Borderless -> Fullscreen is what needed this.
  const ready = main.slice(main.indexOf('win.once("ready-to-show"'), main.indexOf('win.on("leave-full-screen"'));
  const showAt = ready.indexOf("win.show();");
  const reassertAt = ready.indexOf('currentWindowMode === "fullscreen" && !win.isDestroyed() && !win.isFullScreen()');
  assert.ok(showAt !== -1 && reassertAt !== -1, "both steps are present");
  assert.ok(reassertAt > showAt, "the re-assert must come AFTER show(), which is the entire point");
  assert.match(ready.slice(reassertAt), /win\.setFullScreen\(true\);/);
  // Still requested at construction too, so a launch that starts fullscreen
  // never flashes a windowed frame first.
  assert.match(main, /fullscreen: currentWindowMode === "fullscreen",/);
});

test("Borderless -> Fullscreen -> Windowed behaves sensibly", () => {
  // Borderless to Fullscreen changes the frame state, so it recreates the
  // window; the re-assert above is what makes the new one actually fullscreen.
  const toFull = runWindowModeHarness({
    mode: "fullscreen", currentWindowMode: "borderless", currentFrameless: true, isFullScreen: false,
    windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
    bounds: { x: 900, y: 300, width: 700, height: 500 },
  });
  assert.equal(toFull.calls.swapWindow, 1, "the frame state changes, so the window is rebuilt");
  assert.equal(toFull.state.currentWindowMode, "fullscreen");

  // ...and back to Windowed from there leaves fullscreen rather than sticking.
  const toWindowed = runWindowModeHarness({
    mode: "windowed", currentWindowMode: "fullscreen", currentFrameless: false, isFullScreen: true,
    windowedBounds: { x: 2200, y: 640, width: 1180, height: 780 },
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  });
  assert.deepEqual(toWindowed.calls.setFullScreen, [false]);
});

test("Windowed and Borderless saves are unaffected by the fullscreen fix", () => {
  // The window-position fix must still hold: a save that changes nothing still
  // touches nothing, in the modes where the record and the window agree.
  for (const [currentWindowMode, currentFrameless] of [["windowed", false], ["borderless", true]]) {
    const { calls } = runWindowModeHarness({
      mode: currentWindowMode, currentWindowMode, currentFrameless, isFullScreen: false,
      windowedBounds: { x: 100, y: 100, width: 1440, height: 900 },
      bounds: { x: 2200, y: 640, width: 1180, height: 780 },
    });
    assert.deepEqual(calls.setBounds, [], `${currentWindowMode}: saving must not move the window`);
    assert.deepEqual(calls.setFullScreen, [], `${currentWindowMode}: saving must not touch fullscreen`);
  }
});

test("the fullscreen fix is shared logic, with no platform branch", () => {
  const region = main.slice(main.indexOf("function windowIsInMode(win, mode)"), main.indexOf("// ---------------------------------------------------------------- port pick"));
  assert.doesNotMatch(codeOnly(region), /isMac|darwin|win32|process\.platform/, "one implementation for both platforms");
  const build = main.slice(main.indexOf("function buildWindow("), main.indexOf("function wireWindow("));
  const handler = build.slice(build.indexOf('win.on("enter-full-screen"'));
  assert.doesNotMatch(codeOnly(handler.slice(0, 400)), /isMac|darwin|process\.platform/);
});

test("the recentering fix is shared, not duplicated per platform", () => {
  // The bug was in shared window-state logic. A platform branch here would be
  // the wrong shape of fix — and would leave Windows still doing it.
  const geometry = main.slice(main.indexOf("function applyWindowGeometry"), main.indexOf("// ---------------------------------------------------------------- port pick"));
  assert.doesNotMatch(codeOnly(geometry), /isMac|darwin|win32|process\.platform/, "no platform branch in the window-state path");
  const remember = main.slice(main.indexOf("function rememberWindowedBounds(win)"), main.indexOf("// Reads BOTH preferences"));
  assert.doesNotMatch(codeOnly(remember), /isMac|darwin|win32|process\.platform/);
});

test("macOS lifecycle and the always-on-top rescue are untouched by the fix", () => {
  // Cmd+W leaves the app in the Dock; the Dock reopens it against the same
  // warm origin. Neither is reached through the geometry path.
  // PUBLIC checks the platform inline where DEV factored out an `isMac` const —
  // same behaviour, different spelling, and public's comment between the two
  // lines is longer, hence the wider span.
  assert.match(main, /app\.on\("window-all-closed", \(\) => \{[\s\S]{0,500}?if \(process\.platform === "darwin"\) return;/);
  assert.match(main, /app\.on\("activate", \(\) => \{/);
  // Always on Top still composes with every mode, and still puts back a
  // rectangle Windows' z-order reshuffle moved.
  assert.match(main, /win\.setAlwaysOnTop\(alwaysOnTop\);/);
  assert.match(main, /if \(after && \(after\.x !== before\.x \|\| after\.y !== before\.y\)\) win\.setBounds\(before\);/);
});

// -------------------------------------------------------- macOS Cmd+W
//
// THE BUG THESE PIN. In the packaged M2 app Cmd+W did nothing, while Cmd+Q and
// Cmd+V worked and every other Mac application closed its window normally.
//
// The cause is the menu template, not the lifecycle. Electron's `windowMenu`
// ROLE omits Close on macOS — verified against the role table compiled into
// Electron 43.4.0 itself, where the Close item is the NON-mac branch:
//
//   windowmenu: { label: "Window", submenu: [
//     { role: "minimize" }, { role: "zoom" },
//     ...isMac ? [{ type: "separator" }, { role: "front" }]
//              : [{ role: "close" }] ] }
//
// On macOS Cmd+W is a menu key equivalent and nothing else, so with no item
// bound to it the key was inert. It is invisible from Windows precisely
// because the role DOES carry Close there — building `{ role: "windowMenu" }`
// with real Electron on Windows yields ["minimize","zoom","close"].
//
// The whole reopen half of the contract already worked and must stay working.

// Extracts the template array literal passed to Menu.buildFromTemplate(),
// matching brackets rather than guessing at an end marker — the template
// contains both comments and nested brackets.
function macMenuTemplateSource() {
  const fn = main.slice(main.indexOf("function installApplicationMenu"));
  const start = fn.indexOf("[", fn.indexOf("Menu.buildFromTemplate("));
  let depth = 0, inLine = false, inBlock = false, inStr = null;
  for (let i = start; i < fn.length; i++) {
    const c = fn[i], n = fn[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return fn.slice(start, i + 1); }
  }
  throw new Error("menu template not found");
}
const macMenuTemplate = new Function(`return ${macMenuTemplateSource()}`)();

test("the macOS menu contains a real Cmd+W close-window path", () => {
  const windowMenu = macMenuTemplate.find((t) => t.label === "Window");
  assert.ok(windowMenu, "there is an explicit Window menu");
  const roles = windowMenu.submenu.map((i) => i.role || i.type);
  assert.ok(roles.includes("close"), "the Close role is what binds Cmd+W on macOS");

  // It must NOT be the bare role that omits Close on macOS.
  assert.ok(
    !macMenuTemplate.some((t) => t.role === "windowMenu"),
    "`role: windowMenu` alone does not provide Close on macOS"
  );
  // Everything the role did provide is still there.
  for (const kept of ["minimize", "zoom", "front"]) {
    assert.ok(roles.includes(kept), kept + " must survive spelling the menu out");
  }
});

test("Cmd+W is a stock role, not a hand-rolled handler or a renderer keybinding", () => {
  const windowMenu = macMenuTemplate.find((t) => t.label === "Window");
  const closeItem = windowMenu.submenu.find((i) => i.role === "close");
  // Electron supplies the label, the CommandOrControl+W accelerator and the
  // focused-window resolution. Nothing here reimplements any of that.
  assert.equal(typeof closeItem.click, "undefined", "no custom click handler");
  assert.equal(typeof closeItem.accelerator, "undefined", "the role carries its own accelerator");
  for (const item of windowMenu.submenu) {
    assert.equal(typeof item.click, "undefined", "the Window menu is roles only");
  }

  // And the renderer must not intercept Meta+W: before-input-event handles
  // F11 and nothing else, so Cmd+W reaches the menu as macOS intends.
  const input = main.slice(main.indexOf('win.webContents.on("before-input-event"'));
  const handler = input.slice(0, input.indexOf("});"));
  assert.match(handler, /input\.key !== "F11"\) return;/);
  assert.doesNotMatch(handler, /"w"|"W"|meta|Meta/, "no Meta+W interception in the renderer path");
});

test("Cmd+W closes a window and never quits the application", () => {
  const windowMenu = macMenuTemplate.find((t) => t.label === "Window");
  const roles = windowMenu.submenu.map((i) => i.role);
  assert.ok(!roles.includes("quit"), "the Window menu must not carry quit");
  // Quit stays exactly where macOS expects it — the app menu, via appMenu.
  assert.ok(macMenuTemplate.some((t) => t.role === "appMenu"), "Cmd+Q still comes from appMenu");
  // Cmd+C/V/X/A/Z likewise stay with editMenu.
  assert.ok(macMenuTemplate.some((t) => t.role === "editMenu"), "Cmd+V still comes from editMenu");

  // Nothing in the shell reaches app.quit() from a window close on macOS.
  // PUBLIC checks the platform inline where DEV factored out an `isMac` const.
  const lifecycle = main.slice(main.indexOf('app.on("window-all-closed"'), main.indexOf("app.whenReady()"));
  assert.match(lifecycle, /if \(recreating\) return;/);
  assert.match(lifecycle, /if \(process\.platform === "darwin"\) return;/, "macOS must fall out before app.quit()");
  const quitAt = lifecycle.indexOf("app.quit();");
  const macGuardAt = lifecycle.indexOf('if (process.platform === "darwin") return;');
  assert.ok(macGuardAt !== -1 && macGuardAt < quitAt, "the macOS guard precedes the quit");
});

test("the Dock reopens a window, and a stale reference cannot block it", () => {
  // PUBLIC's activate guards on the live window LIST rather than focusing an
  // existing window the way DEV does. Both satisfy the contract — one window,
  // never two — and PUBLIC's is deliberately left as it is.
  const activate = main.slice(main.indexOf('app.on("activate"'), main.indexOf("app.whenReady()"));
  assert.match(activate, /if \(BrowserWindow\.getAllWindows\(\)\.length > 0\) return;/, "a live window is never duplicated");
  // A closed one is replaced through the SAME builder — never a second copy of
  // the build logic, and never a second Express server (the server is imported
  // once in start(), and buildWindow only loads the warm origin).
  assert.match(activate, /mainWindow = buildWindow\(\{ frameless: currentFrameless \}\);/);
  assert.doesNotMatch(activate, /new BrowserWindow|import\(|server\.js/);
  // The reference is cleared on close, so it cannot go stale — and
  // getAllWindows() is authoritative regardless of what mainWindow holds.
  assert.match(main, /win\.on\("closed", \(\) => \{\s*if \(mainWindow === win\) mainWindow = null;/);
  // Guarded on the origin, so a Dock click during startup cannot race it.
  assert.match(activate, /if \(!appOrigin \|\| recreating\) return;/);
  // Reopening rebuilds at the CURRENT mode, so Borderless and Fullscreen come
  // back as themselves rather than as a plain window.
  assert.match(main, /function buildWindow\(\{ frameless \}\)/);
});

test("closing a fullscreen window does not rewrite the saved mode", () => {
  // macOS leaves fullscreen as part of closing a fullscreen window. Without
  // this guard that reads as the user choosing Windowed, so Cmd+W would
  // silently downgrade the setting and the Dock would reopen windowed.
  const build = main.slice(main.indexOf("function buildWindow("), main.indexOf("function wireWindow("));
  assert.match(build, /let closing = false;/);
  assert.match(build, /win\.on\("close", \(\) => \{\s*closing = true;\s*\}\);/);
  const leave = build.slice(build.indexOf('win.on("leave-full-screen"'));
  assert.match(leave.slice(0, 200), /if \(closing\) return;/);
  const enter = build.slice(build.indexOf('win.on("enter-full-screen"'));
  assert.match(enter.slice(0, 200), /if \(closing\) return;/);
  // Borderless placement is still captured on the way out.
  assert.match(build, /win\.on\("close", \(\) => rememberBorderlessBounds\(win\)\);/);
  // swapWindow() destroys its outgoing window, which emits no `close` — so a
  // frame-state recreation is never mistaken for a user closing the window.
  assert.match(main, /if \(old && !old\.isDestroyed\(\)\) old\.destroy\(\);/);
});

test("Windows keeps no application menu at all", () => {
  // The whole Cmd+W fix is inside the macOS branch. Windows still gets a null
  // menu, which is what keeps Ctrl+R and the devtools toggle out of a shipped
  // build — and is why the accelerator work cannot regress it.
  // Ends at the `start` banner: PUBLIC orders its file differently from DEV,
  // with the externals section ABOVE the menu rather than below it, so DEV's
  // end anchor would slice backwards and match nothing.
  const fn = main.slice(main.indexOf("function installApplicationMenu"), main.indexOf("// ------------------------------------------------------------------ start"));
  assert.match(fn, /if \(process\.platform !== "darwin"\) \{\s*Menu\.setApplicationMenu\(null\);\s*return;\s*\}/);
  // Installed once the app is ready, before the first window exists.
  const start = main.slice(main.indexOf("async function start()"), main.indexOf("prefsPath = path.join"));
  assert.match(start, /installApplicationMenu\(\);/);
  assert.match(main, /app\.whenReady\(\)\.then\(start\)/, "menu installation happens after ready");
});

test("window recreation cannot restart the tutorial, because the origin does not move", () => {
  // Borderless swaps the BrowserWindow, which reloads the page. That reload
  // keeps the same origin — appOrigin is set once per launch from the resolved
  // port and is not recomputed per window — so localStorage, and with it
  // aether.tutorialSeen, survives the swap.
  assert.equal((main.match(/appOrigin = `http:\/\/127\.0\.0\.1:\$\{port\}`/g) || []).length, 1,
    "the origin is computed once per launch, not per window");
  const create = main.slice(main.indexOf("win.loadURL(appOrigin)") - 2000, main.indexOf("win.loadURL(appOrigin)") + 100);
  assert.match(create, /win\.loadURL\(appOrigin\);/, "every window loads that same origin");
});
