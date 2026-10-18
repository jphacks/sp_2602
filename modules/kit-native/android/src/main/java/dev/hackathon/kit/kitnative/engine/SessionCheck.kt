package dev.hackathon.kit.kitnative.engine

import android.content.Context
import dev.hackathon.kit.kitnative.LocalData
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

// 合言葉の確かめ（docs/decisions.md D-134。2026-10-18 ユーザーが決めた「1分ごとに確かめる」）。
// 保護者が連携を外したら、子どもの端末の監視を、アプリを閉じていてもおよそ1分で止めるために、
// 監視（MonitorService）の見張りに相乗りして、サーバの authCheck（GET /api/auth/check。DB を読むだけ・中身を返さない）を呼ぶ。
//   いつ: 画面がついている間は 1 分ごと。画面が消えている間は 15 分ごと（生存報告と同じ。画面がついたらすぐ確かめ直す）。
//         失敗（通信できない・503 など）が続いたら、1 分 → 2 分 → 4 分 … 最大 15 分まで延ばす。
//         許可の状態の送信（StatusReporter）が届いたら、合言葉は使えると分かるので、その分の確かめは省く。
//   誰が: 送り先と合言葉（EngineStore の reporter。子どもとしてログインしているときだけ JS が渡す）がある端末だけ。
//         監視を止めている（ログアウト）・合言葉がない（保護者・連携前）端末は呼ばない。
//   結果: 401 + reason: family_unlink → LocalData.clearUnlinked（監視を止め、端末の値を消し、Device Owner もやめる）。
//         理由のない 401 → 保存した合言葉を消して確かめをやめる（監視は止めない。期限切れを待つだけで制限から逃げられないように）。
//         通信できない・503 など → 何も止めず、間をあけてやり直す。
// 決め方は純粋な関数（SessionCheckRules。JVM のテスト SessionCheckTest）、通信と状態はここ（SessionCheck）。
// 確かめた時刻・失敗の回数はメモリにだけ持つ（アプリが作り直されたら、最初の見張りですぐ確かめる）。

object SessionCheckRules {
  // 画面がついている間の間隔（ユーザーが決めた「1分ごと」）
  const val INTERVAL_MS = 60_000L

  // 画面が消えている間の間隔（StatusReportRules.HEARTBEAT_MS と同じ 15 分。電池と通信を食わないように）
  const val SCREEN_OFF_INTERVAL_MS = 15 * 60_000L

  // 失敗が続いたときに延ばす上限
  const val MAX_BACKOFF_MS = 15 * 60_000L

  // 契約（contracts/api.ts）の道筋。送り先（deviceStatusReport の完全な URL）から、同じサーバの authCheck の URL を作る
  const val REPORT_PATH = "/api/device-status/report"
  const val CHECK_PATH = "/api/auth/check"

  // 失敗が n 回続いたあとの待ち（0 回なら 0 = 待たない）。1 分 → 2 分 → 4 分 … 最大 15 分
  fun backoffMs(failures: Int): Long {
    if (failures <= 0) return 0L
    val shift = minOf(failures - 1, 5)
    return minOf(INTERVAL_MS shl shift, MAX_BACKOFF_MS)
  }

  /**
   * 今確かめるか。lastCheckedAt は最後に確かめた（または送信が届いた）時刻（0 = まだ）。
   * 画面がついているかで間隔を変え、失敗が続いていればさらに延ばす。時計が戻ったときはすぐ確かめる
   */
  fun shouldCheck(now: Long, lastCheckedAt: Long, failures: Int, interactive: Boolean): Boolean {
    if (lastCheckedAt <= 0L || now < lastCheckedAt) return true
    val base = if (interactive) INTERVAL_MS else SCREEN_OFF_INTERVAL_MS
    return now - lastCheckedAt >= maxOf(base, backoffMs(failures))
  }

  // 送り先の URL → authCheck の URL。形が違う（ほかのサーバ・道筋が変わった）ときは null（確かめない）
  fun checkUrl(reportUrl: String): String? {
    if (!reportUrl.endsWith(REPORT_PATH)) return null
    return reportUrl.removeSuffix(REPORT_PATH) + CHECK_PATH
  }

  // サーバの返事 → 結果。読み方は許可の状態の送信と同じ（StatusReportRules.outcome。401 は ApiError の unauthorized のときだけ）
  fun outcome(status: Int, errorBody: String?): ReportOutcome = StatusReportRules.outcome(status, errorBody)
}

object SessionCheck {
  private const val CONNECT_TIMEOUT_MS = 5_000
  private const val READ_TIMEOUT_MS = 4_000

  @Volatile private var lastCheckedAt = 0L

  @Volatile private var failures = 0

  private val busy = AtomicBoolean(false)

  // 許可の状態の送信が届いた（合言葉はまだ使える）。次の確かめを1回ぶん先へ送る
  fun markValid(now: Long) {
    lastCheckedAt = now
    failures = 0
  }

  /**
   * 確かめる時期なら確かめる。通信するので、呼ぶ側は監視の判定とは別のスレッドで呼ぶ（MonitorService は Dispatchers.IO）。
   * 確かめようとしたら true
   */
  fun checkIfDue(context: Context, interactive: Boolean, now: Long = System.currentTimeMillis()): Boolean {
    if (!EngineStore.isEngineEnabled(context)) return false
    val access = EngineStore.loadReporter(context) ?: return false
    val url = SessionCheckRules.checkUrl(access.url) ?: return false
    if (!SessionCheckRules.shouldCheck(now, lastCheckedAt, failures, interactive)) return false
    if (!busy.compareAndSet(false, true)) return false
    try {
      lastCheckedAt = now
      when (get(url, access.token)) {
        ReportOutcome.Sent -> failures = 0
        ReportOutcome.Unlinked -> {
          failures = 0
          LocalData.clearUnlinked(context, access.token)
        }
        ReportOutcome.Unauthorized -> {
          // 理由のない 401: この合言葉ではもう確かめられない。監視は止めない（JS がログインし直せば渡し直す）
          failures = 0
          EngineStore.clearReporterIfToken(context, access.token)
          StatusReporter.cancelHeartbeat(context)
        }
        is ReportOutcome.Failed -> failures = minOf(failures + 1, 10)
      }
    } finally {
      busy.set(false)
    }
    return true
  }

  private fun get(url: String, token: String): ReportOutcome {
    var conn: HttpURLConnection? = null
    return try {
      val u = URL(url)
      if (u.protocol != "https" && u.protocol != "http") return ReportOutcome.Failed(SessionCheckRules.INTERVAL_MS)
      conn = u.openConnection() as HttpURLConnection
      conn.requestMethod = "GET"
      conn.connectTimeout = CONNECT_TIMEOUT_MS
      conn.readTimeout = READ_TIMEOUT_MS
      conn.useCaches = false
      conn.instanceFollowRedirects = false // 合言葉を別の行き先へ持っていかない
      conn.setRequestProperty("Authorization", "Bearer $token")
      val status = conn.responseCode
      val errorBody = if (status == 401) StatusReporter.readLimited(conn.errorStream) else null
      SessionCheckRules.outcome(status, errorBody)
    } catch (e: Exception) {
      // 時間切れ・通信できない。何も止めず、間をあけてやり直す
      ReportOutcome.Failed(SessionCheckRules.INTERVAL_MS)
    } finally {
      conn?.disconnect()
    }
  }
}
