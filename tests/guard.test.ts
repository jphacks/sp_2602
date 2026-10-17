// 守り（scripts/lib/guard.mjs と AI 用 hook）の判定の確認。
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { checkCommand, findConflictMarkers, findTestSkips, isSecretPath } from "../scripts/lib/guard.mjs";

describe("競合マーカー", () => {
  it("残っていれば見つけ、普通の等号の行は見つけない", () => {
    expect(findConflictMarkers([`${"<".repeat(7)} HEAD`, "x"])).toHaveLength(1);
    expect(findConflictMarkers([`${">".repeat(7)} main`])).toHaveLength(1);
    expect(findConflictMarkers(["=====", "const a = '<<<<<<<'"])).toHaveLength(0);
  });
});

describe("機密ファイル", () => {
  it("本物は止め、雛形は通す", () => {
    for (const f of [".env", ".env.local", "a/b/server.pem", "release.keystore", "credentials.json"]) {
      expect(isSecretPath(f)).toBe(true);
    }
    for (const f of [".env.example", "src/env.ts", "docs/key.md"]) expect(isSecretPath(f)).toBe(false);
  });
});

describe("テストの skip", () => {
  it("skip / only / todo を見つける", () => {
    // この検査自身に引っかからないよう、skip の書き方は文字列をつないで作る
    const skip = ["it", "skip('a', () => {})"].join(".");
    const only = ["describe", "only('b', f)"].join(".");
    const x = `${"x"}it('c')`;
    expect(findTestSkips([skip, only, x])).toHaveLength(3);
    expect(findTestSkips(["it('a', () => {})", "const skipped = 1"])).toHaveLength(0);
  });
});

describe("AI のコマンド", () => {
  const level = (c: string) => checkCommand(c)?.level ?? null;
  it("禁止は deny", () => {
    expect(level("git add -A")).toBe("deny");
    expect(level("git add .")).toBe("deny");
    expect(level("cd x && git add --all")).toBe("deny");
    expect(level("git commit --no-verify -m x")).toBe("deny");
    expect(level("git -C . commit -n -m x")).toBe("deny");
    expect(level("git push --force origin main")).toBe("deny");
  });
  it("破壊的は ask", () => {
    expect(level("git reset --hard HEAD~1")).toBe("ask");
    expect(level("git clean -fd")).toBe("ask");
    expect(level("git branch -D x")).toBe("ask");
    expect(level("git push -f origin feat/x")).toBe("ask");
    expect(level("git checkout -- src/a.ts")).toBe("ask");
    expect(level("git rebase main")).toBe("ask");
  });
  it("普通の操作とコミット本文の文章は通す", () => {
    expect(level("git add src/a.ts tests/a.test.ts")).toBeNull();
    expect(level("git add ./src/a.ts")).toBeNull();
    expect(level("git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit add . は禁止\nEOF\n)\"")).toBeNull();
    expect(level("git restore --staged src/a.ts")).toBeNull();
    expect(level("npm run check")).toBeNull();
  });
});

describe("hook の出力", () => {
  const run = (file: string, command: string) =>
    spawnSync("node", [file], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });
  it("Claude: 禁止は deny、確認は ask、問題なしは何も出さない", () => {
    const f = ".claude/hooks/guard-bash.mjs";
    expect(JSON.parse(run(f, "git add .").stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(JSON.parse(run(f, "git reset --hard").stdout).hookSpecificOutput.permissionDecision).toBe("ask");
    expect(run(f, "ls").stdout).toBe("");
  });
  it("Codex: 禁止も確認も deny（確認を出せないため）", () => {
    const f = ".codex/hooks/guard-bash.mjs";
    expect(JSON.parse(run(f, "git add .").stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(JSON.parse(run(f, "git reset --hard").stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(run(f, "ls").stdout).toBe("");
  });
});
