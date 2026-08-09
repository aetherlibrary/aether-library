// Speech Bubble Mapping v1 — the ONE authoritative implementation for
// parsing a Bubble MD pool and selecting/resolving an entry from it. Pure:
// no filesystem access, no randomness seeded from anything but Math.random,
// never throws for a normal "nothing eligible" outcome (that's a valid,
// expected result — see pickRandomBubbleEntry).
//
// Format (deliberately simple, v1): one non-empty line = one Bubble Entry,
// parsed to `{style, text}`.
//   - blank lines are ignored
//   - a line whose first NON-WHITESPACE character is "#" is a comment,
//     ignored entirely (never becomes part of the pool)
//   - every other line, trimmed, is one entry. It may optionally start with
//     a case-insensitive "[thought]" or "[dialogue]" tag (any whitespace
//     after the tag is consumed too) — that tag becomes `style` and is
//     stripped from `text`; it never appears in rendered output. Without a
//     recognized tag, `style` is null and the CALLER applies its own
//     per-state default (see characterAssets.js's DEFAULT_BUBBLE_STYLE —
//     the one authoritative table, not duplicated here).
//   - an unrecognized bracketed prefix (e.g. "[banana] hello") is NOT a
//     tag: deterministically, it is left as literal text (brackets and
//     all), style stays null. v1 only recognizes the two known styles —
//     this is a narrow tag match, not a general markup grammar.
// No YAML front matter, no weights, no categories, no separate emoji pool —
// the MD content IS the pool.
//
// Context tokens: {{token_name}} inside an entry's text. An entry that
// requires a token NOT present in the supplied context is excluded from
// selection entirely (never partially rendered, never left with a raw
// "{{token}}" in the output) — see pickRandomBubbleEntry/resolveBubbleTokens.

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const STYLE_TAG_RE = /^\[(thought|dialogue)\]\s*/i;

// Shared by both parseBubbleMarkdown (legacy, one file = one state) and
// parseCharacterSpeechMarkdown (unified doc, one file = every state) — a
// single non-blank, non-heading line becomes one {style, text} entry.
function parseStyledLine(line) {
  const tagMatch = STYLE_TAG_RE.exec(line);
  if (tagMatch) return { style: tagMatch[1].toLowerCase(), text: line.slice(tagMatch[0].length) };
  return { style: null, text: line };
}

// MD text -> ordered array of {style, text} Bubble Entries (comments/blanks
// removed). `style` is "thought" | "dialogue" | null. LEGACY (v1): one file
// IS one state's pool — kept for the speechBubbleMapping fallback path (see
// characterAssets.js) when a Character Asset has no speechBubbleSet
// configured yet. Prefer parseCharacterSpeechMarkdown for new authoring.
export function parseBubbleMarkdown(markdown) {
  const lines = String(markdown ?? "").split(/\r\n|\r|\n/);
  const entries = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue; // blank
    if (line[0] === "#") continue; // comment — first non-whitespace char, since we already trimmed
    entries.push(parseStyledLine(line));
  }
  return entries;
}

// --------------------------------------- Unified Character Speech document
//
// One localized Markdown file per Character (Speech Set) contains every
// conversation state's pool, sectioned with H2 headings:
//   # Classic Alpha                 <- document title, H1, never an entry
//   ## PRE THINKING                 <- H2 recognized state heading
//   [thought] 🤔
//   [dialogue] Interesting question.
//   ## VAULT GATHERING
//   ...
// Only an H2 (`##`) whose normalized text matches a SPEECH_STATES value
// switches the "current section"; H1/H3+ headings are never state
// boundaries (Part 20 — future subsections shouldn't require special-casing
// here) and are never entries either. A line before the first recognized H2,
// or under an UNRECOGNIZED H2, is silently ignored — it never leaks into
// whichever recognized section came before or after it.
const HEADING_RE = /^(#{1,6})\s*(.*)$/;

// "PRE THINKING" / "Pre Thinking" / "pre  thinking" all -> "pre_thinking".
// Deliberately strict (exact match against SPEECH_STATES only) — no fuzzy/
// partial matching, so an unexpected heading is safely ignored rather than
// guessed at.
export function normalizeSectionHeading(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

// MD text -> { [recognizedState]: {style, text}[] }. A state with zero
// authored lines simply never gets a key (callers should read
// `parsed[state] || []`). Never scans/returns entries for a section that
// isn't asked for — see pickRandomBubbleEntry(parsed[state], context).
export function parseCharacterSpeechMarkdown(markdown, states) {
  const recognized = Array.isArray(states) ? states : SPEECH_STATES;
  const lines = String(markdown ?? "").split(/\r\n|\r|\n/);
  const sections = {};
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      if (headingMatch[1].length === 2) {
        const normalized = normalizeSectionHeading(headingMatch[2]);
        current = recognized.includes(normalized) ? normalized : null;
      }
      // H1 (title) and H3+ are never a section boundary — `current` is left
      // exactly as it was, so a stray subheading inside a state can't wipe
      // out the entries that follow it.
      continue;
    }
    if (!current) continue; // before the first recognized heading, or inside an unrecognized one
    (sections[current] ||= []).push(parseStyledLine(line));
  }
  return sections;
}

// The 7 conversation states this parser recognizes as H2 sections — kept
// here (not just in characterAssets.js) so this module has zero import
// dependency on the server-side service, matching its "pure, no fs" header.
// characterAssets.js's SPEECH_STATES is the same literal list; keep both in
// sync if a state is ever added/removed.
const SPEECH_STATES = [
  "pre_thinking",
  "vault_gathering",
  "scholar_thinking",
  "scholar_answering",
  "grand_sage_gathering",
  "grand_sage_answering",
  "post_answering",
  // Clickable NPC interaction: the pool used when the player clicks this
  // Character in the scene. Authored as "## CLICKED"; normalizeSectionHeading
  // lowercases it to this id exactly like every other state heading.
  "clicked",
];

// ------------------------------------------------------ Localized filename
//
// Deterministic naming: assets/dialogue/bubbles/<speechSet>_<locale>.md.
// This is the ONE place the "_<locale>.md" concatenation happens — every
// runtime (F8 + production) mirrors resolveSpeechDocument's CONTROL FLOW
// but always calls through this same string-building rule, never
// hardcoding a suffix inline.
export function speechDocumentPath(speechSet, locale) {
  return `assets/dialogue/bubbles/${speechSet}_${locale}.md`;
}

// Ordered candidate paths for a locale request: the requested locale first,
// then "en" as the ONE fallback (Part 14 — never falls back further, never
// falls back to a different Character's Speech Set). No duplicate when the
// requested locale already IS "en".
export function speechDocumentCandidates(speechSet, locale = "en") {
  const candidates = [speechDocumentPath(speechSet, locale)];
  if (locale !== "en") candidates.push(speechDocumentPath(speechSet, "en"));
  return candidates;
}

// Pure resolution logic, environment-agnostic: `fetchText(path)` is caller-
// supplied (fs-based server-side, fetch-based in-browser) and must resolve
// to the file's text or `null` (not found / failed) — this function never
// touches fs/fetch itself, so it's the same control flow F8 and production
// both run (Part 18), each just plugging in their own real I/O. Returns
// `{path, locale, markdown}` for the first candidate that resolves, or
// `null` if every candidate fails (Part 14 — "if both missing: safe no-op").
export async function resolveSpeechDocument(speechSet, locale, fetchText) {
  if (!speechSet) return null;
  for (const candidatePath of speechDocumentCandidates(speechSet, locale)) {
    const markdown = await fetchText(candidatePath);
    if (markdown !== null && markdown !== undefined) {
      const resolvedLocale = candidatePath === speechDocumentPath(speechSet, locale) ? locale : "en";
      return { path: candidatePath, locale: resolvedLocale, markdown };
    }
  }
  return null;
}

// ------------------------------------------------- Discovering Speech Sets
// The developer never manually maps "English = classic_omega_en.md" — every
// discovered .md filename matching the <speechSet>_<locale>.md convention
// contributes to a logical Speech Set, grouped with every locale variant
// found for it. A legacy per-state filename (pre_thinking.md,
// alpha_pre_thinking.md — no locale suffix) simply never matches, so it can
// never masquerade as a Speech Set or pollute this grouping.
const SPEECH_SET_FILENAME_RE = /^(.+)_([a-z]{2}(?:-[A-Z]{2})?)\.md$/i;

// A bare filename (e.g. "classic_omega_en.md", NOT the full project-relative
// path) -> {speechSet, locale}, or null if it doesn't match the convention.
export function parseSpeechSetFilename(filename) {
  const m = SPEECH_SET_FILENAME_RE.exec(String(filename ?? ""));
  if (!m) return null;
  return { speechSet: m[1], locale: m[2] };
}

// Bare filenames -> { [speechSet]: locale[] } (sorted, deduplicated). ONE
// entry per logical Speech Set, never one per locale (a directory with
// classic_omega_en.md + classic_omega_zh-TW.md yields exactly
// { classic_omega: ["en", "zh-TW"] }, not two separate "sets").
export function groupSpeechSetLocales(filenames) {
  const sets = {};
  for (const filename of filenames || []) {
    const parsed = parseSpeechSetFilename(filename);
    if (!parsed) continue;
    (sets[parsed.speechSet] ||= new Set()).add(parsed.locale);
  }
  const out = {};
  for (const [speechSet, locales] of Object.entries(sets)) out[speechSet] = [...locales].sort();
  return out;
}

// Every {{token}} name referenced in a Bubble Entry's text (a plain
// string — pass entry.text, not the {style, text} object itself), as a Set
// (order-independent, dedup'd — text referencing the same token twice needs
// it available exactly once).
export function requiredBubbleTokens(text) {
  const set = new Set();
  TOKEN_RE.lastIndex = 0;
  let m;
  const s = String(text ?? "");
  while ((m = TOKEN_RE.exec(s))) set.add(m[1]);
  return set;
}

// context[token] counts as "available" only when it's a non-empty string
// (or any other non-nullish, non-empty value) — undefined/null/"" all mean
// "not available", so an entry needing it is excluded rather than ever
// rendering a blank substitution (Part 6: never `I was thinking about ""`).
function tokenAvailable(context, token) {
  const v = context ? context[token] : undefined;
  return v !== undefined && v !== null && v !== "";
}

// Picks ONE {style, text} entry uniformly at random from those whose
// required tokens are ALL available in `context` — never the ones that
// aren't (Part 6: an unavailable-token entry is not eligible, full stop,
// not "rendered with a gap"). Returns null when nothing is eligible (or
// entries is empty) — this is a normal, expected outcome, not an error.
// Picks the WHOLE entry atomically — style is never chosen independently
// from text, since both live on the one object being selected here.
export function pickRandomBubbleEntry(entries, context) {
  const list = Array.isArray(entries) ? entries : [];
  const eligible = list.filter((entry) => {
    for (const token of requiredBubbleTokens(entry?.text)) {
      if (!tokenAvailable(context, token)) return false;
    }
    return true;
  });
  if (!eligible.length) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// Substitutes every {{token}} in `entry` from `context`. Only ever called
// (by the intended pipeline) on an entry pickRandomBubbleEntry already
// confirmed eligible, so every token here should already be available —
// still defensively leaves an unmatched token literally in place rather
// than silently deleting it, since that would hide a caller bug instead of
// surfacing it.
export function resolveBubbleTokens(entry, context) {
  return String(entry ?? "").replace(TOKEN_RE, (whole, token) => (tokenAvailable(context, token) ? String(context[token]) : whole));
}

// ------------------------------------------------ Idle lifecycle pools
//
// PRE THINKING's pool splits by tag for two DIFFERENT purposes (Idle
// Controller, public/app.js): explicit [dialogue] lines are the automatic
// ambient-idle pool; everything else (explicit [thought] OR untagged) is the
// hover pool. An untagged line already defaults to "thought" for this state
// (DEFAULT_BUBBLE_STYLE.pre_thinking) — this split preserves that exact
// semantic rather than inventing a third pool for untagged lines.
export function filterDialogueEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e?.style === "dialogue");
}
export function filterThoughtEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e?.style !== "dialogue");
}

// Picks one entry via the existing token-aware selector, avoiding an
// immediate repeat of `avoidText` when a DIFFERENT eligible option exists —
// "do not replay the same line immediately if there are other available
// lines" / "avoid immediately repeating the same hover thought when
// alternatives are available". Falls back to repeating when the only
// eligible entry IS the one being avoided (repeat is then unavoidable, not
// a bug).
export function pickEntryAvoidingRepeat(entries, context, avoidText) {
  const first = pickRandomBubbleEntry(entries, context);
  if (!first || first.text !== avoidText) return first;
  const alternatives = (Array.isArray(entries) ? entries : []).filter((e) => e.text !== avoidText);
  if (!alternatives.length) return first;
  return pickRandomBubbleEntry(alternatives, context) || first;
}
