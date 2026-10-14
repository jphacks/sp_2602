// モック用の固定データ。MOCK=1 のときサーバはこれを返す。デモ用の入力・出力もここに固定する。
// npm run kit:reset 後の空の状態。contracts/api.ts の API 名と同じキーで固定の応答を置くと、仮の API（kit:stub）がそれを返す。
//   例: export const fixtures = { foo: { ... } satisfies Res<"foo"> };
export const fixtures = {};
