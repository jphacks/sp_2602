package dev.hackathon.kit.kitnative.engine

// C4: 上限に届いたかの判定と、案内を出してよいかの判定（純粋な関数。JVM のテストで確かめる）。
// 規則は JS の C3（src/lib/usage-calc.ts の calcUsage・isExcluded）と同じにする（MVP_SPEC 4.2「C3 と C4 で一貫させる」）:
//   - 制限対象の合計 = 対象外アプリ（C9）と必須例外（電話など）を除いたアプリの分の合計
//   - 上限 0 分は有効な上限で、使っていなくても「到達」（表示 100%）
//   - 到達は「使用 ≥ 上限」（TODO(未決): 等号を含むか。JS の reachedWhen の既定 "gte" に合わせた）
//   - 表示の割合は 0〜100 の整数。到達していなければ最大 99、到達したら 100（「100% なのにまだ使える」を出さない）
//   - 制限なし（空白期間）・上限未設定・その日のルールがない・上限が負 は、割合を出さず、到達もしない
// 分は ForegroundTime.toMinutes で 0.1 分に丸めた「アプリごとの値」を足す（JS も同じ値を足すので、両方の判定がそろう）。

// その日の上限（contracts/native.ts の NativeRestriction["limit"] と同じ3つ）
sealed class DayLimit {
  data class Limited(val limitMinutes: Double) : DayLimit()

  object Unlimited : DayLimit() // 制限なし（空白期間。0 分とも未設定とも違う。Q7）

  object Unset : DayLimit() // 上限未設定（保護者がまだ決めていない）
}

// JS から受け取って端末に保存する判定の値（contracts/native.ts の NativeRestriction）
data class Restriction(
  val date: String, // この値が効く日
  val limit: DayLimit,
  val excludedPackages: Set<String>, // C9 の対象外アプリ
  val essentialPackages: Set<String>, // 安全上の必須例外
  val learningPackages: List<String>, // 上限に届いたとき誘導する学習用アプリ（上から順）
  val configVersion: Long,
  val upcoming: Map<String, DayLimit>, // date の翌日から先の日別上限（電波がなく Slope を開かなくても、次の日も判定できるように）
  val savedAt: Long, // 端末に保存した時刻（エポックからのミリ秒）
) {
  // その日の上限。ルールが分からない日（保存した日より前・先の一覧にない日）は null（＝判定しない）
  fun limitOn(day: String): DayLimit? = if (day == date) limit else upcoming[day]

  // そのアプリを制限の対象から外すか（JS の isExcluded と同じ）
  fun isExcluded(packageName: String): Boolean =
    packageName in excludedPackages || packageName in essentialPackages
}

// 今日の判定の結果
data class Judgement(
  val restrictedMinutes: Double, // 制限対象の合計（分）
  val usedPercent: Int?, // 画面・ウィジェットに出す使用済みの割合（0〜100）。出せない状態なら null
  val reached: Boolean, // 上限に届いたか
)

object LimitRules {
  // 制限対象の合計（分）。minutesByPackage はアプリごとの分（0.1 分単位）
  fun restrictedMinutes(minutesByPackage: Map<String, Double>, rule: Restriction?): Double {
    var sum = 0.0
    for ((pkg, min) in minutesByPackage) {
      if (rule != null && rule.isExcluded(pkg)) continue
      sum += maxOf(0.0, min)
    }
    // 足し算の誤差（0.1 + 0.2 など）を消すため、0.1 分の単位に丸め直す
    return Math.round(sum * 10) / 10.0
  }

  fun judge(restrictedMinutes: Double, limit: DayLimit?): Judgement {
    if (limit !is DayLimit.Limited) return Judgement(restrictedMinutes, null, false)
    val l = limit.limitMinutes
    if (l < 0 || l.isNaN() || l.isInfinite()) return Judgement(restrictedMinutes, null, false) // 上限が負はエラー（到達にしない）
    if (l == 0.0) return Judgement(restrictedMinutes, 100, true) // 0 分は到達。0 で割らない
    val reached = restrictedMinutes >= l
    val actual = restrictedMinutes / l * 100
    // JS の Math.round と同じ（0.5 は上へ）
    val rounded = Math.floor(actual.coerceIn(0.0, 100.0) + 0.5).toInt()
    return Judgement(restrictedMinutes, if (reached) 100 else minOf(99, rounded), reached)
  }

  // 今日の使用量のまとめ（端末に保存してウィジェットが読む形。EngineStore の "today_usage"）を作る
  fun summarize(date: String, usage: DailyUsage, rule: Restriction?, now: Long): TodaySummary {
    val limit = rule?.limitOn(date)
    return when (usage) {
      is DailyUsage.Ok -> {
        val j = judge(restrictedMinutes(usage.minutesByPackage, rule), limit)
        TodaySummary(date, "ok", j.restrictedMinutes, limit, j.usedPercent, j.reached, now)
      }
      DailyUsage.PermissionDenied -> TodaySummary(date, "permission_denied", null, limit, null, false, now)
      is DailyUsage.Unavailable -> TodaySummary(date, "unavailable", null, limit, null, false, now)
    }
  }

  // 案内だけを出さないアプリ（使用時間には数える。数えないアプリは UsageReader.ignoredPackages）。
  // 設定アプリ: 上限に届いたあとも Wi-Fi の接続や Slope の許可の設定をできるようにする（2026-10-17 決定。docs/decisions.md）。
  //   子どもが設定から許可を外しに行けるようになるが、アンインストールは Device Owner で止め、
  //   許可を外されたことは Slope が「許可なし」として見分けられる。
  val PROMPT_EXEMPT_PACKAGES: Set<String> = setOf("com.android.settings")

  // 前面のアプリに「時間は終わりです」の案内を出してよいか。
  // 出さないもの: 前面のアプリが分からない・Slope 自身・ランチャー（ホーム画面）・システムの画面・設定アプリ・対象外アプリ・必須例外。
  // なぜランチャーで出さないか: ホーム画面でも出すと、電話などの必須例外のアプリを開くことすらできなくなるため。
  fun shouldPrompt(
    foreground: String?,
    rule: Restriction,
    selfPackage: String,
    ignoredPackages: Set<String>,
  ): Boolean {
    if (foreground == null) return false
    if (foreground == selfPackage) return false
    if (foreground in ignoredPackages) return false
    if (foreground in PROMPT_EXEMPT_PACKAGES) return false
    return !rule.isExcluded(foreground)
  }
}

// 同じアプリに何度も案内を出し続けて、端末が使えなくならないようにする間隔の管理（C4）。
//   - 同じアプリには samePackageGapMs（既定 60 秒）あける: 「閉じる」を押したあと、少しのあいだは触れる
//   - どのアプリでも、前の案内から anyGapMs（既定 10 秒）はあける: アプリを次々に切り替えたときに連続で出さない
// TODO(未決): 間隔の長さ（実機で子どもに試してもらって決める）。短いほど「止める」に近く、長いほど端末を使える
class PromptThrottle(
  private val samePackageGapMs: Long = 60_000L,
  private val anyGapMs: Long = 10_000L,
) {
  private val lastByPackage = HashMap<String, Long>()
  private var lastAny: Long? = null

  fun allow(packageName: String, now: Long): Boolean {
    val any = lastAny
    if (any != null && now - any < anyGapMs) return false
    val last = lastByPackage[packageName] ?: return true
    return now - last >= samePackageGapMs
  }

  fun record(packageName: String, now: Long) {
    lastByPackage[packageName] = now
    lastAny = now
  }

  // 日付が変わったときなどに、覚えた時刻を消す
  fun reset() {
    lastByPackage.clear()
    lastAny = null
  }
}
