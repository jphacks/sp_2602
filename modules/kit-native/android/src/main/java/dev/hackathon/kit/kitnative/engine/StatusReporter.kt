package dev.hackathon.kit.kitnative.engine

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import dev.hackathon.kit.kitnative.LocalData
import dev.hackathon.kit.kitnative.R
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

// 許可の見張りと親への通告（docs/decisions.md D-113）。子どもの端末の許可（使用状況へのアクセス・他のアプリの上に表示・通知・
// ユーザー補助）の状態を、Slope の画面（JavaScript）が動いていなくても、Kotlin からサーバ（deviceStatusReport）へ直接送る。
// Kotlin がサーバへ直接送るのはこれだけ（ほかはすべて JS の src/lib/api.ts を通る）。
//   いつ送るか: 状態が変わったとき・前に届いてから 15 分たったとき（生存報告）。決め方は StatusReportRules.shouldSend。
//     画面がついている間は MonitorService の見張り（30 秒ごと）が、画面が消えて CPU が眠っている間は
//     AlarmManager の目覚まし（StatusReportReceiver。15 分ごと・端末が休止中でも鳴る種類）が確かめる。
//   送り先と合言葉: JS がログイン時・起動時に setStatusReporter で渡し、EngineStore に保存してある（子どもだけ）。
//   失敗: 時間切れ・通信できない・サーバの不具合は黙って次の機会に回す（RETRY_MS あと）。
//     401（合言葉が無効）なら保存した合言葉を消して、送るのをやめる（JS がもう一度ログインすれば渡し直す）。
//     401 の理由が「保護者が連携を外した」（family_unlink。D-133）なら、さらに監視を止めて端末に残した値を消す（LocalData.clear）。
//     アプリを開かなくても、外された端末の制限が止まるように。JS は次に開いたときに同じ 401 を受け、送信待ちを消して知らせる
//   送る中身: 許可ごとのオン/オフと測った時刻だけ（使用時間・アプリ名・URL は送らない）。
// 新しい依存を足さないため HttpURLConnection で送る（1回の本文は 200 バイトほど）。
object StatusReporter {
  const val ACTION_HEARTBEAT = "dev.hackathon.kit.kitnative.STATUS_HEARTBEAT"

  // 目覚ましの受信機（goAsync）の持ち時間（約 10 秒）に収まるよう、つなぐ・読むを短めにする
  private const val CONNECT_TIMEOUT_MS = 5_000
  private const val READ_TIMEOUT_MS = 4_000
  private const val MAX_ERROR_BODY_BYTES = 4_096
  private const val ALARM_REQUEST_CODE = 3

  // 同時に2つ送らない（監視の見張りと目覚ましが重なったとき）
  private val busy = AtomicBoolean(false)

  /**
   * 送る時期なら送る。通信するので、呼ぶ側は監視の判定とは別のスレッドで呼ぶ（MonitorService は Dispatchers.IO、目覚ましは別スレッド）。
   * 監視を止めている（ログアウト・stopEngine）・送り先がない（保護者・ログイン前）なら何もしない。送ろうとしたら true
   */
  fun reportIfDue(
    context: Context,
    flags: PermissionFlags = EnginePermissions.flags(context),
    now: Long = System.currentTimeMillis(),
  ): Boolean {
    if (!EngineStore.isEngineEnabled(context)) return false
    val access = EngineStore.loadReporter(context) ?: return false
    val state = EngineStore.loadReportState(context)
    if (!StatusReportRules.shouldSend(flags, state.lastSent, state.lastSentAt, state.retryAt, now)) return false
    if (!busy.compareAndSet(false, true)) return false
    try {
      when (val outcome = post(access, StatusReportRules.body(access.childId, flags, StatusReportRules.isoUtc(now)))) {
        ReportOutcome.Sent -> {
          EngineStore.saveReportSent(context, access.token, flags, now)
          scheduleHeartbeat(context) // 次の生存報告の目覚ましを、今から 15 分あとへ置き直す
        }
        ReportOutcome.Unauthorized -> {
          EngineStore.clearReporterIfToken(context, access.token)
          cancelHeartbeat(context)
        }
        ReportOutcome.Unlinked -> {
          // 送っている間に JS が新しい合言葉を渡していたら（ログインし直して紐づけ直した）、消さない
          if (EngineStore.isReporterToken(context, access.token)) {
            LocalData.clear(context)
          } else {
            cancelHeartbeat(context)
          }
        }
        is ReportOutcome.Failed -> {
          EngineStore.saveReportFailed(context, access.token, now + outcome.retryAfterMs)
          scheduleHeartbeat(context)
        }
      }
    } finally {
      busy.set(false)
    }
    return true
  }

  private fun post(access: ReporterAccess, body: String): ReportOutcome {
    var conn: HttpURLConnection? = null
    return try {
      val url = URL(access.url)
      if (url.protocol != "https" && url.protocol != "http") return ReportOutcome.Failed(StatusReportRules.HEARTBEAT_MS)
      conn = url.openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.connectTimeout = CONNECT_TIMEOUT_MS
      conn.readTimeout = READ_TIMEOUT_MS
      conn.doOutput = true
      conn.useCaches = false
      conn.instanceFollowRedirects = false // 合言葉を別の行き先へ持っていかない
      conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
      conn.setRequestProperty("Authorization", "Bearer ${access.token}")
      val bytes = body.toByteArray(Charsets.UTF_8)
      conn.setFixedLengthStreamingMode(bytes.size)
      conn.outputStream.use { it.write(bytes) }
      val status = conn.responseCode
      val errorBody = if (status == 401) readLimited(conn.errorStream) else null
      StatusReportRules.outcome(status, errorBody)
    } catch (e: Exception) {
      // 時間切れ・通信できない・URL が壊れている。黙って次の機会に回す
      ReportOutcome.Failed(StatusReportRules.RETRY_MS)
    } finally {
      conn?.disconnect()
    }
  }

  private fun readLimited(stream: InputStream?): String? {
    if (stream == null) return null
    return stream.use {
      val buf = ByteArray(MAX_ERROR_BODY_BYTES)
      var n = 0
      while (n < buf.size) {
        val r = it.read(buf, n, buf.size - n)
        if (r < 0) break
        n += r
      }
      String(buf, 0, n, Charsets.UTF_8)
    }
  }

  // ── 画面が消えている間の生存報告（AlarmManager）──
  // 監視の見張り（コルーチンの待ち時間）は CPU が眠ると進まないので、画面が消えたまま置かれると生存報告が止まり、
  // 親の画面に「連絡が取れていません」が出てしまう。端末の休止中（Doze）でも鳴る目覚まし（setAndAllowWhileIdle。時刻は正確でなくてよい）で補う。
  // 呼ぶたびに前の目覚ましを置き換える（同じ PendingIntent）ので、画面がついて見張りが送っている間は鳴らない。
  // 休止中の通信は「電池の最適化から外す」をしていないと止められることがある（そのときは親の画面に「連絡が取れていません」が出る）
  fun scheduleHeartbeat(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val at = SystemClock.elapsedRealtime() + StatusReportRules.HEARTBEAT_MS
    try {
      am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, heartbeatIntent(context))
    } catch (e: Exception) {
      // 目覚ましの数の上限など。画面がついたときの見張りで送る
    }
  }

  fun cancelHeartbeat(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    am.cancel(heartbeatIntent(context))
  }

  private fun heartbeatIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST_CODE,
      Intent(context, StatusReportReceiver::class.java).setAction(ACTION_HEARTBEAT),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}

// 生存報告の目覚まし（StatusReporter.scheduleHeartbeat）を受ける。自分のアプリからしか届かない（exported="false"）。
// 送る時期なら送り、次の目覚ましを置く。監視を止めている・送り先がない（ログアウト・401）なら何もしない（目覚ましも置かない）
class StatusReportReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != StatusReporter.ACTION_HEARTBEAT) return
    val app = context.applicationContext
    if (!EngineStore.isEngineEnabled(app) || EngineStore.loadReporter(app) == null) return
    val pending = goAsync()
    Thread {
      try {
        StatusReporter.reportIfDue(app)
        // OS に監視を止められていたら、始め直してみる（裏からは始められないことが多い。だめでも次の目覚ましで送る）
        if (!MonitorService.running && EngineStore.loadRestriction(app) != null) MonitorService.start(app)
      } catch (e: Exception) {
        // 次の目覚ましでやり直す
      } finally {
        if (EngineStore.isEngineEnabled(app) && EngineStore.loadReporter(app) != null) StatusReporter.scheduleHeartbeat(app)
        pending.finish()
      }
    }.start()
  }
}

// 子どもの端末への催促（D-113）。ユーザー補助（Web サイトの制限。D-111）がオフになったら、
// 「ユーザー補助をオンに戻してください。保護者に知らせました」の通知を出す。押すと Android のユーザー補助の設定が開く。
// 保護者が Web サイトを1件も登録していなければ出さない（StatusReportRules.needsAccessibilityNudge）。オンに戻ったら消す
object PermissionNudge {
  const val CHANNEL = "slope_permission"
  const val NOTIFICATION_ID = 2602
  private const val REQUEST_CODE = 4

  // 出せたら true（通知が許可されていなければ false。監視は次の見張りでまた試す）
  fun show(context: Context): Boolean {
    if (!EnginePermissions.canNotify(context)) return false
    ensureChannel(context)
    val open = EnginePermissions.settingsIntent(context, EnginePermissions.ACCESSIBILITY)
    val pending =
      open?.let {
        PendingIntent.getActivity(context, REQUEST_CODE, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
    val n =
      LimitPrompt
        .builder(context, CHANNEL)
        .setSmallIcon(R.drawable.kit_engine_notification)
        .setContentTitle("ユーザー補助をオンに戻してください")
        .setContentText("保護者に知らせました。押すと設定が開きます")
        .setStyle(
          Notification.BigTextStyle().bigText(
            "保護者に知らせました。押すと設定が開くので、「Slope」をオンにしてください（Web サイトの制限に使います）",
          ),
        ).setOngoing(true)
        .setOnlyAlertOnce(true)
        .also { b -> pending?.let { b.setContentIntent(it) } }
        .build()
    return try {
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, n)
      true
    } catch (e: SecurityException) {
      false
    }
  }

  fun cancel(context: Context) {
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL, "許可を戻すお願い", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Slope に必要な許可がオフになったときに、オンに戻すようお願いします"
      },
    )
  }
}
