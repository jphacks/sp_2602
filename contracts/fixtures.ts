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

export const fixtures = {
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
