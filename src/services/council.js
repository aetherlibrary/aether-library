// Council pipeline: Scholars answer independently in parallel,
// then a Judge compares and synthesizes whatever answers are available.
// The Archivist stage is intentionally not implemented yet.

import { randomUUID } from "node:crypto";
import { config, slotNumber } from "../config.js";
import { providers } from "../providers/index.js";
import { resolveTimeoutProfile, isReasoningModel, USER_CANCELLED_CODE } from "../providers/timeouts.js";
import { classifyProviderError } from "../providers/errors.js";
import {
  identityFor,
  defaultReplyLanguageRule,
  formatPersonaName,
  formatScholarNameList,
  personaIdForSlot,
  personaIdForJudge,
} from "../localization.js";
import { retrieveVaultContext } from "./librarian.js";
import {
  normalizeMaterials,
  materialsBlock,
  imageParts,
  materialsMetadata,
  continuationLineageFrom,
} from "./materials.js";
import { startSession, getActiveSession } from "./sessionEngine.js";
import { archiveSession } from "./archives.js";

// In-world identities come from the localization layer (localization.js) and
// follow the app's Default Reply Language. Provider names must not appear in
// generated responses; which provider answers as which Scholar is decided by
// config.scholarSlots and never affects the character.

export function scholarSystem(persona) {
  return [
    `You are ${persona}, a Scholar of the Aether Library — an independent researcher in a private council.`,
    "",
    "Your working method: \"I first examine the user's own library. If useful information exists, I incorporate it. If not, I answer using my own expertise.\"",
    "",
    "The user's personal vault is optional context, NOT your knowledge boundary and NOT the only source of truth. Follow these rules:",
    "",
    "1. The user's question always comes first.",
    "2. If the context package contains vault excerpts relevant to the question, treat them as authoritative for the user's own facts, decisions, preferences, and prior work. Use them first — then expand, explain, analyze, compare, or critique with your own knowledge whenever useful.",
    "3. If no vault context is provided, or it is irrelevant to the question, ignore the vault entirely and answer normally from your own model knowledge, exactly like a capable standalone assistant. NEVER refuse or hold back an answer because the vault has no matching note.",
    "4. Treat the vault as a limit only when the question explicitly asks about the user's own information (e.g. \"What did I decide…\", \"What project am I working on?\", \"What does my governance document say?\"). In that case answer from the vault excerpts, and if they don't contain the requested information, say so plainly.",
    "5. If the question needs information newer than your knowledge, or something you cannot reliably know, give your best answer anyway and state your uncertainty clearly. Do not refuse.",
    "",
    "Knowledge priority: (1) the user's question, (2) relevant vault context if any, (3) your own knowledge.",
    "",
    // Default Reply Language (Settings → General) governs Scholars exactly
    // as it governs the Grand Sage — one shared rule, never a per-prompt
    // policy. Previously this was hard-wired to the question's own language.
    ...defaultReplyLanguageRule(config.defaultReplyLanguage, "answer"),
    "For Traditional Chinese answers: no English headings anywhere; English technical terms are allowed only inside parentheses after the Chinese term, e.g. 事件視界（Event Horizon）.",
    "Before returning your answer, verify that every part of it — headings included — follows the required language. Rewrite anything that does not.",
    "",
    "FORMATTING: keep answers readable — short paragraphs, simple headings, bullet points when useful. Prefer this shape:",
    "## 標題",
    "核心概念：",
    "- item",
    "- item",
    "形成原因：",
    "- item",
    "- item",
    "Do not use Markdown bold as a section label: write 關鍵特徵： or Key features:, never **關鍵特徵** or **Key features**. Bold should be extremely rare. Avoid deeply nested bullets.",
    "",
    "Be substantive but focused. If you are uncertain, say so explicitly.",
    `If you refer to yourself, use only the name ${persona}.`,
    "Never mention AI providers or model names (such as GPT, Claude, or Gemini) unless the user's question is directly about them.",
    "Other Scholars are answering the same question separately; do not speculate about them.",
  ].join("\n");
}

// The Grand Sage Constitution — the principles that govern how the Judge
// forms a ruling. Its founding principle: THE FORM OF WISDOM FOLLOWS THE
// NATURE OF THE QUESTION. The Sage first discerns what the user is truly
// asking for, then chooses the form of judgment that serves it — it never
// forces every ruling into one fixed synthesis template. (This replaced the
// earlier mandatory five-part structure: Agreement / Disagreement /
// Individual Perspectives / Uncertainty / Synthesis.) The inquiry kinds named
// below are illustrations for the model, deliberately NOT an enum the code
// knows about — nothing downstream (UI, Vault, Archives) depends on any
// ruling structure.
//
// The ruling's language follows the application's Default Reply Language (the
// only thing that setting controls). Character names come from the INTERFACE-
// language identity pack and are preserved verbatim even when the ruling is
// written in another language.
const judgeSystemTemplate = (judge, scholarList, replyLanguage) => [
  `You are "${judge}", the final arbiter of the Aether Library council.`,
  `You receive independent answers from several Scholars (${scholarList}) to the same question.`,
  "",
  // The same shared rule every other AI response uses — `replyLanguage` is
  // a language CODE here, resolved to its display name inside the rule.
  ...defaultReplyLanguageRule(replyLanguage, "ruling"),
  "",
  "THE CONSTITUTION OF JUDGMENT — the form of wisdom follows the nature of the question:",
  "Before writing a single word, silently discern what the user truly seeks. Then let that nature — not habit, and not a template — determine the shape, emphasis, and length of your ruling. Never force every ruling into the same synthesis format.",
  "",
  "Illustrations of the principle (not a fixed list — real questions blend these and exceed them):",
  "- A decision to be made → weigh the trade-offs the Scholars surfaced and commit to a clear recommendation.",
  "- Knowledge to be understood → weave the Scholars' accounts into the single clearest explanation; do not stage a contest where none belongs.",
  "- Creative work to be judged → compare strengths and weaknesses honestly, then offer direction where guidance would serve.",
  "- A genuine matter of debate or opinion → lay out where the Scholars agree and differ, weigh their arguments, and reach your own independent conclusion.",
  "",
  "Duties that bind in every form of judgment:",
  `- Judge, never merely summarize: weigh how well-supported each Scholar's position is, and say where you stand. Credit the Scholars by name (${scholarList}) where their contributions shape your ruling.`,
  "- Name real disagreement when it exists; never manufacture conflict where the Scholars agree, and never flatten a genuine conflict into false consensus.",
  "- Be honest about uncertainty — the Scholars' and your own.",
  "- Let structure serve the reader: use whatever headings or flow fit THIS ruling (written in the ruling's language), and only as much length as the question deserves.",
  "",
  `EXCEPTION to the language rule: the character names (${judge} and ${scholarList}) are fixed identities from the interface-language setting. Keep them exactly as given even if they are in a different script from the ruling — never translate or transliterate them.`,
  "Never mention AI providers or model names (such as GPT, Claude, or Gemini) unless the user's question is directly about them.",
  `If you refer to yourself, use only "${judge}".`,
  "Formatting: avoid decorative Markdown bold labels (write \"關鍵特徵：\" or \"Key features:\", never \"**關鍵特徵：**\"). Headings and bullet points are fine; bold should be extremely rare and never used as a section label. Keep paragraphs short and avoid deeply nested bullets.",
  "Before returning your answer, verify that every heading you chose is written in the ruling's language (character names excepted). Rewrite any that is not.",
].join("\n");

function judgeSystem() {
  return judgeSystemTemplate(promptJudgeName(), promptScholarNameList(), config.defaultReplyLanguage);
}

function judgeName() {
  return identityFor(config.interfaceLanguage).judge;
}

// ---------------------------------------------------- persona names in prompts
// Prompts get the MULTILINGUAL form of a persona's name; the UI keeps the
// plain interface-language name. When the interface and reply languages
// differ, a ruling written in the reply language would otherwise name its
// participants in a language the reader never asked for — or, worse, invent
// its own translation. Handing the model both names explicitly ("謀者
// (Architect)") is what keeps a Session's UI labels and its generated prose
// talking about the same character. When the two languages match, the
// formatter collapses to exactly the single name these prompts used before.
function promptPersonaFor(slot) {
  return formatPersonaName(personaIdForSlot(slot), {
    interfaceLanguage: config.interfaceLanguage,
    replyLanguage: config.defaultReplyLanguage,
  });
}

function promptJudgeName() {
  return formatPersonaName(personaIdForJudge(), {
    interfaceLanguage: config.interfaceLanguage,
    replyLanguage: config.defaultReplyLanguage,
  });
}

function promptScholarNameList() {
  return formatScholarNameList({
    interfaceLanguage: config.interfaceLanguage,
    replyLanguage: config.defaultReplyLanguage,
  });
}

// Vault search must never block a Session: if the Librarian fails or exceeds
// this budget, the run continues with an empty context package.
const VAULT_SEARCH_TIMEOUT_MS = 8000;

async function retrieveVaultContextSafe(question) {
  const empty = { snippets: [], sources: [], titles: [], domains: [], tokenEstimate: 0 };
  let timer;
  try {
    return await Promise.race([
      retrieveVaultContext(question),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`vault search timed out after ${VAULT_SEARCH_TIMEOUT_MS}ms`)),
          VAULT_SEARCH_TIMEOUT_MS
        );
      }),
    ]);
  } catch (err) {
    console.error("[council] vault search unavailable:", err.message, "— continuing without vault context");
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

// Shared context package: same for every Scholar. The Librarian retrieves
// only the smallest useful vault context (read-only, token-budgeted), and any
// Session Materials the user attached are appended through the one unified
// materials interface — Scholars never see where knowledge came from.
//
// `useVault: false` (the "Use Vault" Session option, off) bypasses Librarian
// retrieval completely — no search runs, no vault text enters the package.
// Everything else about the package (materials, question, framing) is
// identical; `retrieval.skipped` lets the UI tell "searched, found nothing"
// apart from "never searched."
async function buildContextPackage(question, materials = [], useVault = true) {
  const retrieval = useVault
    ? await retrieveVaultContextSafe(question)
    : { snippets: [], sources: [], titles: [], domains: [], tokenEstimate: 0, skipped: true };

  const parts = ["## Context package"];
  if (retrieval.snippets.length > 0) {
    parts.push(
      "The following excerpts come from the user's personal knowledge vault.",
      "Treat them as trusted background written by the user; weigh them alongside your general knowledge.",
      ""
    );
    for (const snippet of retrieval.snippets) {
      parts.push(`### Vault note: ${snippet.file}`, snippet.text, "");
    }
    parts.push(`Sources: ${retrieval.sources.join(", ")}`);
  } else if (retrieval.skipped) {
    parts.push("No vault context is provided for this session. Answer from your general knowledge.");
  } else {
    parts.push("No relevant notes were found in the user's vault for this question. Answer from general knowledge.");
  }

  const attached = materialsBlock(materials);
  if (attached) parts.push("", attached);

  parts.push("", "## Question", question);

  return { context: parts.join("\n"), retrieval };
}

// One fixed character slot: the identity (persona) comes from the display
// language; the provider/model assignment comes from config.scholarSlots.
// `hasFiles` selects the file-analysis timeout profile (see timeouts.js);
// `onActivity` (optional) fires as response tokens arrive, letting the run
// stream report per-scholar progress.
// Did this error come from the user pressing Stop rather than the model
// failing? The normal path is the timeout clock's own classified
// user_cancelled code (startTimeoutClock). The second clause is the safety
// net for a provider whose SDK throws a raw AbortError — or the generic
// "timeout" wrapProviderError() produces for an abort it didn't classify —
// while the RUN's signal is already aborted: attributing that to the model
// would blame it for something the user did. A real provider failure carries
// code "provider_error" and never matches either clause.
function wasCancelled(err, signal) {
  if (err?.code === USER_CANCELLED_CODE) return true;
  if (!signal?.aborted) return false;
  return err?.name === "AbortError" || err?.code === "timeout";
}

// `persona` is the DISPLAY name (interface language) and is what gets stored
// on the result for tabs, the failure gate and the archive. `promptPersona`
// (optional) is the multilingual form the model is addressed by — see
// promptPersonaFor(). They are separate on purpose: the UI must never show
// the parenthetical form, and the prompt must never lose it.
async function askScholar(slotDef, persona, context, images = [], { hasFiles = false, onActivity, signal, promptPersona } = {}) {
  const provider = providers[slotDef.provider];
  const model = slotDef.model || provider?.model() || "";
  const base = {
    slot: slotNumber(slotDef.slot),
    persona,
    provider: slotDef.provider,
    label: provider?.label || slotDef.provider,
    model,
  };
  if (!provider) {
    return { ...base, status: "error", answer: null, error: `Unknown provider: ${slotDef.provider}` };
  }
  if (!provider.isConfigured()) {
    return { ...base, status: "no_api_key", answer: null, error: "No API key configured — add it to .env.local." };
  }
  // File/long-context requests and reasoning models get longer hard limits;
  // inactivity/connect phases are shared (see resolveTimeoutProfile).
  const timeouts = resolveTimeoutProfile({
    providerId: slotDef.provider,
    model,
    hasFiles: hasFiles || images.length > 0,
    promptChars: context.length,
  });
  try {
    const answer = await provider.complete({ system: scholarSystem(promptPersona || persona), prompt: context, model, images, timeouts, onActivity, signal });
    return { ...base, status: "ok", answer, error: null };
  } catch (err) {
    // Stop Generation: the user aborted this run, so this Scholar produced
    // nothing THROUGH NO FAULT OF THE MODEL. It gets its own status so the
    // failure gate skips it, the UI never labels it a model failure, and it
    // is never counted as evidence that the model is unavailable.
    if (wasCancelled(err, signal)) {
      return { ...base, status: "cancelled", answer: null, error: null, errorCode: USER_CANCELLED_CODE };
    }
    // errorStatus/errorCode let the frontend classify the failure (a
    // specific timeout reason, network, provider_error with an HTTP status)
    // without parsing the message string — see src/providers/errors.js and
    // src/providers/timeouts.js. Timeout codes must never be treated as
    // "model unavailable" by the UI.
    //
    // errorCategory is the SAME product-level classification the Council
    // Pre-check already uses (classifyProviderError) — computed here, where
    // the real error object still exists, so the failure gate and the UI can
    // name the reason ("timeout", "rate limit", …) without re-deriving it or
    // ever showing the raw provider text.
    return {
      ...base,
      status: "error",
      answer: null,
      error: err.message,
      errorStatus: err.status ?? null,
      errorCode: err.code ?? null,
      errorCategory: classifyProviderError(err),
    };
  }
}

function pickJudgeProvider() {
  const preferred = providers[config.judgeProvider];
  if (preferred?.isConfigured()) return preferred;
  return Object.values(providers).find((p) => p.isConfigured()) || null;
}

async function judge(question, scholars, materials = [], images = [], { signal } = {}) {
  // Stop Generation: never open a NEW provider stage once the run is
  // cancelled. This is the last gate before the single most expensive call
  // of the run, and it is checked before anything else here.
  if (signal?.aborted) {
    return { status: "cancelled", provider: null, model: null, answer: null, error: null };
  }
  const answered = Object.values(scholars).filter((s) => s.status === "ok");
  // A cancelled Scholar is not an absent one to rule around — it simply never
  // ran. Only genuinely failed Scholars are reported to the Sage.
  const failed = Object.values(scholars).filter((s) => s.status !== "ok" && s.status !== "cancelled");

  if (answered.length === 0) {
    return {
      status: "skipped",
      provider: null,
      model: null,
      answer: null,
      error: "No Scholar produced an answer, so there is nothing to synthesize.",
    };
  }

  const judgeProvider = pickJudgeProvider();
  if (!judgeProvider) {
    return {
      status: "error",
      provider: null,
      model: null,
      answer: null,
      error: "No provider is configured to act as Judge.",
    };
  }

  // The prompt scaffolding is deliberately language-neutral (English labels,
  // like the Scholars' context package) so that ONLY the user's question drives
  // the ruling's language. Chinese scaffolding here would bias the Judge into
  // Chinese even for an English question, re-coupling the two languages.
  const total = answered.length + failed.length;
  // The Judge sees the same attached materials the Scholars saw, so the
  // ruling can weigh each answer against the actual sources.
  const prompt = [
    `## The user's question\n${question}`,
    materialsBlock(materials),
    // Prompt-side names, not the UI's: see promptPersonaFor(). `s.persona`
    // stays the interface-language name everywhere it is displayed.
    ...answered.map((s) => `## ${promptPersonaFor(s.slot)}'s answer\n${s.answer}`),
    failed.length
      ? `## Absent Scholars\n${failed.map((s) => `${promptPersonaFor(s.slot)}: could not answer (${s.error})`).join("\n")}\nRule only on the Scholars who were present.`
      : null,
    `## Participation\n${answered.length} of ${total} Scholars completed the discussion. Mention this statistic in your ruling, expressed in the ruling's own language.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // The Grand Sage's assigned model, or the provider's default when unset.
  const judgeModel = config.judgeModel || judgeProvider.model();
  console.log(
    `[council] judge: provider=${judgeProvider.id} model=${judgeModel} defaultReplyLanguage=${config.defaultReplyLanguage} (the ruling is written in this language)`
  );

  try {
    const answer = await judgeProvider.complete({
      system: judgeSystem(),
      prompt,
      model: judgeModel,
      images,
      signal,
      // Same profile rules as the Scholars: attached materials or a long
      // record of answers to weigh grants the longer hard limit.
      timeouts: resolveTimeoutProfile({
        providerId: judgeProvider.id,
        model: judgeModel,
        hasFiles: materials.length > 0 || images.length > 0,
        promptChars: prompt.length,
      }),
    });
    return {
      status: "ok",
      provider: judgeProvider.id,
      model: judgeModel,
      answer,
      error: null,
    };
  } catch (err) {
    // Stopped mid-ruling: same rule as a Scholar — the user's own action is
    // never recorded as a Grand Sage failure.
    if (wasCancelled(err, signal)) {
      return { status: "cancelled", provider: judgeProvider.id, model: judgeModel, answer: null, error: null };
    }
    return {
      status: "error",
      provider: judgeProvider.id,
      model: judgeModel,
      answer: null,
      error: err.message,
      errorStatus: err.status ?? null,
      errorCode: err.code ?? null,
      errorCategory: classifyProviderError(err),
    };
  }
}

// ------------------------------------------------------- Council Pre-check
// A minimal, non-generating availability check for every participant BEFORE
// the real Council begins — catches an unavailable model, a missing/invalid
// key, a billing problem, an immediate rate limit, or a dead endpoint while
// it's still cheap to abort. This deliberately reuses the same
// providers/complete()/classifyProviderError() plumbing askScholar() and
// judge() use for the real run — no parallel provider or session system —
// and never calls startSession()/archiveSession(): a pre-check, successful
// or not, never becomes a Session.
//
// A successful pre-check does not guarantee the later real request
// succeeds (later rate limiting, transient outages, context limits, etc.
// are unchanged — see askScholar()/judge()'s own error handling, which this
// does not replace or weaken).
const PRECHECK_PROMPT = "Reply only with: OK";
const PRECHECK_MAX_TOKENS = 16;
// Bounded and short on purpose — this is a liveness probe, not a generation
// request, so it must fail fast rather than wait out the normal (much
// longer) per-request timeout profiles in timeouts.js.
const PRECHECK_TIMEOUT_PROFILE = { kind: "normal", connectMs: 15_000, inactivityMs: 15_000, taskMs: 20_000 };

async function precheckOne(role, providerId, model, persona) {
  const provider = providers[providerId];
  const base = { role, persona, provider: providerId, label: provider?.label || providerId, model };
  if (!provider) {
    return { ...base, ok: false, category: "MODEL_UNAVAILABLE", message: `Unknown provider: ${providerId}` };
  }
  if (!provider.isConfigured()) {
    return { ...base, ok: false, category: "AUTH_ERROR", message: "No API key configured for this provider." };
  }
  // A reasoning model can spend its whole token budget on hidden reasoning
  // before any visible output — capping it as tightly as a normal model
  // would make a healthy reasoning model look unavailable (empty response).
  // See isReasoningModel()'s own comment in timeouts.js.
  const maxTokens = isReasoningModel(providerId, model) ? undefined : PRECHECK_MAX_TOKENS;
  try {
    await provider.complete({
      system: "Reply with exactly one word and nothing else.",
      prompt: PRECHECK_PROMPT,
      model,
      maxTokens,
      timeouts: PRECHECK_TIMEOUT_PROFILE,
    });
    return { ...base, ok: true, category: null, message: null };
  } catch (err) {
    return { ...base, ok: false, category: classifyProviderError(err), message: err.message };
  }
}

// Checks every participant of an upcoming Council run: the requested (or
// default-enabled) Scholar slots, exactly like resolveSlots() picks for the
// real run, plus the Grand Sage — always, per spec, regardless of whether
// any Scholar is being checked. Uses the CONFIGURED judge provider/model
// directly (not judge()'s own configured-provider-unavailable fallback):
// the whole point is to surface a broken Grand Sage assignment rather than
// silently substitute a different provider the way a resilient real run may.
// Runs all checks in parallel — one slow/unavailable provider never delays
// the others. `ok` is true only if every participant passed.
//
// `overrides` (optional — {judgeProvider, judgeModel, scholarSlots: [{slot,
// provider, model, enabled}, ...]}): checks this EXPLICIT participant
// configuration instead of the saved runtime config — e.g. Settings →
// "Check Models Now" validating the form's current, possibly-unsaved
// values (§ manual-check-unsaved-form). Absent (the Send-flow gate never
// sends it) -> byte-for-byte the original saved-config behavior; nothing
// about config.scholarSlots/judgeProvider/judgeModel is read OR mutated
// either way — a pure per-call parameter, never global state.
export async function precheckCouncil(requestedScholars, overrides) {
  const identity = identityFor(config.interfaceLanguage);

  const scholarSlotDefs = overrides ? overrides.scholarSlots || [] : config.scholarSlots;
  const slots = overrides
    ? resolveSlotsFrom(scholarSlotDefs, "council", requestedScholars)
    : resolveSlots("council", requestedScholars);

  const scholarChecks = slots.map((slot) => {
    const slotDef = scholarSlotDefs.find((s) => slotNumber(s.slot) === slot) || { provider: "", model: "" };
    return precheckOne(`scholar${slot}`, slotDef.provider, slotDef.model, identity.scholars[slot]);
  });

  const judgeProvider = overrides ? overrides.judgeProvider : config.judgeProvider;
  const judgeModel = overrides
    ? overrides.judgeModel || providers[judgeProvider]?.model() || ""
    : config.judgeModel || providers[config.judgeProvider]?.model() || "";
  const judgeCheck = precheckOne("judge", judgeProvider, judgeModel, identity.judge);

  const results = await Promise.all([...scholarChecks, judgeCheck]);
  return { ok: results.every((r) => r.ok), results };
}

// Resolves which fixed Scholar slots participate in a run, given a
// slot-defs array in config.scholarSlots' own shape ({slot, provider,
// model, enabled}). Council: the requested slots, or every enabled slot
// when none specified. Single: exactly one slot. Always returns valid,
// de-duplicated, sorted slot numbers.
function resolveSlotsFrom(slotDefs, mode, requested) {
  const defs = Array.isArray(slotDefs) ? slotDefs : [];
  const all = defs.map((s) => slotNumber(s.slot));
  const enabled = defs.filter((s) => s.enabled !== false).map((s) => slotNumber(s.slot));

  let slots = Array.isArray(requested) && requested.length
    ? requested.map(Number).filter((n) => all.includes(n))
    : enabled.slice();
  slots = [...new Set(slots)].sort((a, b) => a - b);
  if (slots.length === 0) slots = [all[0] ?? 1];
  if (mode === "single") slots = slots.slice(0, 1);
  return slots;
}

// The real run's own resolution — always off the saved config.scholarSlots.
// Unchanged in every way (signature, behavior) by the overrides addition
// above; runSessionEvents() below still calls exactly this.
function resolveSlots(mode, requested) {
  return resolveSlotsFrom(config.scholarSlots, mode, requested);
}

// ---------------------------------------------------------- Run Safety
// Exactly ONE initial discussion run may exist at a time. This registry is
// the single authority for that: it is claimed SYNCHRONOUSLY at the top of
// runSessionEvents() — before the first await — so two requests arriving in
// the same tick can never both get through, and it is released in a `finally`
// so a failed, timed-out or client-abandoned run never wedges it.
//
// This guards the INITIAL run only, which is the expensive one (every Scholar
// plus the Grand Sage). Follow-up chat, single-Scholar retry and ruling
// regeneration act on an existing Session and are deliberately untouched.
//
// In-memory and process-scoped, exactly like the active Session itself (see
// sessionEngine.js) — a server restart clears it, same as everything else.
let activeRun = null;

// The message both run routes and the engine use, so the client sees one
// wording no matter which layer rejected the duplicate.
export const RUN_IN_PROGRESS_MESSAGE =
  "A discussion is already in progress. Wait for it to finish before starting another.";
export const RUN_IN_PROGRESS_CODE = "run_in_progress";

// ------------------------------------------------------- run state machine
// Deliberately a small closed set of strings on the ONE activeRun object, not
// a generic workflow engine: these are the only states the runtime and the UI
// ever need to agree on.
//
//   running                    — normal execution
//   cancellation_requested     — Stop pressed; provider calls aborted, no new
//                                stage may start. Still "in flight" until the
//                                pipeline unwinds.
//   awaiting_failure_decision  — a Scholar terminally failed and the Grand
//                                Sage is HELD until the user chooses
//                                continue/stop (see the failure gate below)
//   stopped / completed / failed — terminal; the slot is released immediately
//                                after, so these are observable only briefly.
export const RUN_STATES = [
  "running",
  "cancellation_requested",
  "awaiting_failure_decision",
  "stopped",
  "completed",
  "failed",
];

// A run's terminal outcome, recorded on the Session it installs so nothing
// downstream (follow-up chat, the UI, a future replay) has to infer from
// scholar statuses whether the run finished, was stopped, or was continued
// past a model failure.
export const RUN_OUTCOMES = ["completed", "stopped", "continued_with_failures", "insufficient_results"];

// The run currently in flight, or null. Read-only for callers — the registry
// is only ever mutated by runSessionEvents() and the two control functions
// below. Lets GET /api/session tell "nothing started yet" apart from "a run
// is still working": the Session object itself does not exist until the run
// finishes, so without this a page reloaded mid-run looks identical to an
// idle app.
export function getActiveRun() {
  return activeRun;
}

// The run as the CLIENT may see it (GET /api/session, the stop/decision
// routes). Deliberately a hand-built projection, never the raw object: the
// AbortController, the decision resolver and the orchestration context stay
// server-side, and no provider key or raw error text is ever included.
export function publicRunState(run = activeRun) {
  if (!run) return null;
  return {
    runId: run.runId,
    mode: run.mode,
    state: run.state,
    question: run.question,
    startedAt: run.startedAt,
    // Present only while awaiting_failure_decision. `category` is the
    // product-level classification (TIMEOUT / MODEL_UNAVAILABLE /
    // RATE_LIMITED / …) the client turns into a localized reason — the raw
    // provider message is deliberately NOT sent.
    failure: run.failure
      ? {
          scholars: run.failure.scholars.map((f) => ({
            key: f.key,
            slot: f.slot,
            persona: f.persona,
            provider: f.provider,
            model: f.model,
            category: f.category,
          })),
        }
      : null,
  };
}

// Stop Generation. Idempotent and always safe: no active run, an already
// stopping run, and a run parked at the failure gate all resolve without
// throwing. Never touches the active Session — Stop is not Reset.
export function requestStopActiveRun() {
  const run = activeRun;
  if (!run) return { stopped: false, run: null };
  // Already stopping: report the same state again rather than re-aborting.
  if (run.state !== "cancellation_requested") {
    run.state = "cancellation_requested";
    // Aborts every provider call still in flight AND makes every later
    // signal.aborted check fail closed (see startTimeoutClock's
    // externalSignal).
    run.controller.abort();
    console.log(`[council] stop requested for ${run.runId} (${run.mode})`);
  }
  // A run parked at the failure gate is not inside any provider call, so the
  // abort alone would never wake it — release it explicitly with "stop".
  run.resolveDecision?.("stop");
  return { stopped: true, run: publicRunState(run) };
}

// The user's answer to the failure gate. `runId` is validated so a stale page
// (deciding about a run that has since ended, or about a NEWER run it has
// never seen) can never steer the current one.
export function submitFailureDecision(runId, decision) {
  if (decision !== "continue" && decision !== "stop") {
    throw runError(400, "Decision must be 'continue' or 'stop'.", "invalid_decision");
  }
  const run = activeRun;
  if (!run || run.runId !== runId) {
    throw runError(409, "That discussion is no longer waiting for a decision.", "stale_decision");
  }
  if (run.state !== "awaiting_failure_decision") {
    // Repeating the decision that was already applied is harmless; asking for
    // the OTHER one after the run resumed is not.
    if (run.decision === decision) return { accepted: true, run: publicRunState(run) };
    throw runError(409, "That discussion is no longer waiting for a decision.", "stale_decision");
  }
  run.decision = decision;
  run.resolveDecision?.(decision);
  return { accepted: true, run: publicRunState(run) };
}

// ------------------------------------------------------- provider failure gate
// Which Scholar results are terminal provider failures that must pause the
// run before the Grand Sage convenes.
//
// Included: status "error" — a request was genuinely attempted and failed
// (timeout, model unavailable, rate limit, auth/permission, network after the
// provider layer gave up). These are exactly the failures no pre-run check
// can predict.
//
// Excluded on purpose:
//   "cancelled"   — the user's own Stop, never a model verdict.
//   "no_api_key"  — a CONFIGURATION state detected without ever calling the
//                   provider. It is already surfaced twice before a run can
//                   start (a disabled Scholar chip, and the Council Model
//                   Pre-check gate), so pausing mid-run for it would just
//                   duplicate an existing pre-run gate.
function terminalScholarFailures(scholars) {
  return Object.entries(scholars)
    .filter(([, s]) => s?.status === "error")
    .map(([key, s]) => ({
      key,
      slot: s.slot,
      persona: s.persona,
      provider: s.provider,
      model: s.model,
      category: s.errorCategory || "PROVIDER_ERROR",
    }));
}

// Runs one Session and emits progress events: emit(type, data) fires for
// "librarian", "scholar" (once per participating slot), "judge" (council
// only), and finally "session" with the started Session. Used by the
// streaming endpoint; runSession() wraps it for the single-response endpoint.
//
// mode "single": one Scholar answers, no Judge — the conversation continues
// directly with that Scholar. mode "council": 1–3 Scholars answer and the
// Judge synthesizes, opening Judge Chat.
export async function runSessionEvents(question, options = {}, emit = () => {}) {
  const mode = options.mode === "single" ? "single" : "council";
  // Claim the single run slot. Everything from here to the `try` is
  // synchronous on purpose (see the Run Safety block above): a second request
  // cannot interleave, so it always sees the claim and is rejected.
  if (activeRun) throw runError(409, RUN_IN_PROGRESS_MESSAGE, RUN_IN_PROGRESS_CODE);
  const run = {
    runId: `run-${randomUUID()}`,
    mode,
    question,
    startedAt: new Date().toISOString(),
    state: "running",
    // Stop Generation's single abort source for the whole run — handed to
    // every provider call through the timeout clock (see startTimeoutClock).
    controller: new AbortController(),
    // Populated only while parked at the failure gate.
    failure: null,
    decision: null,
    resolveDecision: null,
  };
  activeRun = run;
  try {
    const session = await executeSessionRun(question, options, emit, mode, run);
    if (run.state !== "cancellation_requested") run.state = "completed";
    return session;
  } catch (err) {
    run.state = "failed";
    throw err;
  } finally {
    // Released however the run ended — success, provider failure, user Stop,
    // or throw. The run owns the slot right through archiving, not just
    // generation, and a run parked at the failure gate is released here too
    // because the gate always settles before this point.
    if (run.state === "cancellation_requested") run.state = "stopped";
    activeRun = null;
  }
}

// A gate nobody ever answers must not hold the run slot forever. The normal
// path out is the user (the decision endpoint, from the live page OR from a
// page reloaded into the decision UI); this is purely the backstop for a
// browser that was closed and never came back. Generous on purpose — it is a
// leak guard, not a decision deadline.
export const FAILURE_GATE_TIMEOUT_MS = 15 * 60 * 1000;

// Parks the run until the user answers the failure gate. Returns the
// decision ("continue" | "stop"). A run stopped from anywhere else (the Stop
// button) resolves this too — see requestStopActiveRun. Defaults to "stop"
// on the backstop timeout: never spend the Grand Sage call on an
// authorization that was never actually given.
function awaitFailureDecision(run, failures) {
  run.state = "awaiting_failure_decision";
  run.failure = { scholars: failures };
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    run.resolveDecision = (decision) => {
      if (settled) return; // repeated Stop clicks / repeated decisions are no-ops
      settled = true;
      run.resolveDecision = null;
      clearTimeout(timer);
      // The gate is over either way; the caller sets the next real state.
      if (run.state === "awaiting_failure_decision") run.state = "running";
      resolve(decision);
    };
    timer = setTimeout(() => {
      console.log(`[council] failure gate for ${run.runId} expired with no decision — stopping`);
      run.resolveDecision?.("stop");
    }, FAILURE_GATE_TIMEOUT_MS);
    // Node must not be held awake by a gate that is only a backstop.
    timer.unref?.();
    // Stop pressed between the gate opening and this listener being armed.
    if (run.controller.signal.aborted) run.resolveDecision("stop");
  });
}

// The run itself. Split out from runSessionEvents() so the run-slot guard can
// wrap it without re-indenting the whole pipeline; `run` carries the abort
// signal and the state machine the runtime controls act on.
async function executeSessionRun(question, options, emit, mode, run) {
  const signal = run.controller.signal;
  const slots = resolveSlots(mode, options.scholars);

  // Session Materials: everything the user attached, already extracted, as
  // one normalized list. Scholars receive text materials inside the context
  // package and images alongside it.
  const materials = normalizeMaterials(options.materials);
  const images = imageParts(materials);

  // "Use Vault" Session option — on (the default) is the unchanged existing
  // behavior; off bypasses Librarian retrieval entirely (see
  // buildContextPackage). Absent/malformed values mean on, never off.
  const useVault = options.useVault !== false;

  const { context, retrieval } = await buildContextPackage(question, materials, useVault);
  emit("librarian", {
    domains: retrieval.domains,
    sources: retrieval.sources,
    titles: retrieval.titles,
    tokenEstimate: retrieval.tokenEstimate,
    skipped: Boolean(retrieval.skipped),
  });

  // Participating Scholars answer independently, in parallel. One failure never
  // blocks the rest. Results are keyed by fixed slot ("scholar1"…).
  const identity = identityFor(config.interfaceLanguage);
  const hasFiles = materials.length > 0;
  const scholars = {};
  await Promise.all(
    slots.map(async (slot) => {
      const slotDef =
        config.scholarSlots.find((s) => slotNumber(s.slot) === slot) ||
        { slot: `scholar${slot}`, provider: "", model: "" };
      const key = `scholar${slot}`;
      // First token from this Scholar: tell the stream it moved from
      // "waiting for provider" to "receiving response" (emitted once).
      let receiving = false;
      const onActivity = () => {
        if (receiving) return;
        receiving = true;
        emit("scholar_status", { key, stage: "receiving" });
      };
      const result = await askScholar(slotDef, identity.scholars[slot], context, images, { hasFiles, onActivity, signal, promptPersona: promptPersonaFor(slot) });
      scholars[key] = result;
      emit("scholar", { key, ...result });
    })
  );

  // ------------------------------------------------------ provider failure gate
  // The Scholars ran CONCURRENTLY, so by the time any one of them fails the
  // others are already in flight — there is no "later Scholar" left to hold
  // back, and aborting healthy siblings would destroy answers the user has
  // already paid for. The only stage still ahead is the Grand Sage, so this
  // is the one place a pause is both possible and meaningful, and it is
  // placed BEFORE the single most expensive call of the run.
  //
  // The gate opens only when the user's answer can actually change the
  // outcome: Council mode, at least one terminal failure, AND at least one
  // surviving answer for the Sage to rule on. The two degenerate cases are
  // deliberately left on their existing terminal paths instead of asking an
  // unanswerable question:
  //   - every Scholar failed  -> nothing to continue WITH (judge() already
  //     returns "skipped" without calling any provider); recorded as
  //     insufficient_results.
  //   - Mentor mode           -> the sole Scholar IS the discussion, so
  //     "continue without it" has no meaning; see the outcome below.
  let outcome = "completed";
  const failures = terminalScholarFailures(scholars);
  const answeredCount = Object.values(scholars).filter((s) => s.status === "ok").length;
  let stoppedAtGate = false;

  // `failureGate: false` opts a caller out entirely — for callers that have
  // no channel to answer with, so parking would just deadlock them. The
  // backwards-compatible /api/council routes pass it (they predate this
  // feature and their clients know nothing about the decision endpoint); the
  // real session run routes never do.
  const gateEnabled = options.failureGate !== false;

  if (gateEnabled && !signal.aborted && mode === "council" && failures.length > 0 && answeredCount > 0) {
    emit("failure_gate", { runId: run.runId, scholars: failures.map(({ key, slot, persona, provider, model, category }) => ({ key, slot, persona, provider, model, category })) });
    console.log(`[council] failure gate for ${run.runId}: ${failures.map((f) => `${f.key}=${f.category}`).join(", ")}`);
    const decision = await awaitFailureDecision(run, failures);
    emit("failure_decision", { runId: run.runId, decision });
    if (decision === "stop") {
      stoppedAtGate = true;
      outcome = "stopped";
    } else {
      outcome = "continued_with_failures";
    }
  }

  // The Judge only convenes in Council mode — and never after a Stop, whether
  // that came from the Stop button (signal aborted; judge() refuses on its
  // own) or from the failure gate (no abort, so it is refused here). Either
  // way the ruling is recorded as "cancelled" rather than left null, so the
  // UI can say the run was stopped instead of showing an empty ruling that
  // reads as still-loading.
  let judgeResult = null;
  if (mode === "council") {
    judgeResult = stoppedAtGate
      ? { status: "cancelled", provider: null, model: null, answer: null, error: null }
      : await judge(question, scholars, materials, images, { signal });
    emit("judge", judgeResult);
  }

  // Terminal outcome, in priority order: an explicit Stop always wins, then
  // "nothing usable came back", then whatever the gate decided.
  if (signal.aborted || stoppedAtGate) outcome = "stopped";
  else if (answeredCount === 0) outcome = "insufficient_results";

  // Install the finished run as the active Session. The identity snapshot keeps
  // names stable even if the interface language changes afterwards. Attachments
  // are recorded as metadata only — the content stays temporary.
  //
  // A stopped run installs its Session too: whatever DID complete stays
  // visible and restorable, because Stop is not Reset.
  const lineage = continuationLineageFrom(materials, options.continuation);
  const session = startSession({
    question,
    mode,
    scholars,
    judge: judgeResult,
    identity: { language: config.interfaceLanguage, ...identity },
    attachments: materialsMetadata(materials),
    useVault,
    parentSessionId: lineage.parentSessionId,
    threadId: lineage.threadId,
    outcome,
  });
  // Cache this run's normalized context for the active Session (see
  // lastRunContext below): a Scholar retry or a ruling regeneration reuses
  // the exact same context package and already-extracted materials — the
  // raw files are never re-parsed or re-sent per Scholar. `outcome` rides
  // along so a retry/regeneration can tell a completed run apart from one
  // that was stopped or continued past a failure.
  lastRunContext = { sessionId: session.id, context, images, materials, hasFiles, outcome };
  emit("session", session);

  // Automatic archiving: a no-op for a Session that isn't complete yet (see
  // isSessionComplete), and never throws — a storage problem here must not
  // block the answer the player already received.
  try {
    await archiveSession(session);
  } catch (err) {
    console.error("[archives] failed to save archive:", err.message);
  }

  return session;
}

export async function runSession(question, options = {}) {
  return runSessionEvents(question, options);
}

// ------------------------------------------------------- retry / regenerate
// A single Scholar's timeout or failure never invalidates a run: the other
// answers are kept, the Judge rules with whoever answered, and the failed
// Scholar can be retried INDIVIDUALLY here — never by re-running the whole
// council.

// The one active Session's run context (there is only ever one active
// Session — see sessionEngine.js). Holds the built context package, the
// normalized materials, and their extracted image parts, so retries and
// ruling regenerations reuse the session's already-parsed document content
// instead of re-extracting or re-sending the raw files. In-memory only,
// replaced by the next run; content never persists past the process.
let lastRunContext = null;

function runError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

// The cached context for the active session, or a rebuilt one when the cache
// is gone (server restarted since the run). A session that had attached
// materials cannot be faithfully rebuilt — their content was temporary — so
// that combination refuses loudly rather than silently retrying without them.
async function contextForActiveSession(session) {
  if (lastRunContext?.sessionId === session.id) return lastRunContext;
  if ((session.attachments || []).length > 0) {
    throw runError(
      409,
      "The materials attached to this session are no longer available (the server restarted since the run). Start a new session to re-attach them."
    );
  }
  const { context } = await buildContextPackage(session.question, [], session.useVault !== false);
  const rebuilt = { sessionId: session.id, context, images: [], materials: [], hasFiles: false };
  lastRunContext = rebuilt;
  return rebuilt;
}

// Re-runs exactly ONE Scholar of the active Session — the same persona and
// context package as the original run; provider/model may be overridden
// ("change model and retry"). On success the Session record is updated in
// place and re-archived; the other Scholars' answers are never touched.
export async function retryScholar(slot, overrides = {}) {
  const session = getActiveSession();
  if (!session) throw runError(409, "No active session — start one by asking a question first.");
  const key = `scholar${slot}`;
  const existing = session.scholars?.[key];
  if (!existing) throw runError(404, `${key} did not participate in this session.`);
  if (existing.status === "ok") throw runError(409, `${key} already answered — there is nothing to retry.`);

  const ctx = await contextForActiveSession(session);
  const slotDef = {
    slot: key,
    provider: overrides.provider || existing.provider,
    // An explicit override wins; switching provider without naming a model
    // falls back to that provider's configured default (askScholar resolves
    // the empty string).
    model: overrides.model || (overrides.provider && overrides.provider !== existing.provider ? "" : existing.model),
  };
  const persona =
    session.identity?.scholars?.[slot] || identityFor(config.interfaceLanguage).scholars[slot];

  console.log(`[council] retrying ${key}: provider=${slotDef.provider} model=${slotDef.model || "(provider default)"}`);
  const result = await askScholar(slotDef, persona, ctx.context, ctx.images, { hasFiles: ctx.hasFiles, promptPersona: promptPersonaFor(slot) });
  session.scholars[key] = result;

  // A successful retry may make the Session archivable for the first time;
  // archiveSession() is a no-op otherwise and never throws.
  try {
    await archiveSession(session);
  } catch (err) {
    console.error("[archives] failed to refresh archive after retry:", err.message);
  }
  return result;
}

// Re-runs ONLY the Judge of the active council Session, synthesizing the
// Scholars' answers as they stand now (e.g. after a successful retry filled
// in a previously failed one). Scholar answers are never re-generated.
export async function regenerateJudgeRuling() {
  const session = getActiveSession();
  if (!session) throw runError(409, "No active session — start one by asking a question first.");
  if (session.mode !== "council") throw runError(409, "Only Council sessions have a Grand Sage ruling.");

  const ctx =
    lastRunContext?.sessionId === session.id
      ? lastRunContext
      : { materials: [], images: [] };
  const judgeResult = await judge(session.question, session.scholars, ctx.materials, ctx.images);
  session.judge = judgeResult;

  try {
    await archiveSession(session);
  } catch (err) {
    console.error("[archives] failed to refresh archive after ruling regeneration:", err.message);
  }
  return judgeResult;
}

// Backwards-compatible council helpers (mode "council", all enabled slots).
// These predate the provider failure gate and their callers have no way to
// answer it, so they opt out and keep their original behavior exactly: a
// failed Scholar never pauses the run, and the Sage rules on whoever
// answered. Stop Generation still applies to them (it is driven by the run
// registry, not by the caller).
export async function runCouncilEvents(question, emit = () => {}) {
  return runSessionEvents(question, { mode: "council", failureGate: false }, emit);
}

export async function runCouncil(question) {
  const session = await runSessionEvents(question, { mode: "council", failureGate: false });
  return { question, scholars: session.scholars, judge: session.judge, session };
}
