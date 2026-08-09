# AI Council

## Purpose

The AI Council is Aether Library's core reasoning workflow: one question,
answered independently by several Scholars, then weighed by the Grand Sage
into a single conclusion.

## The roles

- **Scholars** — the characters who answer. Three ship today: the Architect,
  the Oracle and the Analyst. Each answers independently, so their answers
  are genuinely separate opinions rather than one model talking to itself.
- **Grand Sage** — the character who reads every successful answer and
  reaches a conclusion. In **AI Config** the Grand Sage's slot is labelled
  *Main Judge*, because that is the job it performs in a discussion.

Character identity is independent of provider identity: any supported
provider and model can be assigned to any Scholar or to the Grand Sage
without changing that character's name or behaviour.

## The two modes

- **Council Mode** — one to three Scholars answer the same question in
  parallel, each grounded in the same context (Vault retrieval plus any
  attached material). The Grand Sage then produces a synthesis in whatever
  form the question calls for: a recommendation, the clearest explanation, or
  an account of where the Scholars agreed and disagreed.
- **Mentor Mode** — exactly one Scholar answers. There is no Grand Sage
  step, and the conversation continues directly with that Scholar.

Discussions are started from **Aetherom**, the book on the reading-room
table.

## How a discussion behaves

- **One Scholar failing never blocks the others.** The discussion proceeds
  with whoever answered successfully, and the failed Scholar can be retried
  on its own or on a different model.
- **Answers follow the language of your question**, independent of the
  interface language.
- **Follow-up questions are grounded in the finished discussion**, not in a
  fresh Council run — asking a follow-up does not silently re-query every
  Scholar.
- **Before a Council starts**, Aether Library can run a small per-participant
  check that each configured model is actually reachable, so a
  misconfiguration surfaces before a full discussion is spent.

## Where it lives

`src/services/council.js` runs the discussion, `src/services/sessionEngine.js`
is the single source of truth for the active discussion, and
`src/services/sessionChat.js` handles follow-up conversation.

See also [Providers](providers.md), [Vault](vault.md) and
[Archives](archives.md).
