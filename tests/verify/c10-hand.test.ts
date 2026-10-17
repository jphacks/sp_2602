// 確かめ役（V）: C10 の日別上限を MVP_SPEC 4.4 の式から手で計算した値と比べる（AC-06・AC-07・Q4・Q5・Q7）。
// 例の計画: 計画開始日 d0 = 2026-10-01、S = 300、G = 60、通常上限 180。
//   テスト1 10/20〜10/22（途中）、テスト2 11/10〜11/12（最後）、空白期間 12/20〜2027-01-07。
// 手計算（D = d0 から最後のテストの開始日 11/10 まで = 40 日。B(d) = 300 − 240·u²、u = (d − d0)/40）:
//   10/01 u=0     → 300
//   10/10 u=0.225 → 300 − 240×0.050625 = 287.85 → 288
//   10/11 u=0.25  → 300 − 240×0.0625   = 285
//   10/19 u=0.45  → 300 − 240×0.2025   = 251.4  → 251
//   Q1 = B(10/20) u=0.475 → 300 − 240×0.225625 = 245.85 → 246（10/20〜10/22 は 246 のまま）
//   u_end = u(10/22) = 0.525 → r = 0.8×(1 − 0.275625) = 0.5795
//   R1 = Q1 + r(P1 − Q1) = 245.85 + 0.5795×(300 − 245.85) = 277.229925 → 10/23 は 277
//   10/23 から 11/10（Q2 = G = 60）まで 18 日で線形: 1日 −12.0683292
//   10/24 → 265.1616 → 265、10/31 → 180.6833 → 181、11/01 → 168.6150 → 169、11/09 → 72.0683 → 72
//   11/10〜は G = 60 のまま。12/20〜1/07 は空白期間で「制限なし」、1/08 は 60 に戻る。計画開始日の前（9/30）は通常上限 180
import type { DailyLimit } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { computeDailyLimits } from "@/server/plan/daily-limits";
import { CHILD, CHILD_ID, clock, codeOf, fresh, newFamily, ok, PARENT, post, versionOf } from "./helpers";

const S = 300;
const G = 60;
const plan = { planStartDate: "2026-10-01", startLimitMinutes: S, finalGoalMinutes: G };
const test1 = { startDate: "2026-10-20", endDate: "2026-10-22" };
const test2 = { startDate: "2026-11-10", endDate: "2026-11-12" };
const blank = { id: "winter", startDate: "2026-12-20", endDate: "2027-01-07" };

const handExpected: Record<string, number | "unlimited" | undefined> = {
  "2026-09-30": 180,
  "2026-10-01": 300,
  "2026-10-02": 300, // 299.85
  "2026-10-10": 288,
  "2026-10-11": 285,
  "2026-10-19": 251,
  "2026-10-20": 246,
  "2026-10-21": 246,
  "2026-10-22": 246,
  "2026-10-23": 277,
  "2026-10-24": 265,
  "2026-10-31": 181,
  "2026-11-01": 169,
  "2026-11-09": 72,
  "2026-11-10": 60,
  "2026-11-12": 60,
  "2026-11-13": 60,
  "2026-12-19": 60,
  "2026-12-20": "unlimited",
  "2026-12-31": "unlimited",
  "2027-01-07": "unlimited",
  "2027-01-08": 60,
};

const valueOn = (limits: DailyLimit[], date: string) => {
  const l = limits.find((x) => x.date === date);
  return l == null ? undefined : l.kind === "limited" ? l.limitMinutes : "unlimited";
};

describe("V: C10 を手計算と比べる（純粋な関数）", () => {
  it("S=300・G=60・テスト2件・空白期間1件の各日が手計算と一致する", () => {
    const out = computeDailyLimits(
      { usualLimitMinutes: 180, plan, testPeriods: [test1, test2], blankPeriods: [blank] },
      "2026-09-30",
      "2027-01-10",
    );
    for (const [date, want] of Object.entries(handExpected)) expect(valueOn(out, date), date).toBe(want);
  });

  it("どの日も 0〜1440 の整数で、空白期間の日だけが unlimited（未設定の日はない）", () => {
    const out = computeDailyLimits(
      { usualLimitMinutes: 180, plan, testPeriods: [test1, test2], blankPeriods: [blank] },
      "2026-09-30",
      "2027-01-10",
    );
    expect(out).toHaveLength(103); // 9/30〜1/10 の全日
    for (const l of out) {
      if (l.kind === "limited") {
        expect(Number.isInteger(l.limitMinutes)).toBe(true);
        expect(l.limitMinutes).toBeGreaterThanOrEqual(0);
        expect(l.limitMinutes).toBeLessThanOrEqual(1440);
      } else {
        expect(l.date >= blank.startDate && l.date <= blank.endDate).toBe(true);
      }
    }
  });

  it("テストが0件なら計画があっても通常上限（MVP_SPEC 4.3: 0件は未設定ではない）", () => {
    const out = computeDailyLimits(
      { usualLimitMinutes: 180, plan, testPeriods: [], blankPeriods: [] },
      "2026-10-01",
      "2026-10-03",
    );
    expect(out.map((l) => valueOn([l], l.date))).toEqual([180, 180, 180]);
  });

  it("上限 0 分の通常上限は「0 分の上限」として入る（未設定とは違う）", () => {
    const out = computeDailyLimits(
      { usualLimitMinutes: 0, plan: null, testPeriods: [], blankPeriods: [] },
      "2026-10-01",
      "2026-10-01",
    );
    expect(out).toEqual([{ date: "2026-10-01", kind: "limited", limitMinutes: 0 }]);
  });

  it("連続テストの例（10/20〜22 と 10/23〜24、最後 11/10）: 1つ目の後は回復せず、2つ目の目標 B(10/23) に移る", () => {
    // Q2' = B(10/23) u=22/40=0.55 → 300 − 240×0.3025 = 227.4 → 227
    // 2つ目の後（u_end = 23/40 = 0.575 → r = 0.8×(1 − 0.330625) = 0.5355）: P はまだ S（回復していないので前のピークのまま）
    //   R = 227.4 + 0.5355×(300 − 227.4) = 266.2773 → 10/25 は 266
    const out = computeDailyLimits(
      {
        usualLimitMinutes: 180,
        plan,
        testPeriods: [test1, { startDate: "2026-10-23", endDate: "2026-10-24" }, test2],
        blankPeriods: [],
      },
      "2026-10-20",
      "2026-11-10",
    );
    expect(valueOn(out, "2026-10-22")).toBe(246);
    expect(valueOn(out, "2026-10-23")).toBe(227);
    expect(valueOn(out, "2026-10-24")).toBe(227);
    expect(valueOn(out, "2026-10-25")).toBe(266);
    expect(valueOn(out, "2026-11-10")).toBe(60);
  });
});

describe("V: C10 をサーバ（store）を通して確かめる", () => {
  // 計画開始日 10/01 の日本時間 12:00 に保存する（開始日は今日以降。Q14）
  async function setup() {
    fresh("2026-10-01T03:00:00Z");
    const { child, parent } = await newFamily("c10");
    const childId = child.userId;
    let v = await versionOf(childId, parent.token);
    v = (
      await ok<{ configVersion: number }>(
        post("/api/plan/usual-limit", { childId, expectedVersion: v, usualLimitMinutes: 180 }, parent.token),
      )
    ).configVersion;
    v = (
      await ok<{ configVersion: number }>(
        post("/api/plan/save", { childId, expectedVersion: v, ...plan }, parent.token),
      )
    ).configVersion;
    v = (
      await ok<{ configVersion: number }>(
        post("/api/test-period/create", { childId, expectedVersion: v, name: "中間", ...test1 }, child.token),
      )
    ).configVersion;
    v = (
      await ok<{ configVersion: number }>(
        post("/api/test-period/create", { childId, expectedVersion: v, name: "期末", ...test2 }, parent.token),
      )
    ).configVersion;
    const b = { name: "冬休み", startDate: blank.startDate, endDate: blank.endDate };
    v = (
      await ok<{ configVersion: number }>(
        post("/api/blank-period/create", { childId, expectedVersion: v, ...b }, parent.token),
      )
    ).configVersion;
    return { child, parent, childId, v };
  }

  async function snapshotOf(childId: string, token: string) {
    const r = await ok<{ changed: true; snapshot: { dailyLimits: DailyLimit[]; configVersion: number } }>(
      post("/api/config/get", { childId }, token),
    );
    return r.snapshot;
  }

  it("保存の応答が返った時点で、configGet の日別上限が手計算と一致する（Q5）", async () => {
    const { child, childId, v } = await setup();
    const snap = await snapshotOf(childId, child.token);
    expect(snap.configVersion).toBe(v);
    for (const [date, want] of Object.entries(handExpected)) {
      if (date < "2026-10-01") continue; // 今日より前の日は作らない
      expect(valueOn(snap.dailyLimits, date), date).toBe(want);
    }
    // 120 日先（2027-01-29）まで作る。それより先は未設定
    expect(snap.dailyLimits.at(-1)?.date).toBe("2027-01-29");
  });

  it("Q4: 日が進んでからテストを足すと、今日から先だけ作り直し、昨日以前の値は前のまま", async () => {
    const { child, childId, v } = await setup();
    clockTo("2026-10-25T03:00:00Z");
    // 最後のテストの後に、新しい最後のテスト（11/20〜11/21）を子どもが足す
    await ok(
      post(
        "/api/test-period/create",
        { childId, expectedVersion: v, name: "追試", startDate: "2026-11-20", endDate: "2026-11-21" },
        child.token,
      ),
    );
    const snap = await snapshotOf(childId, child.token);
    // 昨日以前（10/01〜10/24）は、前の計算の値（手計算の表）のまま
    for (const d of ["2026-10-01", "2026-10-10", "2026-10-20", "2026-10-23", "2026-10-24"])
      expect(valueOn(snap.dailyLimits, d), d).toBe(handExpected[d]);
    // 今日（10/25）から先は新しい D = 50 で計算し直す:
    //   Q1 = B(10/20) = 300 − 240×0.38² = 265.344、u_end = 0.42 → r = 0.8×(1 − 0.1764) = 0.65888
    //   R1 = 265.344 + 0.65888×34.656 = 288.17814、Q2 = B(11/10) = 300 − 240×0.64 = 146.4
    //   10/25 = R1 + (Q2 − R1)×2/18 = 272.4246 → 272（前の計算なら 253）
    expect(valueOn(snap.dailyLimits, "2026-10-25")).toBe(272);
    expect(valueOn(snap.dailyLimits, "2026-11-20")).toBe(60);
  });

  it("AC-07: 計算できない保存（重なるテスト）は 400 で、版も日別上限も前のまま", async () => {
    const { child, childId, v } = await setup();
    const before = await snapshotOf(childId, child.token);
    const bad = await post(
      "/api/test-period/create",
      { childId, expectedVersion: v, name: "重なり", startDate: "2026-10-21", endDate: "2026-10-25" },
      child.token,
    );
    expect(bad.status).toBe(400);
    expect(await codeOf(bad)).toBe("bad_request");
    const after = await snapshotOf(childId, child.token);
    expect(after).toEqual({ ...before, generatedAt: (after as { generatedAt?: string }).generatedAt });
  });

  it("AC-07: D=0 かつ S≠G（計画開始日に唯一のテスト）は 400 で、前の版を保つ", async () => {
    fresh("2026-10-15T03:00:00Z");
    const v0 = await versionOf(CHILD_ID, PARENT);
    // デモの子どもの既存のテストを消してから、計画開始日 = 今日 のテストを足す
    const list = await ok<{ testPeriods: { id: string }[]; configVersion: number }>(
      post("/api/test-period/list", { childId: CHILD_ID }, CHILD),
    );
    let v = list.configVersion;
    expect(v).toBe(v0);
    for (const t of list.testPeriods)
      v = (
        await ok<{ configVersion: number }>(
          post("/api/test-period/delete", { childId: CHILD_ID, expectedVersion: v, id: t.id }, CHILD),
        )
      ).configVersion;
    v = (
      await ok<{ configVersion: number }>(
        post(
          "/api/plan/save",
          {
            childId: CHILD_ID,
            expectedVersion: v,
            planStartDate: "2026-10-15",
            startLimitMinutes: 200,
            finalGoalMinutes: 100,
          },
          PARENT,
        ),
      )
    ).configVersion;
    const res = await post(
      "/api/test-period/create",
      { childId: CHILD_ID, expectedVersion: v, name: "当日", startDate: "2026-10-15", endDate: "2026-10-16" },
      CHILD,
    );
    expect(res.status).toBe(400);
    expect(await versionOf(CHILD_ID, PARENT)).toBe(v);
  });
});

// helpers の clock を進める（store は clock.ms を読む）
function clockTo(iso: string) {
  clock.set(iso);
}
