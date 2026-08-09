# Providers

## Purpose

Providers are the AI backends Aether Library can call. A provider is an
implementation detail: it is assigned to a Scholar or to the Grand Sage, but
it never becomes part of that character's identity. Swapping a Scholar from
one model to another does not change who that Scholar is.

## Supported providers

| Provider | Notes |
| --- | --- |
| OpenAI / GPT | |
| Anthropic / Claude | |
| Google / Gemini | |
| Perplexity / Sonar | The Sonar API only |
| DeepSeek | |

Aether Library ships with no keys and no provider enabled. You supply your
own key for each provider you want to use.

## Configuring a provider

Everything is done in **AI Config**:

1. Enter an API key for a provider.
2. Refresh the model list to fetch that provider's currently available
   models.
3. Assign a provider and model to each Scholar and to the Grand Sage.

Keys are written to a local `.env.local` file in the project folder. They are
never sent to the browser: the interface can tell you a key is configured,
but the backend never echoes a stored key back.

## How it behaves

- **A provider with no key is skipped**, and the discussion runs with
  whoever is configured.
- **Model lists come from the provider**, so newly released models appear
  without an application update. The list is filtered against a curated
  catalogue, and recommended, fast, reasoning and budget models are marked.
- **Every request is yours.** Questions go only to the providers you
  selected, on your own account, and usage appears on your bill with them.
  Aether Library does not estimate what a discussion costs in money.
- **Timeouts are handled in phases** — how long a provider may take to start
  responding, how long it may go silent mid-stream, and a hard ceiling — so a
  slow answer is not confused with a dead one.

## Where it lives

One module per provider under `src/providers/`, behind a common interface.
`src/config.js` loads keys and models; `src/services/settings.js` persists
changes made in AI Config.

Adding a provider is one config entry plus one provider module. None beyond
the current five are planned.
