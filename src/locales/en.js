// English locale — the reference pack for the Aether Library UI.
//
// Every user-facing interface string lives in a locale file like this one;
// nothing user-visible is hardcoded in components. Adding a language means
// copying this file, translating it, and registering it in
// src/localization.js (one import line). Missing keys in other locales fall
// back to this pack.
//
// WORLD TERMINOLOGY — official product terms, identical in every locale and
// never translated: "Aether Library", "Vault", "Traveler".
//
// `{name}`, `{count}`, `{path}`, `{error}`, `{n}`, `{title}` are caller-
// substituted placeholders — keep them verbatim in translations.

export default {
  // Native name of this language, shown in Settings → General → Interface
  // Language. Always written in the language itself.
  label: "English",

  // Typography for prose written in this language (see parenthesesFor /
  // listSeparator in src/localization.js). Declared as DATA so a new locale
  // only adds a file, never a condition.
  // The leading space is part of Latin typography: "Architect (謀者)".
  parentheses: [" (", ")"],
  listSeparator: ", ",

  // In-world character identities (see docs/world/characters.md). The English
  // scholar names double as the official titles shown on hover cards in every
  // language ("The Architect" …).
  identity: {
    judge: "Grand Sage",
    scholars: { 1: "Architect", 2: "Oracle", 3: "Analyst" },
  },

  strings: {
    // ------------------------------------------------------------- settings
    settings: "Settings",
    aiConfig: "AI Config",
    display: "Display",
    windowMode: "Window Mode",
    windowModeWindowed: "Windowed",
    windowModeFullscreen: "Fullscreen",
    windowModeBorderless: "Borderless Windowed",
    // Independent of Window Mode — it composes with all three.
    alwaysOnTop: "Always on Top",
    displayUnavailable: "Available in the desktop app.",
    save: "Save",
    cancel: "Cancel",
    general: "General",
    interfaceLanguage: "Interface Language",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    provider: "Provider",
    model: "Model",
    defaultReplyLanguage: "Default Reply Language",
    // The FIRST option, and the default until the user picks a language: the
    // reply follows whatever language the question was asked in. Named for
    // what it does rather than called "Auto", which says nothing about what
    // is being matched.
    matchQuestionLanguage: "Match Question Language",
    apiProviders: "API Providers",
    scholarAssignment: "Scholar Assignment",
    apiKey: "API key",
    enabled: "Enabled",
    status: "Status",
    configured: "Configured",
    notConfigured: "Not configured",
    keyBlankKeeps: "configured — blank keeps it",
    keyNotSet: "not set",
    refreshModels: "Refresh Model List",
    refreshing: "Refreshing…",
    statusConnected: "Connected",
    statusApiKeyRequired: "API key required",
    statusModelRequired: "Model required",
    statusModelUnavailable: "Model unavailable",
    statusProviderDisabled: "Provider disabled",
    selectModel: "Select a model",
    refreshHint: "Refresh models to load the list",
    modelUnavailableWarn: "The configured model was not found for this provider.",
    // Refresh Model List badges — sourced from the curated catalog's explicit
    // per-model metadata (src/config/supported-models.js) whenever a model
    // came from there, which is every model this dropdown ever lists; a
    // name-pattern fallback only covers a manually .env-configured model
    // outside the catalog (see classifyModelBadges() in app.js). Never tied
    // to which Scholar role is using it.
    badgeRecommended: "⭐ Recommended",
    badgeFast: "⚡ Fast",
    badgeReasoning: "🧠 Reasoning",
    badgeBudget: "💰 Budget",
    badgeExperimental: "🧪 Experimental",
    // Reserved for a future Settings toggle (not built yet) that would
    // include catalog experimental/preview entries in Refresh Model List.
    showExperimentalModels: "Show Preview / Experimental Models",
    assignedToScholar: "This Provider is currently assigned to {name}.",
    assignedToJudge: "This Provider is currently assigned to {name}.",
    judgeTitleSuffix: " (Main Judge)",
    saved: "Saved ✓",
    disableAssignedJudge:
      "{name} is assigned to the Grand Sage (Main Judge). Select a different Judge Provider before disabling it.",
    disableAssignedScholars:
      "Disable {name}? The Scholars using it will be turned off (their provider and model are kept).",
    scholarSlotLabel: "Scholar #{n}",

    // ------------------------------------------------------ start menu / home
    // The subtitle and copyright are brand statements — identical in every
    // locale, like the "Aether Library" title itself.
    startSubtitle: "A Nexus for Explorers",
    startCopyright: "© 2026 Kaz Chang. All rights reserved.",
    enterLibrary: "Enter Library",
    connectVault: "Connect Vault",
    archives: "Archives",

    // ------------------------------------------------------- vault controls
    // "Vault" is world terminology — untranslated in every locale. Obsidian
    // is an optional integration; the built-in Vault is the primary system.
    vaultButton: "VAULT",
    vaultMenuAria: "Vault menu",
    openVault: "Open Vault",
    copyVaultPath: "Copy Vault Path",
    changeVaultLocation: "Change Vault Location...",
    obsidianIntegration: "Obsidian Integration",
    integrationOn: "On",
    integrationOff: "Off",
    enableObsidian: "Enable Obsidian Integration",
    disableObsidian: "Disable Obsidian Integration",
    obsidianVaultLabel: "Obsidian Vault",
    changeObsidian: "Change Obsidian Vault...",
    refresh: "Refresh",
    obsidianNotVault:
      "This folder doesn't look like an Obsidian vault (no .obsidian folder inside). Connect it anyway?",
    obsidianConnectFailed: "Could not connect that Obsidian vault: {error}",
    exportObsidian: "Export to Obsidian",
    exported: "Exported ✓",
    exporting: "Exporting…",
    updateObsidian: "Update in Obsidian",
    updated: "Updated ✓",
    obsidianStaleHint: "This session has changed since the last export.",
    autoExportLabel: "Automatically export to Obsidian as well",
    obsidianExportFailed: "Obsidian export failed",
    obsidianExportFailedMsg: "Saved to Aether Vault, but Obsidian export failed.",
    currentVault: "Current Vault",
    openVaultTitle: "Open {path}",
    vaultPathMissing: "{path} (not found — choose Change Vault Location)",
    vaultOpenFailed: "Could not open the Vault folder: {error}",
    vaultConnectFailed: "Could not connect that Vault: {error}",
    pickerFailed: "Could not open the folder picker: {error}",
    changeVaultTitle: "Change Vault Location",
    newVault: "New Vault",
    useThisFolder: "Use This Folder",

    // ------------------------------------------------------------ fullscreen
    fullscreenLibrary: "Fullscreen library",
    fullscreenChat: "Fullscreen chat",

    // -------------------------------------------------- book & mode selection
    bookHotspot: "Start a conversation",
    // The idle discussion panel shows these two together: councilWelcome is
    // the primary greeting, bookPrompt the secondary instruction under it.
    // Only the empty state — a Session in flight replaces both with its
    // progress message (see refreshDiscussionEmptyText in app.js).
    councilWelcome: "The Council awaits your questions.",
    bookPrompt: "Click the book on the table to begin...",
    // "Traveler" is world terminology — untranslated in every locale.
    modeModalWelcome: "Welcome, Traveler.",
    modeModalChoose: "Choose your preferred mode.",
    modeCouncil: "Council",
    modeMentor: "Mentor",
    modeLabel: "Mode",

    // --------------------------------------------------------- session header
    shSession: "Session",
    shScholars: "Scholars",
    shVault: "Vault",
    sessionStarting: "starting…",
    sessionStatusValues: { active: "active", saved: "saved", discarded: "discarded", error: "error", stopped: "stopped" },
    vaultStateValues: { unsaved: "unsaved", saved: "saved" },
    saveToVault: "Save to Vault",
    saving: "Saving…",
    savedToPath: "Saved to {path}.",
    // Saving is the ONE thing that genuinely needs a Vault. Entering the
    // Library and holding a discussion do not, so this is guidance at the
    // point of need rather than a gate on the way in.
    vaultRequiredToSave: "Connect a Vault to save this discussion.",
    reset: "Reset",
    sessionGone:
      "This Session no longer exists on the server (it restarted since this run). Start a new Session.",

    // The lost-Session recovery panel. The active Session is held only in the
    // server's memory, so a restart ends it while this page still shows the
    // discussion — see services/sessionRecovery.js. A Session that reached the
    // Vault was archived under the same id and can be reopened as a new
    // discussion; one that never did is genuinely gone, and says so.
    sessionLostTitle: "This discussion is no longer active",
    sessionLostChecking: "Checking whether this discussion can be continued…",
    sessionLostSaved:
      "The server restarted, so this discussion can no longer be continued directly. It was saved to your Vault, so you can reopen it as the starting point for a new discussion.",
    sessionLostUnsaved:
      "The server restarted, so this discussion can no longer be continued, and it was never saved to your Vault. It is still shown above — copy anything you want to keep before starting a new Session.",
    sessionLostContinue: "Continue in a New Discussion",
    sessionLostReset: "Start a New Session",

    // ------------------------------------------------------ conversation tabs
    waiting: "Waiting…",
    noAnswer: "No answer.",
    noRuling: "No ruling.",
    summaryTab: "Summary",
    scholarFallback: "The Scholar",
    // Staged progress shown while a Council run is in flight (see
    // runProgressMessage() in app.js): the Grand Sage panel / empty state
    // advances through these as the run's stream events arrive, instead of
    // one generic "waiting".
    progressPreparing: "Preparing the council…",
    progressScholars: "The scholars are reviewing your question…",
    progressJudge: "The Grand Sage is considering the scholars' arguments…",
    // Per-tab run states (tab glyph tooltips — see syncTabStatuses() in app.js).
    statusTabWaiting: "Waiting…",
    statusTabThinking: "Thinking…",
    statusTabCompleted: "Completed",
    statusTabFailed: "Failed",
    // Live request phases (per Scholar) + attach phases — see the three-phase
    // timeout architecture (src/providers/timeouts.js).
    statusUploadingFile: "Uploading {name}…",
    statusExtractingDocument: "Extracting {name}…",
    statusWaitingProvider: "Waiting for the provider…",
    statusReceivingResponse: "Receiving the response…",
    statusLongAnalysis: "Long analysis in progress…",
    // Classified timeout reasons (never shown as "model unavailable" — a
    // timeout during a long analysis says nothing about the model itself).
    errorConnectionTimeout: "The provider did not start responding (connection timeout).",
    errorInactivityTimeout: "Timed out due to inactivity — the provider stopped responding mid-request.",
    errorHardTaskTimeout: "Reached the maximum processing time for this request.",
    // Failed-scholar recovery: Council keeps every completed answer; these
    // actions affect only the one failed Scholar (and, afterwards, the ruling).
    retryScholarAction: "Retry this Scholar",
    retryChangeModelAction: "Change model & retry",
    retryChangeModelGo: "Retry with this model",
    continueAvailableAction: "Continue with available Scholars",
    retryFailedMsg: "Retry failed: {error}",
    rulingStaleNotice: "A Scholar's answer was updated after this ruling.",
    regenerateRulingAction: "Regenerate the ruling",

    // ---------------------------------------------------------- run failures
    // Shown when a request never got a real provider response at all (client-
    // side timeout/abort/network failure — see friendlyErrorMessage() in
    // app.js). A provider's own error ("Google API 404: …") is already clear
    // and shown as-is instead of these.
    errorTimeout: "The request timed out. Please try again.",
    errorNetwork: "A network error occurred. Please check your connection and try again.",
    errorAborted: "The request was cancelled.",
    // Run Safety: a second Send while a discussion is already being generated
    // (server-rejected with 409, so nothing was spent). The question is put
    // back in the composer, ready to send once the current run finishes.
    errorRunInProgress: "A discussion is already in progress. Please wait for it to finish before starting another.",
    // Shown after a page reload that landed mid-generation: the run continues
    // on the server, and this page adopts it as soon as it finishes.
    runInProgressReload: "A discussion is still being generated — waiting for it to finish…",

    // ------------------------------------------------- runtime run controls
    // Stop Generation: the ONE composer button becomes Stop while a run is
    // working (see setRunButtonMode in app.js). Distinct from Reset — Stop
    // ends the generation but keeps everything already produced.
    stopGeneration: "Stop",
    stopGenerationHint: "Stop generating — answers already received are kept",
    stopping: "Stopping…",
    generationStopped: "Generation stopped. Answers already received were kept.",
    // Shown in the discussion area when the run was stopped before anything
    // usable arrived. Deliberately NOT the model-unavailable panel: nothing
    // here suggests the model failed or should be replaced.
    generationStoppedTitle: "Generation stopped",
    generationStoppedBody:
      "You stopped this discussion. Any answers that had already arrived were kept — ask again whenever you are ready.",
    scholarStopped: "Stopped before this Scholar answered.",
    statusTabStopped: "Stopped",
    // Provider Failure Gate: a Scholar failed terminally and the Grand Sage
    // is held until the player decides. {name} is the Scholar's in-world
    // name (never a provider or model id).
    failureGateTitle: "{name} did not respond",
    failureGateQuestion: "Continue the discussion without {name}?",
    failureGateContinue: "Continue without {name}",
    failureGateStop: "Stop discussion",
    awaitingDecision: "Awaiting your decision…",
    continuedWithout: "Discussion continued without {name}.",
    noUsableResponses: "No usable model responses.",
    // Concise, non-technical reasons — mapped from the server's failure
    // category (see FAILURE_REASON_KEYS in app.js). The raw provider error is
    // deliberately never shown here.
    failureReasonTimeout: "The model did not respond in time.",
    failureReasonUnavailable: "The model is unavailable.",
    failureReasonRateLimit: "The rate limit was reached.",
    failureReasonAuth: "The API key was rejected.",
    failureReasonBilling: "The provider reported a billing or credit problem.",
    failureReasonProvider: "The provider reported an error.",
    // Joins several character names in one sentence.
    nameSeparator: ", ",
    // Status-based category labels (see providerErrorCategory() in app.js) —
    // prefixed onto the provider's own error text, never replacing it.
    errorAuthInvalid: "Invalid or unauthorized API key",
    errorAccessDenied: "Access denied for this model or account",
    errorEndpointUnavailable: "Model or endpoint not found",
    errorQuotaExceeded: "Quota or rate limit reached — please try again later",
    errorProviderServer: "The provider's server had an error — please try again later",
    // Session-level fatal failure — shown in the discussion area (replacing
    // the "waiting" placeholder) when NO Scholar/Judge produced anything
    // usable at all (see the !anyTabOk branch in startSessionRun()). Not
    // shown for a partial failure (some Scholars ok) — that stays a per-tab
    // error only.
    sessionErrorTitle: "Model unavailable",
    sessionErrorMessage:
      "The selected model could not complete this request. Please choose another model and try again, or use Reset to start a new session.",
    // Appended when a scholar/judge failure looks like the model itself is
    // gone (not found, deprecated, unsupported, or access-denied) — it has
    // already been removed from this provider's cached model list.
    modelRemovedHint: "This model was removed from the list — refresh Model List or choose another model.",

    // ------------------------------------------------------------------ chat
    considering: "{name} is considering…",
    send: "Send",
    sending: "Sending…",

    // -------------------------------------------------------------- composer
    // One persistent input for the whole Session: askPlaceholder* before the
    // first question, continuePlaceholder*/continuePlaceholderMentor after it
    // (see lockSessionConfig() in app.js) — Council follow-up always
    // continues through Grand Sage, so it names them; Mentor mode has no
    // Grand Sage at all, so it must never use that text.
    askPlaceholderCouncil: "Present your question...",
    askPlaceholderMentor: "Ask your mentor...",
    continuePlaceholder: "Continue the discussion with Grand Sage, or press Reset to start a new Symposium...",
    continuePlaceholderMentor: "Continue the discussion, or press Reset to begin a new session...",
    sessionLockedHint: "Reset the current Session to unlock these settings.",
    // "Use Vault" Session option beside the Mode toggle — hover text follows
    // the checkbox state (see updateUseVaultHint() in app.js).
    useVaultLabel: "Use Vault",
    useVaultOnHint: "Allow the Librarian to search your Vault and provide relevant notes for this Session.",
    useVaultOffHint: "Skip Vault search and answer using the AI's own knowledge and the current Session conversation.",
    // Attachment chips on submitted turns + their read-only preview dialog.
    close: "Close",
    attachmentChipLabel: "Preview attachment {name}",
    attachmentNoPreview: "This file was included as Session context. No preview is available for this record.",
    noProviderConfigured: "No provider configured yet — open AI Config to add API keys.",
    needScholar: "Enable at least one Scholar (needs an API key).",

    // -------------------------------------------------- scholar picker / hover
    chipDisabled: "disabled",
    chipNoKey: "no key",
    chipStatusReady: "Ready",
    chipStatusNoKey: "No API key",
    chipTitleDisabled: "This Scholar's provider is disabled — enable it in AI Config.",
    chipTitleNoKey: "No API key for this slot's provider — configure it in AI Config.",
    specialty: "Specialty",
    scholarSpecialties: {
      1: "Systems, structure, planning, and strategic reasoning",
      2: "Interpretation, context, knowledge, and guidance",
      3: "Patterns, evidence, comparison, and exploration",
    },

    // -------------------------------------------------------------- archives
    archivesSubtitle: "Previous Council sessions",
    backToLibrary: "Back to Library",
    backToArchives: "Back to Archives",
    searchArchives: "Search archives...",
    loadingArchives: "Loading archives…",
    archivesLoadFailed: "⚠ Could not load archives: {error}",
    noArchives: "No archived sessions yet.",
    noArchivesSub: "Completed Council sessions will appear here.",
    noSearchMatch: "No archives match your search.",
    loadingSession: "Loading session…",
    archiveLoadFailed: "⚠ Could not load this session: {error}",
    dateLabel: "Date",
    synthesisTitle: "{name}'s Synthesis",
    savedToVaultRef: "Saved to Vault: {path}",
    // Follow-up conversation section heading in the Archive detail view —
    // only rendered when the saved record captured chat turns (manual
    // follow-ups and Quick Questions alike).
    archiveConversationTitle: "Conversation",
    // Sync to Obsidian from the Archive detail view — the recovery path for
    // a session the user forgot to export before resetting. Same optional
    // secondary destination as the live export row; the archive itself is
    // always kept.
    archiveSyncObsidian: "Sync to Obsidian",
    archiveSyncAgain: "Update synced file",
    archiveSyncedObsidian: "Synced to Obsidian ✓",
    archiveSyncing: "Syncing…",
    archiveSyncSuccess: "Synced to {path}.",
    archiveSyncFailed: "Sync failed: {error}",
    archiveSyncNotConfigured: "No Obsidian vault is connected — enable the Obsidian integration in the Vault menu first.",
    archiveSyncOpenVaultMenu: "Open Vault menu",
    // Continue Discussion — reopens a completed Archive as previous-
    // discussion context for a NEW session (see continueDiscussion() in
    // app.js). previousDiscussionLabel is the attachment chip's own label
    // text (icon prepended separately, like every other attachment kind);
    // {title} is the archive's own title.
    continueDiscussion: "Continue Discussion",
    previousDiscussionLabel: "Previous discussion: {title}",
    // Archive Discussion Threads — the Archive Detail page's optional
    // compact position line (section 13), shown only when this Archive
    // belongs to a multi-session thread. {index} is 1-based, oldest first.
    archiveThreadPosition: "Discussion {index} of {count}",
    // "Remove", not "Delete": this action only removes the session from the
    // Archive index — files saved to the Vault or Obsidian are never touched,
    // and the wording must make that distinction clear.
    removeFromArchives: "Remove from Archives",
    removeConfirmTitle: "Remove from Archives?",
    removeConfirmBody1: "This session will be removed from the Archive list.",
    removeConfirmBody2: "Files already saved to Vault or Obsidian will remain untouched.",
    removeConfirmAction: "Remove",
    removeFailed: "Could not remove this session from Archives: {error}",
    // Reset confirmation — shown only when the active Session has unsaved
    // content (see resetSession() in app.js). Reset logic itself is
    // unchanged; this only guards the entry point.
    resetConfirmTitle: "Reset Session?",
    resetConfirmBody1: "Your current conversation has not been saved to Vault.",
    resetConfirmBody2: "Resetting will permanently discard all unsaved content.",
    // Pre-send warning — shown only when one or more of the models about to
    // be used has a failure record inside the 24-hour warning window (see
    // isRuntimeUnavailable()/markModelUnavailable() in app.js). The affected
    // model ids are listed between the message and the question.
    modelFailureWarningTitle: "Some selected models recently failed",
    modelFailureWarningMessage: "The following models were unavailable within the past 24 hours:",
    modelFailureWarningQuestion: "Do you still want to continue?",
    continueAnyway: "Continue anyway",

    // ------------------------------------------------- Council Model Check
    // Pre-check notice (intercepts Send — see runCouncilPrecheck() in
    // app.js) AND the matching Settings → Council Model Check section share
    // this block. councilCheckTitle doubles as both the dialog's <h2> and
    // the Settings fieldset's legend (identical wording in both places, per
    // spec). councilCheckRecommended is a DIFFERENT concept from the model
    // catalog's badgeRecommended above — never conflate the two.
    councilCheckTitle: "Council Model Check",
    councilCheckRecommended: "Recommended",
    councilCheckBody:
      "Before starting, Aether Library can send a minimal request to each selected model to confirm that it is currently available and accessible with your API account.",
    councilCheckHelp:
      "This can help prevent an incomplete Council session caused by unavailable models, access restrictions, invalid API credentials, insufficient API credits, or other immediate provider errors.",
    councilCheckCost:
      "Approx. cost: < $0.01 per check. Actual cost may vary depending on your selected models and provider pricing.",
    councilCheckSkipNote:
      "If you skip this check, a model may fail after other Scholars have already started generating, potentially wasting time and API credits.",
    councilCheckAutoLabel: "Automatically perform this check before Council sessions",
    councilCheckSettingsNote: "You can change this option anytime in Settings.",
    councilCheckRun: "Check & Start",
    councilCheckSkip: "Start Without Checking",
    councilCheckChecking: "Checking…",
    councilCheckRetry: "Retry Check",
    // The Council pre-check fails for exactly one class of reason — a missing
    // key, a disabled provider, an unavailable model, a rate limit — and every
    // one of those is repaired in AI Config, not in Settings. It said "Open
    // Settings" and opened Settings, which is where providers USED to live
    // before the two dialogs were split; a user following it landed in a
    // dialog with no provider fields in it at all.
    councilCheckOpenAiConfig: "Open AI Config",
    // Settings → Council Model Check (wording distinct from the dialog's own
    // checkbox label above, per spec §6).
    councilCheckSettingsAutoLabel: "Automatically perform a minimal API check before starting Council sessions",
    councilCheckSettingsDesc:
      "Helps detect model availability, API access, authentication, and billing issues before generation begins. Each check sends a minimal API request and may incur a small charge.",
    councilCheckSettingsCost: "Approx. cost: typically < $0.01 per check.",
    // Manual "Check Models Now" button (Settings → Council Model Check) —
    // reuses councilCheckChecking (already defined above) for its in-flight
    // state, and COUNCIL_ERROR_CATEGORY_KEYS (already defined above) for a
    // failed participant's row — only the button label and the success
    // message are new here.
    councilCheckManualBtn: "Check Models Now",
    councilCheckManualSuccess: "Verification complete. All models are available.",
    // ------------------------------------------------- AI / Product Status
    // Read-only status shown in the Core Book modal and the Product Status
    // view (see src/services/productStatus.js). "Configured" deliberately
    // means "credentials exist", NEVER "passed the model check" — the two
    // are separate facts and the wording must not blur them.
    aiStatusTitle: "AI Status",
    statusConfigured: "Configured",
    statusNotConfigured: "Not configured",
    statusDisabled: "Configured (off)",
    modelCheckLabel: "Model check",
    // The four states productStatus.js can honestly derive. "Acknowledged"
    // exists because the persisted signature cannot distinguish a passed
    // check from an informed "Start Without Checking" once the page reloads.
    modelCheckNotChecked: "Not checked",
    modelCheckPassed: "Passed",
    modelCheckAcknowledged: "Acknowledged (not re-verified)",
    modelCheckNeedsRecheck: "Needs re-check",
    modelCheckFailed: "Check failed",
    productStatusTitle: "Product Status",
    productStatusOpen: "View Product Status",
    productStatusProviders: "AI Providers",
    productStatusCouncil: "Council",
    productStatusModelCheck: "Model Check",
    productStatusVault: "Vault",
    productStatusGrandSage: "Grand Sage",
    productStatusScholarSlot: "Scholar {n}",
    productStatusVaultConnected: "Connected",
    productStatusVaultMissing: "Configured, folder missing",
    productStatusVaultNone: "Not connected",
    productStatusAutoCheckOn: "Automatic check before each Council: on",
    productStatusAutoCheckOff: "Automatic check before each Council: off",
    productStatusNoLastCheck: "This build does not record a last-check time.",
    productStatusReadOnly: "Informational only — opening this never contacts a provider.",
    productStatusSlotOff: "Off",
    productStatusClose: "Close",
    // ------------------------------------------------- Batch B: MORE menu
    moreMenu: "MORE",
    moreTutorial: "Tutorial",
    moreLearn: "Learn",
    moreReportIssue: "Report & Feedback",
    moreWebsite: "Official Website",
    moreDiscord: "Join Discord",
    moreGithub: "GitHub",
    moreSupport: "Support Aether Library",
    moreAbout: "About",
    // Shown as a title on a MORE entry whose URL has not been set yet, so a
    // disabled item explains itself instead of looking broken.
    linkNotConfigured: "This link is not available yet.",
    // ------------------------------------------------------ Batch B: About
    aboutTitle: "About",
    aboutVersion: "Version {version}",
    aboutDescription:
      "A local-first reasoning workspace: several AI Scholars consider your question, a Grand Sage brings their answers together, and anything worth keeping is saved to your own Vault.",
    // Fallback labels for authored Scene UI Content links that have no
    // title in the current locale (see renderAbout in app.js).
    aboutWebsiteLead: "Learn more at",
    aboutClose: "Close",
    // --------------------------------------------------- Batch B: Tutorial
    tutorialStepCount: "Step {n} of {total}",
    tutorialNext: "Next",
    tutorialBack: "Back",
    tutorialSkip: "Skip",
    tutorialFinish: "Enter the Library",
    tutorialStep1Title: "Settings",
    tutorialStep1Body:
      "Adjust your interface language, default reply language, and visual theme here.",
    tutorialStep2Title: "AI Config",
    tutorialStep2Body:
      "Connect your AI providers, set up API access, and choose or refresh your preferred models.",
    tutorialStep3Title: "Vault",
    tutorialStep3Body:
      "Choose the folder you want to use as your Vault.\nIf you want to sync to Obsidian, enable the option and select the folder that contains the .obsidian folder.",
    tutorialStep4Title: "Aetherom",
    tutorialStep4Body:
      "Click Aetherom whenever you want to start a new discussion.",
    tutorialStep5Title: "Council or Mentor",
    tutorialStep5Body:
      "Council gathers one or more independent opinions before the Grand Sage reaches a final conclusion.\nMentor lets one Scholar answer directly.",
    tutorialStep6Title: "Choose Your Scholars",
    tutorialStep6Body:
      "Choose which Scholars take part in this discussion.\nYou can change the Judge, switch modes, or pick different Scholars at any time.",
    tutorialStep7Title: "Attachments",
    tutorialStep7Body:
      "Attach files, PDFs, images, or text before asking a question. You can also drag and drop files or paste images directly.",
    tutorialStep8Title: "Ask Your Question",
    tutorialStep8Body:
      "Type your question, then press Send to begin the discussion.",
    tutorialStep9Title: "Review the Discussion",
    tutorialStep9Body:
      "Read the discussion, continue asking follow-up questions, or use Quick Questions below the input box to explore the topic further.",
    tutorialStep10Title: "Save to Vault",
    tutorialStep10Body:
      "Save this discussion to your Vault.\nIf Obsidian Sync is enabled, you can also choose to sync it to your Obsidian Vault.",
    tutorialStep11Title: "Privacy & Learn More",
    tutorialStep11Body:
      "Your API keys are stored on your device. Aether Library cannot access or retrieve your stored API keys.\nWhen you send a question, it is sent only to the AI provider(s) you selected.\nFor documentation, updates, and support, visit aetherlibrary.app",
    // ------------------------------------------------------ Batch B: Learn
    learnTitle: "Learn",
    learnClose: "Close",
    // Persistent Council-level failure (see showCouncilPrecheckError() in
    // app.js) — "Council could not begin" title + per-participant rows, each
    // combining a normalized category label with the provider's own message.
    councilCheckErrorTitle: "Council could not begin",
    councilCheckErrorFooter: "No Council responses were generated.",
    // Product-level pre-check categories (classifyProviderError() in
    // src/providers/errors.js) — distinct from errorAuthInvalid etc. above,
    // which describe a REAL Scholar/Judge run failure, not a pre-check one.
    councilErrorModelUnavailable: "This model could not be accessed with the current API account.",
    councilErrorAuth: "The API key for this provider is missing or invalid.",
    councilErrorBilling: "Your API account appears to have insufficient credits or a billing restriction.",
    councilErrorRateLimited: "This provider is rate-limiting requests right now.",
    councilErrorTimeout: "This provider did not respond in time.",
    councilErrorProvider: "This provider returned an error.",
    // Settings changing a Scholar/Judge Provider or Model while a Session is
    // active (see confirmSettingsSessionChange() in app.js). body1/body2 are
    // picked per whether the active Session has been saved to Vault yet;
    // body3 (the Archives-record line) only appears in the unsaved case —
    // the saved case already covers it inside body2Saved.
    settingsSessionWarningTitle: "Start a New Session?",
    settingsSessionWarningBody1Unsaved: "Changing the Provider or Model will reset the current Session.",
    settingsSessionWarningBody2Unsaved: "Any content not saved to Vault will be lost.",
    settingsSessionWarningBody3Unsaved: "The existing Archives record will remain available.",
    settingsSessionWarningBody1Saved: "Changing the Provider or Model will end the current Session and start a new one.",
    settingsSessionWarningBody2Saved: "The saved Vault file and Archives record will remain available.",
    resetAndApply: "Reset and Apply",
    // BCP-47 locale used for date/time formatting in this language.
    dateLocale: "en-US",

    // ------------------------------------------------------------- librarian
    // The Vault presented as the library of the Aether world. `{count}` is a
    // caller-substituted placeholder. Never show paths, folders, filenames,
    // or token counts here.
    librarianSearching: "📚 The Librarian is searching the library...",
    librarianFoundOne: "📚 The Librarian found 1 related note.",
    librarianFound: "📚 The Librarian found {count} related notes.",
    librarianNone: "📚 The Librarian couldn't find any relevant notes.",
    // Library Activity — a generic, in-world notification panel (bottom-right
    // of the game view) for background activity: Librarian retrieval today,
    // future Scholar/Grand Sage/Historian/NPC activity later. The title stays
    // generic on purpose; only this panel's own strings use fresh wording —
    // the librarian* strings above are unchanged and still used verbatim as
    // the Chat Fullscreen fallback (the world panel isn't visible there).
    libraryActivity: "Library Activity",
    libraryActivitySearching: "Searching the archive...",
    libraryActivityFound: "Found {count} related notes.",
    libraryActivityMore: "+{count} more",

    // ----------------------------------------------- composer attachments
    attachTooltip: "Attach files (images, PDF, Markdown, text)",
    attachmentReading: "Reading {name}…",
    attachmentFetchingUrl: "Fetching page…",
    attachmentUnsupported: "Unsupported file type: {name}",
    attachmentsLoading: "Materials are still loading — one moment before starting.",
    removeAttachment: "Remove {name}",
    copy: "Copy",
    copied: "Copied ✓",
    modelsCount: "{count} models",
    // Shown under the Perplexity provider row: this integration speaks the
    // Sonar API only, so "Refresh Model List" reloads a maintained catalog
    // rather than discovering the whole Perplexity platform.
    perplexitySonarNote: "Currently supports the Perplexity Sonar model family.",
    // First-run AI setup guidance (see maybeShowAiSetupHint in app.js).
    aiSetupHint: "Connect your first AI Provider",
    // Stage 2 of first-run setup — shown only once a provider exists.
    vaultSetupHint: "Connect a Vault to save discussions",
    aiSetupHintDismiss: "Dismiss",
    aiSetupTitle: "AI Provider Required",
    aiSetupBody1: "No AI providers have been configured yet.",
    aiSetupBody2: "Connect your first AI provider in AI Config to begin conversations.",
    aiSetupOpenSettings: "Open AI Config",
    aiSetupLater: "Later",
    modeToggleAria: "Interaction mode",
    quickQuestions: "✨ Quick Questions",
    quickQuestionsExpand: "Expand Quick Questions",
    quickQuestionsCollapse: "Collapse Quick Questions",
    resizeWorkspaceDivider: "Resize conversation and interaction panels",
    // Session Summary: the collapsible ruling/answer block at the top of the
    // discussion workspace (see setSessionSummaryExpanded() in app.js).
    sessionSummary: "Session Summary",
    sessionSummaryExpand: "Expand Session Summary",
    sessionSummaryCollapse: "Collapse Session Summary",

    // Judge Chat quick actions. `text` doubles as the message sent to the
    // Judge, so each translation must keep the same question semantics.
    judgeQuickActions: [
      { icon: "🏆", text: "Who gave the best answer?" },
      { icon: "⚖", text: "Compare all scholars" },
      { icon: "🧠", text: "Explain for beginners" },
      { icon: "📚", text: "Merge the best ideas" },
      { icon: "🔍", text: "Challenge your own conclusion" },
      { icon: "⭐", text: "Rate each scholar" },
      { icon: "📖", text: "What did each scholar contribute?" },
      { icon: "🎯", text: "Which answer is the most accurate?" },
      { icon: "💡", text: "Which explanation is easiest to understand?" },
      { icon: "🔬", text: "What evidence supports your conclusion?" },
    ],
  },

  // ------------------------------------------------------ Learn / User Guide
  // Player-facing guide content (Batch B). Deliberately plain-language: no
  // internal service names, module paths, or architecture terms. Shape is
  // [{ id, title, blocks }] where a block is { type:"p", text } or
  // { type:"list", items:[…] }.
  // Learn / User Guide prose now lives in ONE authoritative place:
  // assets/content/learn/<id>.json (see src/services/contentResources.js).
  // Keeping a second copy here would mean two sources of truth for the
  // same text. Only the UI labels that render the guide remain in this
  // pack (learnTitle / learnClose, in `strings` above).
};
