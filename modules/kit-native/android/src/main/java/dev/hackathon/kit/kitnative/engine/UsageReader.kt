package dev.hackathon.kit.kitnative.engine

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process

// C2: OS から「その日（日本時間 0:00〜24:00）のアプリ別の前面の時間」を取る部品。JS の getDailyUsage と監視の Service が使う。
// 方法: UsageStatsManager.queryEvents で、前面に来た／離れたイベント（ACTIVITY_RESUMED・PAUSED・STOPPED・画面が消えた・電源断）を
//   取り、ForegroundTime で数える。queryUsageStats（OS の集計）は日の区切りがずれるので使わない（ForegroundTime.kt の説明）。
// Android の制約:
//   - 「使用状況へのアクセス」（PACKAGE_USAGE_STATS。設定画面でユーザーが許可する特別な権限）がないと、queryEvents は
//     例外を出さずに「空」を返す。空を 0 分と取り違えないよう、先に権限を確かめて PermissionDenied を返す（MVP_SPEC 4.2）。
//   - OS はイベントを数日分しか残さない。RETENTION_DAYS より前の日は「取れない」（Unavailable）として返す（0 分にしない）。
//   - 他のアプリの名前を引くには、Android 11 以降はパッケージの見える範囲の宣言が要る（AndroidManifest の QUERY_ALL_PACKAGES）。
// 数えないもの: ランチャー（ホーム画面）・Slope 自身・システムの画面（通知を下ろした画面など）。子どもが「使った」時間ではないため。

data class AppUsage(val packageName: String, val label: String, val usedMinutes: Double)

sealed class DailyUsage {
  data class Ok(
    val date: String,
    val apps: List<AppUsage>, // 使った時間の多い順。0 分（0.1 分未満）のアプリは入れない
    val minutesByPackage: Map<String, Double>,
    val foreground: String?, // 今日なら、今前面にいるアプリ（数えないアプリも含めてそのまま。C4 で使う）
    val measuredAt: Long,
  ) : DailyUsage()

  object PermissionDenied : DailyUsage()

  data class Unavailable(val reason: String) : DailyUsage()
}

class UsageReader(context: Context) {
  private val app = context.applicationContext

  companion object {
    // OS がイベントを残している日数の目安。これより前の日は取れないとする
    // TODO(未決): 実機（Galaxy A53・Android 16）で何日分残るか確かめる。少なめに見ておく
    const val RETENTION_DAYS = 6

    // 0:00 の時点で何が前面だったかを知るため、その日の始まりより少し前からイベントを読む
    const val LOOKBACK_MS = 3L * 60 * 60 * 1000

    private const val SYSTEM_UI = "com.android.systemui"

    private val labelCache = HashMap<String, String>()

    // ランチャーなどの一覧と、それを作った時刻
    private val ignoredCache = IgnoredCache()
  }

  private class IgnoredCache {
    var packages: Set<String>? = null
    var loadedAt: Long = 0L
  }

  // 「使用状況へのアクセス」が許可されているか
  fun hasUsageAccess(): Boolean {
    val ops = app.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), app.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), app.packageName)
      }
    // MODE_DEFAULT のときは、ふつうの権限として許可されているかで決まる（端末によってこちらになる）
    return if (mode == AppOpsManager.MODE_DEFAULT) {
      app.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      mode == AppOpsManager.MODE_ALLOWED
    }
  }

  // 数えない・案内を出さないアプリ（ランチャー・Slope 自身・システムの画面）。
  // 監視は 15〜30 秒ごとに読むので、ランチャーの一覧は5分だけ覚えておく（ランチャーを入れ替えることはまれ）
  fun ignoredPackages(): Set<String> {
    val now = System.currentTimeMillis()
    synchronized(ignoredCache) {
      val cached = ignoredCache.packages
      if (cached != null && now - ignoredCache.loadedAt < 5 * 60 * 1000L) return cached
    }
    val fresh = loadIgnoredPackages()
    synchronized(ignoredCache) {
      ignoredCache.packages = fresh
      ignoredCache.loadedAt = now
    }
    return fresh
  }

  private fun loadIgnoredPackages(): Set<String> {
    val out = HashSet<String>()
    out.add(app.packageName)
    out.add(SYSTEM_UI)
    try {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      @Suppress("DEPRECATION")
      for (ri in app.packageManager.queryIntentActivities(home, 0)) {
        val pkg = ri.activityInfo?.packageName ?: continue
        // 設定アプリは起動の途中用のホーム（FallbackHome）を持つが、ランチャーではないので数える
        if (pkg != "com.android.settings") out.add(pkg)
      }
    } catch (e: Exception) {
      // 取れなくても、ランチャーの時間が入るだけ（止めない）
    }
    return out
  }

  // 指定した日（日本時間）のアプリ別の前面の時間
  fun read(date: String, now: Long = System.currentTimeMillis(), withLabels: Boolean = true): DailyUsage {
    if (!DayWindow.isDate(date)) return DailyUsage.Unavailable("日付の形が正しくありません: $date")
    if (!hasUsageAccess()) return DailyUsage.PermissionDenied
    val today = DayWindow.dateOf(now)
    if (date > today) return DailyUsage.Unavailable("まだ来ていない日です")
    if (date < DayWindow.addDays(today, -RETENTION_DAYS)) {
      return DailyUsage.Unavailable("端末に記録が残っていない日です")
    }
    val start = DayWindow.startOf(date)
    val end = if (date == today) now else DayWindow.endOf(date)

    val usm =
      app.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        ?: return DailyUsage.Unavailable("使用状況の仕組みがこの端末にありません")
    val events = ArrayList<FgEvent>()
    try {
      val it = usm.queryEvents(start - LOOKBACK_MS, end)
        ?: return DailyUsage.Unavailable("使用状況イベントを取得できません（端末がロック中の可能性があります）")
      val e = UsageEvents.Event()
      while (it.hasNextEvent()) {
        it.getNextEvent(e)
        val kind = FgKind.fromUsageEventType(e.eventType) ?: continue
        events.add(FgEvent(e.packageName ?: "", e.className ?: "", kind, e.timeStamp))
      }
    } catch (ex: Exception) {
      return DailyUsage.Unavailable("使用状況を読めませんでした: ${ex.message ?: ex.javaClass.simpleName}")
    }

    val result = ForegroundTime.compute(events, start, end)
    val ignored = ignoredPackages()
    val minutes = LinkedHashMap<String, Double>()
    for ((pkg, ms) in result.msByPackage) {
      if (pkg.isEmpty() || pkg in ignored) continue
      val m = ForegroundTime.toMinutes(ms)
      if (m > 0.0) minutes[pkg] = m
    }
    val apps =
      minutes.entries
        .sortedByDescending { it.value }
        .map { (pkg, m) -> AppUsage(pkg, if (withLabels) labelOf(pkg) else pkg, m) }
    return DailyUsage.Ok(
      date = date,
      apps = apps,
      minutesByPackage = minutes,
      foreground = if (date == today) result.foregroundAtEnd else null,
      measuredAt = now,
    )
  }

  // 画面に出すアプリ名。消されたアプリなどで引けなければパッケージ名のまま
  fun labelOf(packageName: String): String {
    synchronized(labelCache) { labelCache[packageName]?.let { return it } }
    val label =
      try {
        val pm = app.packageManager
        @Suppress("DEPRECATION")
        val info = pm.getApplicationInfo(packageName, 0)
        pm.getApplicationLabel(info).toString().ifBlank { packageName }
      } catch (e: Exception) {
        packageName
      }
    synchronized(labelCache) { labelCache[packageName] = label }
    return label
  }
}
