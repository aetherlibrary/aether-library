// Obsidian export — copies an already-saved Session note into the connected
// Obsidian vault, as an OPTIONAL secondary destination.
//
// Core data rule (docs/technical/obsidian-integration.md):
//   - Save to Vault always writes to the native Aether Vault first; that file
//     is the source of truth and is never rolled back or deleted here.
//   - Obsidian only ever receives a COPY, only under aether-vault/ (through
//     the jailed write module — this file never touches node:fs against the
//     Obsidian path), and only while the integration is enabled.
//   - Existing Obsidian files are never overwritten: name collisions get a
//     timestamp (then numeric) suffix instead.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getActiveSession } from "./sessionEngine.js";
import { getArchive, setArchiveObsidianExport } from "./archives.js";
import { renderSessionNote } from "../vault/localVaultAdapter.js";
import { resolveWritePath, writeFileInVault } from "../vault/obsidianVault.js";

// Everything exported by Aether Library lands under aether-vault/sessions/.
const EXPORT_SUBDIR = "sessions";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// The one switch the save/export paths honor: integration ON and a path
// remembered. A disabled integration with a retained path must never export.
export function obsidianIntegrationEnabled() {
  return Boolean(config.obsidianIntegration && config.obsidianVaultPath);
}

export function obsidianAutoExportEnabled() {
  return obsidianIntegrationEnabled() && Boolean(config.obsidianAutoExport);
}

// "research-session.md" -> "research-session-20260713-153045.md"
function timestampedName(filename, when = new Date()) {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  const stamp = when
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15); // YYYYMMDD-HHMMSS
  return `${stem}-${stamp}${ext}`;
}

async function fileExists(absPath) {
  return fs.access(absPath).then(
    () => true,
    () => false
  );
}

// First free filename inside aether-vault/sessions/: the plain name, else a
// timestamp suffix, else numeric suffixes — never overwriting anything.
async function uniqueExportPath(filename) {
  const plain = `${EXPORT_SUBDIR}/${filename}`;
  if (!(await fileExists(resolveWritePath(plain)))) return plain;

  const stamped = `${EXPORT_SUBDIR}/${timestampedName(filename)}`;
  if (!(await fileExists(resolveWritePath(stamped)))) return stamped;

  const ext = path.extname(filename);
  const stem = timestampedName(filename).slice(0, -ext.length || undefined);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${EXPORT_SUBDIR}/${stem}-${n}${ext}`;
    if (!(await fileExists(resolveWritePath(candidate)))) return candidate;
  }
  throw httpError(500, "Could not find a free export filename.");
}

// Exports the active Session's saved native-Vault note into Obsidian.
// Requires a prior successful Save to Vault — the export is a copy of that
// file, taken fresh from disk so it matches exactly what the Vault holds.
//
// Re-exporting the SAME session (e.g. after a follow-up + another Save to
// Vault) updates the note it already produced, in place — it never mints a
// second file for one session. The "never overwrite" rule above is about
// name collisions with unrelated notes/sessions, not about a session and its
// own previous export.
export async function exportActiveSessionToObsidian() {
  if (!obsidianIntegrationEnabled()) {
    throw httpError(409, "Obsidian integration is not enabled.");
  }
  const session = getActiveSession();
  if (!session) throw httpError(409, "No active session to export.");
  if (session.vault?.state !== "saved" || !session.vault.path) {
    throw httpError(409, "Save to the Aether Vault first — exports copy the saved note.");
  }

  let content;
  try {
    content = await fs.readFile(session.vault.path, "utf8");
  } catch (err) {
    throw httpError(500, `Could not read the saved Vault note: ${err.message}`);
  }

  const relPath = session.obsidianExport?.relPath || (await uniqueExportPath(path.basename(session.vault.path)));
  const exportedPath = await writeFileInVault(relPath, content);

  // Recorded on the Session so the UI can show "Exported ✓" / "Updated ✓"
  // (and restore it after a reload). relPath is kept so a later re-export of
  // this same session updates this same note instead of picking a new name.
  // The native vault record above is untouched.
  session.obsidianExport = { path: exportedPath, relPath, exportedAt: new Date().toISOString() };
  return session.obsidianExport;
}

// Syncs one ARCHIVED Session into Obsidian — the Archives-screen recovery
// path for a session the user forgot to export before resetting. Same
// pipeline and rules as the live export above: copy the saved native-Vault
// note when it's still readable; an archive that never made it to the Vault
// (or whose file has since moved) falls back to rendering the identical
// Markdown from the archive record itself, so the user never has to locate
// a file by hand. Re-syncing the same archive updates its own previous
// export in place (relPath is remembered on the record) — never a silent
// duplicate. The archive record is kept; only its obsidianExport field is
// updated.
export async function exportArchiveToObsidian(archiveId) {
  if (!obsidianIntegrationEnabled()) {
    const err = httpError(409, "Obsidian integration is not enabled.");
    // Structured flag so the UI can show its "connect Obsidian first" prompt
    // (with a shortcut to the Vault menu) instead of a raw error message.
    err.notConfigured = true;
    throw err;
  }
  const record = await getArchive(archiveId);
  if (!record) throw httpError(404, "No archive with that id exists.");

  let filename = null;
  let content = null;
  if (record.vault?.state === "saved" && record.vault.path) {
    try {
      content = await fs.readFile(record.vault.path, "utf8");
      filename = path.basename(record.vault.path);
    } catch {
      // Vault note gone or unreadable — fall through to the record render.
    }
  }
  if (content === null) ({ filename, content } = renderSessionNote(record));

  const relPath = record.obsidianExport?.relPath || (await uniqueExportPath(filename));
  const exportedPath = await writeFileInVault(relPath, content);

  const exportRecord = { path: exportedPath, relPath, exportedAt: new Date().toISOString() };
  await setArchiveObsidianExport(archiveId, exportRecord);

  // If this archive's Session is still the active one, mirror the record on
  // it too — the live export row then shows the same synced state, and a
  // later live re-export updates the same note instead of minting another.
  const active = getActiveSession();
  if (active?.id === archiveId) active.obsidianExport = exportRecord;

  return exportRecord;
}
