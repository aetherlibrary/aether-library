// Author Preview — THE deterministic completed-Council presentation of the
// Workspace. Production code, with exactly one implementation.
//
// Two callers, one controller:
//
//   Tutorial (public/app.js)  — Steps 8-9 need a finished discussion to point
//     at, and a first-run user has none. Production feature, so this module
//     must not sit behind the devTools gate.
//   F9 (devtools/scene-editor.js) — an author tuning Workspace colors or
//     character names cannot see them while the F8 editor covers the panel,
//     and most of the Workspace only exists AFTER a Council session has run.
//
// Both mount the SAME mock through the SAME API. The dev side owns only the
// shortcut, the editor-hiding CSS and the unsaved-Scene identity it passes
// in; nothing about the preview itself is duplicated for either caller.
//
// It renders into the real #chat-panel using the real runtime classes and the
// real --ws-* theme variables, so what you see is what the Workspace looks
// like — without a provider ever being called.
//
// ISOLATION STRATEGY — a preview-only DOM layer, not a state swap.
//
// The real Workspace children are hidden (never cleared, never rewritten) and
// the mock is mounted alongside them inside #chat-panel. That means there is
// no real application state to snapshot and no reconstruction to get wrong:
// the session, the composer draft, the tab bar and the chat log are all still
// sitting there, untouched, exactly as they were. Unmounting removes one
// element and unhides the originals.
//
// Mounting INSIDE #chat-panel is what makes the preview honest — the panel is
// where style.css maps --ws-* onto the component tokens, so the mock inherits
// the authored theme automatically rather than duplicating the stylesheet.
//
// SAFETY — one boundary, not per-control guards. Everything inside the mock is
// inert because a single capture-phase listener on the preview root swallows
// every interaction event before it can reach a handler. There are no real
// handlers attached to any of it in the first place; the listener is the
// belt to that pair of braces.

(() => {
  const ROOT_ID = "author-preview-root";
  const BODY_CLASS = "author-preview-active";

  // Events that could plausibly trigger an action. Captured and stopped at
  // the preview root, so no mock control can ever reach application code.
  const INERT_EVENTS = ["click", "dblclick", "mousedown", "mouseup", "submit", "change", "input", "keydown", "keypress", "keyup"];

  let active = false;

  // Localized UI strings from the running app, with the English text as a
  // fallback so the preview still reads correctly if the hook is missing.
  function str(key, fallback) {
    const hook = window.__aetherStrings;
    const value = hook && typeof hook.str === "function" ? hook.str(key) : "";
    return typeof value === "string" && value ? value : fallback;
  }

  // Some locale entries are maps rather than strings (session/vault state
  // words). One lookup, so the preview reads the same vocabulary the real
  // session header does instead of inventing a second one.
  function strIn(key, sub, fallback) {
    const hook = window.__aetherStrings;
    const map = hook && typeof hook.str === "function" ? hook.str(key) : null;
    const value = map && typeof map === "object" ? map[sub] : "";
    return typeof value === "string" && value ? value : fallback;
  }

  // ------------------------------------------------------------- fixture
  // THE mock content, in one place. Deliberately generic and obviously
  // authored: no real user question, no real Vault path, no personal data.
  // Stable text, so screenshots and tests do not drift.
  //
  // Everything that names a CHARACTER is injected by the caller from the
  // current unsaved Scene — this fixture never hardcodes a persona name.
  const FIXTURE = {
    question: "How should a small team choose between depth and breadth?",
    // Deliberately not a path shape a real Vault would ever produce.
    vaultPath: "XXX / Author Preview",
    sessionId: "PREVIEW",
    scholarCount: "3",
    summary: {
      heading: "Where the Council agrees",
      body:
        "All three Scholars converge on the same starting point: the choice is not permanent, and treating it as permanent is what makes it expensive.",
      bullets: [
        "Depth compounds when the problem is well understood.",
        "Breadth buys information when it is not.",
        "The cost of switching later is the number that actually matters.",
      ],
      muted: "Preview content — no provider was called.",
    },
    ruling: {
      heading: "Ruling",
      body:
        "Begin with breadth for one short cycle, then commit to depth on whichever thread produced the clearest evidence. Revisit only when the evidence changes, not when the work gets hard.",
    },
    scholarNote:
      "A representative Scholar answer, long enough to show body text, wrapping and the scroll behaviour of the answer area at realistic width.",
  };

  // --------------------------------------------------------------- helpers
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // -------------------------------------------------------------- sections
  // Each builder returns real runtime markup — same classes the live
  // Workspace uses, so the theme applies identically.

  function buildTabs(identity) {
    const tabs = el("div", "tabs");
    // The Grand Sage tab is the selected one, so both the active and the
    // inactive tab states are on screen at once.
    const entries = [
      { label: identity.judge, active: true },
      { label: identity.scholars[1], active: false },
      { label: identity.scholars[2], active: false },
      { label: identity.scholars[3], active: false },
    ];
    for (const entry of entries) {
      const tab = el("button", entry.active ? "tab is-active" : "tab", entry.label);
      tab.type = "button";
      tabs.appendChild(tab);
    }
    return tabs;
  }

  function buildSessionHeader(identity) {
    const header = el("section", "session-header");

    const top = el("div", "sh-top");
    top.append(el("div", "sh-question", FIXTURE.question));
    const saveArea = el("div", "sh-save-area");
    // ap-vault/ap-primary: the real Workspace styles these two buttons by ID
    // (#save-vault, #run-council), and an id cannot be duplicated onto a mock
    // while the real element still exists. See the matching rules in
    // scene-editor.css — they reference the SAME theme tokens, so the author
    // sees the true gold and accent.
    const save = el("button", "sh-save-btn ap-vault", str("saveToVault", "Save to Vault"));
    save.id = TARGET_IDS.saveVault;
    save.type = "button";
    saveArea.appendChild(save);
    top.appendChild(saveArea);
    header.appendChild(top);

    const meta = el("div", "sh-meta");
    const item = (label, value, badge) => {
      const span = el("span", "sh-item");
      span.append(el("span", null, label), document.createTextNode(" "));
      span.appendChild(el(badge ? "b" : "b", badge ? "badge" : null, value));
      return span;
    };
    meta.append(
      item(str("shSession", "Session"), FIXTURE.sessionId),
      item(str("modeLabel", "Mode"), str("modeCouncil", "Council")),
      item(str("status", "Status"), str("statusTabCompleted", "Completed"), true),
      item(str("shVault", "Vault"), strIn("vaultStateValues", "saved", "saved"), true),
      item(str("shScholars", "Scholars"), FIXTURE.scholarCount)
    );
    header.appendChild(meta);

    // The saved-path line, carrying the unmistakably fake preview path.
    header.appendChild(el("span", "muted sh-save-msg", FIXTURE.vaultPath));
    return header;
  }

  // Stable handles the Tutorial aims its spotlight at. Named here rather
  // than looked up by class from outside, so the ring can never be pointed
  // at an element that a later markup change quietly renames or removes.
  const TARGET_IDS = { discussion: "author-preview-discussion", saveVault: "author-preview-save-vault" };

  function buildDiscussion(identity) {
    const workspace = el("div", "discussion-workspace");
    workspace.id = TARGET_IDS.discussion;

    // Session Summary — the collapsible container plus its answer area.
    const summary = el("div", "session-summary");
    const toggle = el("button", "session-summary-toggle");
    toggle.type = "button";
    toggle.append(el("span", "ss-caret", "▼"), el("span", null, str("sessionSummary", "Session Summary")));
    summary.appendChild(toggle);

    const wrap = el("div", "answer-wrap");
    const copy = el("button", "copy-btn", "⧉");
    copy.type = "button";
    wrap.appendChild(copy);

    const answer = el("div", "tab-content answer");
    answer.appendChild(el("h3", null, FIXTURE.summary.heading));
    answer.appendChild(el("p", null, FIXTURE.summary.body));
    const list = el("ul");
    for (const line of FIXTURE.summary.bullets) list.appendChild(el("li", null, line));
    answer.appendChild(list);
    answer.appendChild(el("p", "muted", FIXTURE.summary.muted));
    wrap.appendChild(answer);
    summary.appendChild(wrap);
    workspace.appendChild(summary);

    // The conversation thread: one Scholar turn and the Grand Sage ruling,
    // so both bubble treatments are visible.
    const log = el("div", "chat-log");

    const userTurn = el("div", "chat-msg chat-user");
    userTurn.appendChild(el("p", null, FIXTURE.question));
    log.appendChild(userTurn);

    const scholarTurn = el("div", "chat-msg chat-assistant");
    scholarTurn.appendChild(el("h4", null, identity.scholars[1]));
    scholarTurn.appendChild(el("p", null, FIXTURE.scholarNote));
    log.appendChild(scholarTurn);

    const ruling = el("div", "chat-msg chat-assistant");
    ruling.appendChild(el("h4", null, `${identity.judge} — ${FIXTURE.ruling.heading}`));
    ruling.appendChild(el("p", null, FIXTURE.ruling.body));
    log.appendChild(ruling);

    workspace.appendChild(log);
    return workspace;
  }

  function buildInteraction(identity) {
    const interaction = el("div", "interaction-workspace");

    const controls = el("div", "ask-controls");
    const modeGroup = el("div", "mode-group");
    const labelRow = el("span", "mode-label-row");
    labelRow.appendChild(el("span", "mode-label", str("modeLabel", "Mode")));
    modeGroup.appendChild(labelRow);

    const modeRow = el("div", "mode-row");
    const toggle = el("div", "mode-toggle");
    const council = el("button", "mode-btn is-active", str("modeCouncil", "Council"));
    council.type = "button";
    const mentor = el("button", "mode-btn", str("modeMentor", "Mentor"));
    mentor.type = "button";
    toggle.append(council, mentor);
    modeRow.appendChild(toggle);

    const useVault = el("label", "use-vault-label");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = true;
    useVault.append(chk, el("span", null, str("useVaultLabel", "Use Vault")));
    modeRow.appendChild(useVault);
    modeGroup.appendChild(modeRow);
    controls.appendChild(modeGroup);

    // All three Scholar cards, with the first two selected so both the
    // selected and unselected card treatments are on screen.
    const picker = el("div", "scholar-picker");
    [1, 2, 3].forEach((slot, index) => {
      const chip = el("button", index < 2 ? "scholar-chip is-on" : "scholar-chip");
      chip.type = "button";
      chip.appendChild(el("span", "chip-check", index < 2 ? "✓" : ""));
      chip.appendChild(el("span", "chip-label", identity.scholars[slot]));
      picker.appendChild(chip);
    });
    controls.appendChild(picker);
    interaction.appendChild(controls);

    // The composer, with its toolbar controls.
    const composer = el("div", "composer");
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.placeholder = str("composerPlaceholder", "Present your question...");
    // Never carries a draft — the real composer's text is untouched behind
    // this layer, and nothing here is readable as user content.
    textarea.value = "";
    composer.appendChild(textarea);

    const toolbar = el("div", "composer-toolbar");
    const attach = el("button", "attach-btn", "+");
    attach.type = "button";
    toolbar.appendChild(attach);
    const right = el("div", "composer-toolbar-right");
    const reset = el("button", "secondary", str("reset", "Reset"));
    reset.type = "button";
    const send = el("button", "ap-primary", str("send", "Send"));
    send.type = "button";
    right.append(reset, send);
    toolbar.appendChild(right);
    composer.appendChild(toolbar);
    interaction.appendChild(composer);

    // Quick Questions, in its collapsed default state.
    const quickWrap = el("div", "quick-actions-wrap");
    const quickToggle = el("button", "quick-actions-toggle");
    quickToggle.type = "button";
    quickToggle.append(
      el("span", null, str("quickQuestions", "✨ Quick Questions")),
      el("span", "qa-caret", "▾")
    );
    quickWrap.appendChild(quickToggle);
    interaction.appendChild(quickWrap);

    return interaction;
  }

  // ----------------------------------------------------------- the indicator
  // Deliberately styled in the EDITOR's own language (see scene-editor.css),
  // not the Scene's: an authored theme must never be able to make the way
  // back out of preview invisible.
  function buildIndicator() {
    const badge = el("div", "ap-indicator");
    badge.id = "author-preview-indicator";
    badge.append(
      el("span", "ap-indicator-title", "AUTHOR PREVIEW"),
      el("span", "ap-indicator-hint", "F9 to return to editor")
    );
    return badge;
  }

  // ------------------------------------------------------------ mount/unmount

  // `indicator` is opt-in: the F9 authoring path shows the way-out badge,
  // the Tutorial does not (it has its own callout and Next button, and
  // "F9 to return to editor" would be meaningless to a first-run user).
  function mount(context) {
    if (active) return false;
    const panel = document.getElementById("chat-panel");
    if (!panel) return false;

    const identity = context?.identity;
    if (!identity || !identity.judge || !identity.scholars) return false;

    const root = el("div", "author-preview");
    root.id = ROOT_ID;

    // ONE inert boundary for the whole mock. Capture phase, so nothing
    // inside can reach an application handler even if one were ever bound.
    for (const type of INERT_EVENTS) {
      root.addEventListener(
        type,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true
      );
    }

    root.append(
      buildTabs(identity),
      buildSessionHeader(identity),
      buildDiscussion(identity),
      buildInteraction(identity)
    );

    // Hide the real Workspace WITHOUT touching it: no clearing, no
    // rewriting, nothing to restore afterwards but a class.
    document.body.classList.add(BODY_CLASS);
    panel.appendChild(root);
    if (context?.indicator) document.body.appendChild(buildIndicator());
    active = true;
    // The normal two-panel layout is back, so the production split divider
    // is live again — ask the app to re-derive it rather than setting it.
    window.__aetherSplit?.refresh?.();
    return true;
  }

  function unmount() {
    if (!active) return false;
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById("author-preview-indicator")?.remove();
    document.body.classList.remove(BODY_CLASS);
    active = false;
    // The editor owns the right-hand column again.
    window.__aetherSplit?.refresh?.();
    return true;
  }

  window.__authorPreview = {
    mount,
    unmount,
    isActive: () => active,
    // The Tutorial's spotlight targets, resolved only while mounted.
    element: (name) => (active ? document.getElementById(TARGET_IDS[name] || "") : null),
    TARGET_IDS,
    // Exposed for tests and for anything that wants to assert the preview
    // never leaks into real payloads.
    fixture: () => JSON.parse(JSON.stringify(FIXTURE)),
    ROOT_ID,
    BODY_CLASS,
  };
})();
