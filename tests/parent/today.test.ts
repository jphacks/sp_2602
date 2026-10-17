// 親01「今日の使用量」と親09 アプリごとの利用時間 の中身のテスト（C6: 記録なし・0 分・取得不可の区別、Q7: 制限なし・上限未設定）。
import type { AppMinutes, UsageDay } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { appUsageRows, initialOf, limitText, todaySummary, usedPercent } from "@/components/parent/today";

const day = (over: Partial<UsageDay> = {}): UsageDay => ({
  date: "2026-10-15",
  recorded: true,
  usedMinutes: 120,
  measuredAt: "2026-10-15T06:42:00.000Z",
  limit: { kind: "limited", limitMinutes: 260 },
  apps: [],
  ...over,
});

describe("todaySummary", () => {
  it("記録あり: 120 分 ／ 上限 260分、割合は 46%", () => {
    const s = todaySummary(day());
    expect(s).toEqual({
      kind: "recorded",
      usedMinutes: 120,
      measuredAt: "2026-10-15T06:42:00.000Z",
      limit: { kind: "limited", minutes: 260 },
      percent: 46,
    });
    expect(s.kind === "recorded" && limitText(s.limit)).toBe("上限 260分");
  });

  it("記録なしは 0 分にしない（no_record）。0 分の記録は recorded で 0", () => {
    expect(todaySummary(day({ recorded: false, usedMinutes: null, measuredAt: null }))).toEqual({
      kind: "no_record",
      limit: { kind: "limited", minutes: 260 },
    });
    expect(todaySummary(day({ usedMinutes: 0 }))).toMatchObject({ kind: "recorded", usedMinutes: 0, percent: 0 });
  });

  it("今日の行がない（応答の取り違え）は missing（取得不可として出す）", () => {
    expect(todaySummary(undefined)).toEqual({ kind: "missing" });
  });

  it("空白期間は制限なし（割合を出さない）、上限がない日は上限未設定", () => {
    const u = todaySummary(day({ limit: { kind: "unlimited", blankPeriodId: "b1" } }));
    expect(u).toMatchObject({ kind: "recorded", limit: { kind: "unlimited" }, percent: null });
    expect(u.kind === "recorded" && limitText(u.limit)).toBe("制限なし");
    const n = todaySummary(day({ limit: null }));
    expect(n).toMatchObject({ limit: { kind: "unset" }, percent: null });
    expect(n.kind === "recorded" && limitText(n.limit)).toBe("上限未設定");
  });
});

describe("usedPercent", () => {
  it("上限 0 分は到達扱いで 100%（0 で割らない）", () => {
    expect(usedPercent(0, { kind: "limited", minutes: 0 })).toBe(100);
    expect(usedPercent(30, { kind: "limited", minutes: 0 })).toBe(100);
  });
  it("上限を超えたら 100 に収める", () => {
    expect(usedPercent(400, { kind: "limited", minutes: 260 })).toBe(100);
  });
  it("制限なし・未設定は null（バーを出さない）", () => {
    expect(usedPercent(10, { kind: "unlimited" })).toBeNull();
    expect(usedPercent(10, { kind: "unset" })).toBeNull();
  });
});

describe("appUsageRows（親09）", () => {
  const app = (label: string, usedMinutes: number, excluded = false): AppMinutes => ({
    packageName: `p.${label}`,
    label,
    usedMinutes,
    excluded,
  });

  it("制限の対象と対象外に分け、多い順。横棒は一番多いアプリを 100 にした割合（Figma 50→100・30→60・25→50・15→30）", () => {
    const r = appUsageRows([
      app("X", 25),
      app("YouTube", 50),
      app("ゲーム", 15),
      app("Instagram", 30),
      app("学習ノート", 40, true),
    ]);
    expect(r.restricted.map((x) => [x.label, x.minutes, x.barPercent])).toEqual([
      ["YouTube", 50, 100],
      ["Instagram", 30, 60],
      ["X", 25, 50],
      ["ゲーム", 15, 30],
    ]);
    expect(r.excluded.map((x) => [x.label, x.barPercent])).toEqual([["学習ノート", 80]]);
  });

  it("全部 0 分でも割り算で壊れない", () => {
    expect(appUsageRows([app("a", 0)]).restricted[0]?.barPercent).toBe(0);
    expect(appUsageRows([])).toEqual({ restricted: [], excluded: [] });
  });

  it("initialOf は頭文字（空なら ?）", () => {
    expect(initialOf("YouTube")).toBe("Y");
    expect(initialOf("学習ノート")).toBe("学");
    expect(initialOf("  ")).toBe("?");
  });
});
