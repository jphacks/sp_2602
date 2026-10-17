// 日付（"YYYY-MM-DD"）の計算。アプリとサーバで「今日」や「n 日後」をそろえるため、両方がこのファイルを使う。
// 日付は時刻を持たない文字列として扱い、計算は UTC の 0 時に置いて行う（夏時間・端末の時計の地域に左右されないため）。
// 日付は Asia/Tokyo 固定・0:00 区切り（Q3）。「今日」を出すのはこのファイルの todayString だけ（日本は夏時間がないので UTC+9 で足りる）

const DAY_MS = 86_400_000;

// 既定の時差（分）。日本時間 = UTC+9
export const DEFAULT_UTC_OFFSET_MINUTES = 9 * 60;

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ある時刻が、その地域で何日か（既定は日本時間）
export function dateOf(at: Date, utcOffsetMinutes = DEFAULT_UTC_OFFSET_MINUTES): string {
  return fromMs(at.getTime() + utcOffsetMinutes * 60_000);
}

// 今日（既定は日本時間）
export function todayString(now: Date = new Date(), utcOffsetMinutes = DEFAULT_UTC_OFFSET_MINUTES): string {
  return dateOf(now, utcOffsetMinutes);
}

// n 日後（負なら前）
export function addDays(date: string, n: number): string {
  return fromMs(toMs(date) + n * DAY_MS);
}

// b − a の日数（a が b より後なら負）
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

// from〜to（両端を含む）の日付の一覧
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// その日を含む週の月曜日（週の表示は月〜日。Figma 子02・親01 の並び）
export function mondayOf(date: string): string {
  const dow = new Date(toMs(date)).getUTCDay(); // 0 = 日曜
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

// 曜日の1文字（月・火…）
export function weekdayJa(date: string): string {
  return "日月火水木金土"[new Date(toMs(date)).getUTCDay()] ?? "";
}
