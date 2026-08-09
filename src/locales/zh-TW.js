// Traditional Chinese (繁體中文) locale for the Aether Library UI.
//
// WORLD TERMINOLOGY — official product terms, identical in every locale and
// never translated: "Aether Library", "Vault", "Traveler".
//
// `{name}`, `{count}`, `{path}`, `{error}`, `{n}`, `{title}` are caller-
// substituted placeholders — keep them verbatim.

export default {
  label: "繁體中文",

  // Full-width punctuation for Chinese prose (see parenthesesFor /
  // listSeparator in src/localization.js).
  parentheses: ["（", "）"],
  listSeparator: "、",

  identity: {
    judge: "大智者",
    scholars: { 1: "謀者", 2: "墨者", 3: "理者" },
  },

  strings: {
    // ------------------------------------------------------------- settings
    settings: "設定",
    aiConfig: "AI 配置",
    display: "顯示",
    windowMode: "視窗模式",
    windowModeWindowed: "視窗化",
    windowModeFullscreen: "全螢幕",
    windowModeBorderless: "無邊框全螢幕",
    displayUnavailable: "桌面版應用程式才提供。",
    save: "儲存",
    cancel: "取消",
    general: "一般",
    interfaceLanguage: "介面語言",
    theme: "主題",
    themeDark: "深色",
    themeLight: "淺色",
    provider: "供應商",
    model: "模型",
    defaultReplyLanguage: "預設回覆語言",
    apiProviders: "API 供應商",
    scholarAssignment: "學者指派",
    apiKey: "API 金鑰",
    enabled: "啟用",
    status: "狀態",
    configured: "已設定",
    notConfigured: "未設定",
    keyBlankKeeps: "已設定 — 留空則保留",
    keyNotSet: "尚未設定",
    refreshModels: "重新整理模型列表",
    refreshing: "重新整理中…",
    statusConnected: "已連線",
    statusApiKeyRequired: "需要 API 金鑰",
    statusModelRequired: "需要選擇模型",
    statusModelUnavailable: "模型無法使用",
    statusProviderDisabled: "供應商已停用",
    selectModel: "選擇模型",
    refreshHint: "請重新整理以載入模型清單",
    modelUnavailableWarn: "找不到目前設定的模型。",
    badgeRecommended: "⭐ 推薦",
    badgeFast: "⚡ 快速",
    badgeReasoning: "🧠 推理",
    badgeBudget: "💰 經濟",
    badgeExperimental: "🧪 實驗性",
    showExperimentalModels: "顯示預覽／實驗性模型",
    assignedToScholar: "此供應商目前指派給 {name}。",
    assignedToJudge: "此供應商目前指派給 {name}。",
    judgeTitleSuffix: "（主評審）",
    saved: "已儲存 ✓",
    disableAssignedJudge: "{name} 目前指派為大智者（主評審）。請先改選其他評審供應商，才能停用。",
    disableAssignedScholars: "要停用 {name} 嗎？使用它的學者將會被關閉（其供應商與模型設定會保留）。",
    scholarSlotLabel: "學者 #{n}",

    // ------------------------------------------------------ start menu / home
    // Brand statements — identical in every locale.
    startSubtitle: "A Nexus for Explorers",
    startCopyright: "© 2026 Kaz Chang. All rights reserved.",
    enterLibrary: "進入圖書館",
    connectVault: "連接 Vault",
    archives: "檔案庫",

    // ------------------------------------------------------- vault controls
    vaultButton: "VAULT",
    vaultMenuAria: "Vault 選單",
    openVault: "開啟 Vault",
    copyVaultPath: "複製 Vault 路徑",
    changeVaultLocation: "變更 Vault 位置…",
    obsidianIntegration: "Obsidian 整合",
    integrationOn: "開啟",
    integrationOff: "關閉",
    enableObsidian: "啟用 Obsidian 整合",
    disableObsidian: "停用 Obsidian 整合",
    obsidianVaultLabel: "Obsidian Vault",
    changeObsidian: "變更 Obsidian Vault…",
    refresh: "重新整理",
    obsidianNotVault: "此資料夾看起來不是 Obsidian vault（裡面沒有 .obsidian 資料夾）。仍要連接嗎？",
    obsidianConnectFailed: "無法連接該 Obsidian vault：{error}",
    exportObsidian: "匯出到 Obsidian",
    exported: "已匯出 ✓",
    exporting: "匯出中…",
    updateObsidian: "更新至 Obsidian",
    updated: "已更新 ✓",
    obsidianStaleHint: "自上次匯出後，此 Session 已更新。",
    autoExportLabel: "同時自動匯出到 Obsidian",
    obsidianExportFailed: "Obsidian 匯出失敗",
    obsidianExportFailedMsg: "已儲存到 Aether Vault，但 Obsidian 匯出失敗。",
    currentVault: "目前的 Vault",
    openVaultTitle: "開啟 {path}",
    vaultPathMissing: "{path}（找不到 — 請選擇「變更 Vault 位置」）",
    vaultOpenFailed: "無法開啟 Vault 資料夾：{error}",
    vaultConnectFailed: "無法連接該 Vault：{error}",
    pickerFailed: "無法開啟資料夾選擇視窗：{error}",
    changeVaultTitle: "變更 Vault 位置",
    newVault: "新的 Vault",
    useThisFolder: "使用此資料夾",

    // ------------------------------------------------------------ fullscreen
    fullscreenLibrary: "圖書館全螢幕",
    fullscreenChat: "對話全螢幕",

    // -------------------------------------------------- book & mode selection
    bookHotspot: "開始對話",
    // 閒置狀態的兩行文字：councilWelcome 為主要問候，bookPrompt 為次要指示。
    councilWelcome: "智囊團正等候您的提問。",
    bookPrompt: "請點擊桌上的書本開始...",
    modeModalWelcome: "歡迎，Traveler。",
    modeModalChoose: "請選擇模式。",
    modeCouncil: "智囊團",
    modeMentor: "導師",
    modeLabel: "模式",

    // --------------------------------------------------------- session header
    shSession: "會談",
    shScholars: "學者",
    shVault: "Vault",
    sessionStarting: "啟動中…",
    sessionStatusValues: { active: "進行中", saved: "已儲存", discarded: "已捨棄", error: "錯誤", stopped: "已停止" },
    vaultStateValues: { unsaved: "未儲存", saved: "已儲存" },
    saveToVault: "儲存到 Vault",
    saving: "儲存中…",
    savedToPath: "已儲存到 {path}。",
    reset: "重設",
    sessionGone: "此會談已不存在於伺服器上（伺服器在這次執行後重新啟動過）。請開始新的會談。",

    // 會談遺失的復原面板。進行中的會談僅存於伺服器記憶體，伺服器重新啟動即結束，
    // 但此頁面仍顯示著討論內容 —— 參見 services/sessionRecovery.js。
    // 已存入 Vault 的會談會以相同 id 建立典藏，可作為新討論的起點重新開啟；
    // 未曾存檔者則確實已消失，面板會據實說明。
    sessionLostTitle: "此討論已不再進行中",
    sessionLostChecking: "正在確認此討論是否可以繼續……",
    sessionLostSaved:
      "伺服器已重新啟動，因此無法直接繼續此討論。由於它已存入您的 Vault，您可以將它重新開啟，作為新討論的起點。",
    sessionLostUnsaved:
      "伺服器已重新啟動，因此無法繼續此討論，且它從未存入您的 Vault。內容仍顯示於上方——請先複製您想保留的部分，再開始新的會談。",
    sessionLostContinue: "以此開啟新討論",
    sessionLostReset: "開始新的會談",

    // ------------------------------------------------------ conversation tabs
    waiting: "請稍候…",
    noAnswer: "沒有回應。",
    noRuling: "沒有裁決。",
    summaryTab: "總結",
    scholarFallback: "學者",
    // 智囊團進行中的階段進度訊息（見 app.js 的 runProgressMessage()）。
    progressPreparing: "正在召集議會…",
    progressScholars: "學者們正在研議你的問題…",
    progressJudge: "大智者正在思量學者們的論點…",
    // 各分頁的執行狀態（分頁圖示提示 — 見 app.js 的 syncTabStatuses()）。
    statusTabWaiting: "等待中…",
    statusTabThinking: "思考中…",
    statusTabCompleted: "已完成",
    statusTabFailed: "失敗",
    // 即時請求階段與附件階段（見三段式逾時架構 src/providers/timeouts.js）。
    statusUploadingFile: "正在上傳 {name}…",
    statusExtractingDocument: "正在解析 {name}…",
    statusWaitingProvider: "等待模型回應…",
    statusReceivingResponse: "正在接收回應…",
    statusLongAnalysis: "長時間分析進行中…",
    // 分類後的逾時原因（絕不視為「模型無法使用」）。
    errorConnectionTimeout: "模型未開始回應（連線逾時）。",
    errorInactivityTimeout: "因長時間無活動而逾時 — 模型在請求中途停止回應。",
    errorHardTaskTimeout: "已達此請求的處理時間上限。",
    // 學者失敗後的補救動作（僅影響失敗的那位學者，其他回答全數保留）。
    retryScholarAction: "重試此學者",
    retryChangeModelAction: "更換模型後重試",
    retryChangeModelGo: "以此模型重試",
    continueAvailableAction: "以現有學者繼續",
    retryFailedMsg: "重試失敗：{error}",
    rulingStaleNotice: "本裁決之後，有學者的回答已更新。",
    regenerateRulingAction: "重新產生裁決",

    // ---------------------------------------------------------- run failures
    errorTimeout: "請求逾時，請再試一次。",
    errorNetwork: "發生網路錯誤，請檢查連線後再試一次。",
    errorAborted: "請求已取消。",
    errorRunInProgress: "目前已有討論正在進行中，請等待其完成後再開始新的討論。",
    runInProgressReload: "討論仍在產生中——正在等待完成…",

    // ------------------------------------------------- 執行中控制項
    stopGeneration: "停止",
    stopGenerationHint: "停止產生——已收到的回答會保留",
    stopping: "停止中…",
    generationStopped: "已停止產生。已收到的回答均已保留。",
    generationStoppedTitle: "已停止產生",
    generationStoppedBody: "您已停止這場討論。已收到的回答均已保留——隨時可以再次提問。",
    scholarStopped: "在這位學者回答前已停止。",
    statusTabStopped: "已停止",
    failureGateTitle: "{name} 未能回應",
    failureGateQuestion: "是否在不包含 {name} 的情況下繼續討論？",
    failureGateContinue: "不包含 {name}，繼續",
    failureGateStop: "停止討論",
    awaitingDecision: "等待您的決定…",
    continuedWithout: "已在不包含 {name} 的情況下繼續討論。",
    noUsableResponses: "沒有可用的模型回應。",
    failureReasonTimeout: "模型未能在時間內回應。",
    failureReasonUnavailable: "此模型目前無法使用。",
    failureReasonRateLimit: "已達速率限制。",
    failureReasonAuth: "API 金鑰遭拒絕。",
    failureReasonBilling: "供應商回報帳務或額度問題。",
    failureReasonProvider: "供應商回報錯誤。",
    nameSeparator: "、",
    errorAuthInvalid: "API 金鑰無效或未授權",
    errorAccessDenied: "此模型或帳號遭拒絕存取",
    errorEndpointUnavailable: "找不到此模型或端點",
    errorQuotaExceeded: "已達配額或速率限制，請稍後再試",
    errorProviderServer: "供應商伺服器發生錯誤，請稍後再試",
    sessionErrorTitle: "模型無法使用",
    sessionErrorMessage: "目前選擇的模型無法完成此請求。請更換模型後重試，或按「重設」開始新的工作階段。",
    modelRemovedHint: "此模型已從清單中移除 — 請重新整理模型列表或選擇其他模型。",

    // ------------------------------------------------------------------ chat
    considering: "{name} 思考中……",
    send: "送出",
    sending: "傳送中…",

    // -------------------------------------------------------------- composer
    askPlaceholderCouncil: "提出你的問題……",
    askPlaceholderMentor: "向你的導師提問……",
    continuePlaceholder: "與大智者繼續討論，或按下重設開始新的會談……",
    continuePlaceholderMentor: "繼續討論，或按下重設開始新的會談……",
    sessionLockedHint: "重設目前的 Session 後即可解鎖這些設定。",
    useVaultLabel: "使用 Vault",
    useVaultOnHint: "允許書僮（Librarian）搜尋你的 Vault，並提供與本次 Session 相關的參考資料。",
    useVaultOffHint: "不搜尋 Vault，直接依據 AI 自身知識與目前 Session 的內容回答。",
    close: "關閉",
    attachmentChipLabel: "預覽附件 {name}",
    attachmentNoPreview: "此檔案已作為 Session 內容提供。此紀錄沒有可顯示的預覽。",
    noProviderConfigured: "尚未設定任何供應商 — 請開啟「設定」加入 API 金鑰。",
    needScholar: "請至少啟用一位學者（需要 API 金鑰）。",

    // -------------------------------------------------- scholar picker / hover
    chipDisabled: "已停用",
    chipNoKey: "未設金鑰",
    chipStatusReady: "就緒",
    chipStatusNoKey: "沒有 API 金鑰",
    chipTitleDisabled: "這位學者的供應商已停用 — 請在「設定」中啟用。",
    chipTitleNoKey: "此欄位的供應商沒有 API 金鑰 — 請在「設定」中設定。",
    specialty: "專長",
    scholarSpecialties: {
      1: "系統、架構、規劃與策略推理",
      2: "詮釋、脈絡、知識與引導",
      3: "模式、證據、比較與探索",
    },

    // -------------------------------------------------------------- archives
    archivesSubtitle: "過往的議會討論",
    backToLibrary: "返回圖書館",
    backToArchives: "返回檔案庫",
    searchArchives: "搜尋檔案庫……",
    loadingArchives: "載入檔案庫中……",
    archivesLoadFailed: "⚠ 無法載入檔案庫：{error}",
    noArchives: "尚無封存的會談。",
    noArchivesSub: "完成的議會討論會顯示在這裡。",
    noSearchMatch: "沒有符合搜尋的檔案。",
    loadingSession: "載入會談中……",
    archiveLoadFailed: "⚠ 無法載入此會談：{error}",
    dateLabel: "日期",
    synthesisTitle: "{name}的總結",
    savedToVaultRef: "已儲存到 Vault：{path}",
    archiveConversationTitle: "對話紀錄",
    // 檔案庫詳細頁的「同步到 Obsidian」— 補救忘記匯出就重設的會談。
    archiveSyncObsidian: "同步到 Obsidian",
    archiveSyncAgain: "更新已同步的檔案",
    archiveSyncedObsidian: "已同步到 Obsidian ✓",
    archiveSyncing: "同步中…",
    archiveSyncSuccess: "已同步到 {path}。",
    archiveSyncFailed: "同步失敗：{error}",
    archiveSyncNotConfigured: "尚未連接 Obsidian 儲存庫 — 請先在 Vault 選單啟用 Obsidian 整合。",
    archiveSyncOpenVaultMenu: "開啟 Vault 選單",
    continueDiscussion: "繼續討論",
    previousDiscussionLabel: "上次討論：{title}",
    archiveThreadPosition: "第 {index}／{count} 則討論",
    removeFromArchives: "從檔案庫移除",
    removeConfirmTitle: "從檔案庫移除？",
    removeConfirmBody1: "此操作只會將這筆 Session 從檔案庫中移除。",
    removeConfirmBody2: "已儲存至 Vault 或 Obsidian 的檔案不會受到任何影響。",
    removeConfirmAction: "移除",
    removeFailed: "無法從檔案庫移除：{error}",
    resetConfirmTitle: "重設會談？",
    resetConfirmBody1: "目前的會談尚未儲存到 Vault。",
    resetConfirmBody2: "重設後，所有未儲存的內容將永久遺失。",
    modelFailureWarningTitle: "部分模型近期曾無法使用",
    modelFailureWarningMessage: "以下模型在過去 24 小時內曾回報無法使用：",
    modelFailureWarningQuestion: "是否仍要繼續？",
    continueAnyway: "仍要繼續",

    // ------------------------------------------------- Council Model Check
    councilCheckTitle: "智囊團模型檢查",
    councilCheckRecommended: "建議",
    councilCheckBody: "開始前，Aether Library 可以向每個選定的模型送出一個最小請求，確認它目前可用，且你的 API 帳號有權存取。",
    councilCheckHelp: "這有助於避免因模型無法使用、存取受限、API 憑證無效、API 額度不足，或其他立即發生的供應商錯誤，而導致智囊團會談不完整。",
    councilCheckCost: "預估費用：每次檢查 < $0.01。實際費用依你選擇的模型與供應商定價而有所不同。",
    councilCheckSkipNote: "若略過此檢查，某個模型可能在其他學者已開始產生回應後才失敗，可能浪費時間與 API 額度。",
    councilCheckAutoLabel: "在智囊團會談開始前自動執行此檢查",
    councilCheckSettingsNote: "你可以隨時在設定中變更此選項。",
    councilCheckRun: "檢查並開始",
    councilCheckSkip: "不檢查，直接開始",
    councilCheckChecking: "檢查中…",
    councilCheckRetry: "重新檢查",
    councilCheckOpenSettings: "開啟設定",
    councilCheckSettingsAutoLabel: "在啟動智囊團會談前自動執行最小 API 檢查",
    councilCheckSettingsDesc: "有助於在產生回應前偵測模型可用性、API 存取權限、身分驗證與帳務問題。每次檢查會送出一個最小的 API 請求，可能產生少量費用。",
    councilCheckSettingsCost: "預估費用：通常每次檢查 < $0.01。",
    councilCheckManualBtn: "立即檢查模型",
    councilCheckManualSuccess: "已完成驗證，所有模型皆可使用。",
    // ------------------------------------------------- AI / 產品狀態
    // 唯讀狀態，顯示於核心之書彈窗與產品狀態檢視（見
    // src/services/productStatus.js）。「已設定」僅代表憑證存在，
    // 不代表已通過模型檢查——兩者是不同的事實，用詞不可混淆。
    aiStatusTitle: "AI 狀態",
    statusConfigured: "已設定",
    statusNotConfigured: "尚未設定",
    statusDisabled: "已設定（已停用）",
    modelCheckLabel: "模型檢查",
    // productStatus.js 能誠實推導出的四種狀態。「已確認」之所以存在，
    // 是因為重新載入後，已保存的簽章無法區分「通過檢查」與
    // 「直接開始（略過檢查）」。
    modelCheckNotChecked: "尚未執行",
    modelCheckPassed: "已通過",
    modelCheckAcknowledged: "已確認（未重新驗證）",
    modelCheckNeedsRecheck: "需要重新檢查",
    modelCheckFailed: "檢查失敗",
    productStatusTitle: "產品狀態",
    productStatusOpen: "檢視產品狀態",
    productStatusProviders: "AI 供應商",
    productStatusCouncil: "智囊團",
    productStatusModelCheck: "模型檢查",
    productStatusVault: "Vault",
    productStatusGrandSage: "大智者",
    productStatusScholarSlot: "學者 {n}",
    productStatusVaultConnected: "已連接",
    productStatusVaultMissing: "已設定，但找不到資料夾",
    productStatusVaultNone: "尚未連接",
    productStatusAutoCheckOn: "每次智囊團前自動檢查：開啟",
    productStatusAutoCheckOff: "每次智囊團前自動檢查：關閉",
    productStatusNoLastCheck: "此版本未記錄上次檢查時間。",
    productStatusReadOnly: "僅供參考——開啟此頁面不會連線至任何供應商。",
    productStatusSlotOff: "停用",
    productStatusClose: "關閉",
    // ------------------------------------------------- Batch B: 更多選單
    moreMenu: "更多",
    moreTutorial: "教學導覽",
    moreLearn: "使用指南",
    moreReportIssue: "回報問題與意見",
    moreWebsite: "官方網站",
    moreDiscord: "加入 Discord 社群",
    moreGithub: "GitHub",
    moreSupport: "支持 Aether Library",
    moreAbout: "關於",
    linkNotConfigured: "此連結尚未提供。",
    // ------------------------------------------------------ Batch B: 關於
    aboutTitle: "關於",
    aboutVersion: "版本 {version}",
    aboutDescription:
      "一個以本機為主的思考空間：多位 AI 學者思索您的問題，大智者統整他們的答案，值得保留的內容則存入您自己的 Vault。",
    // Fallback labels for authored Scene UI Content links that have no
    // title in the current locale (see renderAbout in app.js).
    aboutWebsiteLead: "了解更多：",
    aboutClose: "關閉",
    // --------------------------------------------------- Batch B: 教學導覽
    tutorialStepCount: "第 {n} 步，共 {total} 步",
    tutorialNext: "下一步",
    tutorialBack: "上一步",
    tutorialSkip: "略過",
    tutorialFinish: "開始使用",
    tutorialStep1Title: "設定",
    tutorialStep1Body:
      "您可以在這裡調整介面語言、預設回覆語言，以及主題顏色與深淺模式。",
    tutorialStep2Title: "AI 配置",
    tutorialStep2Body:
      "連接您的 AI 供應商、設定 API 存取，並選擇或重新整理偏好的模型。",
    tutorialStep3Title: "Vault",
    tutorialStep3Body:
      "選擇您要使用的 Vault 資料夾。\n若您想同步資料到 Obsidian，請啟用整合選項，並選擇包含 .obsidian 資料夾的位置。",
    tutorialStep4Title: "乙太之書(Aetherom)",
    tutorialStep4Body:
      "想開始新的討論時，點擊乙太之書即可。",
    tutorialStep5Title: "智囊團或導師",
    tutorialStep5Body:
      "智囊團會先匯集學者(可選一或多位)的獨立見解，再由大智者做出最終結論。\n導師則由單一學者直接回答。",
    tutorialStep6Title: "選擇您的學者",
    tutorialStep6Body:
      "\u9078\u64c7\u53c3\u8207\u9019\u5834\u8a0e\u8ad6\u7684\u5b78\u8005\u3002\n\u60a8\u96a8\u6642\u53ef\u4ee5\u66f4\u63db\u5927\u667a\u8005\u3001\u5207\u63db\u6a21\u5f0f\uff0c\u6216\u6539\u9078\u5176\u4ed6\u5b78\u8005\u3002",
    tutorialStep7Title: "附加檔案",
    tutorialStep7Body:
      "提問前可附加檔案、PDF、圖片或文字，也支援直接拖曳檔案或貼上圖片。",
    tutorialStep8Title: "提出您的問題",
    tutorialStep8Body:
      "\u8f38\u5165\u60a8\u7684\u554f\u984c\uff0c\u7136\u5f8c\u6309\u4e0b\u9001\u51fa\uff0c\u8a0e\u8ad6\u4fbf\u6703\u958b\u59cb\u3002",
    tutorialStep9Title: "檢視討論",
    tutorialStep9Body:
      "\u95b1\u8b80\u8a0e\u8ad6\u5167\u5bb9\u3001\u7e7c\u7e8c\u8ffd\u554f\uff0c\u6216\u4f7f\u7528\u8f38\u5165\u6846\u4e0b\u65b9\u7684\u5feb\u901f\u63d0\u554f\uff0c\u9032\u4e00\u6b65\u63a2\u7d22\u9019\u500b\u4e3b\u984c\u3002",
    tutorialStep10Title: "儲存至 Vault",
    tutorialStep10Body:
      "將這場討論儲存至您的 Vault。\n若已啟用 Obsidian 整合，儲存後也可以選擇同步到您的 Obsidian Vault。",
    tutorialStep11Title: "隱私與更多資訊",
    tutorialStep11Body:
      "您的 API 金鑰會保存在您的裝置上，Aether Library 無法存取您已儲存的 API 金鑰。\n當您送出問題時，問題只會傳送給您選擇的 AI 供應商。\n如需說明文件、更新與支援，請造訪 aetherlibrary.app",
    // ------------------------------------------------------ Batch B: 指南
    learnTitle: "使用指南",
    learnClose: "關閉",
    councilCheckErrorTitle: "智囊團無法開始",
    councilCheckErrorFooter: "尚未產生任何智囊團回應。",
    councilErrorModelUnavailable: "目前的 API 帳號無法存取此模型。",
    councilErrorAuth: "此供應商的 API 金鑰遺失或無效。",
    councilErrorBilling: "你的 API 帳號似乎額度不足，或有帳務限制。",
    councilErrorRateLimited: "此供應商目前正在限制請求速率。",
    councilErrorTimeout: "此供應商未在時限內回應。",
    councilErrorProvider: "此供應商回傳了一個錯誤。",

    settingsSessionWarningTitle: "開始新的 Session？",
    settingsSessionWarningBody1Unsaved: "更改 Provider 或 Model 將重設目前的 Session。",
    settingsSessionWarningBody2Unsaved: "尚未儲存至 Vault 的內容將會遺失。",
    settingsSessionWarningBody3Unsaved: "現有的典藏庫紀錄仍會保留。",
    settingsSessionWarningBody1Saved: "更改 Provider 或 Model 將結束目前的 Session 並開始新的 Session。",
    settingsSessionWarningBody2Saved: "已儲存的 Vault 檔案與典藏庫紀錄仍會保留。",
    resetAndApply: "重設並套用",
    dateLocale: "zh-TW",

    // ------------------------------------------------------------- librarian
    librarianSearching: "📚 書僮正在圖書館尋找相關筆記……",
    librarianFoundOne: "📚 書僮帶回了 1 篇相關筆記。",
    librarianFound: "📚 書僮帶回了 {count} 篇相關筆記。",
    librarianNone: "📚 書僮沒有找到相關筆記。",
    libraryActivity: "圖書館動態",
    libraryActivitySearching: "正在搜尋藏書...",
    libraryActivityFound: "找到 {count} 筆相關筆記。",
    libraryActivityMore: "還有 {count} 筆",

    // ----------------------------------------------- composer attachments
    attachTooltip: "附加檔案（圖片、PDF、Markdown、文字）",
    attachmentReading: "讀取 {name} 中…",
    attachmentFetchingUrl: "擷取網頁內容中…",
    attachmentUnsupported: "不支援的檔案類型：{name}",
    attachmentsLoading: "資料仍在讀取中，請稍候再開始。",
    removeAttachment: "移除 {name}",
    copy: "複製",
    copied: "已複製 ✓",
    modelsCount: "{count} 個模型",
    perplexitySonarNote: "目前支援 Perplexity Sonar 系列模型。",
    aiSetupHint: "連接你的第一個 AI 供應商",
    aiSetupHintDismiss: "關閉",
    aiSetupTitle: "需要 AI 供應商",
    aiSetupBody1: "尚未設定任何 AI 供應商。",
    aiSetupBody2: "請在設定中連接第一個 AI 供應商，即可開始對話。",
    aiSetupOpenSettings: "開啟設定",
    aiSetupLater: "稍後再說",
    modeToggleAria: "互動模式",
    quickQuestions: "✨ 快速提問",
    quickQuestionsExpand: "展開快速提問",
    quickQuestionsCollapse: "收合快速提問",
    resizeWorkspaceDivider: "調整討論區與互動區的高度比例",
    sessionSummary: "會談摘要",
    sessionSummaryExpand: "展開會談摘要",
    sessionSummaryCollapse: "收合會談摘要",

    judgeQuickActions: [
      { icon: "🏆", text: "誰的回答最好？" },
      { icon: "⚖", text: "比較所有學者" },
      { icon: "🧠", text: "用初學者能懂的方式解釋" },
      { icon: "📚", text: "整合最好的觀點" },
      { icon: "🔍", text: "挑戰你自己的結論" },
      { icon: "⭐", text: "評分每位學者" },
      { icon: "📖", text: "每位學者各自貢獻了什麼？" },
      { icon: "🎯", text: "哪個答案最準確？" },
      { icon: "💡", text: "哪個解釋最容易理解？" },
      { icon: "🔬", text: "你的結論有哪些證據支持？" },
    ],
  },

  // ------------------------------------------------------ 使用指南內容
  // 面向使用者的指南（Batch B），刻意使用日常語言：不出現內部服務名稱、
  // 模組路徑或架構術語。結構為 [{ id, title, blocks }]，block 為
  // { type:"p", text } 或 { type:"list", items:[…] }。
  // Learn / User Guide prose now lives in ONE authoritative place:
  // assets/content/learn/<id>.json (see src/services/contentResources.js).
  // Keeping a second copy here would mean two sources of truth for the
  // same text. Only the UI labels that render the guide remain in this
  // pack (learnTitle / learnClose, in `strings` above).
};