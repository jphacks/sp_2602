# Git の規律

## タイミング
| いつ | やること |
|---|---|
| ステップを始める前 | `npm run step -- S<番号> <英語名>`（最新の main からブランチを作る。main に直接コミットすると pre-commit が止める） |
| 着手宣言が通った時 | `npm run declare` が下書きの PR を作る（空の「着手」コミットを push する）。誰が何をしているかが `npm run status` と GitHub で見える |
| ステップが終わった時（30〜60分ごと） | `npm run check` → commit → push → PR 本文の完了確認を埋める |
| PR を出した後 | 待たずに次のステップへ。CI が落ちたら `npm run now` に出るので最優先で直す |
| CHANGELOG に新しい行が来た時 | pull → `npm run typecheck` → 自分のコードを直す |
| 同期点の直前 | 手元の作業を PR にしておく（同期点は main で確認する） |

## ブランチと PR
- ブランチ名: `<自分のid>/S<番号>-<短い名前>`（例 `front-a/S2-input-form`）。`npm run step` が作る。`<自分のid>/` で始まらない名前は pre-commit が止める
- 1ステップ = 1PR。PR は着手宣言の時点で下書きとしてでき、本文に宣言の要約が入る（`npm run declare`。作らないなら `--no-pr`）。宣言を直すと PR にコメントで残る。`npm run merge` が下書きを解除してからマージする。
- PR は CI が緑なら自分でマージしてよい。**マージは `npm run merge -- <PR番号>`**（今のコミットの CI が現れて全部成功するまで待つ。push 直後の `gh pr checks --watch` は「no checks reported」で即座に正常終了するので、それを見てマージしない）。main より遅れていると止まるので、`git pull origin main` → `npm run check` → push してからもう一度（CI が今の main と合わせて試し直す）。GitHub の画面でマージする人間も、CI の緑を見てから押す。
- contracts/ に触れる PR は lead に見てもらってからマージする。
- コンフリクトしたら: 自分の変更は自分で解決。他人の担当部分でコンフリクトしたら、その担当者に聞いてから解決する。

## Issue
- 立てるときは `npm run issue -- <種類> <宛先id> "題名" ["1行の本文"]`。本文が2行以上なら `--body-file <path>`（`-` で標準入力）。Windows の npm は引数を cmd.exe に通すので、引数の本文は最初の改行で切れ、後ろの `--dry-run` なども落ちる。立てる前に似た open な Issue を探し、あれば止まる（そちらにコメントする。別件なら --force）。ラベルは `--label <名前>`（何度でも。`area:front` / `screen:home` / `demo:D2` など。無ければ作る）、先に終わるべき Issue は `--blocked-by <番号>`（何度でも。本文に `Depends on #番号` が入り、GitHub 標準の依存関係にも登録される）。
- 宛先は「対応する人」（直す人・決める人）。自分宛てにしない。
- コメントは先頭に `<自分のid>:` を書く（例 `front-a: 上限の範囲は 0〜100万円にします`）。本文には「起票:」が自動で入るが、コメントには入らない。同じアカウントを共有していると、誰の発言か分からなくなる。自分の作業の記録は Issue ではなく PR に書く。
- 種類: `task`（ステップ）/ `bug` / `change-request`（契約・機能の追加）/ `blocked`（他人待ち）
- 他人の担当部分に直してほしいことがあれば、その担当者に `bug` か `task` で assign する。口頭で頼んだ場合も Issue に残す。
- レビュー依頼と自分宛て `bug` は、自分のステップより先に処理する。

## 強制する仕組み（文章だけに頼らない）
- pre-commit: main への直接コミット・ブランチ名の検査、`npm run changelog -- --staged`（CHANGELOG なしの契約変更を止める）、整形・lint の自動修正（直したファイルは add し直す。直せない指摘だけ止める）
- CI: lint・型・テスト・Android 用のバンドル（`expo export`。import の間違い・足りない依存）・契約の CHANGELOG（PR のとき）。バンドルは `npm run check` に入っていないので、CI で初めて落ちることがある
- GitHub 側の設定（lead が前日に）: main のブランチ保護（PR 必須・CI 必須）。**無料のプライベートリポジトリでは使えない**（API が 403）。その場合は `npm run merge` だけでマージする運用で代える。

## 同じ GitHub アカウントを複数人で使う場合（リハーサル等）
- kit.config.json の members で github が同じ人が複数いると、自動でこのモードになる。
- Issue の宛先は assign ではなく **`member:<対応する人のid>` ラベル**で示す（`npm run issue` が自動で付ける。`npm run now` はラベルで探す）。
- 自分の PR は**ブランチ名の先頭 `<自分のid>/`** で見分ける。
- レビュー依頼は使えないので、lead は open な PR を全部見る。
