# Archives

## Purpose

Archives is the automatic local history of completed discussions, independent
of the [Vault](vault.md). Every finished Council or Mentor discussion is
recorded here whether or not you ever explicitly save it to your Vault — so
nothing is lost just because you did not decide to keep it at the time.

## What gets archived

A discussion is recorded once it reaches a completed state: at least one
Scholar answered, and in Council Mode the Grand Sage produced a synthesis. It
is keyed by the discussion's own immutable ID, so it is never archived twice.

A discussion in which every Scholar failed is not archived.

## Browsing and reopening

- **List and search** — newest first, with local text search over the title
  and the original question. Search is plain string matching; no AI request
  is made to search.
- **Detail view** — the Scholars' answers, the Grand Sage's synthesis, and a
  reference to the Vault file if the discussion was saved there.
- **Continue a discussion** — an archived discussion can be reopened as the
  starting point for a new one, carrying the earlier conversation forward as
  context. Related discussions are grouped together as a thread, so a line of
  thinking stays visible as one sequence rather than scattered entries.
- **Delete** — removes only the archive record. A Vault Markdown file the
  discussion was also saved to is never touched.

## How it is stored

One JSON file per discussion under `data/archives/`, independent of where
your Vault lives. The stored record reuses the discussion's own shape rather
than a separate schema, plus a generated title taken from the first
meaningful line of the question.

`data/` is local application state. It stays on your machine and is not part
of the repository.

## Where it lives

`src/services/archives.js`.
