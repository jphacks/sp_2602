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
1. JPHACKS が用意したチームのリポジトリ（`github.com/jphacks/<チーム>`）を clone し、このキットのファイルを入れて push。直下の `README.md` は JPHACKS のひな型を残す（キットの説明は docs/kit/ にある）。README の「開発技術」に、事前に用意したもの（このキット＝開発の道具）と当日作ったものを分けて書く。
2. `kit.config.json` の members（github ユーザー名）を書き換え → `npm run kit:owners`。締め切り（deadlines：運営の時刻と、それまでにやること・担当・優先度）と目安（milestones）はまとめ役と見直す（当日のずれはまとめ役が `npm run kit:schedule`。締め切りは動かさない）。
3. main のブランチ保護: PR 必須 / CI（check）必須 / CODEOWNERS のレビュー必須。無料のプライベートリポジトリでは使えない（403）→ 全員 `npm run merge` でマージする運用にする。
4. ラベル作成: `task` `bug` `change-request` `blocked` `help`（同じ GitHub アカウントを共有するなら `member:<id>` も）。続けてまとめ役が `npm run kit:deadlines -- issues`（締め切りのやることを1件ずつ Issue にする。ラベル `deadline` も作る）。
5. **他のメンバーより先に**ここまで済ませる（リハーサル3: lead の設定前に動いた人がラベルなし・宛先なしの Issue を作った）。

**全員**（手順・確かめ方・失敗したときは docs/kit/setup.md。AI に「docs/kit/setup.md を実行して」と頼んでもよい）
```
git clone <repo> && cd <repo>
npm run kit:setup -- <自分のid>   # npm ci・git hooks・自分・.env・GitHub・doctor をまとめて。「✓ 準備完了」まで
npm run kit:alarm -- --test       # 通知（音なし）が出るか
npm run now
```
当日は別のターミナルで `npm run kit:alarm` を動かしっぱなしにする（締め切りの60・30・10分前と時刻ちょうど、目安の時刻に知らせる）。
Codex を使う人は、続けて docs/kit/codex.md の「最初に1回」（trust・hook の確認・GH_TOKEN）。

## 当日の流れ
時刻は2種類（どちらも kit.config.json。`npm run kit:schedule` で一覧）。
- **締め切り**（deadlines）: 運営が決めた動かない時刻。それまでにやることが担当・優先度（必須 / できれば / 余裕があれば）つきで決まっていて、`npm run now`・`npm run kit:alarm` が担当者に知らせる。終わったら Issue を閉じる。
- **目安**（milestones）: チームの進め方の区切り。進みとずれたらまとめ役が `kit:schedule` でずらす（締め切りを越えない）。

| いつ | 種類 | やること |
|---|---|---|
| 10/17 10:20 キックオフ | 目安 | lead が `npm run kit:reset` → 課題1文 → DEMO.md 下書き（90秒） → data-wishlist で削る → 契約を書く → `npm run kit:stub` |
| 契約凍結 / 同期点1 / 第1統合 | 目安 | 以降の追加は change-request。同期点は docs/rules/sync.md（`npm run status` と動く main で確かめる） |
| 10/17 18:50 中間発表 | 締め切り | 必須事項はなし。見せられるところまで |
| 10/17 20:00 閉会 → 夜 | 締め切り・目安 | push してから会場を出る。夜の分担はまとめ役が決め、オンラインで続ける |
| 10/18 9:50 2日目の始め | 目安 | 夜の変更を main で通し、残りを Code Freeze に収まるよう決め直す |
| 機能フリーズ → 録画 | 目安 | バグと磨きと通し練習だけ。Code Freeze の前に録画 |
| 10/18 15:00 Code Freeze | 締め切り | 以降はコミット・push しない |
| 10/18 16:00 ピッチ（90秒） | 締め切り | 90秒の台本・動画・通し練習（拍手で強制終了） |

## 理解のずれを防ぐ3段
1. **着手宣言 + preflight**: ステップごとに、実在する契約名・画面 id・デモの D番号・自分のファイルで「何を作るか」を書かせて照合（docs/rules/declare.md）。
2. **型**: 契約から外れたコードはコンパイルが通らない。サーバは入出力を実行時にも検査する。
3. **同期点**: 動く main を全員で見る。書類ではなく画面で食い違いを見つける。
