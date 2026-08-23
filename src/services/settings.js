// Settings service: updates .env.local from the UI and hot-reloads config.
// API keys are write-only through this path — they are stored in .env.local
// (gitignored) and never echoed back to the frontend.

import fs from "node:fs";
import { config, envFilePath, reloadConfig, slotNumber, PROVIDER_DEFS, SUPPORTED_THEMES } from "../config.js";
import {
  SCHOLAR_SLOTS,
  identityFor,
  replyLanguageValues,
  supportedInterfaceLanguages,
} from "../localization.js";

// Field map generated from the provider registry — new providers get
// settings support automatically.
const FIELD_TO_ENV = {
  // General (application) settings — independent of any AI setting.
  interfaceLanguage: "INTERFACE_LANGUAGE",
  theme: "UI_THEME",
  // Grand Sage (AI) settings.
  judgeProvider: "JUDGE_PROVIDER",
  judgeModel: "JUDGE_MODEL",
  defaultReplyLanguage: "DEFAULT_REPLY_LANGUAGE",
  // Council Model Pre-check (see config.js's councilAutoCheck/
  // councilAckSignature comment). councilAckSignature is written silently
  // by the frontend right after the player's "Check & Start" / "Start
  // Without Checking" choice — same POST /api/settings path as every other
  // setting, just not driven by the visible Settings form submit.
  councilAutoCheck: "COUNCIL_AUTO_CHECK",
  councilAckSignature: "COUNCIL_ACK_SIGNATURE",
  vaultPath: "VAULT_PATH",
  obsidianVaultPath: "OBSIDIAN_VAULT_PATH",
  obsidianIntegration: "OBSIDIAN_INTEGRATION",
  obsidianAutoExport: "OBSIDIAN_AUTO_EXPORT",
};
for (const def of PROVIDER_DEFS) {
  FIELD_TO_ENV[`${def.id}ApiKey`] = `${def.prefix}_API_KEY`;
  FIELD_TO_ENV[`${def.id}Model`] = `${def.prefix}_MODEL`;
  FIELD_TO_ENV[`${def.id}Enabled`] = `${def.prefix}_ENABLED`;
}
// Scholar slot assignments: which provider/model answers as each character.
for (const slot of SCHOLAR_SLOTS) {
  FIELD_TO_ENV[`scholar${slot}Provider`] = `SCHOLAR${slot}_PROVIDER`;
  FIELD_TO_ENV[`scholar${slot}Model`] = `SCHOLAR${slot}_MODEL`;
  FIELD_TO_ENV[`scholar${slot}Enabled`] = `SCHOLAR${slot}_ENABLED`;
}

// Blank or missing fields keep their current value, so the UI can submit
// only what changed and never needs to hold the existing keys.
export function saveSettings(input = {}) {
  const updates = {};
  for (const [field, envKey] of Object.entries(FIELD_TO_ENV)) {
    const value = input[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (/[\r\n]/.test(trimmed)) throw new Error(`Invalid characters in ${field}.`);
    updates[envKey] = trimmed;
  }

  if (updates.JUDGE_PROVIDER && !config.providers[updates.JUDGE_PROVIDER]) {
    throw new Error(`judgeProvider must be one of: ${Object.keys(config.providers).join(", ")}`);
  }
  // Validated against replyLanguageValues(), not the identity packs: "match"
  // is a policy rather than a locale, so it has no pack — checking packs alone
  // would reject the option the dropdown offers first.
  if (updates.DEFAULT_REPLY_LANGUAGE && !replyLanguageValues().includes(updates.DEFAULT_REPLY_LANGUAGE)) {
    throw new Error(`defaultReplyLanguage must be one of: ${replyLanguageValues().join(", ")}`);
  }
  if (updates.INTERFACE_LANGUAGE && !supportedInterfaceLanguages().includes(updates.INTERFACE_LANGUAGE)) {
    throw new Error(`interfaceLanguage must be one of: ${supportedInterfaceLanguages().join(", ")}`);
  }
  if (updates.UI_THEME && !SUPPORTED_THEMES.includes(updates.UI_THEME)) {
    throw new Error(`theme must be one of: ${SUPPORTED_THEMES.join(", ")}`);
  }
  for (const slot of SCHOLAR_SLOTS) {
    const assigned = updates[`SCHOLAR${slot}_PROVIDER`];
    if (assigned && !config.providers[assigned]) {
      throw new Error(`scholar${slot}Provider must be one of: ${Object.keys(config.providers).join(", ")}`);
    }
  }

  // Guard against orphaning an assignment: a provider that ends up assigned to
  // the Grand Sage or a Scholar in the resulting state must not be disabled.
  // (The UI already prevents this; this is the backend safety net.)
  assertNoDisabledAssignment(updates);

  if (Object.keys(updates).length > 0) {
    upsertEnvFile(updates);
    reloadConfig();
  }
  return { updated: Object.keys(updates) };
}

function assertNoDisabledAssignment(updates) {
  // Error messages surface in the UI, so names follow the interface language.
  const lang = updates.INTERFACE_LANGUAGE || config.interfaceLanguage;
  const identity = identityFor(lang);

  const finalEnabled = (id) => {
    const def = PROVIDER_DEFS.find((d) => d.id === id);
    const key = `${def?.prefix}_ENABLED`;
    if (key in updates) return updates[key] !== "false";
    return Boolean(config.providers[id]?.enabled);
  };

  // The Judge always counts as an assignment (there is always a Grand Sage).
  const judgeProvider = updates.JUDGE_PROVIDER || config.judgeProvider;
  if (!finalEnabled(judgeProvider)) {
    throw new Error(`This Provider is currently assigned to ${identity.judge}.`);
  }
  // A Scholar only counts if it is still ENABLED in the resulting state — a
  // disabled Scholar slot never blocks disabling its provider, so the UI can
  // disable the slots and then the provider in one save.
  for (const slot of SCHOLAR_SLOTS) {
    const current = config.scholarSlots.find((s) => slotNumber(s.slot) === slot);
    const scholarEnabled =
      `SCHOLAR${slot}_ENABLED` in updates
        ? updates[`SCHOLAR${slot}_ENABLED`] !== "false"
        : current?.enabled !== false;
    if (!scholarEnabled) continue;
    const provider = updates[`SCHOLAR${slot}_PROVIDER`] || current?.provider;
    if (provider && !finalEnabled(provider)) {
      throw new Error(`This Provider is currently assigned to ${identity.scholars[slot]}.`);
    }
  }
}

// Updates keys in place, preserving comments and unrelated lines.
// Creates .env.local if it does not exist yet.
function upsertEnvFile(updates) {
  let lines;
  if (fs.existsSync(envFilePath)) {
    lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);
  } else {
    lines = [
      "# Aether Library local configuration.",
      "# This file holds API keys - it is gitignored; never commit it.",
      "",
    ];
  }

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    const idx = lines.findIndex((line) => pattern.test(line));
    const entry = `${key}=${value}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  fs.writeFileSync(envFilePath, lines.join("\n") + "\n", "utf8");
}
