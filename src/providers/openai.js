// OpenAI / GPT provider — OpenAI-compatible chat + models endpoints.
// https://platform.openai.com/docs/api-reference

import { openAICompatProvider } from "./openai-compat.js";

export const { complete, listModels } = openAICompatProvider({
  id: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  keyName: "OPENAI_API_KEY",
  supportsImages: true,
  // OpenAI's own /chat/completions now rejects "max_tokens" outright for
  // current models (confirmed live: 400 unsupported_parameter) — it must be
  // "max_completion_tokens" instead. See openai-compat.js's tokenLimitField
  // comment for the full root-cause writeup (Council Pre-check false negative).
  tokenLimitField: "max_completion_tokens",
});
