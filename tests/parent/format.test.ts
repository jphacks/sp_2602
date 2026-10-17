// 保護者の画面の表示の文字と「分 ⇔ 時間と分」の変換のテスト（src/components/parent/format.ts）。
import { describe, expect, it } from "vitest";
import {
  countText,
  durationTextOf,
  formatHm,
  md,
  mdw,
  parseDuration,
  splitMinutes,
  timeJst,
} from "@/components/parent/format";

describe("日付と時刻の表示", () => {
  it("md は 月/日（先頭の 0 を付けない）", () => {
    expect(md("2026-10-05")).toBe("10/5");
    expect(md("2026-01-12")).toBe("1/12");
  });
  it("mdw は 曜日つき", () => {
    expect(mdw("2026-10-15")).toBe("10/15（木）");
  });
  it("timeJst は日本時間の時:分。読めない時刻は null", () => {
    expect(timeJst("2026-10-15T06:42:00.000Z")).toBe("15:42");
    expect(timeJst("2026-10-15T15:30:00.000Z")).toBe("00:30"); // 日付をまたぐ
    expect(timeJst("いつか")).toBeNull();
  });
  it("countText は件数。分からないときは何も出さない（0件と出さない）", () => {
    expect(countText(2)).toBe("2件");
    expect(countText(0)).toBe("0件");
    expect(countText(undefined)).toBeUndefined();
    expect(countText(null)).toBeUndefined();
  });
});

describe("分 ⇔ 時間と分", () => {
  it("splitMinutes / formatHm（Figma 親02 の「5時間0分」）", () => {
    expect(splitMinutes(300)).toEqual({ hours: 5, minutes: 0 });
    expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
    expect(formatHm(300)).toBe("5時間0分");
    expect(formatHm(60)).toBe("1時間0分");
    expect(formatHm(45)).toBe("45分");
    expect(formatHm(0)).toBe("0分");
  });
  it("durationTextOf: 分 → 入力欄の初期値。null は空", () => {
    expect(durationTextOf(180)).toEqual({ hours: "3", minutes: "0" });
    expect(durationTextOf(null)).toEqual({ hours: "", minutes: "" });
  });
  it("parseDuration: 時間と分を分に直す。片方だけなら、もう片方は 0", () => {
    expect(parseDuration({ hours: "5", minutes: "0" })).toEqual({ ok: true, minutes: 300 });
    expect(parseDuration({ hours: "5", minutes: "" })).toEqual({ ok: true, minutes: 300 });
    expect(parseDuration({ hours: "", minutes: "45" })).toEqual({ ok: true, minutes: 45 });
    expect(parseDuration({ hours: " 1 ", minutes: "30" })).toEqual({ ok: true, minutes: 90 });
    expect(parseDuration({ hours: "０", minutes: "０" })).toEqual({ ok: true, minutes: 0 }); // 全角も受け付ける。0 分は有効
  });
  it("parseDuration: 空・数字でない・分が 60 以上・24時間超えを区別する", () => {
    expect(parseDuration({ hours: "", minutes: "" })).toEqual({ ok: false, reason: "empty" });
    expect(parseDuration({ hours: "a", minutes: "" })).toEqual({ ok: false, reason: "not_number" });
    expect(parseDuration({ hours: "-1", minutes: "" })).toEqual({ ok: false, reason: "not_number" });
    expect(parseDuration({ hours: "1.5", minutes: "" })).toEqual({ ok: false, reason: "not_number" });
    expect(parseDuration({ hours: "1", minutes: "60" })).toEqual({ ok: false, reason: "minutes_range" });
    expect(parseDuration({ hours: "24", minutes: "0" })).toEqual({ ok: true, minutes: 1440 }); // ちょうど上限は可
    expect(parseDuration({ hours: "24", minutes: "1" })).toEqual({ ok: false, reason: "out_of_range" });
  });
});
