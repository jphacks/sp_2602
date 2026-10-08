# AGENTS.md — このリポジトリで働くAIへ（人間も同じ手順）

ハッカソンのチーム開発用リポジトリ。5人がそれぞれ自分の範囲だけを作り、`contracts/` の型で繋がる。
**このファイルは判断の手順だけ。詳細は下の表で必要になった時だけ読む。**

## 毎回の手順（作業の区切りごとに最初から）
1. `npm run now` を実行し、出力の「やること」を上から順に処理する。
2. `npm run step -- S<番号> <英語名>` で最新の main からブランチを作る（着手宣言のひな型も `.kit/declare-<自分>.json` にできる）。宣言を埋めて `npm run preflight` を通す（形式: docs/rules/declare.md）。通らなければ読み直してから書き直す。推測で埋めない。
3. 実装する。触ってよいのは宣言した自分の所有ファイルだけ。
4. 宣言した完了確認（doneCheck）を実行する。**出力の全文は PR 本文の「完了確認」欄に貼り**、人間への報告（下の6行）には結果の要点を書く。「できました」だけの報告はしない。
5. `npm run check`（整形・見た目・型・テスト・範囲）が通ったら commit → push → PR。1ステップ = 1PR。
6. 1に戻る。

## 絶対に守ること
- 他人の所有ファイルを編集しない。必要なら所有者宛てに Issue を立てて待つ間は別のステップへ。
- `contracts/` は lead だけが変更する。足りない型・フィールドがあれば change-request Issue（docs/rules/changes.md）。勝手に自分の側で型を作って回避しない。
- テストを消す・skip する・期待値を実装に合わせて書き換えることで通さない。
- 外部API（AI含む）はサーバ経由で呼ぶ。`MOCK=1` で必ず動く状態を保つ。
- 見た目は Tailwind のクラスと `contracts/tokens.css` の名前だけ（任意値・style 直書き禁止）。画面遷移は `contracts/screens.md` の表どおり。
- サーバとの通信は `src/lib/api.ts` の `call()`（1回で返る）と `stream()`（少しずつ返る）だけで行う。`fetch` を手書きしない。画面間のデータは `useFlow()` だけで渡す。依存パッケージを勝手に足さない。
- 同じ修正に2回失敗したら止まって、人間に状況を報告する。
- フリーズ後（`npm run now` に「変更禁止」と出たら）は新機能を作らない。

## いつ何を読むか
| 状況 | 読むもの |
|---|---|
| 自分の担当・ステップ・触らないファイル | `docs/members/<自分>.md` |
| 何を作っているのか（全体像） | `docs/DEMO.md`（これが最上位の仕様） |
| 型・API・画面 | `contracts/`（schemas.ts / api.ts / screens.md / tokens.css） |
| 技術構成・フォルダ・書き方の約束 | `docs/rules/stack.md` |
| 決まったこと・未決のこと | `docs/requirements/decisions.md` / `open.md` |
| 契約を変えたい・機能を足したい | `docs/rules/changes.md` |
| pull / push / PR / Issue のタイミング | `docs/rules/git.md` |
| 着手宣言の書き方 | `docs/rules/declare.md` |
| 会議の録音から要件を更新する | `docs/rules/meeting.md` |
| 同期点（lead が進行） | `docs/rules/sync.md` |
| 他の人を手伝う・手伝ってもらう（合流） | `docs/rules/help.md` |

## コマンド
- `npm run now` 状況とやること / `npm run step -- S2 input-form` ステップ開始（ブランチ＋宣言ひな型） / `npm run doctor` 環境チェック / `npm run preflight` 着手宣言の照合
- `npm run check` 全検査 / `npm run fix` 整形 / `npm run dev`（http://localhost:3000、`.env` の `MOCK=1` 推奨）
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
