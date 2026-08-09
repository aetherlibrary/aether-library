// Vault Connection — the lifecycle around WHICH folder is the active Vault:
// picking one with the OS folder dialog, opening it in the OS file manager,
// and switching to a new one. This is separate from src/services/vault.js
// (which reads/writes vault *content* once a Vault is already connected).
//
// Changing the connected Vault never touches Archives: an archived Session
// already carries its own `vault` snapshot from when it was saved, so
// reconnecting to a different folder only affects where FUTURE sessions save.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { saveSettings } from "./settings.js";
import { vaultStatus } from "./vault.js";
import { runCommand } from "./osProcess.js";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Native dialogs wait on the user — give them real time, not a request timeout.
const PICKER_TIMEOUT_MS = 5 * 60 * 1000;
const CANCELLED_SENTINEL = "__AETHER_VAULT_PICKER_CANCELLED__";

// runCommand now lives in services/osProcess.js — the ALS native file
// dialogs need the same spawn-and-capture behaviour, and process spawning
// is security-relevant enough not to exist twice.

// ---------------------------------------------------------------- pick folder

// Dialog prompts are fixed server-side per picker kind (never client text —
// the Windows prompt is interpolated into a PowerShell script).
const PICKER_PROMPTS = {
  vault: "Select your Aether Library Vault folder",
  obsidian: "Select your Obsidian Vault folder",
};
function pickerPrompt(kind) {
  return PICKER_PROMPTS[kind] || PICKER_PROMPTS.vault;
}

// Opens the native OS folder picker. Returns { path } or { cancelled: true }.
export async function pickFolder(kind = "vault") {
  if (process.platform === "win32") return pickFolderWindows(kind);
  if (process.platform === "darwin") return pickFolderMac(kind);
  if (process.platform === "linux") return pickFolderLinux(kind);
  throw httpError(501, `Folder picker is not supported on ${process.platform} yet.`);
}

async function pickFolderWindows(kind) {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${pickerPrompt(kind)}'`,
    "$dialog.ShowNewFolderButton = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath } else { Write-Output '" +
      CANCELLED_SENTINEL +
      "' }",
  ].join("; ");

  const { code, stdout, stderr } = await runCommand(
    "powershell.exe",
    ["-NoProfile", "-STA", "-NonInteractive", "-Command", script],
    { timeoutMs: PICKER_TIMEOUT_MS }
  );
  if (code !== 0) throw httpError(500, stderr || "The folder picker could not be opened.");
  if (!stdout || stdout === CANCELLED_SENTINEL) return { cancelled: true };
  return { path: stdout };
}

async function pickFolderMac(kind) {
  const script = `POSIX path of (choose folder with prompt "${pickerPrompt(kind)}")`;
  const { code, stdout, stderr } = await runCommand("osascript", ["-e", script], {
    timeoutMs: PICKER_TIMEOUT_MS,
  });
  if (code !== 0) {
    if (/User canceled/i.test(stderr)) return { cancelled: true };
    throw httpError(500, stderr || "The folder picker could not be opened.");
  }
  return { path: stdout.replace(/\/$/, "") };
}

async function pickFolderLinux(kind) {
  let result;
  try {
    result = await runCommand(
      "zenity",
      ["--file-selection", "--directory", `--title=${pickerPrompt(kind)}`],
      { timeoutMs: PICKER_TIMEOUT_MS }
    );
  } catch {
    throw httpError(
      501,
      "No folder picker is available (zenity not found). Set the Vault path manually in Settings."
    );
  }
  if (result.code !== 0 || !result.stdout) return { cancelled: true };
  return { path: result.stdout };
}

// ------------------------------------------------------------ open in OS

// Opens `targetPath` in the OS file manager. Fire-and-forget: we don't wait
// for the opener process to exit (explorer.exe in particular can report a
// non-zero exit code on a perfectly successful open).
export async function openFolder(targetPath) {
  if (!targetPath) throw httpError(409, "No Vault connected. Connect a Vault from the header first.");

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) throw httpError(400, "The Vault path is not a folder.");
  } catch (err) {
    if (err.status) throw err;
    if (err.code === "ENOENT") {
      throw httpError(404, "This Vault folder could not be found. It may have been moved or deleted.");
    }
    if (err.code === "EACCES" || err.code === "EPERM") {
      throw httpError(403, "Permission denied opening this Vault folder.");
    }
    throw httpError(500, err.message);
  }

  const opener =
    process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(opener, [targetPath], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
  } catch (err) {
    throw httpError(500, `Could not open the Vault folder: ${err.message}`);
  }
  return { opened: true };
}

// ------------------------------------------------------------ connect vault

// Validates and connects a new Vault folder, persisting it through the
// existing settings pipeline (saveSettings -> .env.local -> reloadConfig).
// Does not move, copy, or delete anything at the old or new location, and
// never touches Archives — see the module comment above.
export async function connectVault(rawPath) {
  const targetPath = String(rawPath || "").trim();
  if (!targetPath) throw httpError(400, "No folder was provided.");
  const resolved = path.resolve(targetPath);

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (err) {
    if (err.code === "ENOENT") throw httpError(404, "That folder could not be found.");
    if (err.code === "EACCES" || err.code === "EPERM") throw httpError(403, "Permission denied accessing that folder.");
    throw httpError(500, err.message);
  }
  if (!stat.isDirectory()) throw httpError(400, "Please choose a folder, not a file.");

  try {
    await fs.access(resolved, fsConstants.W_OK);
  } catch {
    throw httpError(403, "Aether Library does not have permission to write to that folder.");
  }

  saveSettings({ vaultPath: resolved });
  return vaultStatus();
}

// -------------------------------------------------------- connect Obsidian
// OPTIONAL integration: remembers the user's existing Obsidian vault folder
// so future Vault entries can also be synchronized into it. The built-in
// Vault stays the primary knowledge system — nothing anywhere requires this
// to be connected, and this function never writes into the chosen folder.
//
// PERMANENT RULE (docs/technical/obsidian-integration.md): Aether Library
// never modifies the user's existing Obsidian organization. Any future write
// goes through the jailed APIs in src/vault/obsidianVault.js, which confine
// everything to the dedicated aether-vault/ folder.
//
// A real Obsidian vault contains a `.obsidian` folder. When the marker is
// missing we reject with `notObsidian: true` so the UI can ask the user to
// confirm; `force: true` connects it anyway.
export async function connectObsidianVault(rawPath, { force = false } = {}) {
  const targetPath = String(rawPath || "").trim();
  if (!targetPath) throw httpError(400, "No folder was provided.");
  const resolved = path.resolve(targetPath);

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch (err) {
    if (err.code === "ENOENT") throw httpError(404, "That folder could not be found.");
    if (err.code === "EACCES" || err.code === "EPERM") throw httpError(403, "Permission denied accessing that folder.");
    throw httpError(500, err.message);
  }
  if (!stat.isDirectory()) throw httpError(400, "Please choose a folder, not a file.");

  if (!force) {
    let hasMarker = false;
    try {
      hasMarker = (await fs.stat(path.join(resolved, ".obsidian"))).isDirectory();
    } catch {
      hasMarker = false;
    }
    if (!hasMarker) {
      const err = httpError(409, "This folder does not look like an Obsidian vault (no .obsidian folder inside).");
      err.notObsidian = true;
      throw err;
    }
  }

  // Choosing a folder is an explicit opt-in, so connecting also enables the
  // integration (the picker is exactly how "Enable" works when no path is
  // remembered yet).
  saveSettings({ obsidianVaultPath: resolved, obsidianIntegration: "true" });
  return vaultStatus();
}

// Turns the OPTIONAL Obsidian integration on or off. Disabling only stops
// future export actions: the remembered path, the auto-export preference,
// and every file already exported stay exactly as they are. Enabling with no
// remembered path rejects with `needsPath: true` so the UI can open the
// folder picker instead.
export async function setObsidianIntegration(enabled) {
  if (enabled && !config.obsidianVaultPath) {
    const err = httpError(409, "No Obsidian vault has been chosen yet — pick a folder to enable the integration.");
    err.needsPath = true;
    throw err;
  }
  saveSettings({ obsidianIntegration: enabled ? "true" : "false" });
  return vaultStatus();
}

// Persists the automatic-export preference (acts only while the integration
// is enabled — see obsidianStatus in services/vault.js).
export async function setObsidianAutoExport(enabled) {
  saveSettings({ obsidianAutoExport: enabled ? "true" : "false" });
  return vaultStatus();
}
