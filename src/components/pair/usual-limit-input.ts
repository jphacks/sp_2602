// 通常上限（Q7: 紐づけ直後に保護者が決める1日の上限）の入力を「時間」と「分」で受け取り、分（0〜1440 の整数）に直す純粋な関数。
// 画面 src/app/pair/usual-limit.tsx が使う。表記は親02 と同じ「3時間0分」。
import { Minutes } from "@contracts/schemas";

export const MAX_DAY_MINUTES = 1440;

export type UsualLimitParse = { ok: true; minutes: number } | { ok: false; error: string };

// 全角の数字（スマホの日本語キーボード）も受け付ける
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
}

export function parseUsualLimit(hoursText: string, minutesText: string): UsualLimitParse {
  const h = toHalfWidth(hoursText);
  const m = toHalfWidth(minutesText);
  if (h === "" && m === "") return { ok: false, error: "時間と分を入れてください" };
  // 片方だけ空なら 0 とみなす（「30分」だけ・「2時間」だけを入れられるように）
  if (!/^\d*$/.test(h) || !/^\d*$/.test(m)) return { ok: false, error: "数字で入れてください" };
  const hours = h === "" ? 0 : Number(h);
  const minutes = m === "" ? 0 : Number(m);
  if (minutes > 59) return { ok: false, error: "分は 0〜59 で入れてください" };
  const total = hours * 60 + minutes;
  if (total > MAX_DAY_MINUTES) return { ok: false, error: "1日の上限は 24時間0分 までです" };
  // 契約（contracts の Minutes）でも確かめる（サーバと同じ決まり）
  if (!Minutes.safeParse(total).success) return { ok: false, error: "0〜1440 分で入れてください" };
  return { ok: true, minutes: total };
}

// 保存済みの分を、入力欄の「時間」「分」に分ける
export function splitMinutes(total: number): { hours: string; minutes: string } {
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

// 「3時間0分」の表記（親02 と同じ）
export function formatHoursMinutes(total: number): string {
  return `${Math.floor(total / 60)}時間${total % 60}分`;
}

// 通常上限の画面を閉じるときの行き先（「決める」が保存できた・「あとで決める」）。URL の from で決める。
//   from=home : 保護者のホーム（親01）の帯から来た → 戻る（ホームはそのまま残っている。戻ると設定を取り直す）
//   それ以外  : 紐づけの直後（親15）から来た → 入口（/）へ置き換えて、役割で振り分け直す
// なぜ: ホームから来たときも入口へ置き換えていたので、下に残ったホームの上にもう1つホームが重なり、
// Android の戻るボタンでホームからホームへ戻る形になっていた
export type UsualLimitFrom = "home" | "pairing";

export function usualLimitFromOf(value: unknown): UsualLimitFrom {
  return value === "home" ? "home" : "pairing";
}

export function usualLimitExit(from: UsualLimitFrom): "back" | "entry" {
  return from === "home" ? "back" : "entry";
}
