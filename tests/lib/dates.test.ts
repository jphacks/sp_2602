// 画面に出す日付の文言（contracts/dates.ts）のテスト。アプリの日付の文言はここだけで作る（子・親・日程の画面で同じ形にする）。
// 日付の文字列をそのまま読むので、端末の時計の地域（日本以外）でも曜日がずれないことも確かめる。
import { formatDateJa, formatDateLongJa, formatSlashDate, formatSlashDateWeekday, weekdayJa } from "@contracts/dates";
import { describe, expect, it } from "vitest";

describe("日付の文言", () => {
  it("「10月28日（水）」・年つき「2026年10月28日（水）」（Figma 子03 の入力欄）", () => {
    expect(formatDateJa("2026-10-28")).toBe("10月28日（水）");
    expect(formatDateLongJa("2026-10-28")).toBe("2026年10月28日（水）");
    expect(formatDateLongJa("2027-01-03")).toBe("2027年1月3日（日）");
  });

  it("「10/12」「10/15（木）」", () => {
    expect(formatSlashDate("2026-10-12")).toBe("10/12");
    expect(formatSlashDate("2026-01-05")).toBe("1/5");
    expect(formatSlashDateWeekday("2026-10-15")).toBe("10/15（木）");
  });

  it("端末の時計の地域が日本でなくても、曜日は日付の文字列どおり", () => {
    const before = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(weekdayJa("2026-10-28")).toBe("水");
      expect(formatDateJa("2026-10-28")).toBe("10月28日（水）");
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});
