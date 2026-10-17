// モック用の固定データ。MOCK=1 のときサーバはこれを返す。デモ用の入力・出力もここに固定する。
import type { Chunk, Req, Res } from "./api";

// デモ用の固定入力（DEMO.md の「デモ用の固定入力」と一致させる）。下の結果はこの入力に対応している。
export const demoInput: Req<"rulesGet"> = { childId: "demo-child" };

const rules: Res<"rulesGet"> = {
  childId: "demo-child",
  limits: [
    { packageName: "com.google.android.youtube", label: "YouTube", dailyMinutes: 60 },
    { packageName: "com.instagram.android", label: "Instagram", dailyMinutes: 30 },
    { packageName: "com.nintendo.zaka", label: "ゲーム", dailyMinutes: 45 },
  ],
  updatedAt: "2026-10-17T10:00:00+09:00",
};

const usage: Res<"usageGet"> = {
  childId: "demo-child",
  date: "2026-10-17",
  apps: [
    { packageName: "com.google.android.youtube", label: "YouTube", usedMinutes: 42 },
    { packageName: "com.instagram.android", label: "Instagram", usedMinutes: 30 },
    { packageName: "com.nintendo.zaka", label: "ゲーム", usedMinutes: 10 },
  ],
  updatedAt: "2026-10-17T18:00:00+09:00",
};

// MOCK=1 のときの Google ログイン。authGoogle に idToken（キー）を送ると、その Session（合言葉つき）が返る。
// 画面・テスト・npm run api -- … --token <token> は、この token を合言葉として使う
export const mockSessions = {
  "mock-google-parent": { token: "mock-token-parent", userId: "demo-parent", name: "デモの保護者", role: "parent" },
  "mock-google-child": { token: "mock-token-child", userId: "demo-child", name: "デモの子ども", role: "child" },
  // ログインしたが、まだ QR のペアリングをしていない人（親子どちらにも分かれていない）
  "mock-google-new": { token: "mock-token-new", userId: "demo-new", name: "はじめての人", role: null },
} satisfies Record<string, Res<"authGoogle">>;

// MOCK=1 のときのペアリング（層2 #22）。状態ごとの例。画面はこれで waiting → claimed → linked と、expired・rejected を確かめる
const demoChild = { id: "demo-child", name: "デモの子ども" };
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

export const fixtures = {
  authGoogle: mockSessions["mock-google-parent"],
  authMe: mockSessions["mock-google-parent"],
  pairStart: mockPair.ticket,
  pairStatus: mockPair.waiting,
  pairClaim: mockPair.claimed,
  pairConfirm: mockPair.linked,
  familyGet: { children: [demoChild] } satisfies Res<"familyGet">,
  usageReport: usage,
  usageGet: usage,
  rulesGet: rules,
  rulesSave: rules,
  // ストリームのモック: chunks を順に流してから res を返す
  rulesSyncStream: {
    chunks: [
      { text: "保護者の設定を読み込んでいます…" },
      { text: "3つのアプリの制限を受け取りました。" },
      { text: "端末に保存しています…" },
    ] satisfies Chunk<"rulesSyncStream">[],
    res: rules,
  },
};
