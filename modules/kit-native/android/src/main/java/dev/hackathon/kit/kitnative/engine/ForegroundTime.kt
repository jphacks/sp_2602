package dev.hackathon.kit.kitnative.engine

// C2: OS の「使用イベント」（UsageStatsManager.queryEvents の結果）から、アプリごとの前面の時間（ミリ秒）を数える純粋な関数。
// Android の型（UsageEvents.Event）を直接受け取らず FgEvent に直してから渡すので、JVM のテスト（src/test/）で確かめられる。
// なぜ queryUsageStats（OS の集計）を使わないか: 集計の「日」の区切りが OS 側の都合（UTC や端末の地域・保存の単位）で決まり、
//   日本時間 0:00〜24:00 にそろわない。またアプリごとの合計にランチャーの時間などの扱いの差がある。
//   そこで前面に来た／離れたイベントを自分で並べて、[windowStart, windowEnd) に入る時間だけを足す。
//
// 数え方（1度に前面にいるアプリは1つとして数える）:
//   - RESUMED（アプリの画面が前に来た）: 別のアプリが前面だったら、そこで閉じて、このアプリを前面にする。
//       同じアプリの別の画面なら、そのまま続ける（画面の名前を覚えておく）。
//   - PAUSED / STOPPED（画面が離れた）: 前面のアプリの画面なら、その画面を外す。画面が1つも残らなければそこで閉じる。
//       なぜ画面ごとに覚えるか: 同じアプリの中で画面を移ると「新しい画面の RESUMED → 古い画面の STOPPED」の順に来るので、
//       アプリ単位で閉じると、使っている途中で数えるのが止まってしまうため。
//   - SCREEN_OFF（画面が消えた）・SHUTDOWN（電源が切れた）: 前面のアプリを閉じる。
//   - 最後まで閉じていないアプリは windowEnd（今日なら「今」）まで数え、そのアプリを「今の前面のアプリ」として返す（C4 で使う）。
//   - イベントの取りこぼし（PAUSED が来ない）があっても、次に別のアプリ（ランチャーを含む）が前に来れば閉じるので、数え続けない。
// 画面分割で2つのアプリを同時に出したときは、後から前に来た方だけを数える（子どもの端末では少ないので、取りこぼしへの強さを優先した）。

// 前面の時間の数え方に関係するイベントの種類
enum class FgKind {
  RESUMED,
  PAUSED,
  STOPPED,
  SCREEN_OFF,
  SHUTDOWN;

  companion object {
    // UsageEvents.Event の値（android.jar で確認。DEVICE_SHUTDOWN は 26。17 は KEYGUARD_SHOWN なので数えない）
    fun fromUsageEventType(type: Int): FgKind? =
      when (type) {
        1 -> RESUMED // ACTIVITY_RESUMED / MOVE_TO_FOREGROUND
        2 -> PAUSED // ACTIVITY_PAUSED / MOVE_TO_BACKGROUND
        16 -> SCREEN_OFF // SCREEN_NON_INTERACTIVE
        23 -> STOPPED // ACTIVITY_STOPPED
        26 -> SHUTDOWN // DEVICE_SHUTDOWN
        else -> null
      }
  }
}

data class FgEvent(
  val packageName: String,
  val className: String, // 画面（Activity）の名前。分からなければ ""
  val kind: FgKind,
  val timeMs: Long,
)

// [startMs, endMs) の前面利用区間。ForegroundTime.compute が日付窓へ切り詰めた値を返す。
data class ForegroundInterval(val startMs: Long, val endMs: Long)

data class ForegroundResult(
  val msByPackage: Map<String, Long>, // アプリごとの前面の時間（ミリ秒。区間に入る分だけ）
  val foregroundAtEnd: String?, // 区間の終わりの時点で前面にいるアプリ（いなければ null）
  val intervalsByPackage: Map<String, List<ForegroundInterval>>, // 日別窓に切り詰めた区間。D9検証用
)

object ForegroundTime {
  // events は時刻の順（queryEvents が返す順）。windowStart より前のイベントは「その時点で何が前面か」を知るためだけに使う
  fun compute(events: List<FgEvent>, windowStart: Long, windowEnd: Long): ForegroundResult {
    val total = HashMap<String, Long>()
    val intervals = HashMap<String, MutableList<ForegroundInterval>>()
    var current: String? = null
    var since = 0L
    val screens = HashSet<String>() // 前面のアプリの、今出ている画面

    fun add(pkg: String, from: Long, to: Long) {
      val s = maxOf(from, windowStart)
      val e = minOf(to, windowEnd)
      if (e > s) {
        total[pkg] = (total[pkg] ?: 0L) + (e - s)
        intervals.getOrPut(pkg) { ArrayList() }.add(ForegroundInterval(s, e))
      }
    }

    fun close(at: Long) {
      val pkg = current ?: return
      add(pkg, since, at)
      current = null
      screens.clear()
    }

    for (ev in events) {
      if (ev.timeMs >= windowEnd) break
      when (ev.kind) {
        FgKind.RESUMED -> {
          if (current != ev.packageName) {
            close(ev.timeMs)
            current = ev.packageName
            since = ev.timeMs
          }
          screens.add(ev.className)
        }
        FgKind.PAUSED, FgKind.STOPPED -> {
          if (current == ev.packageName) {
            screens.remove(ev.className)
            if (screens.isEmpty()) close(ev.timeMs)
          }
        }
        FgKind.SCREEN_OFF, FgKind.SHUTDOWN -> close(ev.timeMs)
      }
    }
    val atEnd = current
    close(windowEnd)
    return ForegroundResult(total, atEnd, intervals.mapValues { (_, value) -> value.toList() })
  }

  // ミリ秒 → 分（0.1 分の単位に丸める）。JS（C3）と Kotlin（C4）が同じ値で到達を判定できるよう、丸めはここだけで行う
  fun toMinutes(ms: Long): Double = Math.round(ms / 6_000.0) / 10.0
}
