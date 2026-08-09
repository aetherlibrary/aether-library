// ONE shared, read-only status representation for the Core Book's AI status
// section and the Product Status view (Batch A). Both UIs consume this — no
// component re-derives provider/model readiness on its own.
//
// Pure, synchronous, and side-effect free BY DESIGN: it only reshapes data the
// frontend already holds (publicConfig + the vault status it already fetched).
// It never performs a network request, so rendering either UI cannot cause
// provider API usage — the explicit requirement that opening the Core Book
// must not spend the player's credit. public/app.js mirrors nothing here; it
// imports the shape via a small global bridge (this file is also the
// Node-testable home, same convention as animationPlayback.js /
// animationBehavior.js / appSplitLayout.js).
//
// Never sees an API key: publicConfig already reduces credentials to
// `configured: Boolean(apiKey)` plus a non-secret `keyFingerprint`, and this
// module consumes only those.

// ---------------------------------------------------------------- providers
// "Configured" means credentials exist — NOT that the provider/model passed
// the Council Model Pre-check. The two are deliberately separate: a key can
// be present and the model still be wrong/retired, which is exactly what the
// pre-check exists to catch.
export function providerStatusList(cfg = {}) {
  const providers = cfg.providers && typeof cfg.providers === "object" ? cfg.providers : {};
  return Object.entries(providers).map(([id, p]) => ({
    id,
    label: p?.label || id,
    configured: Boolean(p?.configured),
    // A provider can be keyed but switched off in Settings; the Core Book
    // shows `configured`, while readiness math below needs both.
    enabled: Boolean(p?.enabled),
    ready: Boolean(p?.configured) && Boolean(p?.enabled),
  }));
}

// ------------------------------------------------------------ model check
// The honest state model, derived STRICTLY from what the existing pre-check
// feature actually persists (config.councilAckSignature) plus what this page
// load has observed. Nothing new is invented or fabricated.
//
// What the existing architecture really stores, confirmed by reading the
// feature end to end:
//   * councilAckSignature is written when a check PASSES (send-time gate and
//     the manual Settings check both persist on result.ok) …
//   * … AND ALSO when the player explicitly chooses "Start Without Checking"
//     — an informed skip counts as acknowledging that configuration.
//   * A FAILED check deliberately persists NOTHING, so that the same broken
//     configuration is caught again next time.
//   * No timestamp of any kind is persisted anywhere.
//
// Consequences this module refuses to paper over:
//   * A persisted acknowledgement alone CANNOT prove "passed" — it may be a
//     skip. Across a reload, "acknowledged" is the strongest honest claim.
//   * "failed" is only knowable within the session that observed it.
// `observed` therefore carries the precise, session-scoped outcome when this
// page load actually ran a check, and takes precedence only while it still
// describes the CURRENT configuration signature.
export const MODEL_CHECK = {
  NOT_CHECKED: "not_checked",
  PASSED: "passed",
  ACKNOWLEDGED: "acknowledged",
  NEEDS_RECHECK: "needs_recheck",
  FAILED: "failed",
};

export function modelCheckStatus({ ackSignature = "", currentSignature = "", observed = null } = {}) {
  // Session-observed outcome wins, but only for the configuration it was
  // actually observed against — changing a model invalidates it immediately.
  if (observed && observed.signature && observed.signature === currentSignature) {
    if (observed.result === "failed") return { state: MODEL_CHECK.FAILED, fromSession: true };
    if (observed.result === "passed") return { state: MODEL_CHECK.PASSED, fromSession: true };
  }
  if (!ackSignature) return { state: MODEL_CHECK.NOT_CHECKED, fromSession: false };
  if (!currentSignature || ackSignature !== currentSignature) {
    return { state: MODEL_CHECK.NEEDS_RECHECK, fromSession: false };
  }
  // Acknowledged for exactly this configuration — but see the note above:
  // this cannot distinguish a pass from an informed skip once reloaded.
  return { state: MODEL_CHECK.ACKNOWLEDGED, fromSession: false };
}

// --------------------------------------------------------------- council
// Grand Sage + the three Scholar slots, each with its resolved provider/model
// and whether that assignment could actually start a session. Council mode
// deliberately does NOT require three distinct providers — several slots may
// share one, so readiness is evaluated per slot, never by counting providers.
export function councilAssignments(cfg = {}) {
  const providers = cfg.providers && typeof cfg.providers === "object" ? cfg.providers : {};
  const judgeProvider = cfg.judgeProvider || "";
  const jp = providers[judgeProvider];
  const scholars = Array.isArray(cfg.scholarSlots) ? cfg.scholarSlots : [];
  return {
    judge: {
      provider: judgeProvider,
      label: jp?.label || judgeProvider,
      model: cfg.judgeModel || jp?.model || "",
      configured: Boolean(jp?.configured),
      ready: Boolean(jp?.configured) && Boolean(jp?.enabled),
    },
    scholars: scholars.map((s) => ({
      slot: s.slot,
      provider: s.provider,
      label: providers[s.provider]?.label || s.provider,
      model: s.model,
      enabled: s.enabled !== false,
      configured: Boolean(s.configured),
      // publicConfig already computes this (providerEnabled && configured);
      // recomputed defensively so a partial payload can't read as ready.
      ready: Boolean(s.ready) || (Boolean(s.configured) && Boolean(s.providerEnabled)),
    })),
  };
}

// ------------------------------------------------------------------ vault
// Mirrors the vault status the app already fetched — never re-probes disk.
export function vaultStatus(vault = {}) {
  return {
    configured: Boolean(vault.configured),
    exists: Boolean(vault.exists),
    path: typeof vault.path === "string" ? vault.path : "",
  };
}

// -------------------------------------------------------------- aggregate
// The single object both UIs render from.
export function buildProductStatus({ config = {}, vault = {}, currentSignature = "", observed = null } = {}) {
  return {
    providers: providerStatusList(config),
    council: councilAssignments(config),
    modelCheck: modelCheckStatus({
      ackSignature: config.councilAckSignature || "",
      currentSignature,
      observed,
    }),
    autoCheck: Boolean(config.councilAutoCheck),
    vault: vaultStatus(vault),
  };
}
