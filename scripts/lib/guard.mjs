// 守りの判定をまとめる（pre-commit の scripts/check-staged.mjs、Claude の .claude/hooks/guard-bash.mjs、
// Codex の .codex/hooks/guard-bash.mjs が同じ判定を使う）。ここは判定だけで、止める処理は呼び出し側。

const MARKER = "<".repeat(7);
const MARKER_END = ">".repeat(7);

/** 追加した行に、コンフリクトのマーカーが残っていないか。見つけた行の内容を返す */
export function findConflictMarkers(addedLines) {
  return addedLines.filter(
    (l) => l.startsWith(`${MARKER} `) || l === MARKER || l.startsWith(`${MARKER_END} `) || l === MARKER_END,
  );
}

const SECRET_NAME = [
  /^\.env$/,
  /^\.env\..+/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.jks$/,
  /\.keystore$/,
  /^id_(rsa|ed25519|ecdsa)$/,
  /^credentials\.json$/,
];
const SECRET_OK = [/\.example$/, /\.sample$/, /\.template$/];

/** 機密ファイルらしい名前か（雛形の *.example などは除く） */
export function isSecretPath(path) {
  const name = path.split("/").pop() ?? "";
  if (SECRET_OK.some((r) => r.test(name))) return false;
  return SECRET_NAME.some((r) => r.test(name));
}

export const isTestPath = (path) => /(^|\/)tests?\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(path);

const SKIP = /\b(it|test|describe)\.(skip|only|todo)\b|\b(xit|xtest|xdescribe)\s*\(|\b(fit|fdescribe)\s*\(/;

/** 追加した行に、テストを飛ばす・絞る書き方がないか */
export function findTestSkips(addedLines) {
  return addedLines.filter((l) => SKIP.test(l));
}

// --- シェルのコマンド（AI のフック用） ---

function segments(command) {
  // heredoc の本文と引用符の中身を除いてから、&& || ; | と改行で区切り、先頭の語が git のものだけ見る
  // （コミットメッセージ本文の文章を誤って拾わないため）
  const plain = command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$|\))/g, "")
    .replace(/"[^"]*"|'[^']*'/g, '""');
  return plain
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean))
    .filter((t) => t[0] === "git");
}

function gitSub(tokens) {
  // git -C dir -c k=v <sub> ... の <sub> を探す
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "-C" || t === "-c" || t === "--git-dir" || t === "--work-tree") i += 2;
    else if (t?.startsWith("-")) i += 1;
    else break;
  }
  return { sub: tokens[i], args: tokens.slice(i + 1) };
}

/**
 * AI が実行しようとしたコマンドを検査する。
 * 戻り値: null（問題なし）／{ level: "deny", reason }（止める）／{ level: "ask", reason }（人間の確認が要る）
 */
export function checkCommand(command) {
  for (const tokens of segments(command)) {
    const { sub, args } = gitSub(tokens);
    const has = (...xs) => args.some((a) => xs.includes(a));

    if (args.includes("--no-verify") || (sub === "commit" && has("-n")) || args.includes("--no-gpg-sign")) {
      return {
        level: "deny",
        reason:
          "フック・署名を飛ばす指定（--no-verify / --no-gpg-sign）は、人間が明示的に許可した場合だけ使える。フックが失敗したら原因を直す。",
      };
    }
    if (sub === "add" && has("-A", "--all", ".")) {
      return {
        level: "deny",
        reason:
          "`git add -A` / `git add .` は禁止。機密ファイルや他のセッションの変更を巻き込むため、ファイル名を1つずつ指定する。",
      };
    }
    if (sub === "push" && has("--force", "-f", "--force-with-lease")) {
      const toMain = args.some(
        (a) => /^(main|master)$/.test(a) || /:(main|master)$/.test(a) || /^\+?(main|master)$/.test(a),
      );
      if (toMain)
        return { level: "deny", reason: "main / master への force push は禁止（人間に頼まれても警告して断る）。" };
      return {
        level: "ask",
        reason: "force push はリモートの履歴を上書きする。人間の明示的な指示があるときだけ実行する。",
      };
    }
    if (sub === "reset" && has("--hard"))
      return { level: "ask", reason: "`git reset --hard` は未コミットの変更をすべて消す。実行前に人間に確認する。" };
    if (sub === "clean" && args.some((a) => /^-[a-zA-Z]*f/.test(a) || a === "--force"))
      return { level: "ask", reason: "`git clean -f` は追跡外ファイルを削除する。実行前に人間に確認する。" };
    if (sub === "branch" && has("-D"))
      return {
        level: "ask",
        reason: "`git branch -D` はマージ前のブランチも消す。人間が明示的に求めたときだけ実行する。",
      };
    if ((sub === "checkout" && args.includes("--")) || (sub === "restore" && !has("--staged"))) {
      return { level: "ask", reason: "ファイルの変更が消える操作。実行前に人間に確認する。" };
    }
    if (sub === "rebase")
      return {
        level: "ask",
        reason: "`git rebase` は履歴を書き換える。実行前に人間に確認する（取り込みは merge を使う）。",
      };
  }
  return null;
}
