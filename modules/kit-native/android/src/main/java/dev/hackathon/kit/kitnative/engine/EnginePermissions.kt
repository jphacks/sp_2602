package dev.hackathon.kit.kitnative.engine

import android.app.Activity
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

// C2・C4 に要る権限の「今の状態」と「設定画面を開く」。JS の getPermissions / openPermissionSettings の中身。
// 名前は contracts/native.ts の NativePermission と同じ:
//   usageAccess         … 使用状況へのアクセス（C2。使用時間を取る）。設定画面でユーザーが許可する特別な権限
//   overlay             … 他のアプリの上に表示（SYSTEM_ALERT_WINDOW。C4。裏から Slope の案内画面を前に出すのに要る）
//   notifications       … 通知（POST_NOTIFICATIONS。Android 13 から実行時の許可。見守り中の通知・許可がないときの案内の通知）
//   batteryOptimization … 電池の最適化から外す（OS が監視を止めにくくする）
//   accessibility       … ユーザー補助（Slope の WebGuardService。制限する Web サイトだけに使う。D-111）。
//                         設定の「ユーザー補助」の画面でユーザーがオンにする（アプリから許可の画面は出せない）
// なぜどれも「設定画面を開く」だけか: 使用状況・重ねて表示・ユーザー補助は OS がアプリからの許可の画面を用意していない（設定画面でしか許可できない）。
//   通知も、2回断られると OS が許可の画面を出さなくなるので、いつでも効く「このアプリの通知の設定」を開く。
//   許可して戻ってきたら、JS がアプリが前に戻ったときに getPermissions を読み直す（child-data.tsx）。
object EnginePermissions {
  const val USAGE_ACCESS = "usageAccess"
  const val OVERLAY = "overlay"
  const val NOTIFICATIONS = "notifications"
  const val BATTERY = "batteryOptimization"
  const val ACCESSIBILITY = "accessibility"

  fun status(context: Context): Map<String, Boolean> =
    mapOf(
      USAGE_ACCESS to UsageReader(context).hasUsageAccess(),
      OVERLAY to canDrawOverlays(context),
      NOTIFICATIONS to canNotify(context),
      BATTERY to ignoresBatteryOptimization(context),
      ACCESSIBILITY to webGuardEnabled(context),
    )

  // 許可の見張り（D-113。StatusReporter）が見る4つ（電池の最適化は見張らない）。status と同じ判定を使う
  fun flags(context: Context): PermissionFlags =
    PermissionFlags(
      usageAccess = UsageReader(context).hasUsageAccess(),
      overlay = canDrawOverlays(context),
      notifications = canNotify(context),
      accessibility = webGuardEnabled(context),
    )

  fun canDrawOverlays(context: Context): Boolean = Settings.canDrawOverlays(context)

  fun canNotify(context: Context): Boolean {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!nm.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= 33) {
      return context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    }
    return true
  }

  fun ignoresBatteryOptimization(context: Context): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(context.packageName)
  }

  // ユーザー補助で Slope の WebGuardService がオンか。設定の「有効なユーザー補助サービス」の一覧（パッケージ名/クラス名を : でつないだ文字）を読む
  // （AccessibilityManager の一覧は、サービスが動き始めるまで少し遅れることがあるので、設定の値を直接見る）
  fun webGuardEnabled(context: Context): Boolean {
    val enabled =
      try {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      } catch (e: Exception) {
        null
      } ?: return false
    val mine = ComponentName(context, WebGuardService::class.java)
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == mine }
  }

  // その権限の設定画面を開く。開けたら true。activity があればそこから開く（なければ新しいタスクで開く）
  fun open(context: Context, activity: Activity?, permission: String): Boolean {
    for (intent in candidates(context, permission)) {
      if (startSafely(context, activity, intent)) return true
    }
    return false
  }

  // 通知から設定画面を開くための Intent（D-113 の「ユーザー補助をオンに戻してください」の通知が PendingIntent にする）。
  // 最初の候補（ユーザー補助は一覧の画面の1つだけ）。知らない名前なら null。
  // resolveActivity で確かめない（Android 11 以降はパッケージの見え方の制限で、開ける画面でも null になることがあるため）
  fun settingsIntent(context: Context, permission: String): Intent? =
    candidates(context, permission).firstOrNull()?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  private fun candidates(context: Context, permission: String): List<Intent> {
    val pkg = context.packageName
    val pkgUri = Uri.parse("package:$pkg")
    // 上から順に試す（端末によってはアプリを指定した画面がないので、一覧の画面へ戻る）
    return when (permission) {
      USAGE_ACCESS ->
        listOf(
          Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, pkgUri),
          Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS),
        )
      OVERLAY ->
        listOf(
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri),
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION),
        )
      NOTIFICATIONS ->
        listOf(
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg),
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri),
        )
      BATTERY ->
        listOf(
          // 「電池の最適化から外しますか」の確認を直接出す（REQUEST_IGNORE_BATTERY_OPTIMIZATIONS の権限が要る）
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri),
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
        )
      // 「ユーザー補助」の一覧の画面。Slope の項目を直接開く画面（ACTION_ACCESSIBILITY_DETAILS_SETTINGS）は
      // ほかのアプリからは開けない（OS の権限が要る）ので、一覧を開いて「Slope」を選んでもらう
      ACCESSIBILITY -> listOf(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
      else -> emptyList()
    }
  }

  private fun startSafely(context: Context, activity: Activity?, intent: Intent): Boolean =
    try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (e: ActivityNotFoundException) {
      false
    } catch (e: SecurityException) {
      false
    }
}
