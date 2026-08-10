// Loads configuration from .env.local (preferred) or .env, with process
// environment variables as fallback. API keys live only here on the backend —
// they are never sent to the browser.
//
// The config object is mutable so the settings service can update .env.local
// and call reloadConfig() without restarting the server.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  identityFor,
  identityTitles,
  uiStringsFor,
  learnSectionsFor,
  supportedInterfaceLanguages,
  interfaceLanguageOptions,
  SCHOLAR_SLOTS,
  DEFAULT_REPLY_LANGUAGE,
} from "./localization.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The application version, read from package.json — the project's actual
// source of truth — rather than introducing another hardcoded copy. Read
// once at module load; a version can't change while the process runs.
// Falls back to "" (About simply omits the row) rather than guessing.
export const appVersion = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version || "";
  } catch {
    return "";
  }
})();
// Overridable for tests so they never touch the real .env.local.
export const envFilePath = process.env.ENV_FILE_PATH
  ? path.resolve(process.env.ENV_FILE_PATH)
  : path.join(projectRoot, ".env.local");

function parseEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// Single source of truth for supported providers. Adding a provider means:
// one entry here + one module in src/providers/ registered in providers/index.js.
// Providers are implementation details — the in-world Scholar identities live
// in localization.js and are assigned providers via the scholar slots below.
export const PROVIDER_DEFS = [
  { id: "openai", prefix: "OPENAI", label: "OpenAI / GPT", short: "GPT", defaultModel: "gpt-5.1" },
  { id: "anthropic", prefix: "ANTHROPIC", label: "Anthropic / Claude", short: "Claude", defaultModel: "claude-sonnet-4-5" },
  { id: "google", prefix: "GOOGLE", label: "Google / Gemini", short: "Gemini", defaultModel: "gemini-2.5-pro" },
  // "Perplexity / Sonar", not bare "Perplexity": this integration speaks the
  // Sonar API only. Perplexity's Agent API (third-party models via
  // /v1/agent) is a different transport and is deliberately not supported —
  // see src/providers/perplexity.js.
  { id: "perplexity", prefix: "PERPLEXITY", label: "Perplexity / Sonar", short: "Sonar", defaultModel: "sonar-pro" },
  { id: "deepseek", prefix: "DEEPSEEK", label: "DeepSeek", short: "DeepSeek", defaultModel: "deepseek-chat" },
];

// Default provider for each fixed Scholar slot (any provider may be assigned
// to any slot in Settings; identity never changes with the assignment). These
// also define the legacy migration path: an old provider-based .env.local that
// only set OPENAI_MODEL / ANTHROPIC_MODEL / GOOGLE_MODEL maps cleanly onto
// slots 1 / 2 / 3.
const DEFAULT_SLOT_PROVIDERS = { 1: "openai", 2: "anthropic", 3: "google" };

// The provider's built-in safe default model, used when nothing else resolves.
function defaultModelFor(providerId) {
  return PROVIDER_DEFS.find((d) => d.id === providerId)?.defaultModel || "";
}

// Extracts the numeric index from a slot id ("scholar2" -> 2, 2 -> 2).
export function slotNumber(slot) {
  if (typeof slot === "number") return slot;
  const m = String(slot ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

// Centralized, defensive normalization of the three fixed Scholar slots.
//
// The rest of the backend (and publicConfig) consume THIS instead of trusting
// raw config/env. It always returns the canonical three-slot array
//   [{ slot: "scholar1", enabled, provider, model }, ...]
// no matter what it is handed: a missing array, a malformed entry, an unknown
// provider, a blank model, or a legacy provider-based config. It never throws
// and never returns fewer than three slots.
export function normalizeScholarSlots(cfg = {}) {
  const providers = cfg && typeof cfg.providers === "object" && cfg.providers ? cfg.providers : {};
  const providerIds = Object.keys(providers);
  const raw = Array.isArray(cfg.scholarSlots) ? cfg.scholarSlots : [];
  const firstProvider = providerIds[0] || PROVIDER_DEFS[0].id;

  return SCHOLAR_SLOTS.map((n) => {
    const slotId = `scholar${n}`;
    const rawSlot =
      raw.find((s) => s && (s.slot === slotId || slotNumber(s.slot) === n)) || {};

    // Provider: a valid, known provider wins; else this slot's legacy default;
    // else the first available provider. Never leaves an unknown value.
    let provider = typeof rawSlot.provider === "string" ? rawSlot.provider.trim() : "";
    if (!provider || !providers[provider]) {
      const legacy = DEFAULT_SLOT_PROVIDERS[n];
      provider = providers[legacy] ? legacy : firstProvider;
    }

    // Model: explicit slot model → provider's configured model → provider's
    // safe default. Always resolves to a concrete, non-empty string.
    let model = typeof rawSlot.model === "string" ? rawSlot.model.trim() : "";
    if (!model) model = providers[provider]?.model || defaultModelFor(provider);

    const enabled = rawSlot.enabled === undefined ? true : Boolean(rawSlot.enabled);

    return { slot: slotId, enabled, provider, model };
  });
}

// Themes the application supports (Settings → General → Theme). "dark" is the
// current brown & gold interface; "light" reuses the parchment palette. Future
// themes register here plus one [data-theme="…"] token block in style.css.
export const SUPPORTED_THEMES = ["dark", "light"];
const DEFAULT_THEME = "dark";

// The active Scene's Workspace theme, injected once at boot and again after
// every Scene save. null until then, which publicConfig reports as-is: the
// frontend falls back to the stylesheet's own Classic block, so a failure
// here leaves the UI looking exactly as it does today rather than blank.
let runtimeSceneTheme = null;

export function setSceneTheme(theme) {
  runtimeSceneTheme = theme && typeof theme === "object" ? theme : null;
}

// First-launch interface language: detect the system language when nothing is
// saved yet; anything that isn't a supported Chinese locale falls back to
// English. Runs on the local backend, which shares the machine (and locale)
// with the UI.
function detectSystemLanguage() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (/^zh/i.test(locale)) return "zh-TW";
  } catch {
    // Detection is best-effort only.
  }
  return "en";
}

export const config = {};

export function reloadConfig() {
  const fileVars = {
    ...parseEnvFile(path.join(projectRoot, ".env")),
    ...parseEnvFile(envFilePath),
  };
  const env = (key, fallback = "") => {
    const value = fileVars[key] ?? process.env[key];
    return value === undefined || value === "" ? fallback : value;
  };

  config.port = Number(env("PORT")) || 8477;
  // Empty until the player explicitly connects one from the header (Milestone
  // 5C: Vault System) — no hardcoded personal default ships in the app.
  config.vaultPath = env("VAULT_PATH", "");
  // Active Vault Adapter for saving Sessions. Only "local" exists today;
  // future adapters (drive, folder, onedrive) register in src/vault/index.js.
  config.vaultAdapter = env("VAULT_ADAPTER", "local");
  // Optional Obsidian integration: the user's existing Obsidian vault folder.
  // Completely optional — the built-in Vault above is the primary knowledge
  // system and everything works with this left empty. Writes into this folder
  // are confined to aether-vault/ via src/vault/obsidianVault.js — never use
  // node:fs against this path directly (docs/technical/obsidian-integration.md).
  config.obsidianVaultPath = env("OBSIDIAN_VAULT_PATH", "");
  // Whether the Obsidian integration is currently ON. Defaults to off. The
  // remembered path above is retained while disabled but must not be used.
  config.obsidianIntegration = env("OBSIDIAN_INTEGRATION") === "true";
  // Automatic export after every native Vault save. Defaults to off, only
  // acts while the integration is enabled (the preference itself survives a
  // disable/enable cycle).
  config.obsidianAutoExport = env("OBSIDIAN_AUTO_EXPORT") === "true";
  config.providers = Object.fromEntries(
    PROVIDER_DEFS.map((def) => [
      def.id,
      {
        apiKey: env(`${def.prefix}_API_KEY`),
        model: env(`${def.prefix}_MODEL`, def.defaultModel),
      },
    ])
  );
  // Developer tools (the F8 Scene Editor — see devtools/). Enabled for every
  // local/dev run and HARD-DISABLED in production builds: with
  // NODE_ENV=production the flag is false regardless of anything else, the
  // /dev static mount and /api/dev/* routes are never registered
  // (server.js), and the frontend never loads the editor script or its F8
  // shortcut (app.js checks this flag from /api/config). DEV_TOOLS=false
  // also turns it off explicitly for a non-production run.
  config.devTools = process.env.NODE_ENV === "production" ? false : env("DEV_TOOLS", "true") !== "false";
  // Provider-call timeout architecture (src/providers/timeouts.js): three
  // separate phases instead of one fixed deadline. connect = until the
  // provider starts responding; inactivity = the longest silence tolerated
  // BETWEEN stream events once it has (activity resets it); task = the hard
  // ceiling per request kind (normal / reasoning models / file analysis or
  // long context). All overridable in .env.local; a request is never killed
  // just because time passed while tokens are still arriving.
  config.timeouts = {
    connectMs: Number(env("TIMEOUT_CONNECT_MS")) || 45_000,
    inactivityMs: Number(env("TIMEOUT_INACTIVITY_MS")) || 90_000,
    taskNormalMs: Number(env("TIMEOUT_TASK_NORMAL_MS")) || 120_000,
    taskReasoningMs: Number(env("TIMEOUT_TASK_REASONING_MS")) || 300_000,
    taskFileMs: Number(env("TIMEOUT_TASK_FILE_MS")) || 600_000,
  };
  // Council Model Pre-check (Settings → Council Model Check). Off by default
  // — an explicit opt-in, since the check itself spends a small amount of
  // the player's own API credit (BYOK). councilAckSignature is the
  // fingerprint (see councilConfigSignature() below) of the Council
  // configuration the player last acknowledged (either by completing a
  // pre-check or explicitly choosing "Start Without Checking") — the ONLY
  // state the "first send / configuration changed" notice needs; see
  // publicConfig() for how the frontend compares it against the CURRENT
  // signature without ever being told an API key.
  config.councilAutoCheck = env("COUNCIL_AUTO_CHECK") === "true";
  config.councilAckSignature = env("COUNCIL_ACK_SIGNATURE", "");
  // Which provider acts as the Judge; falls back to any configured provider.
  config.judgeProvider = env("JUDGE_PROVIDER", "anthropic");
  // Optional explicit model for the Judge (the Grand Sage). Blank = use the
  // judge provider's configured/default model. The internal Judge architecture
  // is unchanged; this only lets the assignment pick a specific model.
  config.judgeModel = env("JUDGE_MODEL");
  // Interface language: the entire application UI (labels, dialogs, tooltips,
  // in-world identity names) follows this. It NEVER affects AI responses.
  // Unset (first launch) = detect from the system locale.
  const rawInterfaceLanguage = env("INTERFACE_LANGUAGE");
  config.interfaceLanguage = supportedInterfaceLanguages().includes(rawInterfaceLanguage)
    ? rawInterfaceLanguage
    : detectSystemLanguage();
  // Theme: application appearance only. Unknown values fall back to dark (the
  // default brown & gold interface).
  const rawTheme = env("UI_THEME");
  config.theme = SUPPORTED_THEMES.includes(rawTheme) ? rawTheme : DEFAULT_THEME;
  // Whether the user has actually CHOSEN an appearance, as opposed to being
  // shown the default. A Scene's theme.defaultMode seeds the appearance only
  // for someone who never picked one — loading a Scene must not flip a
  // preference somebody explicitly saved.
  config.themeIsUserSet = SUPPORTED_THEMES.includes(rawTheme);
  // Display language for the Grand Sage: ONLY the language the Sage writes its
  // final ruling in. It never changes UI text (that is interfaceLanguage), and
  // Scholars still answer in the language of the user's question.
  // Default Reply Language: the language EVERY AI response defaults to —
  // Scholars, the Grand Sage, Mentor, Quick Questions and follow-ups alike.
  // A user who names a language in their own prompt overrides it for that
  // request only. DISPLAY_LANGUAGE is read as a fallback so an existing
  // .env.local keeps its configured value across this rename; the new key
  // is the only one ever written (see settings.js FIELD_TO_ENV).
  //
  // The final fallback is DEFAULT_REPLY_LANGUAGE ("en"), NOT DEFAULT_LANGUAGE
  // ("zh-TW"). The latter is the locale/identity fallback and answers a
  // different question; sharing it here meant a fresh install instructed every
  // Scholar and the Grand Sage to answer in Traditional Chinese before the
  // user had chosen anything. Only this last step changed — a saved
  // DEFAULT_REPLY_LANGUAGE, and the legacy DISPLAY_LANGUAGE, still win, so an
  // existing install keeps exactly the language it had.
  config.defaultReplyLanguage = env("DEFAULT_REPLY_LANGUAGE", env("DISPLAY_LANGUAGE", DEFAULT_REPLY_LANGUAGE));
  // Fixed Scholar slots #1–#3: which provider (and optionally which model)
  // answers as each character. Read the raw values from the environment, then
  // run them through the centralized normalizer so config.scholarSlots is
  // ALWAYS the canonical, valid three-slot array — migrating legacy/blank/
  // malformed configs instead of trusting them.
  const rawScholarSlots = SCHOLAR_SLOTS.map((slot) => ({
    slot: `scholar${slot}`,
    enabled: env(`SCHOLAR${slot}_ENABLED`) !== "false",
    provider: env(`SCHOLAR${slot}_PROVIDER`, DEFAULT_SLOT_PROVIDERS[slot]),
    model: env(`SCHOLAR${slot}_MODEL`),
  }));
  config.scholarSlots = normalizeScholarSlots({
    providers: config.providers,
    scholarSlots: rawScholarSlots,
  });

  // Provider enable state controls whether a provider is offered as an
  // assignment option in Settings. Explicit <PREFIX>_ENABLED wins; otherwise it
  // migrates to enabled when the provider has a key or is assigned to the Judge
  // or a Scholar. A provider that IS assigned is always forced enabled so an
  // existing assignment can never be silently broken.
  for (const def of PROVIDER_DEFS) {
    const p = config.providers[def.id];
    // Assigned = the Judge's provider, or an ENABLED Scholar's provider. A
    // disabled Scholar slot does not force-enable its provider, so a provider
    // can be disabled once its Scholar slots are turned off.
    const assigned =
      config.judgeProvider === def.id ||
      config.scholarSlots.some((s) => s.provider === def.id && s.enabled !== false);
    const raw = env(`${def.prefix}_ENABLED`);
    let enabled;
    if (assigned) enabled = true;
    else if (raw === "true") enabled = true;
    else if (raw === "false") enabled = false;
    else enabled = Boolean(p.apiKey); // migration default
    p.enabled = enabled;
  }

  // Librarian retrieval limits — token efficiency is the priority.
  config.librarian = {
    tokenBudget: Number(env("LIBRARIAN_TOKEN_BUDGET")) || 2000,
    maxDomains: 3,
    maxFiles: 4,
    maxFileTokens: 600,
  };
}

reloadConfig();

export function envFileExists() {
  return fs.existsSync(envFilePath);
}

// A short, one-way, non-secret fingerprint of an API key — changes whenever
// the key changes, never lets the key be recovered. Lets the frontend detect
// "a relevant API credential changed" (Council Model Pre-check, §2) for its
// configuration-signature comparison without the backend ever sending the
// key itself (API keys are write-only to the frontend — see settings.js).
// Empty/missing key -> empty fingerprint, its own distinct, stable value.
function keyFingerprint(apiKey) {
  if (!apiKey) return "";
  return crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

// Safe view for the frontend: reports which keys are configured, never the keys.
export function publicConfig() {
  const judgeModel = config.judgeModel || config.providers[config.judgeProvider]?.model || "";
  return {
    vaultPath: config.vaultPath,
    envFileExists: envFileExists(),
    // Batch B (About dialog): sourced from package.json via appVersion above,
    // never a second hardcoded literal.
    appVersion,
    // Official links are NOT here: they belong to the product configuration
    // (config/product.json, served by GET /api/product). Keeping a second
    // copy in publicConfig would reintroduce exactly the ambiguity the
    // ownership refactor removed.
    // Dev-only Scene Editor gate — false in production, where the editor's
    // files and routes don't exist either (see config.devTools above).
    devTools: config.devTools,
    judgeProvider: config.judgeProvider,
    judgeModel,
    interfaceLanguage: config.interfaceLanguage,
    theme: config.theme,
    themeIsUserSet: config.themeIsUserSet,
    // The active Scene's Workspace theme — the SCENE owns it (see
    // services/worldContent.js), so it is injected here at boot and on save
    // rather than read from a file per request. Same chokepoint pattern as
    // setWorldIdentity: publicConfig stays synchronous.
    sceneTheme: runtimeSceneTheme,
    defaultReplyLanguage: config.defaultReplyLanguage,
    vaultAdapter: config.vaultAdapter,
    // Council Model Pre-check preference + last-acknowledged configuration
    // fingerprint (see councilAutoCheck/councilAckSignature above) — the
    // frontend computes the CURRENT signature itself from scholarSlots +
    // judgeProvider/judgeModel + each provider's keyFingerprint below (never
    // an API key) and compares it against this one to decide whether the
    // "first send / configuration changed" notice is due.
    councilAutoCheck: config.councilAutoCheck,
    councilAckSignature: config.councilAckSignature,
    // In-world identities + localized UI strings follow the INTERFACE language
    // (defaultReplyLanguage sets the language of AI RESPONSES, never the UI).
    identity: identityFor(config.interfaceLanguage),
    strings: uiStringsFor(config.interfaceLanguage),
    // Batch B: Learn / User Guide content for the active interface
    // language (structured sections — see learnSectionsFor()).
    learnSections: learnSectionsFor(config.interfaceLanguage),
    // Official English identity titles ("The Architect" …) for hover cards —
    // shown in every language.
    identityTitles: identityTitles(),
    // Available interface languages [{ id, label }] — the Settings dropdown is
    // built from this, so a new locale file appears automatically.
    interfaceLanguages: interfaceLanguageOptions(),
    // Scholar slot assignments the UI renders. Re-normalized here so the wire
    // payload is guaranteed to be a valid three-slot array even if
    // config.scholarSlots were somehow mangled at runtime — publicConfig must
    // never hand the frontend a missing/partial scholarSlots.
    scholarSlots: normalizeScholarSlots(config).map((s) => {
      const p = config.providers[s.provider];
      const providerEnabled = Boolean(p?.enabled);
      const configured = Boolean(p?.apiKey);
      return {
        // Numeric slot for identity lookup / DOM attributes, plus the canonical
        // string id and enabled flag.
        slot: slotNumber(s.slot),
        slotId: s.slot,
        enabled: s.enabled,
        provider: s.provider,
        model: s.model,
        configured,
        providerEnabled,
        // A slot can start a session only when its provider is enabled and keyed.
        ready: providerEnabled && configured,
      };
    }),
    providers: Object.fromEntries(
      PROVIDER_DEFS.map((def) => {
        const p = config.providers[def.id];
        return [
          def.id,
          {
            configured: Boolean(p.apiKey),
            enabled: Boolean(p.enabled),
            model: p.model,
            label: def.label,
            short: def.short,
            // Non-secret — see keyFingerprint() above. "" when no key is set.
            keyFingerprint: keyFingerprint(p.apiKey),
          },
        ];
      })
    ),
  };
}
