# Vault

## Purpose

The Vault is your own local Markdown knowledge folder. It does two jobs: it
grounds the Scholars' answers in notes you already wrote, and it is where
finished discussions are saved — as ordinary Markdown files you can read,
search, edit or move with any tool.

## Connecting a Vault

No Vault is connected by default. On first launch, **Connect Vault** opens a
folder picker; the chosen path is remembered and reconnects automatically on
restart. **Change Vault Location** switches to a different folder.

Changing the Vault never moves, copies or deletes files at either location,
and never affects [Archives](archives.md) — an archived discussion keeps
referencing the Vault path it was actually saved to.

## Saving a discussion

**Save to Vault** writes the finished discussion as a single Markdown file
under `20-working/sessions/` in your Vault. The file is keyed by the
discussion's own immutable ID, so saving again updates the same file instead
of creating duplicates.

The Vault is plain files on your disk. Nothing about this format depends on
Aether Library continuing to exist.

## Retrieval — the Librarian

Before the Scholars answer, the Librarian looks through your Vault for notes
relevant to the question and includes them in the context every Scholar
receives.

- Retrieval is **keyword-based and deterministic** — no embeddings, no
  vector search, no AI request of its own.
- It is entirely **local and read-only**.
- If the Vault is unconnected or unreadable, the discussion still runs; it
  simply proceeds without your notes.

## Obsidian

An existing Obsidian vault can optionally receive a copy of saved
discussions. The built-in Vault remains primary and Obsidian is never
required — see [Obsidian Integration](obsidian-integration.md).

## Where it lives

`src/services/vaultConnection.js` handles the connection lifecycle,
`src/services/librarian.js` performs retrieval, and
`src/vault/localVaultAdapter.js` writes saved discussions. The local
filesystem is currently the only Vault Adapter.
