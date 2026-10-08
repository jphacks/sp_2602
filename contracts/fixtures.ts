// モック用の固定データ。MOCK=1 のときサーバはこれを返す。デモ用の入力・出力もここに固定する。
import type { Chunk, Req, Res } from "./api";

// デモ用の固定入力（DEMO.md の「デモ用の固定入力」と一致させる）。下の結果はこの入力に対応している。
export const demoInput: Req<"analyze"> = {
  items: [
    { id: "1", name: "動画配信サービス" },
    { id: "2", name: "音楽配信サービス" },
    { id: "3", name: "学習アプリ" },
  ],
};

const analyzeResult: Res<"analyze"> = {
  summary: "（モック）3件中1件は減らせます",
  verdicts: [
    { itemId: "1", label: "keep", reason: "毎日使っている" },
    { itemId: "2", label: "reduce", reason: "週1回しか開いていない" },
    { itemId: "3", label: "drop", reason: "3か月使っていない" },
  ],
};

export const fixtures = {
  analyze: analyzeResult,
  // ストリームのモック: chunks を順に流してから res を返す
  analyzeStream: {
    chunks: [
      { text: "利用状況を確認しています…" },
      { text: "1件目は毎日使われています。" },
      { text: "2件目は週1回だけです。" },
      { text: "3件目は3か月使われていません。" },
    ] satisfies Chunk<"analyzeStream">[],
    res: analyzeResult,
  },
};
