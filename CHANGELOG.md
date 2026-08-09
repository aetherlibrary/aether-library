# Changelog

All notable changes to Aether Library are recorded here.

Aether Library was developed privately before this release. This changelog
begins with the first public version.

## v1.0.0 — Initial Public Release

2026-08-09

The first public release of Aether Library: a local-first workspace where
several AI models consider your question together, presented as a library you
can walk into. Your API keys, your Vault and your discussion history stay on
your own machine — there is no account and no Aether Library server.

### Added

**Discussion**

- Council mode: one question, three Scholars (Architect, Oracle and Analyst)
  answering independently, then a Grand Sage who reviews their answers and
  reaches a conclusion.
- Mentor mode: a focused conversation with a single Scholar, with no Grand
  Sage step.
- Unified conversation composer with continuous follow-up conversation in
  both modes.
- Collapsible Session Summary and a draggable divider between the
  conversation and interaction workspace.
- Direct-submit Quick Questions.
- Session Engine: every discussion is a Session, the single source of truth
  for the active discussion until it is saved or reset.

**Providers**

- Multi-provider configuration across OpenAI, Anthropic, Google,
  Perplexity / Sonar and DeepSeek, with per-Scholar and per-Judge provider
  and model assignment, independent of character identity.
- Curated model catalog with Recommended, Fast, Reasoning, Budget and
  Experimental badges per provider.
- 24-hour memory of recently failed models, with a warning before sending to
  one again.
- Provider requests fail cleanly on timeout rather than hanging, with
  separate connect, inactivity and task deadlines.

**Knowledge**

- Vault: saved discussions are written to a local folder you choose as plain
  Markdown files that remain readable without this application.
- Optional Obsidian integration, including export of saved discussions into
  an existing Obsidian vault; the built-in Vault remains primary.
- Archives: every completed discussion is recorded locally and can be
  reopened, searched, or continued as a new discussion that carries the
  earlier conversation forward as context.
- Librarian: deterministic, keyword-based retrieval of Vault context, with a
  Library Activity status indicator.

**Input**

- Session Materials: attach files, PDFs, images or text before asking, via
  drag and drop, file picker, or pasting an image from the clipboard.
- Raw Markdown copy controls for the Grand Sage's and each Scholar's answers.

**Interface**

- The Classic Library scene, with the reading room, the Scholars and
  Aetherom, the book that starts a discussion.
- Guided 11-step tutorial on first launch, replayable at any time.
- English and Traditional Chinese interface, with the default reply language
  configured separately from the interface language.
- Light and dark appearance.
