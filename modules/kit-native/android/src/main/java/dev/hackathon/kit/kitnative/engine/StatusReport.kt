package dev.hackathon.kit.kitnative.engine

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// 許可の見張りと親への通告（docs/decisions.md D-113）の純粋な部分（Android の部品を使わない。JVM のテスト StatusReportTest）。
// 送るかどうかの決め方・送る本文・サーバの返事の読み方・子どもの端末にユーザー補助を戻すよう催促するか。
// 通信と保存は StatusReporter.kt、見張る間隔は MonitorService（30 秒ごと）と StatusReportReceiver（画面が消えている間の 15 分ごと）。

// 見張る許可（contracts/schemas.ts の DevicePermissionFlags と同じ名前。電池の最適化は見張らない）
data class PermissionFlags(
  val usageAccess: Boolean,
  val overlay: Boolean,
  val notifications: Boolean,
  val accessibility: Boolean,
) {
  // 端末に保存する短い形（"1101" = 使用状況・重ねて表示・通知・ユーザー補助の順）
  fun encode(): String = listOf(usageAccess, overlay, notifications, accessibility).joinToString("") { if (it) "1" else "0" }

  companion object {
    // 壊れていれば null（「まだ送っていない」として扱い、すぐ送り直す）
    fun decode(s: String?): PermissionFlags? {
      if (s == null || s.length != 4 || s.any { it != '0' && it != '1' }) return null
      return PermissionFlags(s[0] == '1', s[1] == '1', s[2] == '1', s[3] == '1')
    }
  }
}

// サーバへ送った結果
sealed class ReportOutcome {
  // 届いた（2xx）
  object Sent : ReportOutcome()

  // 合言葉が無効（401 で、本文がサーバの ApiError の unauthorized）。保存した合言葉を消して送るのをやめる
  object Unauthorized : ReportOutcome()

  // 届かなかった・断られた。retryAfterMs のあとにやり直す
  data class Failed(val retryAfterMs: Long) : ReportOutcome()
}

object StatusReportRules {
  // 生存報告の間隔。親の画面は最後に届いてから 30 分で「連絡が取れていません」を出すので、その半分
  const val HEARTBEAT_MS = 15 * 60_000L

  // 通信できなかった・サーバが落ちていたときに、やり直すまでの間（30 秒ごとの見張りのたびに送り直さない）
  const val RETRY_MS = 60_000L

  /**
   * 今送るか。
   *   - 前に失敗して、やり直すまでの間なら送らない（時計が大きく戻ったときは待たない）
   *   - まだ送っていない・前に送った状態と違う（変わった）なら送る
   *   - 同じなら、前に送ってから HEARTBEAT_MS たったら送る（生存報告）。時計が戻ったときも送る
   */
  fun shouldSend(
    current: PermissionFlags,
    lastSent: PermissionFlags?,
    lastSentAt: Long,
    retryAt: Long,
    now: Long,
  ): Boolean {
    if (now < retryAt && retryAt - now <= HEARTBEAT_MS) return false
    if (lastSent == null || current != lastSent) return true
    return now - lastSentAt >= HEARTBEAT_MS || now < lastSentAt
  }

  // 送る本文（contracts/schemas.ts の DeviceStatusReport）。中身は子どもの id・許可ごとのオン/オフ・測った時刻だけ
  // （使用時間・アプリ名・URL は入れない）。org.json は JVM のテストで使えないので、手で組み立てる
  fun body(childId: String, flags: PermissionFlags, measuredAtIso: String): String =
    "{\"childId\":\"${jsonEscape(childId)}\"," +
      "\"permissions\":{" +
      "\"usageAccess\":${flags.usageAccess}," +
      "\"overlay\":${flags.overlay}," +
      "\"notifications\":${flags.notifications}," +
      "\"accessibility\":${flags.accessibility}}," +
      "\"measuredAt\":\"${jsonEscape(measuredAtIso)}\"}"

  // JSON の文字列の中身にする（" と \ と制御文字を逃がす。childId はふつう uuid なので念のため）
  fun jsonEscape(s: String): String {
    val out = StringBuilder(s.length)
    for (c in s) {
      when {
        c == '"' -> out.append("\\\"")
        c == '\\' -> out.append("\\\\")
        c < ' ' -> out.append(String.format(Locale.ROOT, "\\u%04x", c.code))
        else -> out.append(c)
      }
    }
    return out.toString()
  }

  private val UNAUTHORIZED = Regex("\"code\"\\s*:\\s*\"unauthorized\"")

  /**
   * サーバの返事を読む。401 は本文がサーバの ApiError の unauthorized のときだけ「合言葉が無効」にする
   * （Vercel の保護ページなど、ほかの仕組みの 401 で合言葉を消さない。src/lib/api.ts と同じ考え方）。
   * ほかの 4xx（403 など。時間切れ 408・混雑 429 を除く）は送り直しても同じなので、生存報告の間隔まで待つ
   */
  fun outcome(status: Int, errorBody: String?): ReportOutcome =
    when {
      status in 200..299 -> ReportOutcome.Sent
      status == 401 && errorBody != null && UNAUTHORIZED.containsMatchIn(errorBody) -> ReportOutcome.Unauthorized
      status in 400..499 && status != 408 && status != 429 -> ReportOutcome.Failed(HEARTBEAT_MS)
      else -> ReportOutcome.Failed(RETRY_MS)
    }

  // 子どもの端末に「ユーザー補助をオンに戻してください」を出すか。ユーザー補助は制限する Web サイト（D-111）だけに使うので、
  // 保護者が1件も登録していなければ催促しない（要らない許可を求めない）
  fun needsAccessibilityNudge(flags: PermissionFlags, blockedSiteCount: Int): Boolean =
    !flags.accessibility && blockedSiteCount > 0

  // 時刻 → "2026-10-17T03:00:00.000Z"（契約の IsoDateTime。minSdk 24 では java.time が使えないので SimpleDateFormat）
  fun isoUtc(epochMs: Long): String {
    val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT)
    f.timeZone = TimeZone.getTimeZone("UTC")
    return f.format(Date(epochMs))
  }
}
