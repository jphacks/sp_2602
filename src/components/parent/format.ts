// 保護者の画面で使う、表示の文字の組み立てと「分 ⇔ 時間と分」の変換（純粋な関数。tests/parent/format.test.ts）。
// 保護者には分数で見せる（MVP_SPEC 4.2・5.2）。入力だけは Figma 親02 に合わせて「◯時間◯分」で受け取り、分に直して送る。
// 日付は "YYYY-MM-DD"（日本時間のその日。contracts/dates.ts と同じ約束）。
import { weekdayJa } from "@contracts/dates";

// 1日の分数の上限（contracts/schemas.ts の Minutes と同じ。24時間）
export const MAX_DAY_MINUTES = 1440;

// "2026-10-12" → "10/12"（グラフの下・期間の帯）
export function md(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// "2026-10-15" → "10/15（木）"（親09 の「今日 10/15（木）の合計」）
export function mdw(date: string): string {
  return `${md(date)}（${weekdayJa(date)}）`;
}

// ISO の時刻 → 日本時間の "15:42"（記録を測った時刻の表示。日本は夏時間がないので UTC+9 で足りる）。読めなければ null
export function timeJst(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 9 * 3_600_000).toISOString().slice(11, 16);
}

// 分 → { 時間, 分 }
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const t = Math.max(0, Math.round(total));
  return { hours: Math.floor(t / 60), minutes: t % 60 };
}

// 分 → "5時間0分"（Figma 親02 の書き方。60 分未満は "45分"）
export function formatHm(total: number): string {
  const { hours, minutes } = splitMinutes(total);
  return hours === 0 ? `${minutes}分` : `${hours}時間${minutes}分`;
}

// 入力欄の中身（文字のまま持つ。打ちかけの値を消さないため）
export type DurationText = { hours: string; minutes: string };

export const emptyDuration: DurationText = { hours: "", minutes: "" };

// 分（なければ null）→ 入力欄の初期値
export function durationTextOf(total: number | null | undefined): DurationText {
  if (total == null) return emptyDuration;
  const { hours, minutes } = splitMinutes(total);
  return { hours: String(hours), minutes: String(minutes) };
}

// 入力の読み取り結果
//   empty        : 時間も分も空
//   not_number   : 数字（0 以上の整数）でない
//   minutes_range: 分が 0〜59 でない
//   out_of_range : 合計が 24時間（1440分）を超える
export type ParsedDuration =
  | { ok: true; minutes: number }
  | { ok: false; reason: "empty" | "not_number" | "minutes_range" | "out_of_range" };

// 全角の数字（０〜９）を半角にする（日本語のキーボードで打たれても受け付けるため）
const toHalfWidth = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// 「◯時間◯分」の入力を分に直す。片方だけ空なら、その欄は 0 とみなす（「5時間」だけ入れたら 300 分）
export function parseDuration(t: DurationText): ParsedDuration {
  const h = toHalfWidth(t.hours.trim());
  const m = toHalfWidth(t.minutes.trim());
  if (h === "" && m === "") return { ok: false, reason: "empty" };
  const digits = /^\d+$/;
  if ((h !== "" && !digits.test(h)) || (m !== "" && !digits.test(m))) return { ok: false, reason: "not_number" };
  const hours = h === "" ? 0 : Number(h);
  const minutes = m === "" ? 0 : Number(m);
  if (minutes > 59) return { ok: false, reason: "minutes_range" };
  const total = hours * 60 + minutes;
  if (total > MAX_DAY_MINUTES) return { ok: false, reason: "out_of_range" };
  return { ok: true, minutes: total };
}

// 件数 → "1件"（設定の項目の右の値）。分からない（設定を読み込めていない）ときは undefined = 何も出さない（0件と出さない）
export function countText(n: number | null | undefined): string | undefined {
  return n == null ? undefined : `${n}件`;
}
