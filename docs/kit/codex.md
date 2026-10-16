# Codex で使う

ルールは Claude Code と同じ `AGENTS.md`（Codex は起動時に自動で読む）。Codex 用の設定は `.codex/` にある。

| ファイル | 中身 |
|---|---|
| `.codex/config.toml` | 編集はリポジトリ内だけ・ネットワークあり・npm のキャッシュをリポジトリ内に |
| `.codex/hooks.json` | 守りの hook を登録（下の表） |
| `.codex/hooks/*.mjs` | hook の中身（判定は Claude 用の `.claude/hooks/` と同じ） |

## 最初に1回（Codex を使う人だけ）
全員の準備（docs/kit/setup.md の `npm run kit:setup -- <id>`）を済ませてから:

1. **リポジトリ直下で**起動する。hook はリポジトリ直下からの相対パスで動くため、サブフォルダで起動すると守りが効かない。
   ```powershell
   $env:GH_TOKEN = (gh auth token); codex      # PowerShell
   ```
   ```bash
   GH_TOKEN=$(gh auth token) codex             # Git Bash
   ```
   GH_TOKEN を渡す理由: サンドボックスの中の gh は Windows の資格情報を読めず、`npm run now` / `issue` / `merge` が GitHub に繋がらない（リハーサル1）。
2. 「このフォルダを信頼するか」と聞かれたら trust する。trust しないと `.codex/` の設定も hook も読まれない（AGENTS.md だけは読まれる）。
3. `/hooks` を開き、このリポジトリの hook を確認して trust する。hook の中身が変わると、もう一度 trust が要る。

## 守りの対応（Claude Code との違い）
| 守り | Claude Code | Codex |
|---|---|---|
| 型が通らないまま終わらせない | `.claude/hooks/stop-check.mjs` | `.codex/hooks/stop-check.mjs` |
| 編集したファイルをその場で整形 | `.claude/hooks/format.mjs` | **なし**。commit の前に `npm run fix`（整形崩れは pre-commit が止める） |
| シェルのコマンドでの書き換え | 止めない | 止めない（どちらも pre-commit と CI が止める） |

- Codex に自動整形を入れていない理由: apply_patch は前後の行が一致しないと失敗する。編集のたびに整形すると、Codex が覚えている内容とファイルがずれて次のパッチが失敗しやすくなる。
- Codex の hook は、止めるときに **JSON を返す**（Claude と同じ「終了コード 2」は、Windows の Codex では hook のエラー扱いになり、パッチがそのまま適用された）。hook を直すときはこの形を崩さない。

## サンドボックスで起きること
- **`.git` はサンドボックスの中から書けない**（Codex の仕様）。`git switch` / `commit` / `pull` / `push` と、それを中で使う `npm run step`・`npm run merge`、`npm run now` の fetch は、Codex が「サンドボックスの外で実行してよいか」を聞いてくる。中身を見て承認する。
  - 毎回聞かれるのが面倒なら、その場で「今後も許可」を選ぶ（自分の PC の設定に保存される）。リポジトリ側には自動の許可を入れていない（`git checkout -- .` のような戻せない操作まで通ってしまうため）。
- `npm run now` に「fetch に失敗」と出たら、ほぼこのせい。承認してから実行し直す。
- npm のキャッシュはリポジトリ内の `.npm-cache/`（.gitignore 済み）。ユーザーのフォルダの既定のキャッシュは、サンドボックスから書けない。
- 日本語: PowerShell は 7（`pwsh`）を使う。Windows PowerShell 5.1 は、BOM のない UTF-8 のファイルを読み違えて文字化けする。

## AI だけで回す（codex exec。リハーサルなど）
```bash
GH_TOKEN=$(gh auth token) KIT_MEMBER=<id> codex exec -C <リポジトリ> \
  --dangerously-bypass-hook-trust \
  -c 'projects={"<リポジトリの絶対パス（\ は \\）>"={trust_level="trusted"}}' \
  "<指示>" < /dev/null
```
- `codex exec` は trust を聞かないので、`-c projects=…` で信頼済みにする（しないと `.codex/` が読まれず、読み取り専用で動く）。
- hook の trust も保存されないので `--dangerously-bypass-hook-trust` を付ける（中身を確かめた hook だけで使う）。
- `< /dev/null` を付ける。付けないと標準入力を待って止まる。

## 確かめたこと（2026-10-14・Codex CLI 0.162.1・Windows）
- AGENTS.md は trust しなくても読まれる。`.codex/config.toml` は trust したときだけ効く（workspace-write・ネットワークありになるのを確認）。
- サンドボックスの中では `git switch -c` が `.git` への書き込みで失敗する。
- 他人のファイルへの apply_patch は止まり、自分のファイルは通る。型エラーを残して終わろうとすると続きの指示が入り、直してから終わる。
