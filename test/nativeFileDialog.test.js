// Native OS Open / Save As dialogs for ALS Scene files.
//
// THE AUDIT ANSWER, recorded so nobody re-derives it: the background-image
// picker is NOT a native dialog and could not be reused — it is a server-side
// directory listing rendered as a <select>, and devOpen.js only LAUNCHES a
// file (fire-and-forget, no path returned). The bridge that DOES return a
// persistent absolute path is vaultConnection.js's folder picker, and that is
// what this reuses: a short-lived PowerShell / osascript / zenity helper.
//
// THE SAFETY PROPERTY these tests exist to protect: the suggested filename and
// starting directory are DATA (derived from a Scene name an author typed), so
// they are passed through the child process's ENVIRONMENT and never written
// into a script string. vaultConnection can interpolate its prompts because
// they are fixed constants; these cannot.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  normalizeAlsExtension,
  sanitizeSceneFileName,
  suggestedSceneFileName,
  ALS_EXTENSION,
  ALS_FILTER_LABEL,
  DEFAULT_SCENE_FILENAME,
} from "../src/services/nativeFileDialog.js";

const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const dialogSrc = () => readSource("../src/services/nativeFileDialog.js");

// Several sweeps below look for forbidden patterns ("shell: true", "electron")
// that this module's own header legitimately NAMES while explaining why it
// does not use them. Stripping line comments first keeps those assertions
// about the code rather than about the prose.
const STRIP_COMMENTS = /\/\/[^\n]*/g;

// ====================================================== the reused bridge

test("it reuses the folder picker's mechanism rather than inventing one", async () => {
  const src = await dialogSrc();
  // One shared spawn-and-capture helper, now extracted so it exists once.
  assert.match(src, /import \{ runCommand \} from "\.\/osProcess\.js";/);
  const vault = await readSource("../src/services/vaultConnection.js");
  assert.match(vault, /import \{ runCommand \} from "\.\/osProcess\.js";/);
  assert.doesNotMatch(vault, /function runCommand\(/, "the duplicate copy must be gone");
  // The same three platform helpers the folder picker established.
  assert.match(src, /powershell\.exe/);
  assert.match(src, /"osascript"/);
  assert.match(src, /"zenity"/);
});

test("no Electron, Tauri or other heavyweight dependency was added", async () => {
  const pkg = JSON.parse(await readSource("../package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["express", "pdf-parse"]);
  // Comments stripped: the header legitimately says "no Electron, no Tauri",
  // and that statement is the point rather than a dependency.
  const src = (await dialogSrc()).replace(STRIP_COMMENTS, "");
  assert.doesNotMatch(src, /electron|tauri|node-file-dialog|dialog-node/i);
});

test("nothing derived from author input is concatenated into a shell or script", async () => {
  const withComments = await dialogSrc();
  // Comments stripped for the forbidden-pattern sweeps below: the header
  // explains WHY there is no shell, and naming it is not using it.
  const src = withComments.replace(STRIP_COMMENTS, "");
  // Every parameter travels in the environment.
  assert.match(withComments, /env: \{\s*AETHER_DIALOG_MODE/);
  assert.match(withComments, /AETHER_DIALOG_FILENAME: fileName \|\| ""/);
  assert.match(withComments, /AETHER_DIALOG_DIR: dir \|\| ""/);
  // The Windows script is a CONSTANT: it reads $env: and interpolates nothing.
  const winScript = withComments.slice(withComments.indexOf("const WINDOWS_SCRIPT = ["), withComments.indexOf("async function runWindows"));
  assert.ok(winScript.length > 0);
  assert.doesNotMatch(winScript, /\$\{/, "the PowerShell script must contain no template interpolation");
  assert.match(winScript, /\$env:AETHER_DIALOG_FILENAME/);
  // The AppleScript reads the same values via `system attribute`.
  assert.match(withComments, /system attribute "AETHER_DIALOG_FILENAME"/);
  const macScripts = withComments.slice(withComments.indexOf("const MAC_SAVE_SCRIPT"), withComments.indexOf("async function runMac"));
  assert.doesNotMatch(macScripts, /\$\{/, "the AppleScript must contain no template interpolation");
  // Never a shell, never a concatenated command line.
  assert.doesNotMatch(src, /shell:\s*true/);
  assert.doesNotMatch(src, /exec\(|execSync\(/);
  const osProcess = (await readSource("../src/services/osProcess.js")).replace(STRIP_COMMENTS, "");
  assert.match(osProcess, /spawn\(command, args, \{/);
  assert.doesNotMatch(osProcess, /shell:\s*true/);
});

// ================================================== extension + filename

test("the .als extension is appended when omitted", () => {
  assert.equal(normalizeAlsExtension("scene"), "scene.als");
  assert.equal(normalizeAlsExtension("C:/Scenes/my_scene"), "C:/Scenes/my_scene.als");
  assert.equal(ALS_EXTENSION, ".als");
});

test("an existing .als extension is left alone, case-insensitively", () => {
  assert.equal(normalizeAlsExtension("scene.als"), "scene.als");
  assert.equal(normalizeAlsExtension("scene.ALS"), "scene.ALS");
});

test("a WRONG extension is normalized by appending, never by replacing", () => {
  // Appending can never silently discard part of a name the author typed.
  assert.equal(normalizeAlsExtension("notes.txt"), "notes.txt.als");
  assert.equal(normalizeAlsExtension("data.json"), "data.json.als");
  assert.equal(normalizeAlsExtension("a.b.c"), "a.b.c.als");
  // ...and the result always satisfies the ALS path validator's extension rule.
  assert.equal(path.extname(normalizeAlsExtension("notes.txt")).toLowerCase(), ".als");
});

test("empty input yields no path at all", () => {
  assert.equal(normalizeAlsExtension(""), "");
  assert.equal(normalizeAlsExtension("   "), "");
  assert.equal(normalizeAlsExtension(null), "");
});

test("a Scene name can never become a path or a control sequence", () => {
  assert.equal(sanitizeSceneFileName("../../etc/passwd"), "etcpasswd");
  assert.equal(sanitizeSceneFileName("a/b\\c"), "abc");
  assert.equal(sanitizeSceneFileName('bad:name*?"<>|'), "badname");
  assert.equal(sanitizeSceneFileName("  ..hidden  "), "hidden");
  assert.equal(sanitizeSceneFileName("with\u0000null"), "withnull");
  assert.equal(sanitizeSceneFileName(""), "");
  assert.equal(sanitizeSceneFileName(null), "");
  // Long names are capped rather than rejected.
  assert.ok(sanitizeSceneFileName("x".repeat(500)).length <= 80);
});

test("the suggested filename follows the stated priority", () => {
  // 1. the current ALS filename wins over everything.
  assert.equal(
    suggestedSceneFileName({ currentPath: "C:/Scenes/classic_default.als", sceneName: "Ignored" }),
    "classic_default.als"
  );
  // 2. then the sanitized Scene Name.
  assert.equal(suggestedSceneFileName({ sceneName: "Classic Library (smoke)" }), "Classic Library (smoke).als");
  assert.equal(suggestedSceneFileName({ sceneName: "a/b:c" }), "abc.als");
  // 3. then untitled.als.
  assert.equal(suggestedSceneFileName({}), DEFAULT_SCENE_FILENAME);
  assert.equal(suggestedSceneFileName({ sceneName: "   " }), "untitled.als");
  assert.equal(suggestedSceneFileName({ sceneName: "///" }), "untitled.als");
  // A current path without an extension still suggests one.
  assert.equal(suggestedSceneFileName({ currentPath: "/scenes/older" }), "older.als");
});

// ================================================== dialog configuration

test("the save dialog declares the ALS file type, default extension and overwrite prompt", async () => {
  const src = await dialogSrc();
  const dialog = await import("../src/services/nativeFileDialog.js");
  assert.equal(ALS_FILTER_LABEL, "Aether Library Scene (*.als)");
  // The filter and default extension are now per-KIND data, not literals.
  assert.equal(dialog.FILE_KINDS.scene.label, ALS_FILTER_LABEL);
  assert.deepEqual(dialog.FILE_KINDS.scene.extensions, [".als"]);
  assert.equal(dialog.FILE_KINDS.scene.defaultExt, "als");
  // Windows.
  assert.match(src, /AETHER_DIALOG_FILTER: windowsFilter\(kind\)/);
  assert.match(src, /\$d\.DefaultExt = \$env:AETHER_DIALOG_DEFAULT_EXT/);
  assert.match(src, /\$d\.OverwritePrompt = \$true/);
  assert.match(src, /\$d\.AddExtension = \$true/);
  // The OS's own overwrite confirmation is used, not a re-implementation.
  assert.match(src, /--confirm-overwrite/);
  assert.doesNotMatch(src, /already exists.*overwrite\?/i);
});

test("the open dialog filters by kind and takes exactly one file", async () => {
  const src = await dialogSrc();
  assert.match(src, /\$d\.Multiselect = \$false/);
  assert.match(src, /\$d\.CheckFileExists = \$true/);
  // macOS reads the allowed types from the environment, so the script text is
  // one constant for every kind rather than being rebuilt per call.
  assert.match(src, /of type typeList without multiple selections allowed/);
  assert.match(src, /set rawTypes to system attribute "AETHER_DIALOG_TYPES"/);
  assert.match(src, /--file-filter=\$\{zenityFilter\(kind\)\}/);
});

// THE BUG THIS FILE EXISTS TO PREVENT RECURRING.
//
// WINDOWS_SCRIPT was joined with "; ". That put a semicolon before `else`,
// which ends the if-statement and leaves `else` to be parsed as a command:
//   save — the if branch had already assigned $d, so it kept working;
//   open — $d was never assigned, ShowDialog was never reached, and the script
//          fell through to writing the CANCEL sentinel. Open silently "did
//          nothing" and was indistinguishable from the author cancelling.
test("the if/else is not split across a semicolon join", async () => {
  const src = await dialogSrc();
  assert.match(src, /\]\.join\("\\n"\)/, "the Windows script joins with newlines, never '; '");
  // No array element may START with `else` — that is the exact broken shape.
  assert.doesNotMatch(src, /^\s*"else\b/m);
  assert.match(src, /"\} else \{",/, "if/else stays one statement");
});

test("a broken script fails loudly instead of reporting a cancel", async () => {
  const src = await dialogSrc();
  // Without this, any script error falls through to the cancel sentinel, and
  // callers are required to treat cancel as "do nothing, silently".
  assert.match(src, /"\$ErrorActionPreference = 'Stop'"/);
  assert.match(src, /if \(code !== 0\) throw dialogError\(500,/);
});

test("only a SAVE normalizes the extension — Open must point at a real file", async () => {
  const src = await dialogSrc();
  assert.match(src, /const chosen = mode === "save" && kind === "scene" \? normalizeAlsExtension\(raw\) : raw;/);
  assert.match(src, /inventing an extension there would/);
});

test("the image picker is the SAME dialog, not a second implementation", async () => {
  const src = await dialogSrc();
  const dialog = await import("../src/services/nativeFileDialog.js");
  assert.deepEqual(dialog.FILE_KINDS.image.extensions, [".png", ".jpg", ".jpeg", ".webp"]);
  // One showDialog, one runWindows/runMac/runLinux — the image picker only
  // supplies a different kind.
  assert.equal([...src.matchAll(/async function runWindows\(/g)].length, 1);
  assert.equal([...src.matchAll(/async function runMac\(/g)].length, 1);
  assert.equal([...src.matchAll(/async function runLinux\(/g)].length, 1);
  assert.equal([...src.matchAll(/async function showDialog\(/g)].length, 1);
  assert.match(src, /export function pickImageFileToOpen\(options\) \{\s*return showDialog\("open", \{ \.\.\.options, kind: "image"/);
  // No second PowerShell/osascript/zenity invocation anywhere.
  assert.equal([...src.matchAll(/powershell\.exe/g)].length, 1);
  assert.equal([...src.matchAll(/"osascript"/g)].length, 1);
  assert.equal([...src.matchAll(/"zenity"/g)].length, 1);
});

test("a relative result from the dialog is refused", async () => {
  const src = await dialogSrc();
  assert.match(src, /if \(!path\.isAbsolute\(chosen\)\) \{[\s\S]*?not absolute/);
});

test("cancel is a first-class result, distinct from failure", async () => {
  const src = await dialogSrc();
  assert.match(src, /if \(!raw \|\| raw === CANCELLED\) return \{ cancelled: true \};/);
  // Windows and macOS both report it; zenity's exit 1 with no output is one.
  assert.match(src, /Write-Output \$env:AETHER_DIALOG_CANCELLED/);
  assert.match(src, /if \(\/User canceled\|-128\/i\.test\(stderr\)\) return CANCELLED;/);
  assert.match(src, /if \(result\.code !== 0 \|\| !result\.stdout\) return CANCELLED;/);
});

test("Linux without zenity reports 501 so the caller can fall back", async () => {
  const src = await dialogSrc();
  assert.match(src, /dialogError\(\s*501,\s*"No native file dialog is available \(zenity not found\)/);
  // A timeout is NOT mistaken for "no dialog installed".
  assert.match(src, /if \(err\.status === 504\) throw err;/);
  // An unknown platform is also a fall-back-able 501, not a crash.
  assert.match(src, /throw dialogError\(501, `Native file dialogs are not supported on \$\{process\.platform\}\.`\)/);
});

test("dialogs get a human-scale timeout, not a request timeout", async () => {
  const src = await dialogSrc();
  assert.match(src, /const DIALOG_TIMEOUT_MS = 5 \* 60 \* 1000;/);
  assert.match(src, /timeoutMessage: "Timed out waiting for the file dialog\."/);
});

// ============================================================ the editor





test("Recent is updated only on success, on both routes", async () => {
  const server = await readSource("../src/server.js");
  const open = server.slice(server.indexOf('app.get("/api/dev/scene-file/open"'), server.indexOf('app.post("/api/dev/scene-file/save"'));
  assert.match(open, /const result = await readSceneFile\(req\.query\.path\);[\s\S]*rememberRecentScene\(result\.path\)/);
  assert.match(open, /Remembered only on a SUCCESSFUL open/);
  const save = server.slice(server.indexOf('app.post("/api/dev/scene-file/save"'), server.indexOf('app.get("/api/dev/scene-file/recent"'));
  const writeAt = save.indexOf("await writeSceneFile(");
  const rememberAt = save.indexOf("rememberRecentScene(");
  assert.ok(writeAt > 0 && rememberAt > writeAt, "Recent is written after the file is");
  // The dialog route itself never touches Recent.
  const dialog = server.slice(server.indexOf('app.post("/api/dev/scene-file/dialog"'), server.indexOf('app.get("/api/dev/scene-file/new"'));
  assert.doesNotMatch(dialog, /rememberRecentScene|writeSceneFile/);
});

// ============================================================= shortcuts



// =========================================================== dev-only


test("the module is only reachable from the dev-gated route", async () => {
  const server = await readSource("../src/server.js");
  assert.match(
    server,
    /import \{ pickSceneFileToOpen, pickSceneFileToSave, pickImageFileToOpen \} from "\.\/services\/nativeFileDialog\.js";/
  );
  const uses = [...server.matchAll(/pickSceneFileTo(Open|Save)\(/g)];
  // One import line plus exactly one call each, both in the dialog route.
  assert.equal(uses.length, 2);
  const dialog = server.slice(server.indexOf('app.post("/api/dev/scene-file/dialog"'), server.indexOf('app.get("/api/dev/scene-file/new"'));
  assert.match(dialog, /pickSceneFileToSave\(options\) : await pickSceneFileToOpen\(options\)/);

  // Every picker route lives inside the devTools gate — production has none.
  const devStart = server.indexOf("if (config.devTools) {");
  const alwaysOn = server.indexOf('app.get("/api/health"');
  for (const route of [
    'app.post("/api/dev/scene-file/dialog"',
    'app.post("/api/dev/image-dialog"',
    'app.post("/api/dev/import-image"',
  ]) {
    const at = server.indexOf(route);
    assert.ok(at > devStart && at < alwaysOn, `${route} must be dev-only`);
  }
  assert.equal([...server.matchAll(/pickImageFileToOpen\(/g)].length, 1);
});

// ================================================== existing rules intact

test("the ALS validator still refuses anything the dialog could return wrongly", async () => {
  const sceneFile = await import("../src/services/sceneFile.js");
  // Whatever a dialog hands back still goes through the same path validator.
  assert.throws(() => sceneFile.validateScenePath("relative.als"), /must be absolute/);
  const dir = process.platform === "win32" ? "C:\\S\\" : "/s/";
  assert.throws(() => sceneFile.validateScenePath(`${dir}x.txt`), /must end in \.als/);
  // ...and a normalized name always passes it.
  assert.ok(sceneFile.validateScenePath(`${dir}${normalizeAlsExtension("notes.txt")}`));
});
