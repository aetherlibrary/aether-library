// Vault Adapter registry. The Session Engine asks here for the active adapter
// and never imports a concrete adapter directly — so adding Google Drive,
// Browser Folder, or OneDrive later is a registry entry, not an engine change.
//
// Only LocalVaultAdapter exists today. Future adapters are intentionally not
// implemented yet.

import { config } from "../config.js";
import { localVaultAdapter } from "./localVaultAdapter.js";

const ADAPTERS = {
  local: localVaultAdapter,
};

// Falls back to the local adapter if an unknown one is configured.
export function getActiveAdapter() {
  return ADAPTERS[config.vaultAdapter] || localVaultAdapter;
}

export function listAdapters() {
  return Object.values(ADAPTERS).map((a) => ({ id: a.id, label: a.label }));
}
