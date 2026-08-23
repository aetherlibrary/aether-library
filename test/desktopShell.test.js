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
  // macOS binds Cmd+C/V/X/A/Z, Cmd+Q, Cmd+W and Cmd+M through these roles.
  // Without them a null menu leaves every one of those keys dead — including
  // paste, which is how an API key gets into AI Config.
  assert.match(code, /role: "appMenu"/);
  assert.match(code, /role: "editMenu"/);
  assert.match(code, /role: "windowMenu"/);
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
