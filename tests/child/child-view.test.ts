// 子どもの画面（子01・子02・子11・子07）の表示の決め方のテスト（src/components/child/child-view.ts）。
// C3 の計算（calcUsage）から実際に結果を作り、46%・100%・制限なし・上限未設定・取得不可・権限なしで期待どおりの表示になるか、
// 取れない値を 0% と出していないかを確かめる。
import type { NativeUsageResult } from "@contracts/native";
import type { ConfigSnapshot } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  dayCalc,
  monthDayJa,
  nextTestView,
  openFirstApp,
  paceView,
  shouldOpenLimitScreen,
  slashDate,
  staleNotice,
  testCountLabel,
  usageView,
  weekBars,
  weekBarsLabel,
  weekDates,
} from "@/components/child/child-view";
import type { ConfigState } from "@/lib/config-cache";
import { calcUsage, type LimitInput, nextTest, type UsageCalc } from "@/lib/usage-calc";

const TODAY = "2026-10-15"; // 木曜（Figma 子02 の「10月15日（木）」）

const used = (minutes: number, date = TODAY): NativeUsageResult => ({
  status: "ok",
  date,
  measuredAt: `${date}T03:00:00.000Z`,
  apps: [{ packageName: "com.google.android.youtube", label: "YouTube", usedMinutes: minutes }],
});
const calc = (usage: NativeUsageResult, limit: LimitInput) => calcUsage({ usage, limit, excludedPackages: [] });

// C3 の結果の見本（どれも calcUsage で作る）
const at46 = calc(used(46), { kind: "set", minutes: 100 });
const at100 = calc(used(130), { kind: "set", minutes: 130 });
const over = calc(used(200), { kind: "set", minutes: 100 });
const unlimited = calc(used(90), { kind: "unlimited" });
const unset = calc(used(30), { kind: "unset" });
const unknownLimit = calc(used(30), { kind: "unknown" });
const unavailable = calc(
  { status: "unavailable", reason: "Kotlin の部品がまだありません" },
  { kind: "set", minutes: 100 },
);
const denied = calc({ status: "permission_denied" }, { kind: "set", minutes: 100 });

const snapshot = (over: Partial<ConfigSnapshot> = {}): ConfigSnapshot => ({
  childId: "demo-child",
  configVersion: 3,
  calculationVersion: 1,
  usualLimitMinutes: 120,
  plan: null,
  testPeriods: [],
  blankPeriods: [],
  dailyLimits: [],
  excludedApps: [],
  generatedAt: "2026-10-15T00:00:00.000Z",
  ...over,
});
const fresh = (s: ConfigSnapshot): ConfigState => ({
  status: "fresh",
  snapshot: s,
  savedAt: "2026-10-15T00:00:00.000Z",
});
const test = (id: string, name: string, startDate: string, endDate: string) => ({
  id,
  name,
  startDate,
  endDate,
  createdByUserId: "u1",
  createdByRole: "child" as const,
});

describe("日付の文言", () => {
  it("「10月28日（水）」と「10/12」の形", () => {
    expect(monthDayJa("2026-10-28")).toBe("10月28日（水）");
    expect(monthDayJa("2026-10-15")).toBe("10月15日（木）");
    expect(monthDayJa("2027-01-03")).toBe("1月3日（日）");
    expect(slashDate("2026-10-12")).toBe("10/12");
  });

  it("週は月曜から日曜（Figma 子02 の 10/12〜10/18）", () => {
    expect(weekDates(TODAY)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    // 日曜日も、その前の月曜からの週に入る
    expect(weekDates("2026-10-18")[0]).toBe("2026-10-12");
  });
});

describe("「今日の使用量」の出し分け（子01・子02・子11）", () => {
  it("46%: 「46 ％ 使いました」で、まだ到達していない", () => {
    expect(usageView(at46, null)).toEqual({ kind: "percent", percent: 46, reached: false });
  });

  it("100%: 到達。上限を超えても表示は 100 に収める", () => {
    expect(usageView(at100, null)).toEqual({ kind: "percent", percent: 100, reached: true });
    expect(usageView(over, null)).toEqual({ kind: "percent", percent: 100, reached: true });
  });

  it("制限なし（空白期間）: 割合ではなく「今日は制限なし（夏休み）」", () => {
    const v = usageView(unlimited, { name: "夏休み" });
    expect(v.kind).toBe("message");
    if (v.kind !== "message") return;
    expect(v.reason).toBe("unlimited");
    expect(v.message.title).toBe("今日は制限なし（夏休み）");
    expect(v.message.action).toBeNull();
    // 空白期間の名前が分からないときは名前を付けない
    const noName = usageView(unlimited, null);
    expect(noName.kind === "message" && noName.message.title).toBe("今日は制限なし");
  });

  it("上限未設定: 親がまだ決めていないことを出す（0% と出さない）", () => {
    const v = usageView(unset, null);
    expect(v).toMatchObject({ kind: "message", reason: "limit_unset", message: { tone: "info", action: null } });
    expect(v.kind === "message" && v.message.title).toContain("決まっていません");
  });

  it("取得不可: 使った時間が取れない／上限が取れないを、もう一度ためすつきで出す", () => {
    expect(usageView(unavailable, null)).toMatchObject({
      kind: "message",
      reason: "usage_unavailable",
      message: { title: "使った時間を取得できませんでした", action: { kind: "retry" } },
    });
    expect(usageView(unknownLimit, null)).toMatchObject({
      kind: "message",
      reason: "limit_unknown",
      message: { title: "今日の時間を取得できませんでした", action: { kind: "retry" } },
    });
  });

  it("取得不可の理由（開発向けの文）を子どもに見せない", () => {
    const v = usageView(unavailable, null);
    expect(JSON.stringify(v)).not.toContain("Kotlin");
  });

  it("権限なし: 使用状況へのアクセスの設定を開く案内", () => {
    expect(usageView(denied, null)).toMatchObject({
      kind: "message",
      reason: "permission_denied",
      message: { tone: "warning", icon: "lock", action: { kind: "permission", label: "設定を開く" } },
    });
  });

  it("上限が負: エラーとして出す（割合を出さない）", () => {
    const v = usageView(calc(used(10), { kind: "set", minutes: -1 }), null);
    expect(v).toMatchObject({ kind: "message", reason: "limit_invalid" });
  });

  it("まだ計算していない（null）は読み込み中", () => {
    expect(usageView(null, null)).toEqual({ kind: "loading" });
  });

  it("割合を出せない状態では、どれも数字の 0 を返さない", () => {
    for (const c of [unlimited, unset, unknownLimit, unavailable, denied]) {
      const v = usageView(c, null);
      expect(v.kind).toBe("message");
      expect(v).not.toHaveProperty("percent");
    }
  });
});

describe("「次のテスト」のカード", () => {
  it("「10月28日（水） 数学」「あと13日」", () => {
    const s = snapshot({ testPeriods: [test("t1", "数学", "2026-10-28", "2026-10-29")] });
    expect(nextTestView(fresh(s), nextTest(s, TODAY))).toEqual({
      kind: "test",
      headline: "10月28日（水） 数学",
      detail: "あと13日",
      ongoing: false,
    });
  });

  it("期間中は「テスト中」（終わりの日を添える）", () => {
    const s = snapshot({ testPeriods: [test("t1", "数学", "2026-10-14", "2026-10-16")] });
    expect(nextTestView(fresh(s), nextTest(s, TODAY))).toMatchObject({
      detail: "テスト中（10月16日（金）まで）",
      ongoing: true,
    });
    const oneDay = snapshot({ testPeriods: [test("t1", "英語", TODAY, TODAY)] });
    expect(nextTestView(fresh(oneDay), nextTest(oneDay, TODAY))).toMatchObject({ detail: "テスト中" });
  });

  it("テストが0件なら「予定なし」（ホームはそのまま使える）", () => {
    const s = snapshot();
    expect(nextTestView(fresh(s), nextTest(s, TODAY))).toMatchObject({ kind: "none", headline: "予定なし" });
  });

  it("設定が取れていないときは「予定なし」と言わない", () => {
    expect(nextTestView({ status: "unavailable", error: null }, null)).toMatchObject({
      kind: "unknown",
      headline: "--",
    });
    expect(nextTestView(null, null)).toEqual({ kind: "loading" });
  });

  it("古いキャッシュでも、手元のテストは出す", () => {
    const s = snapshot({ testPeriods: [test("t1", "数学", "2026-10-28", "2026-10-29")] });
    const stale: ConfigState = { status: "stale", snapshot: s, savedAt: "x", reason: "network", error: null };
    expect(nextTestView(stale, nextTest(s, TODAY))).toMatchObject({ kind: "test", detail: "あと13日" });
  });
});

describe("古いキャッシュの帯", () => {
  const s = snapshot();
  it("通信の失敗などで古いときは出す", () => {
    expect(staleNotice({ status: "stale", snapshot: s, savedAt: "x", reason: "network", error: null })).toMatchObject({
      message: "最新でない可能性があります",
    });
  });
  it("最新・読み込み中・起動直後（まだ確かめていないだけ）は出さない", () => {
    expect(staleNotice(fresh(s))).toBeNull();
    expect(staleNotice(null)).toBeNull();
    expect(staleNotice({ status: "stale", snapshot: s, savedAt: "x", reason: "not_checked", error: null })).toBeNull();
  });
});

describe("ペースの札（子02。TODO(未決) Q23 の仮の判定）", () => {
  it("46% は「ちょうどいいペース！」（緑）", () => {
    expect(paceView(at46)).toEqual({ label: "ちょうどいいペース！", tone: "success", icon: "check_circle" });
  });
  it("60% までは ちょうどいい、61% からは「ゆっくり使おう」（責めない言い方・赤を使わない）", () => {
    expect(paceView(calc(used(60), { kind: "set", minutes: 100 }))?.label).toBe("ちょうどいいペース！");
    expect(paceView(calc(used(61), { kind: "set", minutes: 100 }))).toMatchObject({
      label: "ゆっくり使おう",
      tone: "info",
    });
  });
  it("到達したら「今日はここまで。また明日！」", () => {
    expect(paceView(at100)?.label).toBe("今日はここまで。また明日！");
  });
  it("割合を出せないときは札を出さない", () => {
    for (const c of [null, unlimited, unset, unknownLimit, unavailable, denied]) expect(paceView(c)).toBeNull();
  });
});

describe("今週の使用割合の棒グラフ（子02）", () => {
  it("月〜日の7本。今日を強調し、未来の日は下地だけ", () => {
    const bars = weekBars(TODAY, {
      "2026-10-12": calc(used(72), { kind: "set", minutes: 100 }),
      "2026-10-13": calc(used(64), { kind: "set", minutes: 100 }),
      "2026-10-14": calc(used(58), { kind: "set", minutes: 100 }),
      [TODAY]: at46,
    });
    expect(bars.map((b) => `${b.label} ${b.sublabel}`)).toEqual([
      "月 10/12",
      "火 10/13",
      "水 10/14",
      "木 10/15",
      "金 10/16",
      "土 10/17",
      "日 10/18",
    ]);
    expect(bars.map((b) => b.value)).toEqual([72, 64, 58, 46, null, null, null]);
    expect(bars.map((b) => b.highlight)).toEqual([false, false, false, true, false, false, false]);
    expect(bars.every((b) => b.capacity === 100)).toBe(true);
    expect(bars.slice(4).every((b) => b.topLabel === undefined)).toBe(true);
  });

  it("取れない日は棒なしで「--」、制限なしの日は「なし」、読み込み中は何も出さない（0 にしない）", () => {
    const bars = weekBars(TODAY, {
      "2026-10-12": unavailable,
      "2026-10-13": unlimited,
      "2026-10-14": undefined,
      [TODAY]: denied,
    });
    expect(bars.slice(0, 4).map((b) => [b.value, b.topLabel])).toEqual([
      [null, "--"],
      [null, "なし"],
      [null, undefined],
      [null, "--"],
    ]);
    expect(weekBarsLabel(bars)).toContain("月曜 記録なし");
    expect(weekBarsLabel(bars)).toContain("火曜 制限なし");
  });

  it("過去の日はその日の日別上限で割合を出す（上限がない日・設定がない日は取れない扱い）", () => {
    const s = snapshot({
      dailyLimits: [
        { date: "2026-10-12", kind: "limited", limitMinutes: 50 },
        { date: "2026-10-13", kind: "unlimited", blankPeriodId: "b1" },
      ],
    });
    expect(dayCalc(used(40, "2026-10-12"), s, "2026-10-12")).toMatchObject({ state: "ok", displayUsedPercent: 80 });
    expect(dayCalc(used(40, "2026-10-13"), s, "2026-10-13").state).toBe("unlimited");
    expect(dayCalc(used(40, "2026-10-14"), s, "2026-10-14").state).toBe("limit_unset");
    expect(dayCalc(used(40, "2026-10-12"), null, "2026-10-12").state).toBe("limit_unknown");
  });

  it("過去の日も対象外アプリを除いて数える", () => {
    const s = snapshot({
      dailyLimits: [{ date: "2026-10-12", kind: "limited", limitMinutes: 100 }],
      excludedApps: [{ packageName: "com.google.android.youtube", label: "YouTube", sinceVersion: 1 }],
    });
    expect(dayCalc(used(40, "2026-10-12"), s, "2026-10-12")).toMatchObject({ displayUsedPercent: 0 });
  });
});

describe("上限到達で 子11 へ進むか（子01）", () => {
  it("到達したら、その日に1回だけ進む", () => {
    expect(shouldOpenLimitScreen(at100, TODAY, null)).toBe(true);
    expect(shouldOpenLimitScreen(at100, TODAY, TODAY)).toBe(false);
    expect(shouldOpenLimitScreen(at100, TODAY, "2026-10-14")).toBe(true);
  });
  it("到達していない・割合を出せないときは進まない", () => {
    const notReached: UsageCalc[] = [at46, unlimited, unset, unavailable, denied];
    for (const c of notReached) expect(shouldOpenLimitScreen(c, TODAY, null)).toBe(false);
    expect(shouldOpenLimitScreen(null, TODAY, null)).toBe(false);
  });
});

describe("お勧めアプリ（子11）", () => {
  it("上から順に試して、開けたところで止める", () => {
    const tried: string[] = [];
    const ok = openFirstApp(["a", "b", "c"], (p) => {
      tried.push(p);
      return p === "b";
    });
    expect(ok).toBe(true);
    expect(tried).toEqual(["a", "b"]);
  });
  it("どれも開けなければ false（画面は案内のダイアログを出す）", () => {
    expect(openFirstApp(["a"], () => false)).toBe(false);
    expect(openFirstApp([], () => true)).toBe(false);
  });
});

describe("設定（子07）のテスト日程の件数", () => {
  it("「1件」の形。設定が取れないときは出さない（0件と言わない）", () => {
    const s = snapshot({ testPeriods: [test("t1", "数学", "2026-10-28", "2026-10-29")] });
    expect(testCountLabel(fresh(s))).toBe("1件");
    expect(testCountLabel(fresh(snapshot()))).toBe("0件");
    expect(testCountLabel({ status: "unavailable", error: null })).toBeUndefined();
    expect(testCountLabel(null)).toBeUndefined();
  });
});
