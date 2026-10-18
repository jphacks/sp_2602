// 子どもは自分でログアウトできない（D-136。2026-10-18 ユーザーが決めた）。
// 前は子どもの設定（子07）の「ログアウト」で session.tsx の signOut → native.clearLocalData() が呼ばれ、端末の制限（Kotlin の監視）が
// 止まっていた（制限から逃げる道）。子どもの端末がログイン状態から抜けるのは、保護者が連携を外したとき（family_unlink）だけ。
// 確かめること: canSignOut が子どもだけ false・子どもの画面のコードにログアウトへの道がない・signOut と入口 /pair が canSignOut を通す。
// あわせて、監視（Kotlin の engine）が動いている端末では、役割のない人がログアウトしても監視を止めない（clearLocalData を呼ばない）・
// 入口 /pair に「ログアウト」を出さないことも確かめる（子どもの端末で JS だけログアウト状態になり、別のアカウントで入り直した抜け道）
import fs from "node:fs";
import path from "node:path";
import { mockSessions } from "@contracts/fixtures";
import { describe, expect, it } from "vitest";
import { canSignOut, clearDeviceOnSignOut } from "@/lib/session-core";

const repo = path.resolve(__dirname, "../..");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// 行のコメント（// …）と JSX のコメント（{/* … */}）・ブロックのコメントを除く
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");

const read = (...p: string[]) => code(fs.readFileSync(path.join(repo, ...p), "utf8"));

describe("canSignOut: 自分でログアウトできるか（D-136）", () => {
  it("子ども（役割 child）はできない", () => {
    expect(canSignOut(mockSessions["mock-google-child"])).toBe(false);
    expect(canSignOut({ role: "child" })).toBe(false);
  });

  it("保護者・役割が決まる前（まだ制限がかかっていない）・ログインしていないときはできる", () => {
    expect(canSignOut(mockSessions["mock-google-parent"])).toBe(true);
    expect(canSignOut({ role: null })).toBe(true);
    expect(canSignOut(null)).toBe(true);
    expect(canSignOut({ role: null }, false)).toBe(true);
  });

  it("監視が動いている端末では、役割のない人・保護者・ログインしていない人にも出さない", () => {
    expect(canSignOut({ role: null }, true)).toBe(false);
    expect(canSignOut(mockSessions["mock-google-parent"], true)).toBe(false);
    expect(canSignOut(null, true)).toBe(false);
    expect(canSignOut({ role: "child" }, true)).toBe(false);
  });
});

describe("clearDeviceOnSignOut: ログアウトのときの端末の片付け（D-136 の抜け道）", () => {
  const device = (enabled: boolean) => {
    const calls: string[] = [];
    return {
      calls,
      isEngineEnabled: () => enabled,
      clearLocalData: () => void calls.push("clearLocalData"),
      clearParentLocalData: () => void calls.push("clearParentLocalData"),
    };
  };

  it("監視が動いている端末で役割のない人がログアウトしても、clearLocalData を呼ばない（監視を止めない）。保護者のウィジェットの値だけ消す", () => {
    const d = device(true);
    expect(clearDeviceOnSignOut(d)).toBe(true);
    expect(d.calls).toEqual(["clearParentLocalData"]);
  });

  it("監視が動いていない端末（保護者の端末・紐づけ前）では、端末に残した値を全部消す", () => {
    const d = device(false);
    expect(clearDeviceOnSignOut(d)).toBe(false);
    expect(d.calls).toEqual(["clearLocalData"]);
  });
});

describe("子どもの役割でログアウトに至る道がない（D-136）", () => {
  it("子どもの画面（src/app/child）のコードに、ログアウトの行・signOut・ログアウトのボタンがない", () => {
    const targets = files(path.join(repo, "src", "app", "child"));
    const found = targets.filter((p) =>
      /LogoutListItem|signOut|clearLocalData|ログアウト/.test(code(fs.readFileSync(p, "utf8"))),
    );
    expect(found.map((p) => path.relative(repo, p))).toEqual([]);
    expect(targets.length).toBeGreaterThan(5);
  });

  it("子どもの設定（子07）は、テスト日程・テーマカラー・配色の3つだけ（Figma にある「ログアウト」は出さない）", () => {
    const settings = read("src", "app", "child", "settings.tsx");
    expect(settings).not.toContain("LogoutListItem");
    expect(settings).toContain('title="テスト日程の一覧・変更"');
    expect(settings).toContain('title="テーマカラーの変更"');
    expect(settings).toContain('title="配色の変更"');
    expect(settings.match(/<ListItem\b/g)).toHaveLength(3);
  });

  it("session.tsx の signOut は、子どもなら何もしない（端末の片付けの前で canSignOut を確かめる）。片付けは clearDeviceOnSignOut を通す", () => {
    const session = read("src", "lib", "session.tsx");
    const body = session.slice(session.indexOf("const signOut = useCallback"));
    const guard = body.indexOf("if (!canSignOut(who)) return;");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf("clearDeviceOnSignOut(native)"));
    expect(guard).toBeLessThan(body.indexOf("revokeServerSession()"));
    // signOut では clearLocalData を直に呼ばない（監視が動いている端末で止めないように）
    expect(body).not.toContain("native.clearLocalData()");
  });

  it("入口 /pair（役割選び）の「ログアウト」は canSignOut のときだけ出す（子どもには出さない）", () => {
    const pair = read("src", "app", "pair", "index.tsx");
    expect(pair).toContain("const showLogout = canSignOut(");
    expect(pair).toContain("native.isEngineEnabled())"); // 監視が動いている端末にも出さない
    expect(pair).toMatch(/footer=\{showLogout \?/);
  });

  it("ほかの紐づけの画面（子どもの QR・保護者の読み取り・状態の照会・いつもの上限）にはログアウトがない", () => {
    for (const name of ["child.tsx", "parent.tsx", "status.tsx", "usual-limit.tsx", "_layout.tsx"])
      expect(read("src", "app", "pair", name)).not.toMatch(/signOut|LogoutListItem|ログアウト/);
  });
});
