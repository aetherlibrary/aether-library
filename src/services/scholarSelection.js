// Active Scholar selection — which Scholars a run will actually use.
//
// This exists because selection was previously DERIVED from provider
// configuration: every rebuild of the Scholar picker cleared the selection
// and re-added every configured, ready, enabled slot. Any Settings save (or
// anything else that refreshed config) therefore silently rewrote the
// player's choice — in Mentor mode a single chosen Scholar became all three,
// and in Council mode a deliberately deselected Scholar came back and was
// executed, spending API credit the player had chosen not to spend.
//
// The four concepts are kept strictly apart here:
//
//   persona identity      — which character a slot is (never touched here)
//   provider/model        — what answers as that character (Settings)
//   readiness/pre-check   — whether that assignment COULD answer right now
//   active selection      — what the player actually chose to run
//
// Readiness may only ever REMOVE a slot that can no longer run. It may never
// add one. A default selection is derived only when there is no prior choice
// to honour — a first build, or an explicit Reset.
//
// public/app.js mirrors this logic inline (it cannot import); this module is
// the tested source of truth and test/scholarSelection.test.js keeps the two
// honest.

// Mentor mode runs exactly one Scholar. When several are selected — switching
// down from Council, or a legacy state — the lowest slot number wins. This
// matches the rule setMode() has always applied, so the behaviour players
// already know is unchanged.
export function narrowToSingle(slots) {
  const list = [...slots].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return list.length ? [list[0]] : [];
}

// The active selection after a picker rebuild.
//
//   mode        "single" | "council"
//   previous    the selection before this rebuild (empty on a first build)
//   ready       slots that CAN be selected at all (provider enabled + key)
//   eligible    slots a fresh default selection would use (ready + enabled)
//   reset       true to discard `previous` and take the defaults (Reset only)
//
// Returns a sorted array of slot numbers. Never returns an empty selection
// while anything is ready — an empty picker has no way forward for the player.
export function resolveScholarSelection({ mode, previous = [], ready = [], eligible = [], reset = false } = {}) {
  const readySet = new Set(ready.filter((n) => Number.isFinite(n)));
  const defaults = eligible.filter((n) => readySet.has(n));

  // Honour the existing choice, minus anything that can no longer run. A slot
  // that merely changed provider or model is still ready, so it survives —
  // that is the whole point of this function.
  let next = reset ? [] : previous.filter((n) => readySet.has(n));

  // Nothing left to honour (first build, Reset, or every chosen slot became
  // unavailable): fall back to the defaults so the picker is never empty.
  if (next.length === 0) next = [...defaults];
  // Still nothing eligible, but something is selectable — never strand the
  // player with an empty picker.
  if (next.length === 0 && readySet.size > 0) next = [Math.min(...readySet)];

  if (mode === "single") next = narrowToSingle(next);
  return [...new Set(next)].sort((a, b) => a - b);
}
