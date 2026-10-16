// npm run issue の --label / --blocked-by の確認。本物の GitHub には繋がず、偽の gh（呼ばれた引数を記録する）を使う。
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FAKE_GH = `#!/bin/sh
echo "$*" | tr '\n' ' ' >> "$GH_LOG"; echo >> "$GH_LOG"
case "$1 $2" in
  "issue list") echo '[]' ;;
  "label list") echo '[{"name":"task"}]' ;;
  "issue create") echo 'https://github.com/o/r/issues/42' ;;
  "api repos/{owner}/{repo}/issues/7") echo 999 ;;
esac
`;

function run(args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "fakegh-"));
  const log = join(dir, "log.txt");
  writeFileSync(join(dir, "gh"), FAKE_GH);
  chmodSync(join(dir, "gh"), 0o755);
  writeFileSync(log, "");
  const r = spawnSync("node", ["scripts/issue.mjs", ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_LOG: log, KIT_MEMBER: "lead" },
  });
  return {
    ...r,
    calls: readFileSync(log, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

describe.skipIf(process.platform === "win32")("npm run issue（偽の gh）", () => {
  it("--label を種類のほかに付け、無いラベルは作る", () => {
    const r = run(["task", "lead", "画面を表示する", "本文", "--label", "area:front", "--label", "screen:home"]);
    expect(r.status).toBe(0);
    expect(r.calls.filter((c) => c.startsWith("label create")).map((c) => c.split(" ")[2])).toEqual([
      "area:front",
      "screen:home",
    ]);
    const create = r.calls.find((c) => c.startsWith("issue create")) ?? "";
    expect(create).toContain("--label task");
    expect(create).toContain("--label area:front");
    expect(create).toContain("--label screen:home");
  });

  it("--blocked-by を本文の Depends on と、標準の依存関係の両方に入れる", () => {
    const r = run(["task", "lead", "画面を表示する", "本文", "--blocked-by", "#7"]);
    expect(r.status).toBe(0);
    expect(r.calls.find((c) => c.startsWith("issue create"))).toContain("Depends on #7");
    expect(r.calls).toContain("api -X POST repos/{owner}/{repo}/issues/42/dependencies/blocked_by -F issue_id=999");
  });

  it("番号でない --blocked-by は止める", () => {
    const r = run(["task", "lead", "画面を表示する", "本文", "--blocked-by", "abc"]);
    expect(r.status).toBe(1);
    expect(r.calls.some((c) => c.startsWith("issue create"))).toBe(false);
  });
});
