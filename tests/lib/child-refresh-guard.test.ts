// 子どもの画面の定期取得（child-data.tsx の refresh）で、連携が外れた片付けと重なっても、止めた制限を戻さないこと（D-133 の再検査）。
// 取得を待ったあとに Session が入れ替わった・消えた、または設定の取得が 401 だったら、saveRestriction・startEngine・enqueue をしない
// （src/lib/child-refresh-guard.ts の canApplyChildRefresh と、child-data.tsx がそれを続きの前で確かめていること）
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canApplyChildRefresh } from "@/lib/child-refresh-guard";
import type { ConfigState } from "@/lib/config-cache";

const snapshot = {
  childId: "c1",
  configVersion: 1,
  calculationVersion: 1,
  usualLimitMinutes: 120,
  plan: null,
  testPeriods: [],
  blankPeriods: [],
  dailyLimits: [],
  excludedApps: [],
  blockedSites: [],
  generatedAt: "2026-10-15T03:00:00.000Z",
} as unknown as Extract<ConfigState, { status: "fresh" }>["snapshot"];

const fresh: ConfigState = { status: "fresh", snapshot, savedAt: "2026-10-15T03:00:00.000Z" };
const unauthorized = { code: "unauthorized", message: "m", hint: "h" } as const;
const unlinked = { ...unauthorized, reason: "family_unlink" } as const;

describe("canApplyChildRefresh", () => {
  it("同じ Session のままで、設定が取れた・通信できなかっただけなら続ける", () => {
    expect(canApplyChildRefresh("t1", "t1", fresh)).toBe(true);
    const network = { code: "network", message: "m", hint: "h" } as const;
    expect(
      canApplyChildRefresh("t1", "t1", {
        status: "stale",
        snapshot,
        savedAt: "x",
        reason: "network",
        error: network,
      }),
    ).toBe(true);
    expect(canApplyChildRefresh("t1", "t1", { status: "unavailable", error: network })).toBe(true);
  });

  it("待っている間に Session が消えた（ログアウト状態・401）・入れ替わったら続けない", () => {
    expect(canApplyChildRefresh("t1", null, fresh)).toBe(false);
    expect(canApplyChildRefresh("t1", "t2", fresh)).toBe(false);
    expect(canApplyChildRefresh(null, null, fresh)).toBe(false);
  });

  it("設定の取得が 401（連携が外れた・合言葉が無効）なら、合言葉がまだ同じでも続けない", () => {
    for (const error of [unauthorized, unlinked]) {
      expect(
        canApplyChildRefresh("t1", "t1", { status: "stale", snapshot, savedAt: "x", reason: "network", error }),
      ).toBe(false);
      expect(canApplyChildRefresh("t1", "t1", { status: "unavailable", error })).toBe(false);
    }
  });
});

describe("child-data.tsx の refresh", () => {
  const text = fs.readFileSync(path.resolve(__dirname, "../../src/lib/child-data.tsx"), "utf8");
  const body = text.slice(text.indexOf("const refresh = useCallback"));
  const at = (s: string) => {
    const i = body.indexOf(s);
    expect(i, s).toBeGreaterThan(0);
    return i;
  };

  it("取得を待つ前に合言葉を覚え、待ったあと・続き（saveRestriction・startEngine・enqueue・アプリの一覧）の前で確かめる", () => {
    const remember = at("const token = currentSessionToken();");
    const wait = at("await Promise.all(");
    const guard = at("if (!canApplyChildRefresh(token, currentSessionToken(), cfg)) return;");
    expect(remember).toBeLessThan(wait);
    expect(wait).toBeLessThan(guard);
    for (const next of [
      "native.saveRestriction(",
      "native.startEngine();",
      "usageOutbox.enqueue(",
      "childAppsSync.run(",
      "recheckSession()",
    ])
      expect(guard, next).toBeLessThan(at(next));
  });
});
