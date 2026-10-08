# 着手宣言

ステップを始める前に `.kit/declare-<自分のid>.json` を書き、`npm run preflight` を通す。
目的は「AIが（人間も）何を作ろうとしているか」を、**実在する名前で**書かせて照合すること。
存在しない契約名・他人のファイル・デモ台本にない番号を書いたら、理解がずれている。

```json
{
  "member": "front1",
  "step": "S2",
  "goal": "入力欄に3件まで登録し、判定ボタンで analyze を呼ぶ",
  "demoStep": "D2",
  "screens": ["home"],
  "contracts": ["AnalyzeRequest", "Item"],
  "files": ["src/app/home/page.tsx", "src/app/home/ItemForm.tsx"],
  "doneCheck": "npm run typecheck"
}
```

| 項目 | 照合先 |
|---|---|
| step | `docs/members/<自分>.md` にある番号 |
| demoStep | `docs/DEMO.md` の D番号（このステップがデモのどこに効くか） |
| screens | `contracts/screens.md` の画面 id |
| contracts | `contracts/schemas.ts` / `api.ts` で export されている名前 |
| files | すべて自分の所有範囲（`kit.config.json`） |
| doneCheck | 実行できるコマンド（`npm run …` なら script が存在するか） |

`demoStep` が書けないステップは、デモに効かない作業。やる前に lead に確認する。
