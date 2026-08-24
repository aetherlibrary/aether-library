# Aether Library

English | [繁體中文](README.zh-TW.md)

Aether Library is a multi-AI workspace where different AI providers collaborate to answer your questions together. Compare perspectives from multiple AI Scholars, synthesize insights with a Grand Sage, and preserve your knowledge in a personal Vault stored on your device.

Your API keys, your Vault and your discussion history stay on your own
machine. There is no account and no Aether Library server.

![Aether Library — the Classic Library](docs/assets/aether-library-classic.png)

## What is Aether Library?

Most AI tools give you a single model's answer in a chat box. Aether Library is built around the idea that difficult questions deserve multiple perspectives, and that valuable conversations are worth preserving.

You start a discussion by opening Aetherom, the book on the reading-room table. Choose how your question is explored: a full Council where multiple Scholars respond independently, or a single Mentor for focused guidance. Compare responses side by side and save meaningful insights into your Vault as plain Markdown files.

The library itself is not decoration. Scenes, characters and the reading room
are part of how the product presents its work, and the current MVP ships with
the **Classic Library**.

## Features

**Council mode** — One question, several Scholars (Architect, Oracle and
Analyst), each answering independently on the provider and model you assign to
them. The Grand Sage then reviews their answers and reaches a conclusion in
whatever form the question calls for — a recommendation, an explanation, or a
synthesis of where they agree and disagree.

**Mentor mode** — A focused conversation with a single Scholar, with no Grand
Sage step.

**Multiple providers** — Assign any provider and model to any Scholar or to
the Grand Sage, independent of that character's identity. Currently supported:

| Provider | |
| --- | --- |
| OpenAI / GPT | |
| Anthropic / Claude | |
| Google / Gemini | |
| xAI / Grok | |
| Perplexity / Sonar | Sonar API |
| DeepSeek | |

**Vault** — Your own local Markdown knowledge folder. Saved discussions are
written as ordinary `.md` files you can read, search, edit or move with any
tool. An optional integration can also export saved discussions into an
existing Obsidian vault; the built-in Vault remains primary and Obsidian is
never required.

**Archives** — Every completed discussion is recorded locally, so you can
reopen it later. A previous discussion can also be continued as a new one,
carrying the earlier conversation forward as context, and related discussions
are grouped together as a thread.

**Attachments** — Attach files, PDFs, images or text before asking, so the
Scholars can work from your own material. You can drag and drop files onto the
composer, or paste an image straight from the clipboard.

**Guided tutorial** — An 11-step walkthrough on first launch, covering
settings, AI configuration, the Vault, Aetherom, the two modes, attachments
and saving your work. It can be replayed at any time.

**Two languages** — The interface is available in English and Traditional
Chinese, and the language the Grand Sage replies in is configured separately
from the interface language.

## Getting Started

### Desktop App — recommended

1. Download the build for your platform from the
   [latest release](https://github.com/aetherlibrary/aether-library/releases/latest).
2. Run it, then launch **Aether Library** like any other application.

| Platform | Download |
| --- | --- |
| Windows 10/11 (x64) | Installer |
| macOS on Apple Silicon (arm64) | DMG |

Nothing else to install — no Node.js, no terminal.

The macOS build is not code-signed or notarized yet, so macOS blocks it on
first launch. Open it once from Finder with right-click → **Open**, and it
starts normally from then on.

### Run from Source

For Linux, for an Intel Mac, or if you would rather run the code directly.

Requires **Node.js 20 or newer**. There is no build step.

```bash
npm install
npm start
```

Then open **http://127.0.0.1:8477**.

`npm start` runs the application in production mode — the same application the
desktop installer ships, served to your browser instead of its own window.

## AI Configuration

Aether Library ships with no API keys and no provider enabled. You supply your
own keys for whichever providers you want to use.

1. Launch the application and click **Enter Library**.
2. Open **AI Config** and add a key for at least one provider.
3. Refresh the model list and choose a model for each Scholar and for the
   Grand Sage.
4. Optionally click **Connect Vault** and choose a folder for your saved
   discussions.
5. Click **Aetherom** on the table to start your first discussion.

Keys entered here are written to a local `.env.local` file — in your
per-user application data folder for the desktop app, or in the project folder
when running from source. Either way it stays on your machine and is never sent
anywhere except to the provider you are calling.

## Vault & Privacy

Aether Library is local-first, and it is worth being precise about what that
does and does not mean.

**Stays on your machine**

- Your API keys, in a local `.env.local` file
- Your Vault — plain Markdown files in a folder you choose
- Your Archives and application settings
- There is no account system, and no Aether Library server that your
  discussions pass through

**Leaves your machine**

- The question you ask, together with any attached material and relevant
  context, is sent to the AI providers **you** selected — and only to those
  providers. That request is subject to their terms and privacy policies, and
  usage appears on your own account with them.

Aether Library does not estimate what a discussion costs in money. Check your
provider's dashboard for that.

## Development

```bash
npm run dev     # development mode, with file watching
npm test        # node --test
```

`npm run dev` enables the in-application authoring tools used to build and
adjust Scenes. These are development-only and are switched off in `npm start`.

The private development repository contains additional authoring tooling and
internal design material that is not part of this public release.

Advanced: `.env.example` documents the available environment configuration
options for manual setup, if you prefer to configure the application by hand
rather than through **AI Config**.

## Project Structure

```
src/            server, services, AI providers, locales
public/         the application UI — no build step
electron/       the desktop shell that wraps the same server and UI
assets/         scenes, characters, props, art and authored content
config/         product identity and application shell configuration
test/           node:test suites
docs/           technical documentation
```

## Status

Aether Library is at **v1.2.0**, released for Windows (x64) and macOS on Apple
Silicon (arm64). The core loop — configure providers, ask through Aetherom in
Council or Mentor mode, save to your Vault, reopen from Archives — is complete
and in daily use.

Not yet available: code signing and notarization for the macOS build, Intel Mac
builds, additional Scenes beyond the Classic Library, and further languages.
See [CHANGELOG.md](CHANGELOG.md) for release history and
[ROADMAP.md](ROADMAP.md) for what is planned.

## Links

- **Download** — https://github.com/aetherlibrary/aether-library/releases/latest
- **GitHub** — https://github.com/aetherlibrary/aether-library
- **Website** — https://aetherlibrary.app
- **Discord** — https://discord.gg/Gc9BR5wmt
- **Feedback & bug reports** — https://forms.gle/iGkDLfqnhZqMyUag6
- **Support development** — https://ko-fi.com/kazchang

## License

Copyright © 2026 Kaz Chang. All rights reserved.

The source code is publicly visible for transparency and review. **This is not
open-source software.** Copying, modifying, redistributing or commercially
reusing the source code, artwork or assets requires prior written permission
from the copyright holder.

See [LICENSE](LICENSE) for the full terms.
