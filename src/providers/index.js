// Provider registry, built from PROVIDER_DEFS in config.js.
// Every provider exposes the same interface:
//   { id, label, short, isConfigured(), model(), complete(), listModels() }
//
// Adding a future provider = one entry in PROVIDER_DEFS + one module here.
//
// Providers are pure implementation details. The in-world characters
// (Judge, Scholars #1–#3) live in localization.js, and which provider
// answers as which character is decided by config.scholarSlots.

import { config, PROVIDER_DEFS } from "../config.js";
import * as openai from "./openai.js";
import * as anthropic from "./anthropic.js";
import * as google from "./google.js";
import * as perplexity from "./perplexity.js";
import * as deepseek from "./deepseek.js";

const impls = { openai, anthropic, google, perplexity, deepseek };

export const providers = {};
for (const def of PROVIDER_DEFS) {
  const impl = impls[def.id];
  if (!impl) continue;
  providers[def.id] = {
    id: def.id,
    label: def.label,
    short: def.short,
    isConfigured: () => Boolean(config.providers[def.id]?.apiKey),
    model: () => config.providers[def.id]?.model,
    complete: impl.complete,
    listModels: impl.listModels,
  };
}
