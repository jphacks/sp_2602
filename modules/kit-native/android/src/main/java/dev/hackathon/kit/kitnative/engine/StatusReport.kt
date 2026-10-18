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

  // 合言葉が無効で、その理由が「保護者が連携を外した」（401 の本文に reason: "family_unlink"。D-133）。
  // 合言葉を消すのに加えて、監視を止め、端末に残した値を消し、Device Owner もやめる（LocalData.clearUnlinked）。
  // 送り先が http のときは、release 版では信じない（StatusReportRules.guardUnlinked で Unauthorized に読み替える）
  object Unlinked : ReportOutcome()

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
  private val FAMILY_UNLINK = Regex("\"reason\"\\s*:\\s*\"family_unlink\"")

  /**
   * サーバの返事を読む。401 は本文がサーバの ApiError の unauthorized のときだけ「合言葉が無効」にする
   * （Vercel の保護ページなど、ほかの仕組みの 401 で合言葉を消さない。src/lib/api.ts と同じ考え方）。
   * そのうち reason が family_unlink（保護者が連携を外した）のときだけ Unlinked にする。ほかの 401（期限切れ・ログアウトされた）で
   * 監視を止めると、子どもが合言葉の期限切れを待つだけで制限から逃げられるので、止めない（src/lib/session-core.ts と同じ考え方）。
   * ほかの 4xx（403 など。時間切れ 408・混雑 429 を除く）は送り直しても同じなので、生存報告の間隔まで待つ
   */
  fun outcome(status: Int, errorBody: String?): ReportOutcome =
    when {
      status in 200..299 -> ReportOutcome.Sent
      status == 401 && errorBody != null && UNAUTHORIZED.containsMatchIn(errorBody) ->
        if (FAMILY_UNLINK.containsMatchIn(errorBody)) ReportOutcome.Unlinked else ReportOutcome.Unauthorized
      status in 400..499 && status != 408 && status != 429 -> ReportOutcome.Failed(HEARTBEAT_MS)
      else -> ReportOutcome.Failed(RETRY_MS)
    }

  /**
   * 「保護者が連携を外した」（Unlinked）を信じて片付けてよいか。片付けると監視が止まり、Device Owner（アンインストールの止め）も
   * やめるので、偽の返事で起こされないようにする。送り先が https のときだけ信じる。
   *   なぜ: http（dev client・手元の LAN のサーバ・src/lib/api.ts の既定 http://10.0.2.2:3000）だと、子どもが Wi-Fi の HTTP プロキシを
   *   自分の PC に向けて、401 {"code":"unauthorized","reason":"family_unlink"} を作って返せるため。
   * ただし、アプリが debuggable（開発用のビルド）なら http でも信じる（手元のサーバで「連携を外す」を試せるように）。
   * JS の src/lib/session-core.ts の canTrustUnlink と同じ考え方
   */
  fun trustsUnlink(url: String, debuggable: Boolean): Boolean =
    debuggable || url.trim().startsWith("https://", ignoreCase = true)

  // 信じられない Unlinked（release 版で送り先が http）は、理由のない 401（Unauthorized）と同じ扱いにする
  // （合言葉は消して送るのをやめるが、監視は止めない・Device Owner もやめない）。ほかの結果はそのまま
  fun guardUnlinked(outcome: ReportOutcome, url: String, debuggable: Boolean): ReportOutcome =
    if (outcome == ReportOutcome.Unlinked && !trustsUnlink(url, debuggable)) ReportOutcome.Unauthorized else outcome

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
