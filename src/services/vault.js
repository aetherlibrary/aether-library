// Vault service: read access to the configured vault, plus one explicit,
// narrowly-scoped write (a test file under 20-working/drafts).
// Nothing in this module writes to the vault unless writeTestDraft() is called.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const DRAFTS_SUBDIR = path.join("20-working", "drafts");

function assertVaultConfigured() {
  if (!config.vaultPath) {
    const err = new Error("No Vault connected. Connect a Vault from the header before using this feature.");
    err.status = 409;
    throw err;
  }
}

// `configured` reflects whether a Vault path has been connected at all;
// `exists` reflects whether that path is currently reachable on disk (it can
// be configured but missing, e.g. an unplugged drive).
//
// `obsidian` reports the OPTIONAL Obsidian integration the same way. The
// built-in Vault above is the primary knowledge system; an unconnected
// Obsidian ({ configured: false }) is a completely normal state, never an
// error.
export async function vaultStatus() {
  const obsidian = await obsidianStatus();
  if (!config.vaultPath) {
    return { path: "", exists: false, configured: false, obsidian };
  }
  try {
    const stat = await fs.stat(config.vaultPath);
    return { path: config.vaultPath, exists: stat.isDirectory(), configured: true, obsidian };
  } catch {
    return { path: config.vaultPath, exists: false, configured: true, obsidian };
  }
}

async function obsidianStatus() {
  // `enabled` is the single switch the rest of the app honors: integration ON
  // and a remembered path. A retained path with the integration OFF is normal
  // and must never be used. `autoExport` is the user's preference; it only
  // acts while `enabled` is true.
  const base = {
    configured: Boolean(config.obsidianVaultPath),
    enabled: Boolean(config.obsidianIntegration && config.obsidianVaultPath),
    autoExport: Boolean(config.obsidianAutoExport),
  };
  if (!config.obsidianVaultPath) {
    return { ...base, path: "", exists: false };
  }
  try {
    const stat = await fs.stat(config.obsidianVaultPath);
    return { ...base, path: config.obsidianVaultPath, exists: stat.isDirectory() };
  } catch {
    return { ...base, path: config.obsidianVaultPath, exists: false };
  }
}

export async function listTopLevelFolders() {
  assertVaultConfigured();
  const entries = await fs.readdir(config.vaultPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export async function readNote(relativePath) {
  const full = resolveInsideVault(relativePath);
  return fs.readFile(full, "utf8");
}

// Writes a test markdown file into 20-working/drafts.
// Only ever invoked via the explicit POST /api/vault/test-write endpoint.
export async function writeTestDraft() {
  assertVaultConfigured();
  const draftsDir = path.join(config.vaultPath, DRAFTS_SUBDIR);
  await fs.mkdir(draftsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(draftsDir, `aether-test-${stamp}.md`);
  const content = [
    "---",
    `created: ${new Date().toISOString()}`,
    "source: aether-library",
    "type: test",
    "---",
    "",
    "# Aether Library test draft",
    "",
    "This file confirms Aether Library can write into the vault.",
    "It is safe to delete.",
    "",
  ].join("\n");

  await fs.writeFile(filePath, content, { flag: "wx" }); // wx: fail rather than overwrite
  return { path: filePath };
}

// Guards against path traversal escaping the vault.
function resolveInsideVault(relativePath) {
  const full = path.resolve(config.vaultPath, relativePath);
  const root = path.resolve(config.vaultPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Path escapes the vault");
  }
  return full;
}
