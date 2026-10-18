package dev.hackathon.kit.kitnative.engine

// 「日本時間の1日」の区切りを出す純粋な関数（C2・C4 で使う。Android の API に頼らないので JVM のテストで確かめられる）。
// 仕様: 日付は Asia/Tokyo 固定・0:00 区切り（plan.md の Q3）。JS 側の contracts/dates.ts（todayString・dateOf）と同じく
//   「UTC+9 の固定の時差」で計算する（日本は夏時間がないので足りる。端末の時計の地域設定に左右されないようにするため）。
// なぜ自前で計算するか: minSdk 24 では java.time が使えない（API 26 から）。Calendar は端末の地域に引きずられやすいので使わない。
//   日付 → 通日（1970-01-01 からの日数）の変換は、よく知られた days-from-civil の式（グレゴリオ暦）で行う。
object DayWindow {
  const val UTC_OFFSET_MS: Long = 9L * 60 * 60 * 1000 // 日本時間 = UTC+9
  const val DAY_MS: Long = 86_400_000L

  private val DATE_RE = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

  // "YYYY-MM-DD" として正しい日付か（2月30日などは false）
  fun isDate(date: String): Boolean {
    val m = DATE_RE.matchEntire(date) ?: return false
    val (y, mo, d) = m.destructured
    val year = y.toInt()
    val month = mo.toInt()
    val day = d.toInt()
    if (month !in 1..12 || day < 1) return false
    return day <= daysInMonth(year, month)
  }

  // その日の 0:00（日本時間）の時刻（エポックからのミリ秒）。正しくない日付なら IllegalArgumentException
  fun startOf(date: String): Long {
    val m = DATE_RE.matchEntire(date)
    require(m != null && isDate(date)) { "日付の形が正しくありません: $date" }
    val (y, mo, d) = m.destructured
    return daysFromCivil(y.toInt(), mo.toInt(), d.toInt()) * DAY_MS - UTC_OFFSET_MS
  }

  // その日の 24:00（＝翌日の 0:00。区間は [startOf, endOf) で、終わりは含まない）
  fun endOf(date: String): Long = startOf(date) + DAY_MS

  // ある時刻が、日本時間で何日か（UTC 14:59:59 は同じ日、15:00:00 は翌日）
  fun dateOf(epochMs: Long): String {
    val days = Math.floorDiv(epochMs + UTC_OFFSET_MS, DAY_MS)
    val (y, m, d) = civilFromDays(days)
    // Locale.ROOT: 端末の言語によって数字が別の文字にならないように
    return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", y, m, d)
  }

  // n 日後（負なら前）
  fun addDays(date: String, n: Int): String = dateOf(startOf(date) + n * DAY_MS)

  private fun isLeap(y: Int) = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0

  private fun daysInMonth(y: Int, m: Int): Int =
    when (m) {
      2 -> if (isLeap(y)) 29 else 28
      4, 6, 9, 11 -> 30
      else -> 31
    }

  // グレゴリオ暦の年月日 → 1970-01-01 からの日数（Howard Hinnant の days_from_civil）
  internal fun daysFromCivil(year: Int, month: Int, day: Int): Long {
    val y = (if (month <= 2) year - 1 else year).toLong()
    val era = Math.floorDiv(y, 400L)
    val yoe = y - era * 400
    val mp = (month + 9) % 12 // 3月 = 0 … 2月 = 11
    val doy = (153 * mp + 2) / 5 + day - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097 + doe - 719468
  }

  // 1970-01-01 からの日数 → 年月日（civil_from_days）
  internal fun civilFromDays(days: Long): Triple<Int, Int, Int> {
    val z = days + 719468
    val era = Math.floorDiv(z, 146097L)
    val doe = z - era * 146097
    val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = (doy - (153 * mp + 2) / 5 + 1).toInt()
    val m = (if (mp < 10) mp + 3 else mp - 9).toInt()
    val y = (yoe + era * 400 + (if (m <= 2) 1 else 0)).toInt()
    return Triple(y, m, d)
  }
}
