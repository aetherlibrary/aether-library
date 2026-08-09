// How a finished run is PRESENTED — the one place that decides what the
// workspace says after a run ends.
//
// This exists because "no usable answer" and "the user stopped it" rendered
// identically: the client only asked "did any tab succeed?", so pressing Stop
// produced the provider-failure treatment — status "error", a "Model
// unavailable" panel, and guidance to pick a different model. None of that is
// true of a cancellation: the user cancelled, and the models may be perfectly
// healthy.
//
// CANONICAL OUTCOME PRIORITY (highest first):
//   1. user cancellation      — always wins; it explains everything after it
//   2. provider/model failure — a real terminal failure the user should act on
//   3. insufficient results   — nothing usable came back
//   4. successful completion
//
// public/app.js mirrors this inline (it cannot import); this module is the
// tested source of truth and test/runPresentation.test.js keeps the two
// honest.

// Terminal run outcomes recorded on the Session (see startSession()).
export const RUN_OUTCOMES = ["completed", "stopped", "continued_with_failures", "insufficient_results"];

// kind:   what the workspace should say happened
// status: the Session status badge value
// showProviderFailureGuidance:
//         whether to show the "Model unavailable / choose another model"
//         panel. NEVER true for a cancellation — that is the actual bug this
//         module fixes.
// messageKey: localization key for the one-line summary (null = say nothing
//         beyond the normal render)
export function presentRunOutcome({ outcome, anyAnswerOk = false } = {}) {
  // 1. User cancellation outranks everything, including "nothing came back":
  //    a run stopped before any Scholar answered has no usable results BY
  //    DEFINITION, and reporting that as a model failure is exactly wrong.
  if (outcome === "stopped") {
    return {
      kind: "stopped",
      status: "stopped",
      showProviderFailureGuidance: false,
      messageKey: "generationStopped",
    };
  }

  // 2/3. Nothing usable came back from a run that was NOT cancelled — a real
  //      provider/model problem the player can act on.
  if (outcome === "insufficient_results" || !anyAnswerOk) {
    return {
      kind: "insufficient",
      status: "error",
      showProviderFailureGuidance: true,
      messageKey: "noUsableResponses",
    };
  }

  // 4. Completed — either cleanly, or with the player's explicit authorization
  //    to proceed without a failed Scholar.
  if (outcome === "continued_with_failures") {
    return {
      kind: "continued_with_failures",
      status: "active",
      showProviderFailureGuidance: false,
      messageKey: "continuedWithout",
    };
  }
  return { kind: "completed", status: "active", showProviderFailureGuidance: false, messageKey: null };
}

// A Scholar result's display state. A cancelled Scholar is NOT a failed one —
// it never got the chance to answer, so it must never be rendered with
// failure treatment or counted as evidence a model is unavailable.
export function scholarDisplayState(scholar) {
  if (!scholar) return "unknown";
  if (scholar.status === "cancelled") return "stopped";
  if (scholar.status === "ok") return "ok";
  return "failed";
}
