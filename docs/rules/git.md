# Git の規律

## タイミング
| いつ | やること |
|---|---|
| ステップを始める前 | `git pull --rebase origin main`（`npm run now` が遅れを教える） |
| ステップが終わった時（30〜60分ごと） | `npm run check` → commit → push → PR |
| PR を出した後 | 待たずに次のステップへ。CI が落ちたら `npm run now` に出るので最優先で直す |
| CHANGELOG に新しい行が来た時 | pull → `npm run typecheck` → 自分のコードを直す |
| 同期点の直前 | 手元の作業を PR にしておく（同期点は main で確認する） |

## ブランチと PR
- ブランチ名: `<自分のid>/S<番号>-<短い名前>`（例 `front1/S2-input-form`）
- 1ステップ = 1PR。PR 本文のテンプレートに着手宣言の要約を書く。
- 自分の所有範囲だけの PR は CI が緑なら自分でマージしてよい。
- contracts/ や共有ファイルに触れる PR は lead がレビューしてからマージ（CODEOWNERS が自動でレビュー依頼する）。
- コンフリクトしたら: 自分の所有ファイルは自分で解決。他人のファイルでコンフリクトしたら、そもそも範囲外を触っている。

## Issue
- 種類: `task`（ステップ）/ `bug` / `change-request`（契約・機能の追加）/ `blocked`（他人待ち）
- 他人のファイルに直してほしいことがあれば、その所有者に `bug` か `task` で assign する。口頭で頼んだ場合も Issue に残す。
- レビュー依頼と自分宛て `bug` は、自分のステップより先に処理する。

## 強制する仕組み（文章だけに頼らない）
- pre-commit: `npm run scope -- --staged`（範囲外・CHANGELOG なしの契約変更を止める）
- CI: 型・テスト・範囲（PR 作成者で判定）
- GitHub 側の設定（lead が前日に）: main のブランチ保護（PR 必須・CI 必須・CODEOWNERS レビュー必須）

## 同じ GitHub アカウントを複数人で使う場合（リハーサル等）
- kit.config.json の members で github が同じ人が複数いると、自動でこのモードになる。
- 自分宛ての Issue は assign ではなく **`member:<自分のid>` ラベル**で示す（`npm run now` はラベルで探す）。
- 自分の PR は**ブランチ名の先頭 `<自分のid>/`** で見分ける（CI の範囲チェックもブランチ名で人を決める）。
- レビュー依頼は使えないので、lead は open な PR を全部見る。
