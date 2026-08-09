// Native OS Open / Save As dialogs for ALS Scene files.
//
// REUSED, NOT INVENTED: this is the same bridge vaultConnection.js has used
// for the native folder picker since it was written — a short-lived helper
// process (PowerShell / osascript / zenity) that returns a real, persistent
// absolute path on stdout. No Electron, no Tauri, no new dependency.
//
// (The background-image picker is NOT that bridge and could not be reused: it
// is a server-side directory listing rendered as a <select>, and devOpen.js
// only LAUNCHES a file in its default app — fire-and-forget, returning no
// path at all.)
//
// INJECTION SAFETY. vaultConnection's folder picker can interpolate its prompt
// straight into the PowerShell script because those prompts are fixed
// server-side constants. These dialogs cannot: the suggested filename and the
// starting directory are DATA — derived from a Scene name an author typed. So
// every such value is passed through the child's ENVIRONMENT, which no shell
// or script parser ever expands, and the script text itself stays a constant
// that contains no caller input. Combined with argv-array spawning (never a
// concatenated command line, never shell: true), nothing an author can type
// becomes executable.
//
// DEV-ONLY: the single route that reaches this module is registered inside
// server.js's config.devTools gate.

import path from "node:path";
import { runCommand } from "./osProcess.js";

function dialogError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Native dialogs wait on a human — give them real time, not a request timeout.
const DIALOG_TIMEOUT_MS = 5 * 60 * 1000;
const CANCELLED = "__AETHER_SCENE_DIALOG_CANCELLED__";

export const ALS_EXTENSION = ".als";
export const ALS_FILTER_LABEL = "Aether Library Scene (*.als)";
export const DEFAULT_SCENE_FILENAME = "untitled.als";

// ------------------------------------------------------------- file kinds
// ONE dialog implementation, parameterised by what it should show. Adding the
// image picker as a second PowerShell/osascript/zenity implementation would
// have meant three more places for a bug like the `else` one above to hide.
// Everything here is DATA passed through the child's environment; no kind's
// values are ever interpolated into script text.
export const FILE_KINDS = {
  scene: {
    label: ALS_FILTER_LABEL,
    extensions: [ALS_EXTENSION],
    defaultExt: "als",
  },
  image: {
    label: "Image (*.png; *.jpg; *.jpeg; *.webp)",
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    defaultExt: "png",
  },
};

function fileKind(kind) {
  return FILE_KINDS[kind] || FILE_KINDS.scene;
}

// "Label|*.png;*.jpg" — the Windows common-dialog filter format.
function windowsFilter(kind) {
  const k = fileKind(kind);
  const globs = k.extensions.map((e) => `*${e}`).join(";");
  return `${k.label}|${globs}`;
}

// zenity takes globs space-separated inside one --file-filter argument.
function zenityFilter(kind) {
  const k = fileKind(kind);
  return `${k.label} | ${k.extensions.map((e) => `*${e}`).join(" ")}`;
}

// AppleScript wants bare extensions; they arrive as one comma-joined env value
// and are split by the script's own text-item delimiters.
function macTypes(kind) {
  return fileKind(kind)
    .extensions.map((e) => e.replace(/^\./, ""))
    .join(",");
}

// ------------------------------------------------------------ the filename
// Windows' own AddExtension only fills in a MISSING extension, and neither
// osascript nor zenity adds one at all — so the result is normalized here for
// every platform. A wrong extension is APPENDED to rather than replaced
// ("notes.txt" -> "notes.txt.als"), which can never silently discard part of
// a name the author deliberately typed.
export function normalizeAlsExtension(filePath) {
  const raw = String(filePath || "").trim();
  if (!raw) return "";
  return path.extname(raw).toLowerCase() === ALS_EXTENSION ? raw : `${raw}${ALS_EXTENSION}`;
}

// Anything that cannot appear in a filename on the strictest of the three
// platforms, plus separators and control characters. Never a path — only a
// leaf name, so the dialog decides the directory.
export function sanitizeSceneFileName(value) {
  const cleaned = String(value || "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
  return cleaned;
}

// Suggested filename priority (Section 1): the current ALS filename, then the
// sanitized Scene Name, then untitled.als.
export function suggestedSceneFileName({ currentPath, sceneName } = {}) {
  const fromPath = currentPath ? path.basename(String(currentPath)) : "";
  if (fromPath) return normalizeAlsExtension(fromPath);
  const fromName = sanitizeSceneFileName(sceneName);
  if (fromName) return normalizeAlsExtension(fromName);
  return DEFAULT_SCENE_FILENAME;
}

function startingDirectory(currentPath) {
  if (!currentPath) return "";
  const dir = path.dirname(String(currentPath));
  return path.isAbsolute(dir) ? dir : "";
}

// ================================================================= Windows
// A constant script; every value arrives in $env:. An invisible TopMost form
// is used as the dialog's owner so it opens IN FRONT of the browser rather
// than behind it — a dialog nobody can see reads as a frozen application.
// JOINED WITH NEWLINES, NOT "; ". A semicolon before `else` ENDS the if
// statement, leaving `else` to be parsed as a command name. That produced a
// non-terminating CommandNotFoundException, so:
//   save — the if branch had already assigned $d, and everything still worked;
//   open — $d was never assigned, `$d.Title` failed on $null, ShowDialog was
//          never reached, and $result stayed null, so the last line wrote the
//          CANCEL sentinel. Open "did nothing" and looked exactly like a user
//          cancel. Newline joining removes the whole hazard class.
//
// $ErrorActionPreference = 'Stop' is the second half of the fix: a broken
// script must FAIL LOUDLY rather than fall through to the cancel sentinel.
// A silent cancel is the worst possible failure mode here, because the caller
// is required to treat cancel as "the author changed their mind" and do nothing.
const WINDOWS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "$owner = New-Object System.Windows.Forms.Form",
  "$owner.TopMost = $true",
  "$owner.ShowInTaskbar = $false",
  "$owner.WindowState = 'Minimized'",
  "$owner.Show()",
  "if ($env:AETHER_DIALOG_MODE -eq 'save') {",
  "  $d = New-Object System.Windows.Forms.SaveFileDialog",
  "  $d.OverwritePrompt = $true",
  "  $d.AddExtension = $true",
  "} else {",
  "  $d = New-Object System.Windows.Forms.OpenFileDialog",
  "  $d.Multiselect = $false",
  "  $d.CheckFileExists = $true",
  "}",
  "$d.Title = $env:AETHER_DIALOG_TITLE",
  "$d.Filter = $env:AETHER_DIALOG_FILTER",
  "$d.DefaultExt = $env:AETHER_DIALOG_DEFAULT_EXT",
  "if ($env:AETHER_DIALOG_FILENAME) { $d.FileName = $env:AETHER_DIALOG_FILENAME }",
  "if ($env:AETHER_DIALOG_DIR) { $d.InitialDirectory = $env:AETHER_DIALOG_DIR }",
  "$result = $d.ShowDialog($owner)",
  "$owner.Close()",
  "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName } else { Write-Output $env:AETHER_DIALOG_CANCELLED }",
].join("\n");

async function runWindows(mode, { title, fileName, dir, kind }) {
  const { code, stdout, stderr } = await runCommand(
    "powershell.exe",
    ["-NoProfile", "-STA", "-NonInteractive", "-Command", WINDOWS_SCRIPT],
    {
      timeoutMs: DIALOG_TIMEOUT_MS,
      timeoutMessage: "Timed out waiting for the file dialog.",
      env: {
        AETHER_DIALOG_MODE: mode,
        AETHER_DIALOG_TITLE: title,
        AETHER_DIALOG_FILTER: windowsFilter(kind),
        AETHER_DIALOG_DEFAULT_EXT: fileKind(kind).defaultExt,
        AETHER_DIALOG_FILENAME: fileName || "",
        AETHER_DIALOG_DIR: dir || "",
        AETHER_DIALOG_CANCELLED: CANCELLED,
      },
    }
  );
  if (code !== 0) throw dialogError(500, stderr || "The file dialog could not be opened.");
  return stdout;
}

// ================================================================== macOS
// AppleScript reads the same values with `system attribute`, so nothing is
// interpolated into the script here either.
const MAC_SAVE_SCRIPT = [
  'set suggested to system attribute "AETHER_DIALOG_FILENAME"',
  'set dialogTitle to system attribute "AETHER_DIALOG_TITLE"',
  "try",
  "  set chosen to choose file name with prompt dialogTitle default name suggested",
  "  POSIX path of chosen",
  "on error number -128",
  '  return system attribute "AETHER_DIALOG_CANCELLED"',
  "end try",
].join("\n");

// The allowed types arrive as one comma-joined env value and are split by the
// script's own text-item delimiters, so the script text stays constant for
// every file kind rather than being rebuilt per call.
const MAC_OPEN_SCRIPT = [
  'set dialogTitle to system attribute "AETHER_DIALOG_TITLE"',
  'set rawTypes to system attribute "AETHER_DIALOG_TYPES"',
  "set savedDelims to AppleScript's text item delimiters",
  'set AppleScript\'s text item delimiters to ","',
  "set typeList to every text item of rawTypes",
  "set AppleScript's text item delimiters to savedDelims",
  "try",
  "  set chosen to choose file with prompt dialogTitle of type typeList without multiple selections allowed",
  "  POSIX path of chosen",
  "on error number -128",
  '  return system attribute "AETHER_DIALOG_CANCELLED"',
  "end try",
].join("\n");

async function runMac(mode, { title, fileName, kind }) {
  const { code, stdout, stderr } = await runCommand(
    "osascript",
    ["-e", mode === "save" ? MAC_SAVE_SCRIPT : MAC_OPEN_SCRIPT],
    {
      timeoutMs: DIALOG_TIMEOUT_MS,
      timeoutMessage: "Timed out waiting for the file dialog.",
      env: {
        AETHER_DIALOG_TITLE: title,
        AETHER_DIALOG_FILENAME: fileName || DEFAULT_SCENE_FILENAME,
        AETHER_DIALOG_TYPES: macTypes(kind),
        AETHER_DIALOG_CANCELLED: CANCELLED,
      },
    }
  );
  if (code !== 0) {
    if (/User canceled|-128/i.test(stderr)) return CANCELLED;
    throw dialogError(500, stderr || "The file dialog could not be opened.");
  }
  return stdout;
}

// ================================================================== Linux
// zenity takes everything as real argv entries, so no script text exists to
// inject into. It is not installed everywhere, which is why a missing binary
// reports 501 rather than 500 — the editor treats that as "no native dialog
// here" and falls back to the typed-path prompt.
async function runLinux(mode, { title, fileName, dir, kind }) {
  const args = ["--file-selection", `--title=${title}`, `--file-filter=${zenityFilter(kind)}`];
  if (mode === "save") {
    args.push("--save", "--confirm-overwrite");
    const start = dir ? path.join(dir, fileName || DEFAULT_SCENE_FILENAME) : fileName || DEFAULT_SCENE_FILENAME;
    args.push(`--filename=${start}`);
  } else if (dir) {
    args.push(`--filename=${dir}${path.sep}`);
  }
  let result;
  try {
    result = await runCommand("zenity", args, {
      timeoutMs: DIALOG_TIMEOUT_MS,
      timeoutMessage: "Timed out waiting for the Scene file dialog.",
    });
  } catch (err) {
    if (err.status === 504) throw err;
    throw dialogError(
      501,
      "No native file dialog is available (zenity not found). Enter the .als path manually instead."
    );
  }
  // zenity exits 1 on cancel with no output.
  if (result.code !== 0 || !result.stdout) return CANCELLED;
  return result.stdout;
}

// ==================================================================== API
// Returns { path } (absolute, .als-normalized) or { cancelled: true }.
// Throws 501 where no native dialog exists, so the caller can fall back.
async function showDialog(mode, { currentPath, sceneName, kind = "scene", title: titleOverride } = {}) {
  const fileName = mode === "save" ? suggestedSceneFileName({ currentPath, sceneName }) : "";
  const dir = startingDirectory(currentPath);
  const title = titleOverride || (mode === "save" ? "Save Scene As" : "Open Scene");
  const args = { title, fileName, dir, kind };

  let raw;
  if (process.platform === "win32") raw = await runWindows(mode, args);
  else if (process.platform === "darwin") raw = await runMac(mode, args);
  else if (process.platform === "linux") raw = await runLinux(mode, args);
  else throw dialogError(501, `Native file dialogs are not supported on ${process.platform}.`);

  if (!raw || raw === CANCELLED) return { cancelled: true };
  // Only a SAVE normalizes the extension: an Open dialog already restricted
  // the choice to existing files, and inventing an extension there would
  // point at a file that does not exist.
  const chosen = mode === "save" && kind === "scene" ? normalizeAlsExtension(raw) : raw;
  if (!path.isAbsolute(chosen)) {
    throw dialogError(500, "The file dialog returned a path that is not absolute.");
  }
  return { path: chosen };
}

export function pickSceneFileToOpen(options) {
  return showDialog("open", { ...options, kind: "scene" });
}

export function pickSceneFileToSave(options) {
  return showDialog("save", { ...options, kind: "scene" });
}

// The SAME dialog, asking for an image. Open-only: importing reads a file the
// author already has, and never writes through the dialog.
export function pickImageFileToOpen(options) {
  return showDialog("open", { ...options, kind: "image", title: "Import Image" });
}
