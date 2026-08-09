// Obsidian write jail — the ONLY module allowed to write into a connected
// Obsidian vault, enforcing a permanent product rule:
//
//   Aether Library integrates with Obsidian; it never takes ownership of it.
//
// Everything Aether Library ever generates inside a user's Obsidian vault
// lives under ONE dedicated folder, OBSIDIAN_WRITE_ROOT ("aether-vault/"),
// created on first write. Everything outside it is read-only by construction:
//
//   - every write API here resolves through resolveWritePath(), which jails
//     the target under <obsidian vault>/aether-vault/ and rejects absolute
//     paths, drive switches, `..` traversal, and symlink escapes;
//   - no API in this module (or anywhere else) moves, renames, overwrites,
//     or deletes the user's existing notes, and nothing scans folders
//     outside the write root;
//   - future sync/export features MUST call these APIs instead of fs — never
//     import node:fs against config.obsidianVaultPath directly.
//
// Connecting an Obsidian vault stays read-only (see connectObsidianVault in
// services/vaultConnection.js): it validates the folder and remembers its
// location. The worst case of ever using these APIs is the appearance of a
// single new `aether-vault/` folder.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const OBSIDIAN_WRITE_ROOT = "aether-vault";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function assertConnected() {
  if (!config.obsidianVaultPath) {
    throw httpError(409, "No Obsidian vault connected. Connect one from the Vault menu first.");
  }
}

// Case-insensitive containment on Windows, exact elsewhere.
function isInside(parent, child) {
  const rel = path.relative(
    process.platform === "win32" ? parent.toLowerCase() : parent,
    process.platform === "win32" ? child.toLowerCase() : child
  );
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// The absolute path of the dedicated Aether folder inside the Obsidian vault.
export function writeRootPath() {
  assertConnected();
  return path.join(path.resolve(config.obsidianVaultPath), OBSIDIAN_WRITE_ROOT);
}

// Resolves a RELATIVE path (e.g. "sessions/note.md") to an absolute path
// guaranteed to live under aether-vault/. This is the single gate every write
// goes through; there is deliberately no variant that escapes it.
export function resolveWritePath(relativePath) {
  const rel = String(relativePath ?? "").trim();
  if (!rel) throw httpError(400, "A relative path inside aether-vault/ is required.");
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw httpError(400, "Absolute paths are not allowed — paths are relative to aether-vault/.");
  }

  const root = writeRootPath();
  const resolved = path.resolve(root, rel);
  if (!isInside(root, resolved) || resolved === root) {
    throw httpError(400, `Refused: "${relativePath}" resolves outside ${OBSIDIAN_WRITE_ROOT}/.`);
  }
  return resolved;
}

// Creates aether-vault/ (and nothing else) if it does not exist yet.
export async function ensureWriteRoot() {
  const root = writeRootPath();
  await fs.mkdir(root, { recursive: true });
  return root;
}

// After directories exist, verify the REAL location (symlinks resolved) is
// still inside the real write root, so a symlinked folder inside aether-vault/
// cannot redirect writes into the user's notes.
async function assertRealPathInsideRoot(dir) {
  const [realRoot, realDir] = await Promise.all([fs.realpath(writeRootPath()), fs.realpath(dir)]);
  if (!isInside(realRoot, realDir)) {
    throw httpError(400, `Refused: target escapes ${OBSIDIAN_WRITE_ROOT}/ via a symlink.`);
  }
}

// Creates a directory inside aether-vault/.
export async function mkdirInVault(relativePath) {
  const target = resolveWritePath(relativePath);
  await ensureWriteRoot();
  await fs.mkdir(target, { recursive: true });
  await assertRealPathInsideRoot(target);
  return target;
}

// Writes one file inside aether-vault/, creating parent folders as needed.
// Overwrites only its own previous content at that path — by construction it
// can never touch a file outside the write root.
export async function writeFileInVault(relativePath, content) {
  const target = resolveWritePath(relativePath);
  await ensureWriteRoot();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertRealPathInsideRoot(path.dirname(target));
  await fs.writeFile(target, content, "utf8");
  return target;
}
