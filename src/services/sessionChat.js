// Session Chat — the follow-up conversation that belongs to the active Session.
//
// It continues the SAME Session the run created; it never starts a council and
// never re-queries the other Scholars. Exactly one completion per turn:
//   - Council mode  -> the Judge answers (Judge Chat), grounded in the ruling.
//   - Single mode   -> the one Scholar continues the conversation.
// Answers are grounded only in the stored Session record plus the chat so far.

import { config } from "../config.js";
import { providers } from "../providers/index.js";
import { resolveTimeoutProfile } from "../providers/timeouts.js";
import {
  identityFor,
  defaultReplyLanguageRule,
  formatPersonaName,
  personaIdForSlot,
  personaIdForJudge,
} from "../localization.js";
import { getActiveSession, appendChat } from "./sessionEngine.js";
import { scholarSystem } from "./council.js";
import { normalizeMaterials, materialsBlock, imageParts, materialsMetadata } from "./materials.js";

// Heading/intro for materials attached to a FOLLOW-UP message — deliberately
// distinct from the initial question's "## Attached materials" framing (see
// materials.js) so the model never mistakes a follow-up attachment for
// something the original question came with.
const FOLLOW_UP_MATERIALS_HEADING = "## Materials attached to this message";
const FOLLOW_UP_MATERIALS_INTRO =
  "The user attached the following materials to their latest message below only — new context for this follow-up turn, not part of the original question or anything attached earlier.";

// Oldest turns are dropped from the prompt (never from the stored transcript)
// to keep follow-up cost bounded on long conversations.
const MAX_PROMPT_MESSAGES = 24;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Follow-ups and Quick Questions obey the SAME Default Reply Language as the
// initial run (Settings → General) — previously this was pinned to the
// language of the user's own message, which made one conversation able to
// drift away from the configured default. Built per call, since the setting
// can change between turns.
function languageRule() {
  return [
    ...defaultReplyLanguageRule(config.defaultReplyLanguage, "reply"),
    "The character names above are fixed identities — keep them exactly as given even if they are in a different script from your reply.",
  ].join("\n");
}

function judgePersona(session) {
  return session.identity?.judge || identityFor(config.interfaceLanguage).judge;
}

// Prompt-side persona names (same rule as promptPersonaFor() in council.js).
// The PRIMARY name comes from the Session's own identity-snapshot language,
// so a restored Session keeps naming its participants the way it ran; the
// parenthetical follows the CURRENT reply language, because that is the
// language this reply will actually be written in. Display values (the
// returned `speaker`, error messages) keep using the plain snapshot name.
function promptLanguages(session) {
  return {
    interfaceLanguage: session.identity?.language || config.interfaceLanguage,
    replyLanguage: config.defaultReplyLanguage,
  };
}
function promptScholarPersona(session, scholar) {
  return formatPersonaName(personaIdForSlot(scholar?.slot), promptLanguages(session)) || scholar?.persona || "";
}
function promptJudgePersona(session) {
  return formatPersonaName(personaIdForJudge(), promptLanguages(session)) || judgePersona(session);
}

// Renders the chat-so-far as labelled turns for the prompt. A past turn's own
// attachments aren't resent (only the current message's materials travel with
// full content — see FOLLOW_UP_MATERIALS_*), but naming them here keeps the
// model from losing track of "that image/document" across later turns.
function historyBlock(session, assistantName) {
  const history = session.chat.slice(-MAX_PROMPT_MESSAGES);
  if (history.length === 0) return null;
  return [
    "## Conversation so far",
    history
      .map((m) => {
        const names = (m.attachments || []).map((a) => a.name).join(", ");
        const attachedNote = names ? ` [attached: ${names}]` : "";
        return `${m.role === "assistant" ? assistantName : "User"}: ${m.text}${attachedNote}`;
      })
      .join("\n\n"),
  ].join("\n\n");
}

// ------------------------------------------------------------- Council: Judge

function judgeSystem(session) {
  const judge = promptJudgePersona(session);
  const personaLines = Object.values(session.scholars || {})
    .filter((s) => s?.persona)
    .map((s) => `- ${promptScholarPersona(session, s)} — the Scholar answered by ${s.label}`);

  return [
    `You are ${judge}, the Judge of the Aether Library council. You have just delivered your ruling on a council session, and the user is now talking with you about it — like consulting the head librarian after the council meeting.`,
    "",
    "SOURCE RULES (strict):",
    "- Base every reply ONLY on the council record you are given (the user's question, each Scholar's answer, your ruling), the follow-up conversation so far, and your own reasoning about them.",
    "- The council is over. Never invent new Scholar statements, never claim to have consulted a Scholar again, and never pretend the council was re-run. If asked what a Scholar would say now, present it explicitly as your own inference from what that Scholar wrote.",
    "- If the record does not contain the information needed, say so plainly instead of inventing it.",
    "",
    "EVALUATING SCHOLARS:",
    "- Compare Scholars fairly and concretely, citing what each actually wrote.",
    "- Do not force a single overall winner; when useful, assign strengths per category — accuracy, reasoning depth, creativity, teaching clarity, conciseness, original insight — and give an overall recommendation.",
    "- Always explain WHY each category or judgment was assigned.",
    "- Be honest about uncertainty, including in your own original conclusion. If a follow-up exposes a real flaw in your ruling, say so and revise your view.",
    "",
    "IDENTITY:",
    "The Scholars in this council:",
    ...(personaLines.length ? personaLines : ["- (see the council record)"]),
    "- ALWAYS refer to the Scholars by their persona names above. Mention the provider or model behind a Scholar ONLY when the user explicitly asks about providers or models; then answer plainly using the mapping above.",
    "- When the user refers to a Scholar by a provider or product name (GPT, Claude, Gemini, …), understand which Scholar they mean and reply using that Scholar's persona name.",
    `- If you refer to yourself, use only ${judge}.`,
    "",
    `LANGUAGE: ${languageRule()}`,
    "",
    "FORMAT: this is a conversation, not a ruling — do NOT restate your ruling or fall back into its structure. Keep replies focused on what was asked: short paragraphs, bullet points or a compact category list when comparing Scholars. Avoid decorative Markdown bold labels (write 關鍵特徵： or Key features:, never **Key features:**).",
  ].join("\n");
}

function judgePrompt(session, message, materials = []) {
  const judge = promptJudgePersona(session);
  const scholars = Object.values(session.scholars || {});
  const answered = scholars.filter((s) => s.status === "ok");
  const failed = scholars.filter((s) => s.status !== "ok");

  const attachments = Array.isArray(session.attachments) ? session.attachments : [];
  const parts = [
    "## Council record",
    `### The user's question\n${session.question}`,
    attachments.length
      ? `### Materials the user attached to this session\n${attachments
          .map((a) => `- ${a.name} (${a.kind}${a.url ? `, ${a.url}` : ""})`)
          .join("\n")}\nTheir content was shown to the council during the session; refer to it through the Scholars' answers and your ruling.`
      : null,
    ...answered.map((s) => `### ${promptScholarPersona(session, s)}'s answer\n${s.answer}`),
    failed.length
      ? `### Absent Scholars\n${failed.map((s) => `${promptScholarPersona(session, s)} did not answer (${s.error || s.status}).`).join("\n")}`
      : null,
    `### Your ruling (${judge})\n${session.judge.answer}`,
    historyBlock(session, judge),
    `## The user's new message\n${message}`,
    materialsBlock(materials, { heading: FOLLOW_UP_MATERIALS_HEADING, intro: FOLLOW_UP_MATERIALS_INTRO }),
    `Reply to this message as ${judge}.`,
  ].filter(Boolean);

  return parts.join("\n\n");
}

// The Judge that actually ruled answers follow-ups; if its key was removed
// since, fall back the same way the council picks a Judge.
function pickJudgeProvider(session) {
  const recorded = providers[session.judge?.provider];
  if (recorded?.isConfigured()) return recorded;
  const preferred = providers[config.judgeProvider];
  if (preferred?.isConfigured()) return preferred;
  return Object.values(providers).find((p) => p.isConfigured()) || null;
}

async function judgeChatReply(session, message, materials = []) {
  if (session.judge?.status !== "ok" || !session.judge.answer) {
    throw httpError(409, "The Judge produced no ruling for this session, so there is nothing to discuss.");
  }
  const provider = pickJudgeProvider(session);
  if (!provider) throw httpError(400, "No provider is configured to act as Judge.");

  // Continue on the same model the ruling used; fall back to the current Judge
  // model assignment, then the provider default.
  const model = session.judge.model || config.judgeModel || provider.model();
  const prompt = judgePrompt(session, message, materials);
  const reply = await provider.complete({
    system: judgeSystem(session),
    prompt,
    model,
    images: imageParts(materials),
    // Follow-ups get the same adaptive limits as runs: materials attached to
    // this turn (or a long council record) grant the longer hard ceiling.
    timeouts: resolveTimeoutProfile({
      providerId: provider.id,
      model,
      hasFiles: materials.length > 0,
      promptChars: prompt.length,
    }),
  });
  return { reply, speaker: judgePersona(session), provider: provider.id, model };
}

// -------------------------------------------------------- Single: the Scholar

// The one participating Scholar in a single-scholar session.
function singleScholar(session) {
  return Object.values(session.scholars || {}).find((s) => s.status === "ok") || null;
}

function scholarChatPrompt(session, scholar, message, materials = []) {
  // Mentor follow-ups name the Scholar by the same multilingual rule the
  // Council prompts use.
  const name = promptScholarPersona(session, scholar);
  const parts = [
    "## Our conversation",
    `### The user's original question\n${session.question}`,
    `### Your first answer (${name})\n${scholar.answer}`,
    historyBlock(session, name),
    `## The user's new message\n${message}`,
    materialsBlock(materials, { heading: FOLLOW_UP_MATERIALS_HEADING, intro: FOLLOW_UP_MATERIALS_INTRO }),
    `Continue the conversation as ${name}, answering the new message directly. Do not restate your whole first answer; build on it.`,
  ].filter(Boolean);
  return parts.join("\n\n");
}

async function scholarChatReply(session, message, materials = []) {
  const scholar = singleScholar(session);
  if (!scholar) {
    throw httpError(409, "This session's Scholar produced no answer, so there is nothing to continue.");
  }
  const provider = providers[scholar.provider];
  if (!provider?.isConfigured()) {
    throw httpError(400, `${scholar.persona}'s provider is not configured.`);
  }

  const prompt = scholarChatPrompt(session, scholar, message, materials);
  const reply = await provider.complete({
    system: scholarSystem(promptScholarPersona(session, scholar)),
    prompt,
    model: scholar.model,
    images: imageParts(materials),
    timeouts: resolveTimeoutProfile({
      providerId: provider.id,
      model: scholar.model,
      hasFiles: materials.length > 0,
      promptChars: prompt.length,
    }),
  });
  return { reply, speaker: scholar.persona, provider: provider.id, model: scholar.model };
}

// ------------------------------------------------------------------ dispatch

// rawMaterials follows the exact same wire shape as the initial run's
// `materials` (see materials.js normalizeMaterials) — the same validation,
// size caps, and per-kind handling apply to a follow-up attachment as to one
// on the original question.
export async function sessionChatReply(message, rawMaterials) {
  const session = getActiveSession();
  if (!session) {
    throw httpError(409, "No active session — start one by asking a question first.");
  }

  const materials = normalizeMaterials(rawMaterials);
  const result =
    session.mode === "single"
      ? await scholarChatReply(session, message, materials)
      : await judgeChatReply(session, message, materials);

  // Recorded only after a successful reply so the transcript never holds an
  // unanswered user message the UI showed an error for. The attachment
  // metadata is attributed to THIS user turn only (see appendChat) — it never
  // touches session.attachments, which stays the original question's record.
  appendChat("user", message, materialsMetadata(materials));
  appendChat("assistant", result.reply);
  return result;
}
