# 画面契約

画面の一覧・遷移・担当。画面 id（バッククォートで囲んだもの）は着手宣言で参照される。
変更手続きはデータ契約と同じ（CHANGELOG に1行）。

「前の画面から受け取る」「次の画面へ渡す」は `useFlow()` 経由の受け渡し。「サーバとの通信」は `call()` / `stream()` で使う API（contracts/api.ts の名前）。

| id | 画面 | 担当 | 前の画面から受け取る | サーバとの通信 | 次の画面へ渡す | 遷移先 |
|---|---|---|---|---|---|---|
| `role` | 役割を選ぶ（保護者・子ども） | front-b（本体）・front-a（部品） | なし | なし | なし | `parent-rules`、`child-home` |
| `parent-rules` | 保護者: アプリごとの制限時間を決める | front-b（本体）・front-a（部品） | なし | rulesGet（RulesQuery → Rules）、rulesSave（RulesSave → Rules） | Rules | `parent-usage`、`role` |
| `parent-usage` | 保護者: 子どもの使用状況を見る | front-b（本体）・front-a（部品） | Rules | usageGet（RulesQuery → Usage） | なし | `parent-rules`、`role` |
| `child-home` | 子ども: 今日の制限と使用状況を見る | front-b（本体）・front-a（部品） | なし | rulesSyncStream（RulesQuery → Rules）、usageReport（UsageReport → Usage） | なし | `role` |

## UXの約束（全画面共通）
- 1画面1目的。主ボタンは1つだけ。
- 待ち時間が1秒を超えたら、何をしているかを文字で出す。
- エラーは「何が起きたか＋次に押すもの」をセットで出す（`errorOf(e)` の message と hint をそのまま表示）。
- 見た目は `contracts/tokens.ts` の名前だけ（`StyleSheet.create` の中で `tokens.color.primary` のように使う。色コード・数字の直書き・`style={{}}` は npm run lint が弾く）。
- 画面は Android のスマホ（幅 360〜412dp）を基準に作る。押せる部品は高さ `tokens.size.touch`（44）以上。
- 画面 id = `src/app/<id>/index.tsx`（Expo Router。ファイルの位置がそのまま画面の道筋になる）。表に画面を足したのにファイルがないとテストが落ちる。
- 子どもの端末では、保護者の権限が必要な操作（制限ルールの変更・保護者の設定の表示）を画面に出さない。ただし画面で隠すだけでは足りないので、権限はサーバ側でも検証する。
