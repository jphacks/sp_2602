// 通信の契約（アプリ ⇔ サーバ）。サーバとクライアントは必ずこの表を経由する（パスを手書きしない）。
//   kind "json"   : 1回の要求に1回の応答
//   kind "stream" : 応答を少しずつ返す（chunk を何回か → 最後に res を1回）。今は使う API がないが、仕組み（StreamDef・streamLine）は残してある
// 失敗したときの形は errors.ts の ApiError に統一。
//   auth（誰が呼べるか。サーバの入口 src/server/route.ts が毎回確かめる。画面で隠すだけにしない）:
//     "none" だれでも / "signedIn" ログイン済み（紐づけ前の role: null も可） / "parent" 保護者だけ / "child" 子どもだけ
//     合言葉がない・無効なら unauthorized(401)、役割が違えば forbidden(403)
//   入力に childId がある API は、auth に加えて「子どもは自分の childId だけ」「保護者は連携済み（D2）の子どもだけ」を
//   route.ts が必ず確かめる（紐づけ前の人はどの子どもも扱えない）。handlers の中で書き忘れることはない。
// 決まりごと: 条件つきの取得も POST（GET で条件を渡す仕組みはない）。path は `/api/<機能>/<名前>`。
import { z } from "zod";
import { ApiError } from "./errors";
import {
  BlankPeriodCreate,
  BlankPeriodList,
  BlankPeriodSaveResult,
  BlankPeriodUpdate,
  ChildQuery,
  ConfigQuery,
  ConfigResult,
  ExcludedAppsSave,
  ExcludedAppsSaveResult,
  ExcludedAppsView,
  Family,
  FamilyUnlinkResult,
  GoogleSignIn,
  LinkStatus,
  PairClaim,
  PairConfirm,
  PairQuery,
  PairStart,
  PairStatus,
  PairTicket,
  ParentUsageView,
  PeriodDelete,
  PeriodDeleteResult,
  PlanSave,
  PlanSaveResult,
  PlanView,
  Session,
  SignOutRequest,
  SignOutResult,
  TestPeriodCreate,
  TestPeriodList,
  TestPeriodSaveResult,
  TestPeriodUpdate,
  UsageQuery,
  UsageUpload,
  UsageUploadResult,
  UsualLimitSave,
  UsualLimitSaveResult,
} from "./schemas";

export const Health = z.object({ ok: z.literal(true), mock: z.boolean() });
export type Health = z.infer<typeof Health>;

export type AuthRule = "none" | "signedIn" | "parent" | "child";

// json の API 1本を短く書くための道具（kind・method・path・auth・req・res）
const post = <A extends AuthRule, Q extends z.ZodType, S extends z.ZodType>(path: string, auth: A, req: Q, res: S) =>
  ({ kind: "json", method: "POST", path, auth, req, res }) as const;

export const api = {
  health: { kind: "json", method: "GET", path: "/api/health", auth: "none", req: z.void(), res: Health },

  // ── C1: ログイン ──
  // Google の ID トークンを確かめて、合言葉を出す（初めての人は登録もする。role は null のまま）。
  // MOCK=1 のときだけ "mock-" で始まる idToken（contracts/fixtures.ts の mockLogins）も受け付ける
  authGoogle: post("/api/auth/google", "none", GoogleSignIn, Session),
  // 今の合言葉の持ち主（役割を含む）。アプリの起動時に、どの画面に進むかを決めるのに使う
  authMe: { kind: "json", method: "GET", path: "/api/auth/me", auth: "signedIn", req: z.void(), res: Session },
  // ログアウト。サーバ側で合言葉を使えなくする（otherDevices: true なら、この端末以外の合言葉をすべて）
  // 足した理由: 端末の中の合言葉を消すだけでは、なくした端末・盗まれた合言葉が期限まで使えたままになるため
  authSignOut: post("/api/auth/sign-out", "signedIn", SignOutRequest, SignOutResult),

  // ── C1: QR の紐づけ。役割がまだない人（role: null）が使う。MVP は親1人↔子1人（2人目は conflict。Q2）──
  // 子ども: QR を出す（保護者・連携済みの子どもは conflict。前に出した未使用の QR は無効になる。Q10）
  pairStart: post("/api/pair/start", "signedIn", PairStart, PairTicket),
  // 子ども・保護者: 進み具合を聞く（自分が関わるペアリングだけ。ほかは not_found）
  pairStatus: post("/api/pair/status", "signedIn", PairQuery, PairStatus),
  // 保護者: QR の番号を送る（期限切れ・使用済み・自分の QR・すでに連携済みは conflict。子どもは forbidden。知らない番号は not_found）
  pairClaim: post("/api/pair/claim", "signedIn", PairClaim, PairStatus),
  // 子ども: 「はい / いいえ」で確定する（QR を出した本人だけ。D2 への保存が終わってから linked を返す）
  pairConfirm: post("/api/pair/confirm", "signedIn", PairConfirm, PairStatus),
  // 子ども: 自分が出した QR（waiting / claimed）を取り消す（子14 などの「やめる」）。以後その code は使えない（expired になる）。
  // 足した理由: 「やめる」の後も QR が期限（10分）まで使えたままだと、画面を離れた後に保護者が読めてしまうため。
  // QR を出した本人だけ（ほかの人のペアリングは not_found）。もう linked なら conflict。expired・rejected はそのまま返す（何度呼んでもよい）
  pairCancel: post("/api/pair/cancel", "signedIn", PairQuery, PairStatus),
  // 親子: D2 に保存が確定した連携状態（紐づけ前の人は unlinked）
  linkStatus: {
    kind: "json",
    method: "GET",
    path: "/api/link/status",
    auth: "signedIn",
    req: z.void(),
    res: LinkStatus,
  },
  // 保護者: 連携済みの子どもの一覧
  familyGet: { kind: "json", method: "GET", path: "/api/family/get", auth: "parent", req: z.void(), res: Family },
  // 保護者: 子どもとの連携を外す（連携済みの子どもだけ。route.ts が確かめる）。子どもの合言葉はすべて使えなくなり、
  // 子どもは役割のない状態（role: null）に戻る（もう一度 QR で紐づけ直せる）。子どもの端末をなくしたときにも使う
  // 足した理由: 保護者が子どもを外す手段・なくした子どもの端末の合言葉を止める手段がなかったため
  familyUnlink: post("/api/family/unlink", "parent", ChildQuery, FamilyUnlinkResult),

  // ── D8: 通常上限と計画（C10 の入力）──
  // 親子: 計画と通常上限を見る（子どもは閲覧のみ）
  planGet: post("/api/plan/get", "signedIn", ChildQuery, PlanView),
  // 保護者: 計画（開始日・S・G。通常上限も一緒に変えられる）を保存する。保存と同時に C10 が今日から先の日別上限を作り直してから返す
  // （版がずれていたら conflict。開始日が今日より前・G > S は bad_request。Q14）
  planSave: post("/api/plan/save", "parent", PlanSave, PlanSaveResult),
  // 保護者: 通常上限だけを保存する（紐づけ直後に決める。Q7）。保存と同時に C10 が作り直す
  // 足した理由: Q7 で「親に決まったとき（紐づけ直後）に1日の上限を決める」ことになり、計画（S・G）とは別に保存する必要があるため
  usualLimitSave: post("/api/plan/usual-limit", "parent", UsualLimitSave, UsualLimitSaveResult),

  // ── D3: テスト期間（親子どちらも変えられる。Q11。保存と同時に C10 が作り直す）──
  testPeriodList: post("/api/test-period/list", "signedIn", ChildQuery, TestPeriodList),
  testPeriodCreate: post("/api/test-period/create", "signedIn", TestPeriodCreate, TestPeriodSaveResult),
  testPeriodUpdate: post("/api/test-period/update", "signedIn", TestPeriodUpdate, TestPeriodSaveResult),
  testPeriodDelete: post("/api/test-period/delete", "signedIn", PeriodDelete, PeriodDeleteResult),

  // ── 空白期間（Q7。親だけ。期間中は制限なし。保存と同時に C10 が作り直す）──
  // 足した理由: Q7 の仕様の変更（夏休みなどの空白期間）。子どもは configGet の blankPeriods で見られる
  blankPeriodList: post("/api/blank-period/list", "parent", ChildQuery, BlankPeriodList),
  blankPeriodCreate: post("/api/blank-period/create", "parent", BlankPeriodCreate, BlankPeriodSaveResult),
  blankPeriodUpdate: post("/api/blank-period/update", "parent", BlankPeriodUpdate, BlankPeriodSaveResult),
  blankPeriodDelete: post("/api/blank-period/delete", "parent", PeriodDelete, PeriodDeleteResult),

  // ── C7: 設定のスナップショット（通常上限・計画・日程・空白期間・日別上限・対象外アプリ・版を1組で）──
  // 親子: knownVersion と同じ版なら中身を省く。子どもが呼ぶと「子どもの端末が使っている版」として記録する（Q6）
  configGet: post("/api/config/get", "signedIn", ConfigQuery, ConfigResult),

  // ── C8・C6: 利用記録 ──
  // 子ども: 利用記録（今日と昨日の2日分）を送る。同じ送信 ID の送り直しは二重に保存しない（duplicate を返す）
  usageUpload: post("/api/usage/upload", "child", UsageUpload, UsageUploadResult),
  // 保護者: 連携済みの子どもの、期間の実績（分）と日別上限（C6。週のグラフ・今日の分数・アプリ別）
  usageGet: post("/api/usage/get", "parent", UsageQuery, ParentUsageView),

  // ── C9: 制限対象外アプリ ──
  // 親子: 対象外アプリの一覧（子どもは閲覧のみ）
  excludedAppsGet: post("/api/excluded-apps/get", "signedIn", ChildQuery, ExcludedAppsView),
  // 保護者: 対象外アプリを保存する（全件の置き換え。子どもは forbidden。版がずれていたら conflict）
  excludedAppsSave: post("/api/excluded-apps/save", "parent", ExcludedAppsSave, ExcludedAppsSaveResult),
  // TODO(保留): Q15 子どもの端末のアプリ一覧をサーバへ送る API は作らない（プライバシーの検討中）
} as const satisfies Record<string, { auth: AuthRule; [key: string]: unknown }>;

export type Api = typeof api;
export type RouteName = keyof Api;
export type JsonRoute = { [K in RouteName]: Api[K]["kind"] extends "json" ? K : never }[RouteName];
export type StreamRoute = { [K in RouteName]: Api[K]["kind"] extends "stream" ? K : never }[RouteName];
export type Req<K extends RouteName> = z.infer<Api[K]["req"]>;
export type Res<K extends RouteName> = z.infer<Api[K]["res"]>;
// ストリームの API の途中の1かけらの型（今はストリームの API がないので never になる）
export type Chunk<K extends StreamRoute> = Api[K] extends { chunk: z.ZodType } ? z.infer<Api[K]["chunk"]> : never;
// ストリームの API 1本の形。stream() / handleStream() はこれで読む（ストリームの API が1本もない時も型が崩れない）
export type StreamDef = {
  kind: "stream";
  method: string;
  path: string;
  auth: AuthRule;
  req: z.ZodType;
  chunk: z.ZodType;
  res: z.ZodType;
};

// ストリームで流れる1行（NDJSON）の形
export const streamLine = <C extends z.ZodType, R extends z.ZodType>(chunk: C, res: R) =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("chunk"), data: chunk }),
    z.object({ type: z.literal("done"), data: res }),
    z.object({ type: z.literal("error"), error: ApiError }),
  ]);
