package dev.hackathon.kit.kitnative.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// 許可の見張りと親への通告（D-113）の純粋な部分のテスト（StatusReport.kt）。
//   cd android && ./gradlew :kit-native:testDebugUnitTest
// 確かめること: 変わったとき・15 分ごと・失敗のあとの待ち・時計が戻ったときに送るか、送る本文の形（使用時間などを入れない）、
//   サーバの返事の読み方（401 は ApiError の unauthorized のときだけ合言葉を消す）、ユーザー補助の催促の出し分け
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
