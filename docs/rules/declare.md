# 着手宣言

ステップを始める前に `npm run step -- S<番号> <英語名>` でひな型を作り、`npm run declare -- 項目=値 …` で埋める（JSON を手で編集しない。最後に preflight が自動で走る）。
例: `npm run declare -- demoStep=D2 screens=parent-rules contracts=Rules,RulesSave files=src/app/parent-rules/index.tsx`
目的は「AIが（人間も）何を作ろうとしているか」を、**実在する名前で**書かせて照合すること。
存在しない契約名・画面 id・デモ台本にない番号を書いたら、理解がずれている。

```json
{
  "member": "front-b",
  "step": "S2",
  "goal": "保護者がアプリごとの上限を入れ、保存ボタンで rulesSave を呼ぶ",
  "demoStep": "D2",
  "screens": ["parent-rules"],
  "contracts": ["Rules", "RulesSave"],
  "files": ["src/app/parent-rules/index.tsx"],
  "doneCheck": "npm run typecheck"
}
```

| 項目 | 照合先 |
|---|---|
| step | `docs/members/<自分>.md` にある番号 |
| demoStep | `docs/DEMO.md` の D番号（このステップがデモのどこに効くか） |
| screens | `contracts/screens.md` の画面 id |
| contracts | `contracts/schemas.ts` / `api.ts` / `errors.ts` / `native.ts` / `tokens.ts` で export されている名前 |
| newContracts（任意） | このステップで新しく作る契約名。files に contracts/ を含む場合だけ書ける。既にある名前は書けない |
| files | 触る予定のファイル（照合はしない。PR の題名と「作業中」の表示に使う。担当の目安は docs/rules/team.md） |
| doneCheck | 実行できるコマンド（`npm run …` なら script が存在するか） |

使わない項目は `contracts=なし`（`none` / `-` も可）と書く。空のまま残さない。
ステップ表にない作業（`npm run step -- X … --adhoc`）は step が `X` になり、メンバーファイルとの照合を省く。デモに効かない作業なら `demoStep=なし` でよい（効くなら D番号を書く。書けば照合する）。
DEMO.md の該当行の画面と screens が食い違うと警告が出る（止めはしない）。DEMO.md と screens.md のどちらが古いか確かめる。

`demoStep` が書けないステップは、デモに効かない作業。やる前に lead に確認する。
