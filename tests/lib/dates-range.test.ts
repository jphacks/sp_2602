// 日付の範囲（contracts/dates.ts の datesInRange）と、契約の日付（IsoDate）が受け付ける年（セキュリティ検査 IN-04 / IPA-12）。
// 前は 9999-12-31 からの一覧づくりが終わらず、親の利用記録の取得（usageGet）が応答しなかった
import { addDays, datesInRange, MAX_RANGE_DAYS } from "@contracts/dates";
import { IsoDate, UsageQuery } from "@contracts/schemas";
import { describe, expect, it } from "vitest";

describe("datesInRange", () => {
  it("from〜to の両端を含む日付を順に返す（月・年・うるう日をまたぐ）", () => {
    expect(datesInRange("2028-02-27", "2028-03-01")).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(datesInRange("2026-12-31", "2027-01-01")).toEqual(["2026-12-31", "2027-01-01"]);
    expect(datesInRange("2026-10-18", "2026-10-18")).toEqual(["2026-10-18"]);
  });

  it("to が from より前・読めない日付なら空（終わらない繰り返しにならない）", () => {
    expect(datesInRange("2026-10-18", "2026-10-17")).toEqual([]);
    expect(datesInRange("abc", "2026-10-17")).toEqual([]);
    expect(datesInRange("+010000-01", "9999-12-31")).toEqual([]);
  });

  it("9999-12-31 だけの範囲でも、1件を返して終わる", () => {
    expect(datesInRange("9999-12-31", "9999-12-31")).toEqual(["9999-12-31"]);
  });

  it("MAX_RANGE_DAYS を超える範囲は RangeError（とても大きな配列を作らない）", () => {
    expect(() => datesInRange("0001-01-01", "9999-12-31")).toThrow(RangeError);
    expect(datesInRange("2000-01-01", "2099-12-31")).toHaveLength(36_525);
    expect(36_525).toBeLessThan(MAX_RANGE_DAYS);
  });
});

describe("IsoDate は 2000〜2099 年だけを受け付ける", () => {
  it("端の日は通り、その外は断る", () => {
    expect(IsoDate.safeParse("2000-01-01").success).toBe(true);
    expect(IsoDate.safeParse("2099-12-31").success).toBe(true);
    for (const s of ["1999-12-31", "2100-01-01", "0001-01-01", "9999-12-31"]) {
      expect(IsoDate.safeParse(s).success, s).toBe(false);
    }
  });

  it("受け付ける一番後の日の翌日も、YYYY-MM-DD の形で数えられる", () => {
    expect(addDays("2099-12-31", 1)).toBe("2100-01-01");
  });

  it("UsageQuery は from・to が範囲の外なら断る", () => {
    expect(UsageQuery.safeParse({ childId: "c", from: "9999-12-31", to: "9999-12-31" }).success).toBe(false);
    expect(UsageQuery.safeParse({ childId: "c", from: "2026-10-12", to: "2026-10-18" }).success).toBe(true);
  });
});
