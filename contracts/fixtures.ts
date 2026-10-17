// MOCK 用の固定データと、各 API の返り値の例。
//   - mockSessions / mockLogins: MOCK=1 のときのログイン（保護者・子ども・はじめての人）。サーバが DB を開くときにこの3人を入れる（src/server/seed/demo.ts）
//   - mockPair: ペアリングの状態ごとの例（画面がすべての分かれ道を試せるように）
//   - mockExcludedAppCandidates: MOCK のデモの子どもの「端末のアプリ一覧」の見本（src/server/seed/demo.ts だけが DB に入れる。Q15・D-110）
//   - fixtures: 各 API の返り値の例（画面を作るときの見本・テストの期待値）。日付は Figma の見本に合わせて 2026-10-12 の週
// 画面の見本データとして使ってよいが、本番の値の代わりに画面へ直書きしない（取れなかった値を見本で埋めない）。
import type { Res } from "./api.js";
import type { AppMinutes, ExcludedAppInput, UsageDayReport } from "./schemas.js";

// ── ログイン ──

// MOCK=1 のときの Google ログイン。authGoogle に idToken（キー）を送ると、その Session（合言葉つき）が返る。
// ここにない "mock-" で始まる idToken（例: "mock-new-端末ごとの番号"）は、その番号の「はじめての人」を新しく作る
// （2台の端末で、それぞれ別の「はじめての人」としてログインし、QR の紐づけを試すため。src/lib/google.ts が作る）
// デモの保護者とデモの子どもは、はじめから連携済み（親1人↔子1人。Q2）
// userId は DB の形（uuid）にそろえた固定の値（DB を空にして入れ直しても同じ人になる）
export const demoUserIds = {
  parent: "00000000-0000-4000-8000-0000000000a1",
  child: "00000000-0000-4000-8000-0000000000a2",
  new: "00000000-0000-4000-8000-0000000000a3",
} as const;
export const mockSessions = {
  "mock-google-parent": {
    token: "mock-token-parent",
    userId: demoUserIds.parent,
    name: "デモの保護者",
    role: "parent",
  },
  "mock-google-child": { token: "mock-token-child", userId: demoUserIds.child, name: "デモの子ども", role: "child" },
  // ログインしたが、まだ QR の紐づけをしていない人（親子どちらにも分かれていない）
  "mock-google-new": { token: "mock-token-new", userId: demoUserIds.new, name: "はじめての人", role: null },
} satisfies Record<string, Res<"authGoogle">>;

// MOCK のログイン画面に並べる3人（idToken と、ボタンに出す名前）
export const mockLogins = [
  { idToken: "mock-google-parent", label: "保護者としてログイン（デモ）" },
  { idToken: "mock-google-child", label: "子どもとしてログイン（デモ）" },
  { idToken: "mock-google-new", label: "はじめての人としてログイン" },
] as const satisfies readonly { idToken: keyof typeof mockSessions; label: string }[];

// ── ペアリング ──

export const demoChild = { id: demoUserIds.child, name: "デモの子ども" };
const pairBase = { pairId: "demo-pair", child: demoChild, expiresAt: "2026-10-17T10:10:00+09:00" };
export const mockPair = {
  ticket: { pairId: "demo-pair", code: "demo-code-123456", expiresAt: pairBase.expiresAt },
  waiting: { ...pairBase, state: "waiting", parentName: null },
  claimed: { ...pairBase, state: "claimed", parentName: "デモの保護者" },
  linked: { ...pairBase, state: "linked", parentName: "デモの保護者" },
  expired: { ...pairBase, state: "expired", parentName: null },
  rejected: { ...pairBase, state: "rejected", parentName: "デモの保護者" },
} satisfies { ticket: Res<"pairStart"> } & Record<
  "waiting" | "claimed" | "linked" | "expired" | "rejected",
  Res<"pairStatus">
>;

// ── C9 の候補（Q15）──

// MOCK のデモの子どもの端末のアプリ一覧の見本（Figma 親16 の4つ）。本物の候補は子どもの端末が送る一覧（childAppsUpload）。
// 使うのは MOCK の見本を DB に入れるとき（src/server/seed/demo.ts の seedMockAccounts）とテストだけ。
// 画面（親16）はここを読まない（届いていない一覧を見本で埋めない。docs/decisions.md D-110）
export const mockExcludedAppCandidates: ExcludedAppInput[] = [
  { packageName: "com.example.studynote", label: "学習ノート" },
  { packageName: "com.example.wordcards", label: "英単語カード" },
  { packageName: "com.example.video", label: "動画アプリ" },
  { packageName: "com.example.game", label: "ゲーム" },
];

// ── 見本のアプリの使用時間（Figma 親09 の並び）──

// ある1日のアプリ別の累計の見本。学習ノートは対象外なので excluded: true
export const demoAppMinutes: AppMinutes[] = [
  { packageName: "com.google.android.youtube", label: "YouTube", usedMinutes: 52, excluded: false },
  { packageName: "com.instagram.android", label: "Instagram", usedMinutes: 31, excluded: false },
  { packageName: "com.twitter.android", label: "X", usedMinutes: 12, excluded: false },
  { packageName: "com.example.game", label: "ゲーム", usedMinutes: 25, excluded: false },
  { packageName: "com.example.studynote", label: "学習ノート", usedMinutes: 40, excluded: true },
];

// ある1日の利用記録の見本（子どもの端末が送る形）
export const demoUsageDay = (date: string, measuredAt: string): UsageDayReport => ({
  date,
  measuredAt,
  restrictedMinutes: demoAppMinutes.filter((a) => !a.excluded).reduce((s, a) => s + a.usedMinutes, 0),
  apps: demoAppMinutes,
});

// ── 各 API の返り値の例 ──

const plan = {
  childId: demoUserIds.child,
  planStartDate: "2026-10-01",
  startLimitMinutes: 300,
  finalGoalMinutes: 120,
  version: 2,
  updatedAt: "2026-10-01T09:00:00.000Z",
} satisfies NonNullable<Res<"planGet">["plan"]>;

const testPeriods = [
  {
    id: "demo-test-1",
    name: "数学",
    startDate: "2026-10-28",
    endDate: "2026-10-30",
    createdByUserId: demoUserIds.child,
    createdByRole: "child",
  },
] satisfies Res<"testPeriodList">["testPeriods"];

const blankPeriods = [
  { id: "demo-blank-1", name: "冬休み", startDate: "2026-12-24", endDate: "2027-01-07" },
] satisfies Res<"blankPeriodList">["blankPeriods"];

const excludedApps = [
  { packageName: "com.example.studynote", label: "学習ノート", sinceVersion: 1 },
  { packageName: "com.example.wordcards", label: "英単語カード", sinceVersion: 3 },
] satisfies Res<"excludedAppsGet">["apps"];

const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const weekLimits = [300, 287, 273, 260, 247, 233, 220];
const weekUsed = [255, 243, 222, 120, null, null, null];

const snapshot = {
  childId: demoUserIds.child,
  configVersion: 3,
  calculationVersion: 2,
  usualLimitMinutes: 180,
  plan,
  testPeriods,
  blankPeriods,
  dailyLimits: week.map((date, i) => ({ date, kind: "limited" as const, limitMinutes: weekLimits[i] ?? 0 })),
  excludedApps,
  generatedAt: "2026-10-15T09:00:00.000Z",
} satisfies Extract<Res<"configGet">, { changed: true }>["snapshot"];

export const fixtures = {
  health: { ok: true, mock: true } satisfies Res<"health">,
  authGoogle: mockSessions["mock-google-parent"] satisfies Res<"authGoogle">,
  authMe: mockSessions["mock-google-parent"] satisfies Res<"authMe">,
  authSignOut: { ok: true, revoked: 1 } satisfies Res<"authSignOut">,
  pairStart: mockPair.ticket,
  pairStatus: mockPair.waiting,
  pairClaim: mockPair.claimed,
  pairConfirm: mockPair.linked,
  linkStatus: {
    state: "linked",
    role: "parent",
    partners: [{ userId: demoUserIds.child, name: "デモの子ども", role: "child" }],
  } satisfies Res<"linkStatus">,
  familyGet: { children: [demoChild] } satisfies Res<"familyGet">,
  familyUnlink: { childId: demoUserIds.child, revokedSessions: 1 } satisfies Res<"familyUnlink">,
  planGet: {
    childId: demoUserIds.child,
    plan,
    usualLimitMinutes: 180,
    configVersion: 3,
    childAppliedVersion: 2, // 子どもの端末はまだ版 2 = 「反映待ち」
  } satisfies Res<"planGet">,
  planSave: { plan, usualLimitMinutes: 180, configVersion: 3, calculationVersion: 2 } satisfies Res<"planSave">,
  usualLimitSave: { usualLimitMinutes: 180, configVersion: 1, calculationVersion: 1 } satisfies Res<"usualLimitSave">,
  testPeriodList: {
    childId: demoUserIds.child,
    testPeriods,
    periodsChangedVersion: 2, // 数学を足した版
    configVersion: 3,
    childAppliedVersion: 3,
  } satisfies Res<"testPeriodList">,
  testPeriodCreate: {
    testPeriod: testPeriods[0] as (typeof testPeriods)[number],
    configVersion: 3,
    calculationVersion: 2,
  } satisfies Res<"testPeriodCreate">,
  testPeriodUpdate: {
    testPeriod: testPeriods[0] as (typeof testPeriods)[number],
    configVersion: 4,
    calculationVersion: 3,
  } satisfies Res<"testPeriodUpdate">,
  testPeriodDelete: {
    deletedId: "demo-test-1",
    configVersion: 5,
    calculationVersion: 4,
  } satisfies Res<"testPeriodDelete">,
  blankPeriodList: {
    childId: demoUserIds.child,
    blankPeriods,
    blankChangedVersion: 3, // 冬休みを足した版
    configVersion: 3,
    childAppliedVersion: 3,
  } satisfies Res<"blankPeriodList">,
  blankPeriodCreate: {
    blankPeriod: blankPeriods[0] as (typeof blankPeriods)[number],
    configVersion: 4,
    calculationVersion: 3,
  } satisfies Res<"blankPeriodCreate">,
  blankPeriodUpdate: {
    blankPeriod: blankPeriods[0] as (typeof blankPeriods)[number],
    configVersion: 5,
    calculationVersion: 4,
  } satisfies Res<"blankPeriodUpdate">,
  blankPeriodDelete: {
    deletedId: "demo-blank-1",
    configVersion: 6,
    calculationVersion: 5,
  } satisfies Res<"blankPeriodDelete">,
  configGet: { changed: true, snapshot, epoch: "3f0c9a52-6d1e-4b7a-9c2f-8e4d1a6b5c70" } satisfies Res<"configGet">,
  usageUpload: {
    submissionId: "7f1c2b4e-8d3a-4f6b-9c2d-1e5a7b9c0d12",
    status: "accepted",
    appliedDates: ["2026-10-14", "2026-10-15"],
  } satisfies Res<"usageUpload">,
  usageGet: {
    childId: demoUserIds.child,
    from: "2026-10-12",
    to: "2026-10-18",
    days: week.map((date, i) => {
      const used = weekUsed[i] ?? null;
      return {
        date,
        recorded: used != null,
        usedMinutes: used,
        measuredAt: used == null ? null : `${date}T12:00:00.000Z`,
        limit: { kind: "limited" as const, limitMinutes: weekLimits[i] ?? 0 },
        apps:
          used == null
            ? []
            : [
                { packageName: "com.google.android.youtube", label: "YouTube", usedMinutes: used, excluded: false },
                { packageName: "com.example.studynote", label: "学習ノート", usedMinutes: 40, excluded: true },
              ],
      };
    }),
    lastUploadedAt: "2026-10-15T09:00:00.000Z",
  } satisfies Res<"usageGet">,
  excludedAppsGet: {
    childId: demoUserIds.child,
    apps: excludedApps,
    removedApps: [],
    appsChangedVersion: 3, // 英単語カードを足した版
    configVersion: 3,
    childAppliedVersion: 2, // 英単語カード（sinceVersion 3）は「反映待ち」
  } satisfies Res<"excludedAppsGet">,
  excludedAppsSave: { apps: excludedApps, configVersion: 3 } satisfies Res<"excludedAppsSave">,
  childAppsUpload: {
    appCount: 4,
    receivedAt: "2026-10-15T09:00:00.000Z",
    iconsNeeded: [],
  } satisfies Res<"childAppsUpload">,
  childAppIconsUpload: { saved: 0 } satisfies Res<"childAppIconsUpload">,
  // 見本にはアイコンがない（画面は仮のアイコン＝頭文字を出す）
  childAppIconsGet: { childId: demoUserIds.child, icons: [] } satisfies Res<"childAppIconsGet">,
  childAppsGet: {
    childId: demoUserIds.child,
    // 表示名の順（サーバが Intl.Collator("ja") で並べた順。かな → 漢字）
    apps: [
      { packageName: "com.example.game", label: "ゲーム", iconHash: null },
      { packageName: "com.example.wordcards", label: "英単語カード", iconHash: null },
      { packageName: "com.example.studynote", label: "学習ノート", iconHash: null },
      { packageName: "com.example.video", label: "動画アプリ", iconHash: null },
    ],
    receivedAt: "2026-10-15T09:00:00.000Z",
  } satisfies Res<"childAppsGet">,
};
