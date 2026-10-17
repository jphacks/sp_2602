# AGENTS.md — このリポジトリで働くAIへ（人間も同じ手順）

ハッカソンのチーム開発用リポジトリ。4人＋デバッガー（docs/rules/team.md）がそれぞれ自分の担当を作り、`contracts/` の型で繋がる。
**このファイルは判断の手順だけ。詳細は下の表で必要になった時だけ読む。**

## 最初に1回（このPCで初めて使うとき・clone した直後）
**ほかの何よりも先に** `docs/kit/setup.md` を上から実行して確かめ、結果を人間に報告する。中心は `npm run kit:setup -- <自分のid>`（npm ci・git hooks・自分の設定・.env・GitHub・doctor を順に行う）。自分の id は人間に聞く（推測しない）。`npm run now` の先頭に「このPCの準備がまだ」と出たときも、ここに戻る。

## 毎回の手順（作業の区切りごとに最初から）
1. `npm run now` を実行し、出力の「やること」を上から順に処理する。
2. `npm run step -- S<番号> <英語名>` で最新の main からブランチを作る（着手宣言のひな型も `.kit/declare-<自分>.json` にできる）。宣言は `npm run declare -- demoStep=D2 files=… screens=… contracts=…` で埋める（JSON を手で編集しない。preflight も自動で走り、通ると下書きの PR ができて「作業中」が全員に見える）（形式: docs/rules/declare.md）。通らなければ読み直してから書き直す。推測で埋めない。
3. 実装する。宣言した自分の担当（`docs/members/<自分>.md`）を作る。
4. 宣言した完了確認（doneCheck）を実行する。**出力の全文は PR 本文の「完了確認」欄に貼り**、人間への報告（下の6行）には結果の要点を書く。「できました」だけの報告はしない。
5. `npm run check`（整形・見た目・型・テスト・契約の変更記録）が通ったら commit → push（PR は declare が下書きで作ってある。本文の完了確認を埋める）。1ステップ = 1PR。マージは必ず `npm run merge`（CI が今のコミットで通るまで待ってからマージする。`gh pr merge` を直接使わない）。
6. 1に戻る。

## 絶対に守ること
- 他人の担当部分を直したくなったら、勝手に直さず `npm run issue -- bug <担当者id> "題名"` で担当者に頼み、待つ間は別のステップへ。Issue は必ず `npm run issue` で立てる（似た Issue があれば止まるので、そちらにコメントする）。宛先は「対応する人」で、自分ではない。Issue・PR へのコメントは先頭に `<自分のid>:` を書く（同じ GitHub アカウントを共有していても、誰の発言か分かるように）。**本文が2行以上ならファイルに書いて `--body-file <path>` で渡す**（引数で渡すと Windows では最初の改行で切れる）。
- `contracts/` を変えるときは docs/rules/changes.md の手順（`contracts/CHANGELOG.md` に1行）に従う。足りない型・フィールドがあれば `npm run issue -- change-request lead "題名"`。契約を足した人は `npm run kit:stub` で仮の API・画面を置き、useFlow の欄も同じ PR で足す。勝手に自分の側で型を作って回避しない。
- テストを消す・skip する・期待値を実装に合わせて書き換えることで通さない。
- 外部API（AI含む）はサーバ経由で呼ぶ。`MOCK=1` で必ず動く状態を保つ。
- 見た目は `StyleSheet.create` と `contracts/tokens.ts` の名前だけ（色コード・数値の余白の直書き、`style={{ … }}` の直書き禁止）。画面遷移は `contracts/screens.md` の表どおり。Android 固有の処理（使用時間の取得・制限画面など）は Kotlin（`modules/kit-native/`。`/android/` は生成物なので書かない）に置き、画面から直接触らず `contracts/` の窓口の型を通す。制限の判定は端末内で完結させ、保護者の権限はサーバ側で確かめる（docs/rules/stack.md の設計原則）。
- サーバとの通信は `src/lib/api.ts` の `call()`（1回で返る）と `stream()`（少しずつ返る）だけで行う。画面から `fetch` を手書きしない。画面間のデータは `useFlow()` だけで渡す。依存パッケージを勝手に足さない。
- 同じ不具合の修正（テスト・型・ビルドが通らない）に2回失敗したら、止まって人間に状況を報告する。道具の失敗（ファイル編集が適用できない、文字化けなど）は修正の失敗に数えず、別の方法（別の編集手段、エンコーディング指定）を1回試してから報告する。
- フリーズ後（`npm run now` に「変更禁止」と出たら）は新機能を作らない。Code Freeze（運営の締め切り）を過ぎたらコミット・push もしない。
- `npm run now` の「締め切り」に自分の担当（← 自分）が出たら、時刻に間に合うよう優先する。終わったらその Issue を閉じる。

## いつ何を読むか
| 状況 | 読むもの |
|---|---|
| 自分の担当・ステップ・触らないファイル | `docs/members/<自分>.md` |
| チームの組み方（機能A・B の分け方・キックオフでの書き換え） | `docs/rules/team.md` |
| 何を作っているのか（全体像） | `docs/DEMO.md`（これが最上位の仕様） |
| 型・API・画面 | `contracts/`（schemas.ts / api.ts / screens.md / tokens.ts） |
| 技術構成・フォルダ・書き方の約束 | `docs/rules/stack.md` |
| 決まったこと・未決のこと | `docs/requirements/decisions.md` / `open.md` |
| 契約を変えたい・機能を足したい | `docs/rules/changes.md` |
| pull / push / PR / Issue のタイミング | `docs/rules/git.md` |
| 着手宣言の書き方 | `docs/rules/declare.md` |
| 会議の録音から要件を更新する | `docs/rules/meeting.md` |
| 同期点（まとめ役が進行） | `docs/rules/sync.md` |
| 他の人を手伝う・手伝ってもらう（合流） | `docs/rules/help.md` |
| 要件・設計から Issue を一括で洗い出して立てる（開発の開始前） | スキル `plan-issues`（`.claude/skills/` と `.agents/skills/`）。docs/rules/git.md |
| 作業中に別の問題・追加案を見つけた（Issue を膨らませず新しく立てる） | スキル `spawn-issue`（`.claude/skills/` と `.agents/skills/`）。docs/rules/git.md |
| PR の AI 自動レビュー（Codex）を有効にする・使う | `docs/kit/pr-review.md` |
| コンフリクト（マージ競合）が出た | スキル `resolve-conflicts`（`.claude/skills/` と `.agents/skills/`）。docs/rules/git.md |
| Codex で動いていて、git・gh・npm がサンドボックスで失敗する | `docs/kit/codex.md` |

## Review guidelines（PR のレビュー観点。Codex の自動レビューもここを読む）
- コンフリクトを解決した PR（マージコミットを含む）では、**自分側と main 側の両方の変更が残っているか**を確かめる。片方の追加した行・関数・型・テストが意図なく消えていないかを、差分から探す。
- `contracts/` が変わったら、`contracts/CHANGELOG.md` に1行の記録があるか確認する。契約の競合を AI が片方に寄せて解決していないかも見る。
- 他人の担当部分（`docs/members/`）への変更が混ざっていないか確認する。
- テストの削除・skip・期待値の書き換えで通していないか確認する。
- 色コード・余白の数値の直書き、`style={{ … }}`、画面からの `fetch` の手書きがないか確認する。

## コマンド
- `npm run now` 状況とやること / `npm run step -- S2 input-form` ステップ開始（ブランチ＋宣言ひな型） / `npm run doctor` 環境チェック / `npm run preflight` 着手宣言の照合
- `npm run check` 全検査 / `npm run fix` 整形 / `npm run dev`（アプリの開発サーバ。Expo の Development Build につなぐ）/ `npm run dev:server`（API サーバを手元で動かす。`.env` の `MOCK=1` 推奨）/ `npm run android`（Android 16 の実機にアプリを入れて起動）
- 個人の作業ファイル（リポジトリの外。読まずに1行足すだけ）: 詰まったら `npm run log -- stuck "内容" --scope 内|外 --tried "…" --why 権限|契約不足|知識|外部|時間`、人を待つなら `npm run log -- wait "…"`、自分で決めたことは `npm run log -- decide "…（理由）"`、解決したら `npm run log -- done "…"`（開始・完了は自動）
- `npm run merge -- [PR番号]` CI を待ってからマージ / `npm run issue -- <種類> <宛先> "題名" --body-file <path>` Issue
- lead だけ: `npm run kit:reset`（キックオフで1回。ひな型の例を消す） / `npm run kit:stub`（契約に合わせて仮の API・画面を置く）
- 確かめる道具: `npm run api -- <契約名> [--body-file 本文.json]`（契約どおりに API を叩く） / `npm run shot -- docs/shots/<自分>/<D番号>-<名前>.png [--link hackathonkit://<画面id>]`（adb でつながっている実機・エミュレータの画面を撮って Read で見る。見た目の確認は必ずこれで）
- ステップ表にない作業: `npm run step -- X <英語名> --adhoc "目的"`（完了には数えない。PR に理由を1行）
- まとめ役だけ: `npm run kit:schedule [shift <分> | from <id> <HH:MM>]`（進みが時計とずれたら時刻表を直す。kit.config.json の時刻だけはまとめ役も変えてよい）
- DB: テーブルは `src/server/db/schema.ts`、使うのは `await db()`。手元は設定なしで動く。Neon に反映は `npm run db:push`（docs/rules/stack.md「DB」）
- 締め切りと全員の状況: `npm run kit:deadlines`（締め切りとやることの一覧） / `npm run status`（全員の作業中・止まっている人・担当の残り） / `npm run kit:alarm`（人間が別のターミナルで動かす見張り役。AI は動かさない）
- 最初の準備: `npm run kit:setup -- <id>`（clone 直後に1回。手順と失敗したときは docs/kit/setup.md） / 自分だけ変える: `npm run kit:whoami -- <id>`

## 人間への言葉づかい（Claude Code・Codex 共通）
読む人はプログラミングや IT の専門用語に慣れていない前提で書く。人間への返事・報告・Issue・PR の本文が対象。
- 専門用語・英語の略語は、その返事で初めて出たところで「何のためのものか」を短く添える。例: 「Zod（データの形が正しいかを確かめる道具）」「PR（自分の変更を main に入れる前に見てもらう申請）」「型エラー（受け渡すデータの形が約束と合わない、という指摘）」
- コマンドやコードを見せたら、それが何をするかを日本語で1行添える。エラーは原文を貼るだけにしない。「何が起きたか・なぜか・次に何をすればよいか」に言い換える。
- 1文を短くする。カタカナ語より日本語を使う（デプロイ → 公開、リファクタリング → 書き直し）。たとえ話は正確さを崩さない範囲で1つまで。
- **Issue・PR の話は番号から始めない。** AI どうしのやり取りは Issue で進むので、人間は何が共有されたかを知らない。次の順に書き、番号は最後に括弧で添える。
  1. 誰から: `<id>`（役割を短く。例「back-a（サーバ担当）」）。Issue 本文の末尾の「起票:」や、コメントの先頭の id で分かる
  2. 何を・なぜ: 「〜のために、…を足したい（変えたい）という話が出ている」
  3. こちらの見解: 「私たち（<自分の担当>）としては、〜なので…がよいと思う」
  - 例: 「back-a（サーバ担当）から、結果の画面を早く出すために、API の返事に件数を足したいという話が出ています（#16）。フロント側としては、画面の直しが1か所で済むので賛成でよいと思います。」
- **やること・決めてほしいことの一覧は、1項目ずつ「〜のため、（どこに）…をする」と書く。** 番号・ファイル名だけを並べない。
  - だめな例: 「#16 と #15 への返事」「PR #11 にコメント」「decisions.md への記録」
  - よい例: 「件数を足す話（#16、back-a から）は、中間発表の後に決めると返事する」「上限の金額の範囲が案とずれているため、予算の画面の PR（#11）に直してほしいとコメントする」「あとで理由をたどれるように、この2つの決定を decisions.md（決まったことの記録）に書く」
- 言い換えないもの: コード・コメント・コミットの文面・コマンド・ファイル名・契約名（言い換えると、コピーしても動かなくなる・検索で見つからなくなる）。6行の報告の形もそのまま使い、各行の中身をやさしく書く。
- 相手が「詳しく」「用語のままでいい」と言ったら合わせる。

## 報告の形（6行）
```
ステップ: S? <名前>
やったこと: <1文>
完了確認: <コマンド> → <結果の要点>
変更ファイル: <一覧>
仮定したこと: <なければ なし>
次: <次のステップ or 待ち>
```
