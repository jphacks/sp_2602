// データ契約（アプリ ⇔ サーバで受け渡す形）。メンバー間はこのファイルの型だけでつながる。
// ログイン・QR の紐づけは作り直し前（S2）の形を引き継ぎ、ルールの部分は docs/MVP_SPEC.md（C1〜C10・D1〜D8）と
// 人間が決めた「仕様の決定 Q1〜Q15」（空白期間・親1↔子1 など）に合わせた。
// 名前と項目は backend/src/db/schema の表にそろえている（ただし DB の型ではなく API の形。id は文字列、日付は "YYYY-MM-DD"）。
import { z } from "zod";

// ── 共通の部品 ──────────────────────────────────────────────

// 日付（"YYYY-MM-DD"）。日本時間（Asia/Tokyo・0:00 区切り）の「その日」（Q3）。今日の出し方は contracts/dates.ts の1か所だけ
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD で書いてください")
  .refine(
    (s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s),
    {
      message: "存在しない日付です",
    },
  );
export type IsoDate = z.infer<typeof IsoDate>;

// 日時（ISO 8601・タイムゾーンつき。例 2026-10-17T10:00:00.000Z・2026-10-17T19:00:00+09:00）。
// 本当の日時だけを受け付ける（なぜ: 前は空でない文字列なら何でも通り、"abc" のような measuredAt が保存されると
// Date.parse が NaN になって「新しい測定が勝つ」の比較が必ず false になり、その日の記録が二度と更新されなかったため）。
// タイムゾーンのない日時（"2026-10-17T10:00:00"）は、端末の地域によって意味が変わるので受け付けない
export const IsoDateTime = z.iso.datetime({ offset: true });

// 1日の分数（0〜1440 の整数）。0 分は「有効な上限」（MVP_SPEC 4.2: 0 分上限は到達扱い）
export const Minutes = z.number().int().min(0).max(1440);

// 設定の版（C7 の configVersion）。子ども1人に1本の数で、計画・通常上限・テスト期間・空白期間・日別上限・対象外アプリの
// どれかが変わるたびに 1 増える（Q6。backend の child_config_versions と同じ考え方）。0 は「まだ何も保存していない」
export const ConfigVersion = z.number().int().min(0);

// Android のアプリ識別子（例: com.google.android.youtube）
export const PackageName = z.string().min(1).max(255);

// 「どの子どもの話か」を指す入力。サーバは必ず、呼んだ人がこの子どもを扱えるか（子ども本人・連携済みの親）を確かめる
export const ChildQuery = z.object({ childId: z.string().min(1) });
export type ChildQuery = z.infer<typeof ChildQuery>;

// 子どもの端末が今使っている設定の版（Q6）。子どもが configGet で送った版をサーバが覚え、親の画面が「反映済み／反映待ち」を出すのに使う。
// まだ一度も取りに来ていなければ null。configVersion（最新）より小さければ「反映待ち」
export const ChildAppliedVersion = ConfigVersion.nullable();

// ── C1: ログイン ──────────────────────────────────────────────

// 端末の持ち主の役割。保護者か子どもか（子どもが保護者の権限を取れないことは、サーバ側で検証する）
export const Role = z.enum(["parent", "child"]);
export type Role = z.infer<typeof Role>;

// Google ログインの結果。端末で Google にログインして受け取った ID トークンを、サーバに渡して確かめてもらう（保護者も子どもも同じ）
export const GoogleSignIn = z.object({ idToken: z.string().min(1) });
export type GoogleSignIn = z.infer<typeof GoogleSignIn>;

// サーバが出す合言葉と、ログインした人。role は QR の紐づけ（linked）が確定するまで null（Q1。画面の「役割を選ぶ」は端末の中だけ）
// token は以降の API に `Authorization: Bearer <token>` で付ける（src/lib/api.ts の call() / stream() が付ける）
export const Session = z.object({
  token: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1), // 画面に出す名前（Google のアカウント名）
  role: Role.nullable(),
});
export type Session = z.infer<typeof Session>;

// ログアウト（サーバ側で合言葉を使えなくする）。端末の中の合言葉を消すだけだと、盗まれた・なくした端末の合言葉が
// 期限（最後に使ってから30日）まで使えたままになるため。
//   otherDevices を省く・false : この端末の合言葉だけを使えなくする（ふつうのログアウト）
//   otherDevices: true          : この端末以外の、同じ人の合言葉をすべて使えなくする（端末をなくしたとき、別の端末から）
export const SignOutRequest = z.object({ otherDevices: z.boolean().optional() });
export type SignOutRequest = z.infer<typeof SignOutRequest>;
export const SignOutResult = z.object({ revoked: z.number().int().min(0) }); // 使えなくした合言葉の数
export type SignOutResult = z.infer<typeof SignOutResult>;

// 子ども1人。id は子どもの userId
export const Child = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // 画面に出す名前
});
export type Child = z.infer<typeof Child>;

// ── C1: QR の紐づけ（作り直し前の S2 と同じ流れ）──────────────────
// 子どもの端末が QR を出す → 保護者が読む → 子どもが「はい」で確定 → サーバが D2 に保存してから linked を返す
// 流れ: waiting（QR を出して待つ）→ claimed（保護者が読んだ。子どもの確認待ち）→ linked（紐づいた）
//       途中で expired（10分たった・出し直しで無効・子どもが「やめる」で取り消した。pairCancel）・rejected（子どもが「いいえ」）。linked で QR を出した人は child、読んだ人は parent になる
// QR は10分・1回だけ・出し直したら前の QR は無効（Q10）。MVP は親1人↔子1人で、2人目の紐づけは conflict（Q2）
export const PairState = z.enum(["waiting", "claimed", "linked", "expired", "rejected"]);
export type PairState = z.infer<typeof PairState>;

// 子どもが QR を出すときの入力。name は画面に出す呼び名（省くと Google のアカウント名）
export const PairStart = z.object({ name: z.string().min(1).max(40).optional() });
export type PairStart = z.infer<typeof PairStart>;

// QR に入れるもの。code は使い捨ての番号（10分で失効・1回だけ）。合言葉や個人情報は入れない（MVP_SPEC 4.1）
export const PairTicket = z.object({
  pairId: z.string().min(1),
  code: z.string().min(1),
  expiresAt: IsoDateTime,
});
export type PairTicket = z.infer<typeof PairTicket>;

// 「どのペアリングか」を指す入力（進み具合を聞く）
export const PairQuery = z.object({ pairId: z.string().min(1) });
export type PairQuery = z.infer<typeof PairQuery>;

// ペアリングの進み具合（子ども・保護者のどちらも、自分が関わるものだけ聞ける）
export const PairStatus = z.object({
  pairId: z.string().min(1),
  state: PairState,
  child: Child, // QR を出した子ども
  parentName: z.string().nullable(), // 読んだ保護者の名前（claimed 以降。「〇〇さんの家族に入りますか？」に出す）
  expiresAt: IsoDateTime,
});
export type PairStatus = z.infer<typeof PairStatus>;

// 保護者が QR を読んで送る入力
export const PairClaim = z.object({ code: z.string().min(1) });
export type PairClaim = z.infer<typeof PairClaim>;

// 子どもの「はい / いいえ」
export const PairConfirm = z.object({ pairId: z.string().min(1), accept: z.boolean() });
export type PairConfirm = z.infer<typeof PairConfirm>;

// ── C1: 連携状態（D2）──────────────────────────────────────────

// 連携の相手1人
export const LinkPartner = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  role: Role,
});
export type LinkPartner = z.infer<typeof LinkPartner>;

// 連携状態。D2 に保存が確定した関係だけを返す（サーバに届かなかった「取得不可」はアプリ側の状態。ここには出てこない）
// partners は、保護者から見れば連携済みの子ども、子どもから見れば連携済みの保護者（MVP は最大1人。Q2）
export const LinkStatus = z.object({
  state: z.enum(["linked", "unlinked"]),
  role: Role.nullable(), // 呼んだ人の役割
  partners: z.array(LinkPartner),
});
export type LinkStatus = z.infer<typeof LinkStatus>;

// 保護者の家族（連携済みの子どもの一覧）。MVP は最大1人だが、形は一覧のまま（Q2）
export const Family = z.object({ children: z.array(Child) });
export type Family = z.infer<typeof Family>;

// 保護者が子どもとの連携を外した結果。外すと、子どもの端末の合言葉もすべて使えなくなる（子どもの端末をなくしたときにも使う）
export const FamilyUnlinkResult = z.object({
  childId: z.string().min(1),
  revokedSessions: z.number().int().min(0), // 使えなくした、子どもの合言葉の数
});
export type FamilyUnlinkResult = z.infer<typeof FamilyUnlinkResult>;

// ── 1日の上限の値（C10 が作り、C3・C6 が使う）──────────────────────
// 1日の上限は3つの状態を取り違えないよう kind で分ける（Q7）:
//   limited   : 上限あり（limitMinutes 分。0 分も有効な上限 = その日は使えない）
//   unlimited : 制限なし（空白期間中。0 分とも「未設定」とも違う）
//   （値がない）: 上限未設定（親がまだ通常上限を決めていない）。日別上限の一覧にその日がない・null で表す
export const DayLimit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("limited"), limitMinutes: Minutes }),
  z.object({ kind: z.literal("unlimited"), blankPeriodId: z.string().min(1) }), // どの空白期間による「制限なし」か
]);
export type DayLimit = z.infer<typeof DayLimit>;

// ── D8: 通常上限と利用計画（親だけが変える。C10 の入力）────────────────

// 通常上限（Q7）。親に決まったとき（紐づけ直後）に決める1日の上限。計画がない日・テスト期間が0件のときに使う
export const UsualLimitSave = z.object({
  childId: z.string().min(1),
  expectedVersion: ConfigVersion,
  usualLimitMinutes: Minutes,
});
export type UsualLimitSave = z.infer<typeof UsualLimitSave>;

// 計画の中身（親02 で親が入力する3つの値。Q14: 3つとも必須・分は 0〜1440 の整数・G ≤ S・開始日は今日以降）
// 「開始日は今日以降」は今日がサーバの時計で決まるため、サーバの store.ts で確かめる（ここでは形だけ）
const planFields = {
  planStartDate: IsoDate, // 計画開始日 d0
  startLimitMinutes: Minutes, // 開始上限 S（分）
  finalGoalMinutes: Minutes, // 最終目標 G（分）
};
const goalNotAboveStart = (v: { startLimitMinutes: number; finalGoalMinutes: number }) =>
  v.finalGoalMinutes <= v.startLimitMinutes;
const goalMessage = { message: "最終目標は開始上限と同じか、それより少なくしてください", path: ["finalGoalMinutes"] };

export const PlanSettingsInput = z.object(planFields).refine(goalNotAboveStart, goalMessage);
export type PlanSettingsInput = z.infer<typeof PlanSettingsInput>;

// 保存済みの計画（backend の plan_settings）。version はこの計画を保存したときの設定の版（configVersion）
export const PlanSettings = z.object({
  ...planFields,
  childId: z.string().min(1),
  version: ConfigVersion,
  updatedAt: IsoDateTime,
});
export type PlanSettings = z.infer<typeof PlanSettings>;

// 計画の取得結果（親02・子の閲覧）。plan・usualLimitMinutes はまだ決めていなければ null
// configVersion は今の設定の版（保存するときの expectedVersion に使う）。childAppliedVersion は Q6 の「反映済み／反映待ち」用
export const PlanView = z.object({
  childId: z.string().min(1),
  plan: PlanSettings.nullable(),
  usualLimitMinutes: Minutes.nullable(),
  configVersion: ConfigVersion,
  childAppliedVersion: ChildAppliedVersion,
});
export type PlanView = z.infer<typeof PlanView>;

// 計画の保存（親だけ）。expectedVersion は画面が読んだときの configVersion。ずれていたら conflict（ほかの端末が先に変えた）
// usualLimitMinutes を入れると、通常上限も同じ1回で変える（親02 でも通常上限を変えられる。Q14）
export const PlanSave = z
  .object({
    ...planFields,
    childId: z.string().min(1),
    expectedVersion: ConfigVersion,
    usualLimitMinutes: Minutes.optional(),
  })
  .refine(goalNotAboveStart, goalMessage);
export type PlanSave = z.infer<typeof PlanSave>;

// 設定を変えた結果の共通部分。configVersion は新しい設定の版、calculationVersion は C10 が作り直した日別上限の版
// （C10 の再計算は保存と同じ1回の処理で済ませてから返す。返ってきた時点で configGet に反映されている。Q5）
export const ConfigChange = z.object({
  configVersion: ConfigVersion,
  calculationVersion: z.number().int().min(0),
});
export type ConfigChange = z.infer<typeof ConfigChange>;

export const PlanSaveResult = ConfigChange.extend({
  plan: PlanSettings,
  usualLimitMinutes: Minutes.nullable(),
});
export type PlanSaveResult = z.infer<typeof PlanSaveResult>;

export const UsualLimitSaveResult = ConfigChange.extend({ usualLimitMinutes: Minutes });
export type UsualLimitSaveResult = z.infer<typeof UsualLimitSaveResult>;

// ── 期間（テスト期間・空白期間の共通の形）────────────────────────────

// 名前と期間。開始日・終了日はどちらもその日を含む
// TODO(未決): 終了日を含むかどうか（backend README の Deferred decisions）。今は「含む」として C10 を計算している
const periodFields = {
  name: z.string().trim().min(1).max(120),
  startDate: IsoDate,
  endDate: IsoDate,
};
const endNotBeforeStart = (v: { startDate: string; endDate: string }) => v.endDate >= v.startDate;
const endMessage = { message: "終了日は開始日と同じか、それより後にしてください", path: ["endDate"] };

// ── D3: テスト期間（親子どちらも追加・編集・削除できる。Q11）──────────────

// テスト期間1件（backend の test_periods）。作った人を残す（Q11）
export const TestPeriod = z.object({
  id: z.string().min(1),
  ...periodFields, // name はテスト名（例: 期末テスト）
  createdByUserId: z.string().min(1),
  createdByRole: Role,
});
export type TestPeriod = z.infer<typeof TestPeriod>;

// テスト期間の一覧（取得結果）
export const TestPeriodList = z.object({
  childId: z.string().min(1),
  testPeriods: z.array(TestPeriod), // 開始日の早い順
  configVersion: ConfigVersion,
  childAppliedVersion: ChildAppliedVersion,
});
export type TestPeriodList = z.infer<typeof TestPeriodList>;

// 作成。expectedVersion は画面が読んだときの configVersion（ずれていたら conflict）
export const TestPeriodCreate = z
  .object({ childId: z.string().min(1), expectedVersion: ConfigVersion, ...periodFields })
  .refine(endNotBeforeStart, endMessage);
export type TestPeriodCreate = z.infer<typeof TestPeriodCreate>;

// 更新（id のテスト期間の名前・期間を置き換える。作った人は変わらない）
export const TestPeriodUpdate = z
  .object({ childId: z.string().min(1), expectedVersion: ConfigVersion, id: z.string().min(1), ...periodFields })
  .refine(endNotBeforeStart, endMessage);
export type TestPeriodUpdate = z.infer<typeof TestPeriodUpdate>;

// 削除（テスト期間・空白期間で共通の形）
export const PeriodDelete = z.object({
  childId: z.string().min(1),
  expectedVersion: ConfigVersion,
  id: z.string().min(1),
});
export type PeriodDelete = z.infer<typeof PeriodDelete>;

// 作成・更新の結果（保存したテスト期間と、新しい版）
export const TestPeriodSaveResult = ConfigChange.extend({ testPeriod: TestPeriod });
export type TestPeriodSaveResult = z.infer<typeof TestPeriodSaveResult>;

// 削除の結果（テスト期間・空白期間で共通）
export const PeriodDeleteResult = ConfigChange.extend({ deletedId: z.string().min(1) });
export type PeriodDeleteResult = z.infer<typeof PeriodDeleteResult>;

// ── 空白期間（Q7。親だけが登録・変更・削除できる。期間中は「制限なし」）────────

// 空白期間1件（夏休みなど）。期間中の日別上限は unlimited になり、終わったら元の上限（計画・通常上限で計算した値）に戻る
export const BlankPeriod = z.object({
  id: z.string().min(1),
  ...periodFields, // name は期間の名前（例: 夏休み）
});
export type BlankPeriod = z.infer<typeof BlankPeriod>;

export const BlankPeriodList = z.object({
  childId: z.string().min(1),
  blankPeriods: z.array(BlankPeriod), // 開始日の早い順
  configVersion: ConfigVersion,
  childAppliedVersion: ChildAppliedVersion,
});
export type BlankPeriodList = z.infer<typeof BlankPeriodList>;

export const BlankPeriodCreate = z
  .object({ childId: z.string().min(1), expectedVersion: ConfigVersion, ...periodFields })
  .refine(endNotBeforeStart, endMessage);
export type BlankPeriodCreate = z.infer<typeof BlankPeriodCreate>;

export const BlankPeriodUpdate = z
  .object({ childId: z.string().min(1), expectedVersion: ConfigVersion, id: z.string().min(1), ...periodFields })
  .refine(endNotBeforeStart, endMessage);
export type BlankPeriodUpdate = z.infer<typeof BlankPeriodUpdate>;

export const BlankPeriodSaveResult = ConfigChange.extend({ blankPeriod: BlankPeriod });
export type BlankPeriodSaveResult = z.infer<typeof BlankPeriodSaveResult>;

// ── D6: 日別上限（C10 が作り、C7 で配る）────────────────────────

// ある1日の、制限対象アプリの合計の上限（DayLimit に日付を付けたもの）。一覧にない日は「上限未設定」
export const DailyLimit = z.discriminatedUnion("kind", [
  z.object({ date: IsoDate, kind: z.literal("limited"), limitMinutes: Minutes }),
  z.object({ date: IsoDate, kind: z.literal("unlimited"), blankPeriodId: z.string().min(1) }),
]);
export type DailyLimit = z.infer<typeof DailyLimit>;

// ── D7: 制限対象外アプリ（C9。親だけが変える）────────────────────

// 対象外アプリ1つ（入力の形）。label は画面に出すアプリ名
export const ExcludedAppInput = z.object({
  packageName: PackageName,
  label: z.string().min(1).max(120),
});
export type ExcludedAppInput = z.infer<typeof ExcludedAppInput>;

// 保存済みの対象外アプリ（backend の excluded_apps）。sinceVersion はこのアプリが対象外になった設定の版
//   子どもの端末が使っている版（childAppliedVersion）がこれより小さければ、このアプリは「反映待ち」（Figma 親16）
export const ExcludedApp = ExcludedAppInput.extend({ sinceVersion: ConfigVersion });
export type ExcludedApp = z.infer<typeof ExcludedApp>;

// 対象外から外したアプリ（親16 で「外した」ことが子どもの端末に届いたかを出すため）。removedVersion は外した設定の版。
// もう一度対象外にしたら、この一覧からは消える
export const RemovedExcludedApp = ExcludedAppInput.extend({ removedVersion: ConfigVersion });
export type RemovedExcludedApp = z.infer<typeof RemovedExcludedApp>;

// 対象外アプリの取得結果（親は編集用、子どもは閲覧用）
// 「反映済み／反映待ち」（Q6・Figma 親16）はサーバの値だけで決められるようにする（なぜ: 画面を開き直しても正しく出すため。
//   前は「外したアプリ」の版を画面が覚えていたので、開き直すと分からなくなった）:
//   appsChangedVersion : 対象外アプリの一覧（アプリの組・名前）が最後に変わった設定の版。一度も変わっていなければ 0。
//                        childAppliedVersion がこれ以上なら、一覧の全体が子どもの端末に届いている
//   apps[].sinceVersion: そのアプリが対象外になった版 / removedApps[].removedVersion: そのアプリを外した版
// TODO(保留): Q15 親が選ぶ候補（子どもの端末のアプリ一覧）をどこから得るかは保留。サーバへ送る API は作らない。
//   親16 の候補は contracts/fixtures.ts の mockExcludedAppCandidates（MOCK の固定値）を使う
export const ExcludedAppsView = z.object({
  childId: z.string().min(1),
  apps: z.array(ExcludedApp),
  removedApps: z.array(RemovedExcludedApp),
  appsChangedVersion: ConfigVersion,
  configVersion: ConfigVersion,
  childAppliedVersion: ChildAppliedVersion,
});
export type ExcludedAppsView = z.infer<typeof ExcludedAppsView>;

// 対象外アプリの保存（親だけ）。apps は保存後の全件（差分ではない）
export const ExcludedAppsSave = z.object({
  childId: z.string().min(1),
  expectedVersion: ConfigVersion,
  apps: z.array(ExcludedAppInput).max(500),
});
export type ExcludedAppsSave = z.infer<typeof ExcludedAppsSave>;

export const ExcludedAppsSaveResult = z.object({
  apps: z.array(ExcludedApp),
  configVersion: ConfigVersion,
});
export type ExcludedAppsSaveResult = z.infer<typeof ExcludedAppsSaveResult>;

// ── C7: 設定のスナップショット ────────────────────────────────────

// C7 で端末が取り込む「1組」。中の一覧は必ず同じ configVersion のもの（アプリはこの組を丸ごと採用し、版の違うものを混ぜない）
export const ConfigSnapshot = z.object({
  childId: z.string().min(1),
  configVersion: ConfigVersion,
  calculationVersion: z.number().int().min(0), // 日別上限を作った C10 の版
  usualLimitMinutes: Minutes.nullable(), // 通常上限（null = 親がまだ決めていない = 上限未設定）
  plan: PlanSettings.nullable(), // 子どもは閲覧のみ（MVP_SPEC: 子供は開始日・各上限を変更できない）
  testPeriods: z.array(TestPeriod), // 0 件は「日程なし」であって「上限未設定」ではない（MVP_SPEC 4.3）
  blankPeriods: z.array(BlankPeriod), // 空白期間（期間中は制限なし）
  // 日付の早い順。一覧にない日は「上限未設定」。空白期間の日は kind: "unlimited"
  dailyLimits: z.array(DailyLimit),
  excludedApps: z.array(ExcludedApp),
  generatedAt: IsoDateTime, // サーバがこの組を作った時刻
});
export type ConfigSnapshot = z.infer<typeof ConfigSnapshot>;

// C7 の取得の入力。knownVersion は端末が今使っている版（なければ省く）。
// 同じ版なら中身を省いて返す（通信を減らす）。子どもが送った knownVersion は「子どもの端末が使っている版」として記録される（Q6）
export const ConfigQuery = z.object({
  childId: z.string().min(1),
  knownVersion: ConfigVersion.optional(),
});
export type ConfigQuery = z.infer<typeof ConfigQuery>;

// C7 の取得の結果。changed: false なら手元の組をそのまま使ってよい
export const ConfigResult = z.discriminatedUnion("changed", [
  z.object({ changed: z.literal(false), configVersion: ConfigVersion }),
  z.object({ changed: z.literal(true), snapshot: ConfigSnapshot }),
]);
export type ConfigResult = z.infer<typeof ConfigResult>;

// ── C8: 利用記録（子どもの端末 → サーバ）────────────────────────

// 1アプリぶんの、その日のそれまでの合計（累計）
export const AppMinutes = z.object({
  packageName: PackageName,
  label: z.string().min(1).max(120), // 画面に出すアプリ名（親09 で使う）
  usedMinutes: Minutes,
  // 測ったときに、このアプリが制限対象外（C9）または必須例外だったか（C3 と同じ判定を端末で付ける）
  excluded: z.boolean(),
});
export type AppMinutes = z.infer<typeof AppMinutes>;

// 1日ぶんの利用記録（Q8: その日のアプリ別の累計＋測った時刻＋制限対象の合計分）。
// サーバは日ごとに「測った時刻が一番新しいもの」を正とする（古い記録が後から届いても上書きしない）
export const UsageDayReport = z.object({
  date: IsoDate,
  measuredAt: IsoDateTime, // 端末で測った時刻
  restrictedMinutes: Minutes, // 制限対象アプリの合計（C3 と同じ計算。親の画面はこれを使う = 新しい設定で過去を計算し直さない）
  apps: z.array(AppMinutes).max(1000),
});
export type UsageDayReport = z.infer<typeof UsageDayReport>;

// 利用記録の送信（子どもだけ）。毎回「今日と昨日」の2日分を送る（Q8）。
// submissionId は端末が作る送信 ID（UUID）。送り直しでも同じ ID を使う（冪等キー）
export const UsageUpload = z.object({
  submissionId: z.uuid(),
  childId: z.string().min(1),
  days: z.array(UsageDayReport).min(1).max(7),
});
export type UsageUpload = z.infer<typeof UsageUpload>;

// 送信の結果。duplicate は「同じ ID・同じ中身をもう受け付け済み」（二重には保存していない）。どちらも送信待ちから消してよい
// 同じ ID で中身が違うときは conflict のエラー（端末側で隔離する）
export const UsageUploadResult = z.object({
  submissionId: z.uuid(),
  status: z.enum(["accepted", "duplicate"]),
  // 正として採用した日（その日の記録より新しく測ったもの）。古い記録だった日は入らない
  appliedDates: z.array(IsoDate),
});
export type UsageUploadResult = z.infer<typeof UsageUploadResult>;

// ── C6: 親が見る子どもの実績 ──────────────────────────────────────

// 親が見る期間の指定。from〜to（両端を含む）。週の表示なら月曜〜日曜を渡す
export const UsageQuery = z
  .object({
    childId: z.string().min(1),
    from: IsoDate,
    to: IsoDate,
  })
  .refine((v) => v.from <= v.to, { message: "to は from と同じか、それより後にしてください", path: ["to"] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < 190, {
    message: "一度に見られるのは半年（190日）までです",
    path: ["to"],
  });
export type UsageQuery = z.infer<typeof UsageQuery>;

// 1日ぶんの実績。記録がない日（未同期・取得不可を含む）は recorded: false で usedMinutes は null。0 分の記録とは区別する
export const UsageDay = z.object({
  date: IsoDate,
  recorded: z.boolean(),
  usedMinutes: Minutes.nullable(), // 制限対象アプリの合計（端末が送った restrictedMinutes）
  measuredAt: IsoDateTime.nullable(), // その記録を端末で測った時刻
  limit: DayLimit.nullable(), // その日の上限（null = 上限未設定。unlimited = 空白期間で制限なし）
  apps: z.array(AppMinutes), // 使った時間の多い順（親09）
});
export type UsageDay = z.infer<typeof UsageDay>;

// 親が見る実績（C6）。days は from〜to の全日を日付順に1件ずつ（記録がない日も入る）
export const ParentUsageView = z.object({
  childId: z.string().min(1),
  from: IsoDate,
  to: IsoDate,
  days: z.array(UsageDay),
  lastUploadedAt: IsoDateTime.nullable(), // 子どもの端末から最後に記録が届いた時刻（まだなら null）
});
export type ParentUsageView = z.infer<typeof ParentUsageView>;
