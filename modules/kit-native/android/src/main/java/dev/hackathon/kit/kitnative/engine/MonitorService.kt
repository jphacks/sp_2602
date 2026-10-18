package dev.hackathon.kit.kitnative.engine

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import dev.hackathon.kit.kitnative.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

// C4: 監視と案内の Foreground Service。Slope の画面（JavaScript）が動いていなくても、Kotlin だけで次を繰り返す:
//   1. 端末に保存した判定の値（EngineStore の restriction。JS の saveRestriction が書く）から、今日の上限を取り出す
//   2. 今日の使用時間を OS から読み（UsageReader。C2）、C3 と同じ規則で制限対象の合計・割合・到達を出す（LimitRules）
//   3. 今日の使用量のまとめを端末に保存する（ウィジェット C5 が読む）。見守り中の通知の文も更新する
//   4. 到達していて、前面のアプリが Slope・ランチャー・対象外アプリ・必須例外のどれでもなければ、Slope の案内を前に出す（LimitPrompt）。
//      同じアプリには間をあけて出す（PromptThrottle）。端末が使えなくなるほど出し続けないため
// 間隔: ふだん 30 秒、到達している間は 15 秒（到達後に別のアプリを開いたとき、早めに案内するため）。画面がついた・ロックを解いた
//   ときはすぐ1回読む。
// なぜ Foreground Service か: Android 8 以降、裏で動くふつうの Service はすぐ止められる。通知を出し続ける Foreground Service なら
//   OS に止められにくい。Android 14 以降は「種類」の宣言が要る。使用時間の見守りに合う決まった種類がないので specialUse
//   （AndroidManifest に用途の説明を書く）にした。WorkManager は最短 15 分ごとなので、上限に届いたときの案内には遅すぎる。
// 始め方: JS の startEngine（ログイン後・設定を取れたとき）、端末の再起動後（BootReceiver）。止め方: JS の stopEngine（ログアウト）。
class MonitorService : Service() {
  companion object {
    const val NOTIFICATION_ID = 2600
    const val INTERVAL_MS = 30_000L
    // 上限に達している間は短い間隔で確かめる（開いてすぐ閉じるアプリも見逃さないため。前は 15 秒で、数秒だけ開くと素通りした。
    // 実機 SC-53C の Gaming Hub）。数えるのはその日の分の出来事だけなので、5 秒ごとでも重くない
    const val INTERVAL_REACHED_MS = 5_000L

    @Volatile
    var running = false
      private set

    @Volatile
    private var instance: MonitorService? = null

    // 監視を始める。すでに動いていれば、すぐ1回読み直させる。始められなければ false
    // （Android 12 以降、アプリが裏にいるときは Foreground Service を始められない。そのときは例外になる）
    fun start(context: Context): Boolean {
      if (running) {
        checkNow()
        return true
      }
      return try {
        val intent = Intent(context, MonitorService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, MonitorService::class.java))
    }

    // 判定の値が変わったときなどに、次の回を待たずに読み直させる（同じプロセスの中なので、直接知らせる）
    fun checkNow() {
      instance?.wake?.trySend(Unit)
    }
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val wake = Channel<Unit>(Channel.CONFLATED)
  private var loop: Job? = null
  private val throttle = PromptThrottle()
  private var lastDate: String? = null
  private var lastText: String? = null
  private lateinit var reader: UsageReader

  // 画面がついた・ロックを解いたら、すぐ1回読む（画面が消えている間は読んでも意味がないので、待っている）
  private val screenReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        wake.trySend(Unit)
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    reader = UsageReader(this)
    LimitPrompt.ensureChannels(this)
    if (!goForeground("Slope が使用時間を見守っています")) {
      stopSelf()
      return
    }
    running = true
    instance = this
    val filter =
      IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // OS が作り直したとき（START_STICKY）に、ログアウト済みなら止める
    if (!EngineStore.isEngineEnabled(this) || !running) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (loop?.isActive != true) {
      loop =
        scope.launch {
          while (isActive) {
            val next =
              try {
                tick()
              } catch (e: Exception) {
                INTERVAL_MS // 1回の失敗で監視を止めない
              }
            withTimeoutOrNull(next) { wake.receive() }
          }
        }
    } else {
      wake.trySend(Unit)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    if (instance === this) instance = null
    scope.cancel()
    try {
      unregisterReceiver(screenReceiver)
    } catch (e: IllegalArgumentException) {
      // 登録の前に止まったとき
    }
    super.onDestroy()
  }

  // 1回ぶんの判定。次の回までの待ち時間（ミリ秒）を返す
  private fun tick(): Long {
    // ログアウトで止められた（stopEngine・clearLocalData）あとに、消した値を書き戻さない
    if (!EngineStore.isEngineEnabled(this)) {
      stopSelf()
      return INTERVAL_MS
    }
    val now = System.currentTimeMillis()
    val today = DayWindow.dateOf(now)
    if (today != lastDate) {
      throttle.reset() // 日付が変わったら、前の日の案内の時刻は忘れる
      lastDate = today
    }
    val rule = EngineStore.loadRestriction(this)
    val usage = reader.read(today, now, withLabels = false)
    val summary = LimitRules.summarize(today, usage, rule, now)
    EngineStore.saveToday(this, summary)
    updateNotification(summary)

    if (rule != null && summary.reached && usage is DailyUsage.Ok && !AppVisibility.slopeInForeground) {
      val fg = usage.foreground
      if (fg != null && LimitRules.shouldPrompt(fg, rule, packageName, reader.ignoredPackages()) && throttle.allow(fg, now)) {
        if (LimitPrompt.show(this)) throttle.record(fg, now)
      }
    }
    return if (summary.reached) INTERVAL_REACHED_MS else INTERVAL_MS
  }

  // 見守り中の通知の文（子どもが見る。分数ではなく割合で出す。MVP_SPEC 4.2）
  private fun statusText(s: TodaySummary): String =
    when {
      s.status == "permission_denied" -> "使用状況へのアクセスを許可してください"
      s.status != "ok" -> "使った時間を取得できませんでした"
      s.reached -> "今日のスマホの時間は終わりです"
      s.usedPercent != null -> "今日は ${s.usedPercent}% 使いました"
      s.limit is DayLimit.Unlimited -> "今日は制限なし"
      else -> "今日の時間はまだ決まっていません"
    }

  private fun updateNotification(s: TodaySummary) {
    val text = statusText(s)
    if (text == lastText) return
    goForeground(text)
  }

  // 通知を出して Foreground にする（2回目からは通知の文を変えるだけ）。できなければ false
  private fun goForeground(text: String): Boolean {
    val n = buildNotification(text)
    return try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, n)
      }
      lastText = text
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun buildNotification(text: String): Notification {
    // 押すと Slope を開く
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val pending =
      open?.let { PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    return LimitPrompt
      .builder(this, LimitPrompt.CHANNEL_ENGINE)
      .setSmallIcon(R.drawable.kit_engine_notification)
      .setContentTitle("Slope が使用時間を見守っています")
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .also { b -> pending?.let { b.setContentIntent(it) } }
      .build()
  }
}

// Slope の画面（MainActivity）が前に出ているか。KitNativeModule が Activity の出入りで書き換える。
// Slope が前にいる間は、Kotlin から案内を出さない（JS の画面が自分で子11 を出す。二重に開かないため）
object AppVisibility {
  @Volatile
  var slopeInForeground: Boolean = false
}
