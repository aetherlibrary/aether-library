// DeepSeek provider — OpenAI-compatible chat + models endpoints.
// https://api-docs.deepseek.com

import { openAICompatProvider } from "./openai-compat.js";

export const { complete, listModels } = openAICompatProvider({
  id: "deepseek",
  label: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  keyName: "DEEPSEEK_API_KEY",
});
