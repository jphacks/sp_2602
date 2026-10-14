# AGENTS.md — このリポジトリで働くAIへ（人間も同じ手順）

ハッカソンのチーム開発用リポジトリ。5人がそれぞれ自分の範囲だけを作り、`contracts/` の型で繋がる。
**このファイルは判断の手順だけ。詳細は下の表で必要になった時だけ読む。**

## 毎回の手順（作業の区切りごとに最初から）
1. `npm run now` を実行し、出力の「やること」を上から順に処理する。
2. `npm run step -- S<番号> <英語名>` で最新の main からブランチを作る（着手宣言のひな型も `.kit/declare-<自分>.json` にできる）。宣言は `npm run declare -- demoStep=D2 files=… screens=… contracts=…` で埋める（JSON を手で編集しない。preflight も自動で走る）（形式: docs/rules/declare.md）。通らなければ読み直してから書き直す。推測で埋めない。
3. 実装する。触ってよいのは宣言した自分の所有ファイルだけ。
4. 宣言した完了確認（doneCheck）を実行する。**出力の全文は PR 本文の「完了確認」欄に貼り**、人間への報告（下の6行）には結果の要点を書く。「できました」だけの報告はしない。
5. `npm run check`（整形・見た目・型・テスト・範囲）が通ったら commit → push → PR。1ステップ = 1PR。マージは必ず `npm run merge`（CI が今のコミットで通るまで待ってからマージする。`gh pr merge` を直接使わない）。
6. 1に戻る。

## 絶対に守ること
- 他人の所有ファイルを編集しない。必要なら `npm run issue -- bug <所有者id> "題名"` で所有者に頼み、待つ間は別のステップへ。Issue は必ず `npm run issue` で立てる（似た Issue があれば止まるので、そちらにコメントする）。宛先は「対応する人」で、自分ではない。**本文が2行以上ならファイルに書いて `--body-file <path>` で渡す**（引数で渡すと Windows では最初の改行で切れる）。
- `contracts/` は lead だけが変更する。足りない型・フィールドがあれば `npm run issue -- change-request lead "題名"`（docs/rules/changes.md）。lead は契約を足したら `npm run kit:stub` で仮の API・画面を置き、useFlow の欄も同じ PR で足す。勝手に自分の側で型を作って回避しない。
- テストを消す・skip する・期待値を実装に合わせて書き換えることで通さない。
- 外部API（AI含む）はサーバ経由で呼ぶ。`MOCK=1` で必ず動く状態を保つ。
- 見た目は Tailwind のクラスと `contracts/tokens.css` の名前だけ（任意値・style 直書き禁止）。画面遷移は `contracts/screens.md` の表どおり。
- サーバとの通信は `src/lib/api.ts` の `call()`（1回で返る）と `stream()`（少しずつ返る）だけで行う。`fetch` を手書きしない。画面間のデータは `useFlow()` だけで渡す。依存パッケージを勝手に足さない。
- 同じ不具合の修正（テスト・型・ビルドが通らない）に2回失敗したら、止まって人間に状況を報告する。道具の失敗（ファイル編集が適用できない、文字化けなど）は修正の失敗に数えず、別の方法（別の編集手段、エンコーディング指定）を1回試してから報告する。
- フリーズ後（`npm run now` に「変更禁止」と出たら）は新機能を作らない。

## いつ何を読むか
| 状況 | 読むもの |
|---|---|
| 自分の担当・ステップ・触らないファイル | `docs/members/<自分>.md` |
| チームの組み方（機能A・B の分け方・キックオフでの書き換え） | `docs/rules/team.md` |
| 何を作っているのか（全体像） | `docs/DEMO.md`（これが最上位の仕様） |
| 型・API・画面 | `contracts/`（schemas.ts / api.ts / screens.md / tokens.css） |
| 技術構成・フォルダ・書き方の約束 | `docs/rules/stack.md` |
| 決まったこと・未決のこと | `docs/requirements/decisions.md` / `open.md` |
| 契約を変えたい・機能を足したい | `docs/rules/changes.md` |
| pull / push / PR / Issue のタイミング | `docs/rules/git.md` |
| 着手宣言の書き方 | `docs/rules/declare.md` |
| 会議の録音から要件を更新する | `docs/rules/meeting.md` |
| 同期点（まとめ役が進行） | `docs/rules/sync.md` |
| 他の人を手伝う・手伝ってもらう（合流） | `docs/rules/help.md` |
| Codex で動いていて、git・gh・npm がサンドボックスで失敗する | `docs/kit/codex.md` |

## コマンド
- `npm run now` 状況とやること / `npm run step -- S2 input-form` ステップ開始（ブランチ＋宣言ひな型） / `npm run doctor` 環境チェック / `npm run preflight` 着手宣言の照合
- `npm run check` 全検査 / `npm run fix` 整形 / `npm run dev`（http://localhost:3000、`.env` の `MOCK=1` 推奨）
- `npm run log -- "メモ"` 個人の作業ログに1行（開始・完了は step / merge が自動で書く。置き場所はリポジトリの外。`npm run log` で今日の分を見る） / `npm run merge -- [PR番号]` CI を待ってからマージ / `npm run issue -- <種類> <宛先> "題名" --body-file <path>` Issue
- lead だけ: `npm run kit:reset`（キックオフで1回。ひな型の例を消す） / `npm run kit:stub`（契約に合わせて仮の API・画面を置く）
- 確かめる道具: `npm run api -- <契約名> [--body-file 本文.json]`（契約どおりに API を叩く） / `npm run shot -- <URL> docs/shots/<自分>/<D番号>-<名前>.png`（画面を撮って Read で見る。見た目の確認は必ずこれで）
- ステップ表にない作業: `npm run step -- X <英語名> --adhoc "目的"`（完了には数えない。PR に理由を1行）
- まとめ役だけ: `npm run kit:schedule [shift <分> | from <id> <HH:MM>]`（進みが時計とずれたら時刻表を直す。kit.config.json の時刻だけはまとめ役も変えてよい）
- DB: テーブルは `src/server/db/schema.ts`、使うのは `await db()`。手元は設定なしで動く。Neon に反映は `npm run db:push`（docs/rules/stack.md「DB」）
- 自分の設定: `npm run kit:whoami -- <id>`（初回のみ）

## 報告の形（6行）
```
ステップ: S? <名前>
やったこと: <1文>
完了確認: <コマンド> → <結果の要点>
変更ファイル: <一覧>
仮定したこと: <なければ なし>
次: <次のステップ or 待ち>
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
