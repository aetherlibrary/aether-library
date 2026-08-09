// Clickable NPC interaction — the pure decision logic behind clicking a
// Character in the scene.
//
// Two things live here, both deliberately free of DOM/timer/fetch access so
// they are testable in Node and identical between any runtime that needs
// them (public/app.js mirrors the constants inline, as it cannot import):
//
//   1. Which conversation target a clicked Role selects (Mentor + a Scholar
//      slot, or Council).
//   2. Whether a hover thought is currently allowed to appear, given the
//      clicked-dialogue bubble's higher priority.
//
// The Role -> Scholar slot relationship is NOT redeclared here. The runtime
// already owns exactly one authoritative table (SPEECH_SCHOLAR_ROLE_BY_SLOT
// in public/app.js, `{1:"alpha",2:"beta",3:"gamma"}`) plus a single sage Role
// id; both are passed IN and inverted below, so adding or renaming a Scholar
// slot stays a one-place change and this module can never disagree with it.

// Timing (Section 7). One scoped home for the three durations rather than
// literals buried at their call sites.
export const NPC_CLICK_ANIMATION_MS = 200; // subtle acknowledgement pop
export const NPC_CLICK_SCALE = 1.03; // peak of that pop
export const CLICKED_DIALOGUE_VISIBLE_MS = 1800; // fully-opaque hold
export const CLICKED_DIALOGUE_FADE_MS = 250; // fade-out after the hold

// Bubble priority, highest first. An active session's own state bubbles
// always win; clicked dialogue outranks both idle sources. Exported as data
// (not just encoded in ifs) so a test can assert the ORDER itself, not only
// one behaviour that happens to follow from it.
export const BUBBLE_PRIORITY = ["active_session", "clicked", "hover_thought", "idle_dialogue"];

export function bubblePriorityRank(kind) {
  const i = BUBBLE_PRIORITY.indexOf(kind);
  return i === -1 ? Number.POSITIVE_INFINITY : i; // unknown = lowest
}

// True when `candidate` may take the bubble away from `current`. Equal kinds
// are allowed to replace each other — that is what makes "click the same NPC
// again" restart, and "click a different NPC" hand over, without either
// needing a special case.
export function canBubbleReplace(current, candidate) {
  if (!current) return true;
  return bubblePriorityRank(candidate) <= bubblePriorityRank(current);
}

// { 1:"alpha", ... } -> { alpha:1, ... }. Slot keys arrive as object keys
// (strings) and are normalized back to numbers here, so callers always get a
// real slot number to hand to the existing scholar selection.
export function scholarSlotByRole(scholarRoleBySlot) {
  const out = {};
  for (const [slot, roleId] of Object.entries(scholarRoleBySlot || {})) {
    const n = Number(slot);
    if (roleId && Number.isFinite(n)) out[roleId] = n;
  }
  return out;
}

// What clicking `roleId` should select:
//   a Scholar Role -> { mode: "single", slot }   (Mentor, that Scholar)
//   the sage Role  -> { mode: "council", slot: null }
//   anything else  -> null (not a conversation participant; no mode change)
//
// Returning null rather than throwing matters: a Role with no conversation
// meaning (a future pet/traveler NPC) must still be safely clickable.
export function npcClickIntent(roleId, { scholarRoleBySlot, sageRoleId } = {}) {
  if (!roleId) return null;
  if (sageRoleId && roleId === sageRoleId) return { mode: "council", slot: null };
  const slot = scholarSlotByRole(scholarRoleBySlot)[roleId];
  if (slot === undefined) return null;
  return { mode: "single", slot };
}

// ------------------------------------------------- Council slot eligibility
//
// THE rule buildScholarPicker (public/app.js) already applies when it decides
// which Scholars a Council starts with — "every ready, enabled Scholar" —
// lifted here verbatim so the picker and the Omega click share one predicate
// instead of two that could drift. Nothing new is enabled by it: an unready
// slot (provider disabled, or no API key) is never eligible, exactly as the
// chip it renders is never selectable.
//
// `ready` is the backend's own restored verdict when present; the fallback
// mirrors the picker's, and never assumes readiness it wasn't told about.
export function isScholarSlotReady(slot, provider) {
  if (!slot) return false;
  const providerEnabled =
    slot.providerEnabled ??
    (provider && provider.enabled !== undefined ? Boolean(provider.enabled) : Boolean(slot.configured));
  return Boolean(slot.ready ?? (providerEnabled && slot.configured));
}

export function isCouncilEligibleSlot(slot, provider) {
  return isScholarSlotReady(slot, provider) && slot.enabled !== false;
}

// Every eligible slot number, ascending. `providers` is the config's provider
// map, looked up per slot exactly as the picker does.
export function councilEligibleSlots(slots, providers = {}) {
  return (Array.isArray(slots) ? slots : [])
    .filter((s) => isCouncilEligibleSlot(s, providers[s?.provider]))
    .map((s) => Number(s.slot))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

// Whether a hover thought may be shown right now.
//
// `suppressedRoleId` is the Role most recently clicked, and stays suppressed
// until the pointer LEAVES it and comes back (the caller clears it on
// pointer-out). Without that, a clicked dialogue expiring under a stationary
// pointer would immediately be replaced by a hover thought — the pointer
// never moved, so the player would read it as the click "bouncing".
//
// A clicked bubble anywhere blocks every hover thought, not just the clicked
// Role's own: only one Character bubble is ever visible at a time, so a
// second Character's hover would have to steal it from a higher-priority
// state.
export function canShowHoverThought({ idleMode, clickedRoleId, suppressedRoleId, roleId } = {}) {
  if (idleMode !== "pre") return false; // active/post own the bubble entirely
  if (clickedRoleId) return false; // clicked dialogue outranks hover
  if (suppressedRoleId && suppressedRoleId === roleId) return false; // needs a re-entry first
  return true;
}
