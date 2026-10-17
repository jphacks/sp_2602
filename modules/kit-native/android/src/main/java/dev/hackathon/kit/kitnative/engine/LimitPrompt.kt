package dev.hackathon.kit.kitnative.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import dev.hackathon.kit.kitnative.R

// C4: 上限に届いたとき、Slope の「時間は終わりです」の画面（子11。JS の /child/limit-reached）を前に出す部品。
// Android の制約（MVP_SPEC 2章「強制停止・常時遮断は保証しない」）:
//   - Android 10 以降、裏で動いているアプリは勝手に画面（Activity）を出せない（バックグラウンドからの起動の制限）。
//     例外の1つが「他のアプリの上に表示」（SYSTEM_ALERT_WINDOW）の許可を持つアプリなので、許可があれば Activity を起動する。
//   - 許可がなければ、優先度の高い通知（全画面の intent つき）で案内する。Android 14 以降は全画面の intent も
//     特別な許可（USE_FULL_SCREEN_INTENT。電話・目覚まし以外は既定でオフ）がないと、上から出る通知（ヘッドアップ）になる。
//     どちらでも、子どもが通知を押せば子11 が開く。
// 前に出す道筋: slope://child/limit-reached の深いリンク（Expo Router がこのパスの画面を開く。app.json の scheme が "slope"）。
//   MainActivity は singleTask なので、Slope がすでに動いていれば同じ画面に新しいリンクとして届く。
object LimitPrompt {
  const val DEEP_LINK = "slope://child/limit-reached"

  // 通知のチャンネル（Android 8 以降）。見守り中（常に出る・静か）と、時間が終わった案内（音・上から出る）を分ける
  const val CHANNEL_ENGINE = "slope_engine"
  const val CHANNEL_LIMIT = "slope_limit"
  const val NOTIFICATION_LIMIT_ID = 2601

  // 案内を出す。出せた（はず）なら true。どちらの方法も使えなければ false
  fun show(context: Context): Boolean {
    if (EnginePermissions.canDrawOverlays(context)) {
      try {
        context.startActivity(limitIntent(context).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
      } catch (e: Exception) {
        // OS に断られたら、通知で案内する（下へ続く）
      }
    }
    return notifyLimit(context)
  }

  // Slope の子11 を開く Intent（自分のアプリだけが受け取るよう setPackage する）
  fun limitIntent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(DEEP_LINK))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

  // 優先度の高い通知（全画面の intent つき）で案内する。通知が許可されていなければ false
  fun notifyLimit(context: Context): Boolean {
    if (!EnginePermissions.canNotify(context)) return false
    ensureChannels(context)
    val pending =
      PendingIntent.getActivity(
        context,
        0,
        limitIntent(context).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    val n =
      builder(context, CHANNEL_LIMIT)
        .setSmallIcon(R.drawable.kit_engine_notification)
        .setContentTitle("今日のスマホの時間は終わりです")
        .setContentText("続きはあしたにしよう。押すと Slope を開きます")
        .setCategory(Notification.CATEGORY_REMINDER)
        .setContentIntent(pending)
        .setFullScreenIntent(pending, true)
        .setAutoCancel(true)
        .also {
          // 古い案内が残り続けないよう、しばらくしたら消す（Android 8 以降）
          if (Build.VERSION.SDK_INT >= 26) it.setTimeoutAfter(5 * 60 * 1000L)
        }
        .build()
    return try {
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_LIMIT_ID, n)
      true
    } catch (e: SecurityException) {
      false
    }
  }

  // 時間が終わった案内の通知を消す（ログアウトのとき）
  fun cancelLimitNotification(context: Context) {
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_LIMIT_ID)
  }

  // 学習用アプリなどを開く（C4 の誘導）。入っていない・開けなければ false
  fun openApp(context: Context, packageName: String): Boolean {
    val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
    return try {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (e: Exception) {
      false
    }
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ENGINE) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ENGINE, "使用時間の見守り", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Slope が使用時間を見守っている間に出る通知です"
          setShowBadge(false)
        },
      )
    }
    if (nm.getNotificationChannel(CHANNEL_LIMIT) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_LIMIT, "時間が終わったときの案内", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "1日の時間が終わったときに Slope の案内を出します"
        },
      )
    }
  }

  // Android 8 より前はチャンネルがないので、作り方を分ける
  fun builder(context: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(context, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context).setPriority(
        if (channel == CHANNEL_LIMIT) Notification.PRIORITY_HIGH else Notification.PRIORITY_LOW,
      )
    }
}
