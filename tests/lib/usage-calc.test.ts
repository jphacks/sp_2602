// C3 の計算のテスト（MVP_SPEC 4.2・AC-09・AC-16、Q7 の「制限なし」）。取れなかった値を 0 分・0% にしないことを確かめる。
import type { NativeUsageResult } from "@contracts/native";
import { type ConfigSnapshot, UsageDayReport } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  APP_LABEL_MAX,
  calcUsage,
  clipText,
  currentBlankPeriod,
  limitForDate,
  nextTest,
  REPORT_APPS_MAX,
  toUsageDayReport,
} from "@/lib/usage-calc";

const ok = (apps: [string, number][]): NativeUsageResult => ({
  status: "ok",
  date: "2026-10-15",
  measuredAt: "2026-10-15T03:00:00.000Z",
  apps: apps.map(([packageName, usedMinutes]) => ({ packageName, label: packageName, usedMinutes })),
});
const set = (minutes: number) => ({ kind: "set" as const, minutes });

describe("C3: 割合と到達状態", () => {
  it("使用済み％ = 使用 / 上限 × 100。残り％ = 100 − 使用済み％", () => {
    const r = calcUsage({
      usage: ok([
        ["a", 30],
        ["b", 15],
      ]),
      limit: set(90),
      excludedPackages: [],
    });
    expect(r).toMatchObject({
      state: "ok",
      usedMinutes: 45,
      displayUsedPercent: 50,
      remainingPercent: 50,
      reached: false,
    });
  });

  it("上限を超えたら表示は 100% に収め、元の値（実際の使用率）は保持する", () => {
    const r = calcUsage({ usage: ok([["a", 150]]), limit: set(100), excludedPackages: [] });
    expect(r).toMatchObject({
      displayUsedPercent: 100,
      remainingPercent: 0,
      actualPercent: 150,
      usedMinutes: 150,
      reached: true,
    });
  });

  it("上限ちょうどで到達（既定は ≥。引数で > にもできる TODO(未決)）", () => {
    expect(calcUsage({ usage: ok([["a", 60]]), limit: set(60), excludedPackages: [] })).toMatchObject({
      reached: true,
    });
    expect(
      calcUsage({ usage: ok([["a", 60]]), limit: set(60), excludedPackages: [], reachedWhen: "gt" }),
    ).toMatchObject({
      reached: false,
    });
  });

  it("上限 0 分は有効な上限で、到達扱い（0 で割らない。表示 100%・残り 0%）", () => {
    const r = calcUsage({ usage: ok([]), limit: set(0), excludedPackages: [] });
    expect(r).toMatchObject({ state: "ok", displayUsedPercent: 100, remainingPercent: 0, reached: true });
  });

  it("上限が負はエラー（limit_invalid）", () => {
    expect(calcUsage({ usage: ok([]), limit: set(-1), excludedPackages: [] }).state).toBe("limit_invalid");
  });

  it("上限未設定・上限が分からない・制限なし（空白期間）は、それぞれ別の状態", () => {
    const usage = ok([["a", 30]]);
    expect(calcUsage({ usage, limit: { kind: "unset" }, excludedPackages: [] }).state).toBe("limit_unset");
    expect(calcUsage({ usage, limit: { kind: "unknown" }, excludedPackages: [] }).state).toBe("limit_unknown");
    expect(calcUsage({ usage, limit: { kind: "unlimited" }, excludedPackages: [] })).toEqual({
      state: "unlimited",
      usedMinutes: 30,
    });
  });

  it("使用時間が取れない・権限がないときは 0 分として計算しない", () => {
    expect(calcUsage({ usage: { status: "permission_denied" }, limit: set(60), excludedPackages: [] }).state).toBe(
      "permission_denied",
    );
    expect(
      calcUsage({ usage: { status: "unavailable", reason: "x" }, limit: set(60), excludedPackages: [] }).state,
    ).toBe("usage_unavailable");
  });

  it("対象外アプリ（C9）と必須例外（電話など）は合計に入れない", () => {
    const r = calcUsage({
      usage: ok([
        ["com.example.studynote", 40],
        ["com.google.android.dialer", 10],
        ["com.google.android.youtube", 20],
      ]),
      limit: set(40),
      excludedPackages: ["com.example.studynote"],
    });
    expect(r).toMatchObject({ usedMinutes: 20, displayUsedPercent: 50 });
  });

  it("使用 0 分の記録は 0%（取得不可とは別）", () => {
    expect(calcUsage({ usage: ok([]), limit: set(60), excludedPackages: [] })).toMatchObject({
      state: "ok",
      displayUsedPercent: 0,
      remainingPercent: 100,
    });
  });
});

describe("C7 の組から当日の上限・次のテストを取り出す", () => {
  const snapshot: ConfigSnapshot = {
    childId: "c",
    configVersion: 1,
    calculationVersion: 1,
    usualLimitMinutes: 120,
    plan: null,
    testPeriods: [
      {
        id: "t1",
        name: "数学",
        startDate: "2026-10-20",
        endDate: "2026-10-21",
        createdByUserId: "c",
        createdByRole: "child",
      },
    ],
    blankPeriods: [{ id: "b1", name: "秋休み", startDate: "2026-10-16", endDate: "2026-10-16" }],
    dailyLimits: [
      { date: "2026-10-15", kind: "limited", limitMinutes: 120 },
      { date: "2026-10-16", kind: "unlimited", blankPeriodId: "b1" },
    ],
    excludedApps: [],
    generatedAt: "2026-10-15T00:00:00.000Z",
  };

  it("limitForDate: 値あり・制限なし・日付がない（未設定）・組がない（分からない）を分ける", () => {
    expect(limitForDate(snapshot, "2026-10-15")).toEqual({ kind: "set", minutes: 120 });
    expect(limitForDate(snapshot, "2026-10-16")).toEqual({ kind: "unlimited" });
    expect(limitForDate(snapshot, "2026-10-17")).toEqual({ kind: "unset" });
    expect(limitForDate(null, "2026-10-15")).toEqual({ kind: "unknown" });
  });

  it("テスト期間 0 件でも、通常上限の日別上限があれば割合を出せる（AC-16）", () => {
    const r = calcUsage({ usage: ok([["a", 60]]), limit: limitForDate(snapshot, "2026-10-15"), excludedPackages: [] });
    expect(r).toMatchObject({ state: "ok", displayUsedPercent: 50 });
  });

  it("nextTest: これから始まるテストまでの日数。期間中は 0 で ongoing", () => {
    expect(nextTest(snapshot, "2026-10-15")).toMatchObject({ name: "数学", daysUntil: 5, ongoing: false });
    expect(nextTest(snapshot, "2026-10-21")).toMatchObject({ daysUntil: 0, ongoing: true });
    expect(nextTest(snapshot, "2026-10-22")).toBeNull();
  });

  it("currentBlankPeriod: 今日が空白期間ならその期間", () => {
    expect(currentBlankPeriod(snapshot, "2026-10-16")?.name).toBe("秋休み");
    expect(currentBlankPeriod(snapshot, "2026-10-15")).toBeNull();
  });
});

describe("C8 で送る1日の記録の形（Q8）", () => {
  it("アプリ別の累計・測った時刻・制限対象の合計を、C3 と同じ判定で作る", () => {
    const usage = ok([
      ["com.example.studynote", 40],
      ["com.google.android.youtube", 20.4],
    ]);
    if (usage.status !== "ok") throw new Error("ok のはず");
    const day = toUsageDayReport(usage, ["com.example.studynote"]);
    expect(day).toMatchObject({ date: "2026-10-15", measuredAt: usage.measuredAt, restrictedMinutes: 20 });
    expect(day.apps.find((a) => a.packageName === "com.example.studynote")?.excluded).toBe(true);
  });
});

describe("C3: 表示の割合と到達をそろえる（99.5% 以上でも、到達していなければ 100% と出さない）", () => {
  it("上限 200 分で 199 分（99.5%）: 到達していないので表示は 99%・残り 1%", () => {
    expect(calcUsage({ usage: ok([["a", 199]]), limit: set(200), excludedPackages: [] })).toMatchObject({
      state: "ok",
      actualPercent: 99.5,
      displayUsedPercent: 99,
      remainingPercent: 1,
      reached: false,
    });
  });

  it("上限ちょうどで到達したら 100%・残り 0%", () => {
    expect(calcUsage({ usage: ok([["a", 200]]), limit: set(200), excludedPackages: [] })).toMatchObject({
      displayUsedPercent: 100,
      remainingPercent: 0,
      reached: true,
    });
  });

  it("到達の判定を > にしたとき、上限ちょうどは到達ではないので 99%", () => {
    expect(
      calcUsage({ usage: ok([["a", 60]]), limit: set(60), excludedPackages: [], reachedWhen: "gt" }),
    ).toMatchObject({ displayUsedPercent: 99, reached: false });
  });

  it("どの分数でも「表示が 100 ⇔ 到達」（1〜400 分・上限 1〜300 分を全部試す）", () => {
    for (let L = 1; L <= 300; L++)
      for (let used = 0; used <= 400; used += 7) {
        const r = calcUsage({ usage: ok([["a", used]]), limit: set(L), excludedPackages: [] });
        if (r.state !== "ok") throw new Error("ok のはず");
        expect(r.displayUsedPercent === 100, `${used}/${L}`).toBe(r.reached);
      }
  });
});

describe("C8 で送る記録は必ず契約に合う（アプリ名 120 文字・アプリ 1000 個まで）", () => {
  const usageWith = (apps: { packageName: string; label: string; usedMinutes: number }[]) => ({
    status: "ok" as const,
    date: "2026-10-15",
    measuredAt: "2026-10-15T03:00:00.000Z",
    apps,
  });

  it("アプリ名は 120 文字に切る。空なら packageName で代用し、それも 120 文字に切る", () => {
    const longPkg = `com.example.${"x".repeat(200)}`;
    const report = toUsageDayReport(
      usageWith([
        { packageName: "a.long", label: "あ".repeat(130), usedMinutes: 5 },
        { packageName: longPkg, label: "", usedMinutes: 3 },
      ]),
      [],
    );
    expect(report.apps.map((a) => a.label.length)).toEqual([APP_LABEL_MAX, APP_LABEL_MAX]);
    expect(report.apps[1]?.label).toBe(longPkg.slice(0, APP_LABEL_MAX));
    expect(UsageDayReport.safeParse(report).success).toBe(true);
  });

  // #49 の契約では、1日の記録に同じアプリが2回あると形の誤りになり、その日の記録が丸ごと隔離されて親に届かない
  it("同じアプリが2回出てきたら、使った時間を足して1つにする（合計の分数も変わらない）", () => {
    const report = toUsageDayReport(
      usageWith([
        { packageName: "com.game", label: "ゲーム", usedMinutes: 10 },
        { packageName: "com.note", label: "ノート", usedMinutes: 4 },
        { packageName: "com.game", label: "ゲーム（別名）", usedMinutes: 5 },
      ]),
      ["com.note"],
    );
    expect(report.apps.map((a) => [a.packageName, a.label, a.usedMinutes])).toEqual([
      ["com.game", "ゲーム", 15],
      ["com.note", "ノート", 4],
    ]);
    expect(report.restrictedMinutes).toBe(15);
    expect(new Set(report.apps.map((a) => a.packageName)).size).toBe(report.apps.length);
  });

  it("絵文字（2つで1文字）を途中で切らない", () => {
    expect(clipText(`${"a".repeat(119)}😀`, 120)).toBe("a".repeat(119));
    expect(clipText("短い", 120)).toBe("短い");
  });

  it("アプリが 1000 個を超えたら、使った時間の多い順に 1000 個。合計の分数は全部のアプリで数える", () => {
    const apps = Array.from({ length: 1005 }, (_, i) => ({
      packageName: `app.n${i}`,
      label: `アプリ${i}`,
      usedMinutes: i < 5 ? 0 : 1,
    }));
    apps.push({ packageName: "app.big", label: "大", usedMinutes: 30 });
    const report = toUsageDayReport(usageWith(apps), []);
    expect(report.apps).toHaveLength(REPORT_APPS_MAX);
    expect(report.apps[0]?.packageName).toBe("app.big");
    expect(report.restrictedMinutes).toBe(1000 + 30);
    expect(UsageDayReport.safeParse(report).success).toBe(true);
  });
});
