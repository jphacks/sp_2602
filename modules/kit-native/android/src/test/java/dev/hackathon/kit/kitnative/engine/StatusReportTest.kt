package dev.hackathon.kit.kitnative.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// 許可の見張りと親への通告（D-113）の純粋な部分のテスト（StatusReport.kt）。
//   cd android && ./gradlew :kit-native:testDebugUnitTest
// 確かめること: 変わったとき・15 分ごと・失敗のあとの待ち・時計が戻ったときに送るか、送る本文の形（使用時間などを入れない）、
//   サーバの返事の読み方（401 は ApiError の unauthorized のときだけ合言葉が無効とみなす。理由が family_unlink なら監視も止める）、
//   返事のあとにすること（理由のない 401 は、監視が動いていれば合言葉を残し、止まっていれば消す。replyAction）、
//   ユーザー補助の催促の出し分け
class StatusReportTest {
  private val min = 60_000L
  private val allOn = PermissionFlags(usageAccess = true, overlay = true, notifications = true, accessibility = true)
  private val a11yOff = allOn.copy(accessibility = false)
  private val t0 = 1_792_200_000_000L

  @Test
  fun まだ送っていなければすぐ送る() {
    assertTrue(StatusReportRules.shouldSend(allOn, null, 0L, 0L, t0))
  }

  @Test
  fun 変わったらすぐ送る() {
    assertTrue(StatusReportRules.shouldSend(a11yOff, allOn, t0, 0L, t0 + 30_000))
    assertTrue(StatusReportRules.shouldSend(allOn, a11yOff, t0, 0L, t0 + 1))
  }

  @Test
  fun 同じなら15分ごとの生存報告だけ() {
    assertFalse(StatusReportRules.shouldSend(allOn, allOn, t0, 0L, t0 + 14 * min))
    assertTrue(StatusReportRules.shouldSend(allOn, allOn, t0, 0L, t0 + 15 * min))
    assertEquals(15 * min, StatusReportRules.HEARTBEAT_MS)
  }

  @Test
  fun 時計が戻ったら送り直す() {
    assertTrue(StatusReportRules.shouldSend(allOn, allOn, t0, 0L, t0 - 1))
  }

  @Test
  fun 失敗のあとは待つ_変わっていても待つ_時計が大きく戻ったら待たない() {
    val retryAt = t0 + StatusReportRules.RETRY_MS
    assertFalse(StatusReportRules.shouldSend(allOn, null, 0L, retryAt, t0))
    assertFalse(StatusReportRules.shouldSend(a11yOff, allOn, t0 - 20 * min, retryAt, t0 + 30_000))
    assertTrue(StatusReportRules.shouldSend(a11yOff, allOn, t0 - 20 * min, retryAt, retryAt))
    // retryAt が今より 15 分を超えて先 = 時計が戻った。待たずに送る
    assertTrue(StatusReportRules.shouldSend(allOn, null, 0L, t0 + 16 * min, t0))
  }

  @Test
  fun 本文は子どものidと許可ごとのオンオフと測った時刻だけ() {
    val body = StatusReportRules.body("c-1", a11yOff, "2026-10-18T01:12:00.000Z")
    assertEquals(
      "{\"childId\":\"c-1\",\"permissions\":{\"usageAccess\":true,\"overlay\":true,\"notifications\":true,\"accessibility\":false}," +
        "\"measuredAt\":\"2026-10-18T01:12:00.000Z\"}",
      body,
    )
  }

  @Test
  fun JSONの文字列を逃がす() {
    assertEquals("a\\\"b\\\\c\\u000a", StatusReportRules.jsonEscape("a\"b\\c\n"))
  }

  @Test
  fun 時刻はUTCのISOの形() {
    assertEquals("2026-10-16T15:00:00.000Z", StatusReportRules.isoUtc(1792162800000L))
  }

  @Test
  fun サーバの返事の読み方() {
    assertEquals(ReportOutcome.Sent, StatusReportRules.outcome(200, null))
    assertEquals(
      ReportOutcome.Unauthorized,
      StatusReportRules.outcome(401, "{\"code\": \"unauthorized\",\"message\":\"x\",\"hint\":\"y\"}"),
    )
    // 保護者が連携を外した 401（reason: family_unlink。D-133）だけ Unlinked（監視を止めて端末の値を消す）
    assertEquals(
      ReportOutcome.Unlinked,
      StatusReportRules.outcome(
        401,
        "{\"code\":\"unauthorized\",\"message\":\"x\",\"hint\":\"y\",\"reason\": \"family_unlink\"}",
      ),
    )
    // 理由が違う 401 では監視を止めない。unauthorized でない本文に reason があっても止めない
    assertEquals(
      ReportOutcome.Unauthorized,
      StatusReportRules.outcome(401, "{\"code\":\"unauthorized\",\"message\":\"x\",\"hint\":\"y\",\"reason\":\"other\"}"),
    )
    assertEquals(
      ReportOutcome.Failed(StatusReportRules.HEARTBEAT_MS),
      StatusReportRules.outcome(401, "{\"code\":\"forbidden\",\"reason\":\"family_unlink\"}"),
    )
    // サーバの ApiError でない 401（Vercel の保護ページなど）では合言葉を消さない（ほかの 4xx と同じく、生存報告の間隔まで待つ）
    assertEquals(ReportOutcome.Failed(StatusReportRules.HEARTBEAT_MS), StatusReportRules.outcome(401, "<html>"))
    assertEquals(ReportOutcome.Failed(StatusReportRules.HEARTBEAT_MS), StatusReportRules.outcome(401, null))
    // 403・400 は送り直しても同じなので、生存報告の間隔まで待つ。408・429・5xx はすぐ（1 分後）やり直す
    assertEquals(ReportOutcome.Failed(StatusReportRules.HEARTBEAT_MS), StatusReportRules.outcome(403, null))
    assertEquals(ReportOutcome.Failed(StatusReportRules.HEARTBEAT_MS), StatusReportRules.outcome(400, null))
    assertEquals(ReportOutcome.Failed(StatusReportRules.RETRY_MS), StatusReportRules.outcome(429, null))
    assertEquals(ReportOutcome.Failed(StatusReportRules.RETRY_MS), StatusReportRules.outcome(503, null))
  }

  @Test
  fun 連携が外れたを信じるのはhttpsか開発用のビルドのときだけ() {
    assertTrue(StatusReportRules.trustsUnlink("https://slope.example.com/api/device-status/report", debuggable = false))
    assertTrue(StatusReportRules.trustsUnlink("HTTPS://slope.example.com/api/device-status/report", debuggable = false))
    // release 版で http（手元の LAN のサーバ・既定の http://10.0.2.2:3000）なら信じない（偽のプロキシで作れるため）
    assertFalse(StatusReportRules.trustsUnlink("http://10.0.2.2:3000/api/device-status/report", debuggable = false))
    assertFalse(StatusReportRules.trustsUnlink("http://192.168.0.5:3000/api/auth/check", debuggable = false))
    assertFalse(StatusReportRules.trustsUnlink("", debuggable = false))
    // 開発用のビルド（debuggable）なら http でも信じる（手元で試せるように）
    assertTrue(StatusReportRules.trustsUnlink("http://10.0.2.2:3000/api/device-status/report", debuggable = true))
  }

  @Test
  fun releaseでhttpの送り先なら連携が外れたは理由のない401と同じにする() {
    val http = "http://10.0.2.2:3000/api/device-status/report"
    val https = "https://slope.example.com/api/device-status/report"
    val unlinked = StatusReportRules.outcome(401, "{\"code\":\"unauthorized\",\"reason\":\"family_unlink\"}")
    assertEquals(ReportOutcome.Unlinked, unlinked)
    assertEquals(ReportOutcome.Unauthorized, StatusReportRules.guardUnlinked(unlinked, http, debuggable = false))
    assertEquals(ReportOutcome.Unlinked, StatusReportRules.guardUnlinked(unlinked, http, debuggable = true))
    assertEquals(ReportOutcome.Unlinked, StatusReportRules.guardUnlinked(unlinked, https, debuggable = false))
    // ほかの結果は送り先によらずそのまま
    for (o in listOf(ReportOutcome.Sent, ReportOutcome.Unauthorized, ReportOutcome.Failed(StatusReportRules.RETRY_MS))) {
      assertEquals(o, StatusReportRules.guardUnlinked(o, http, debuggable = false))
    }
    // 合言葉の確かめ（SessionCheck）も同じ読み方を通る
    val checked = SessionCheckRules.outcome(401, "{\"code\":\"unauthorized\",\"reason\":\"family_unlink\"}")
    assertEquals(ReportOutcome.Unauthorized, StatusReportRules.guardUnlinked(checked, http, debuggable = false))
  }

  @Test
  fun 返事のあとにすること_guardUnlinkedと監視が動いているかの組み合わせ() {
    val http = "http://10.0.2.2:3000/api/device-status/report"
    val https = "https://slope.example.com/api/device-status/report"
    val unlinked = StatusReportRules.outcome(401, "{\"code\":\"unauthorized\",\"reason\":\"family_unlink\"}")
    val plain = StatusReportRules.outcome(401, "{\"code\":\"unauthorized\"}")
    for (engine in listOf(true, false)) {
      // 信じてよい family_unlink（https・開発用のビルド）だけ止める。監視が動いているかによらない
      assertEquals(ReplyAction.StopUnlinked, StatusReportRules.replyAction(unlinked, https, debuggable = false, engineEnabled = engine))
      assertEquals(ReplyAction.StopUnlinked, StatusReportRules.replyAction(unlinked, http, debuggable = true, engineEnabled = engine))
      assertEquals(ReplyAction.Valid, StatusReportRules.replyAction(ReportOutcome.Sent, http, debuggable = false, engineEnabled = engine))
      assertEquals(
        ReplyAction.Retry(StatusReportRules.RETRY_MS),
        StatusReportRules.replyAction(ReportOutcome.Failed(StatusReportRules.RETRY_MS), https, debuggable = false, engineEnabled = engine),
      )
    }
    // 理由のない 401: 監視が動いていれば合言葉を残して間隔を延ばす（外されたら family_unlink を受けて止まれるように）。止まっていれば消す
    assertEquals(ReplyAction.KeepAndSlowDown, StatusReportRules.replyAction(plain, https, debuggable = false, engineEnabled = true))
    assertEquals(ReplyAction.ClearToken, StatusReportRules.replyAction(plain, https, debuggable = false, engineEnabled = false))
    // release 版で http の family_unlink は信じない（guardUnlinked を通る）= 理由のない 401 と同じ。監視は止めない
    assertEquals(ReplyAction.KeepAndSlowDown, StatusReportRules.replyAction(unlinked, http, debuggable = false, engineEnabled = true))
    assertEquals(ReplyAction.ClearToken, StatusReportRules.replyAction(unlinked, http, debuggable = false, engineEnabled = false))
    // 合言葉の確かめ（SessionCheck）の返事も同じ決め方を通る
    val checked = SessionCheckRules.outcome(401, "{\"code\":\"unauthorized\",\"reason\":\"family_unlink\"}")
    assertEquals(ReplyAction.KeepAndSlowDown, StatusReportRules.replyAction(checked, http, debuggable = false, engineEnabled = true))
    assertEquals(ReplyAction.StopUnlinked, StatusReportRules.replyAction(checked, https, debuggable = false, engineEnabled = true))
  }

  @Test
  fun 保存の形との行き来() {
    assertEquals("1110", a11yOff.encode())
    assertEquals(a11yOff, PermissionFlags.decode("1110"))
    assertNull(PermissionFlags.decode("111"))
    assertNull(PermissionFlags.decode("11x0"))
    assertNull(PermissionFlags.decode(null))
  }

  @Test
  fun ユーザー補助の催促はWebサイトの登録があるときだけ() {
    assertTrue(StatusReportRules.needsAccessibilityNudge(a11yOff, 1))
    assertFalse(StatusReportRules.needsAccessibilityNudge(a11yOff, 0))
    assertFalse(StatusReportRules.needsAccessibilityNudge(allOn, 3))
  }
}
