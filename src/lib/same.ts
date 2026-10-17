// 取り直した値が前と同じ中身なら、前の値（同じ入れ物）をそのまま返す。setState((prev) => keepIfSame(prev, next)) で使う。
// なぜ: 30 秒ごとの取り直し（設定の組・権限の状態）は、中身が変わっていなくても毎回新しい入れ物を返す。
// そのまま入れると Context の値が毎回変わり、それを見ている全部の画面が描き直され、
// 値を依存に入れた effect（ウィジェットへの保存など）もやり直してしまう。
// 比べ方は JSON（設定の組・権限の状態は JSON にできる素の値だけでできている）。
export function keepIfSame<T>(prev: T, next: T): T {
  if (prev === next) return prev;
  if (prev == null || next == null) return next;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
