# Obsidian Integration

## Purpose

An **optional** bridge for users who already keep an Obsidian vault. The
built-in [Vault](vault.md) is Aether Library's primary knowledge system;
connecting Obsidian is an additional integration, never a required setup.
Everything works identically with Obsidian left unconnected.

## Permanent product rule (non-negotiable)

> Aether Library integrates with Obsidian; it never takes ownership of it.

Users may have years of notes, folders, plugins, templates, and workflows in
their vault. Aether Library must never modify that organization:

- **Connecting is read-only.** `connectObsidianVault()`
  (`src/services/vaultConnection.js`) validates the folder (it exists, and
  contains a `.obsidian` marker — connecting anyway requires an explicit
  user confirmation), then remembers its location as `OBSIDIAN_VAULT_PATH`
  in Aether Library's own `.env.local`. Nothing in the user's vault is
  created, changed, or deleted at connect time — not even an empty folder.
- **All generated content lives in ONE dedicated folder**:
  `aether-vault/` at the vault root, created automatically on first write.

  ```
  Obsidian Vault
  ├── .obsidian
  ├── 01_Inbox            ← never touched
  ├── 02_Notes            ← never touched
  ├── ...                 ← never touched
  └── aether-vault/       ← the only folder Aether Library ever writes
      ├── sessions/
      ├── archives/
      ├── personal-notes/
      └── attachments/
  ```

- **Hard rules**, everywhere and forever:
  - never create files outside `aether-vault/`;
  - never move, rename, or overwrite existing notes;
  - never reorganize the user's vault;
  - never scan or index unrelated folders unless the user explicitly asks;
  - treat everything outside `aether-vault/` as read-only.

## Structural enforcement (not convention)

The rule is enforced by construction in `src/vault/obsidianVault.js` — the
only module permitted to write into a connected Obsidian vault:

- `OBSIDIAN_WRITE_ROOT = "aether-vault"` is the single constant every write
  resolves through.
- `resolveWritePath(relativePath)` is the one gate: it jails every target
  under `<vault>/aether-vault/` and rejects absolute paths, drive switches,
  `..` traversal, the root itself, and (after directories exist) symlink
  escapes via a realpath containment check.
- The public API is deliberately minimal — `ensureWriteRoot()`,
  `mkdirInVault()`, `writeFileInVault()` — and no API capable of writing
  elsewhere exists. There are no delete/move/rename operations at all.

**Rule for future features (sync, export, attachments):** call
`obsidianVault.js` APIs only. Never import `node:fs` against
`config.obsidianVaultPath` directly — code review should treat that as a
defect regardless of intent.

`test/obsidianVault.test.js` locks the behavior in: read-only connection
(byte-identical user content, no folder created), path jailing, escape
attempts (traversal, absolute, symlink) creating nothing outside the root,
and the worst-case guarantee — the only possible change to a user's vault is
the appearance of the single `aether-vault/` folder.

## Export workflow

The first (and so far only) feature built on the write jail
(`src/services/obsidianExport.js`):

- **The native Aether Vault is always primary.** *Save to Vault* writes to it
  first, exactly as before; Obsidian only ever receives a copy of that saved
  note afterwards. An export failure never rolls back or deletes the native
  file — the UI reports "Saved to Aether Vault, but Obsidian export failed."
- **Two integration states** (`OBSIDIAN_INTEGRATION`, default off), shown in
  the Vault menu. Off: nothing Obsidian-related appears anywhere, and a
  remembered path is retained but never used. On: the connected path plus
  *Change* / *Disable* actions. Enabling with no remembered path opens the
  folder picker; disabling only stops future exports and deletes nothing.
- **Manual export** is an inline, non-blocking secondary action revealed
  under *Saved ✓*; **auto-export** (`OBSIDIAN_AUTO_EXPORT`, default off) is a
  checkbox next to it that exports a copy automatically after each native
  save. The preference survives a disable/enable cycle but is suspended
  while disabled.
- Exports land under `aether-vault/sessions/`; a filename collision gets a
  timestamp suffix (`research-session-20260713-153045.md`), then numeric —
  existing files are never overwritten.

`test/obsidianExport.test.js` covers the data rules: disabled integrations
refuse to export even with a remembered path, exports require a prior native
save, collisions uniquify, and disabling deletes nothing.
