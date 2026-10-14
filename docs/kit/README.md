# hackathon-kit

5人でAIを使って作るためのチーム開発の枠組み。製品のコードではなく「道具」なので事前に用意してよい（中身の契約・データ・画面は当日作る）。

- AI（Claude Code / Codex）は `AGENTS.md` だけを入口に読み、`npm run now` で「今何をするか」を決める。AI ごとの設定は Claude Code が `.claude/`、Codex が `.codex/`（使い方は docs/kit/codex.md）。
- ルールは md に、**状況は GitHub（Issue・PR）と git に**持たせる。md に進捗を書かない（5人で書き換えると衝突して古くなる）。
- 「触るな」は文章ではなく仕組みで止める: Claude / Codex の hook（早期警告）→ pre-commit → CI。

## 正本はこれだけ
| 何 | どこ |
|---|---|
| メンバー・担当範囲・タイムライン・変更ルール | `kit.config.json` |
| 何を作るか | `docs/DEMO.md` |
| 型・API・画面・デザイン | `contracts/` |
| 決まったこと / 未決 | `docs/requirements/` |
| 技術構成・書き方の約束 | `docs/rules/stack.md`（Next.js + Tailwind v4 + Biome。公開先は Vercel、DB は Neon + Drizzle。手元は PGlite） |

このファイルは枠組みの説明書。リポジトリ直下の `README.md` と `LICENSE` はプロダクト用に空けてある。

## 前日までに
**lead**
1. GitHub にリポジトリを作り、このキットを push（当日は新リポジトリから始めるため「テンプレートリポジトリ」にしておく）。
2. `kit.config.json` の members（github ユーザー名）を書き換え → `npm run kit:owners`。時刻表（milestones）はまとめ役と決めて書く（当日のずれはまとめ役が `npm run kit:schedule`）。
3. main のブランチ保護: PR 必須 / CI（check）必須 / CODEOWNERS のレビュー必須。無料のプライベートリポジトリでは使えない（403）→ 全員 `npm run merge` でマージする運用にする。
4. ラベル作成: `task` `bug` `change-request` `blocked` `help`（同じ GitHub アカウントを共有するなら `member:<id>` も）。
5. **他のメンバーより先に**ここまで済ませる（リハーサル3: lead の設定前に動いた人がラベルなし・宛先なしの Issue を作った）。

**全員**
```
git clone <repo> && cd <repo>
npm ci
npm run kit:setup
npm run kit:whoami -- <自分のid>
cp .env.example .env
npm run doctor        # 全部 ✓ になるまで
npm run now
```
Codex を使う人は、続けて docs/kit/codex.md の「最初に1回」（trust・hook の確認・GH_TOKEN）。

## 当日の流れ
| 時刻（kit.config.json） | やること |
|---|---|
| キックオフ | lead が `npm run kit:reset`（ひな型の例を消す）→ 課題1文 → DEMO.md 下書き → data-wishlist で削る → 契約を書く → `npm run kit:stub` |
| 契約凍結 | 以降の追加は change-request。全員 MOCK=1 で並行開発 |
| 同期点 / 第1統合 | docs/rules/sync.md（動くもので理解を合わせる） |
| 機能フリーズ | バグと磨きと通し練習だけ |
| 録画 | DEMO.md 通りに録画（バックアップ） |

## 理解のずれを防ぐ3段
1. **着手宣言 + preflight**: ステップごとに、実在する契約名・画面 id・デモの D番号・自分のファイルで「何を作るか」を書かせて照合（docs/rules/declare.md）。
2. **型**: 契約から外れたコードはコンパイルが通らない。サーバは入出力を実行時にも検査する。
3. **同期点**: 動く main を全員で見る。書類ではなく画面で食い違いを見つける。
