package dev.hackathon.kit.kitnative.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// 合言葉の確かめ（D-134）の純粋な部分のテスト（SessionCheck.kt の SessionCheckRules）。
//   cd android && ./gradlew :kit-native:testDebugUnitTest
// 確かめること: 画面がついている間は 1 分ごと・消えている間は 15 分ごと、失敗が続いたら延ばす（最大 15 分）、
//   時計が戻ったらすぐ確かめる、authCheck の URL の作り方、返事の読み方（family_unlink の 401 だけ監視を止める）
class SessionCheckTest {
  private val min = 60_000L
  private val t0 = 1_792_162_800_000L

  @Test
  fun 画面がついている間は1分ごと() {
    assertTrue(SessionCheckRules.shouldCheck(t0, 0L, 0, interactive = true)) // まだ一度も確かめていない
    assertFalse(SessionCheckRules.shouldCheck(t0 + 59_000L, t0, 0, interactive = true))
    assertTrue(SessionCheckRules.shouldCheck(t0 + min, t0, 0, interactive = true))
  }

  @Test
  fun 画面が消えている間は15分ごと_画面がついたら1分たっていればすぐ() {
    assertFalse(SessionCheckRules.shouldCheck(t0 + 14 * min, t0, 0, interactive = false))
    assertTrue(SessionCheckRules.shouldCheck(t0 + 15 * min, t0, 0, interactive = false))
    assertTrue(SessionCheckRules.shouldCheck(t0 + 2 * min, t0, 0, interactive = true))
  }

  @Test
  fun 失敗が続いたら間隔を延ばす_最大15分() {
    assertEquals(0L, SessionCheckRules.backoffMs(0))
    assertEquals(1 * min, SessionCheckRules.backoffMs(1))
    assertEquals(2 * min, SessionCheckRules.backoffMs(2))
    assertEquals(4 * min, SessionCheckRules.backoffMs(3))
    assertEquals(8 * min, SessionCheckRules.backoffMs(4))
    assertEquals(15 * min, SessionCheckRules.backoffMs(5))
    assertEquals(15 * min, SessionCheckRules.backoffMs(100))
    // 3 回続けて失敗したら、画面がついていても 4 分あける
    assertFalse(SessionCheckRules.shouldCheck(t0 + 3 * min, t0, 3, interactive = true))
    assertTrue(SessionCheckRules.shouldCheck(t0 + 4 * min, t0, 3, interactive = true))
  }

  @Test
  fun 時計が戻ったらすぐ確かめる() {
    assertTrue(SessionCheckRules.shouldCheck(t0 - min, t0, 0, interactive = true))
  }

  @Test
  fun authCheckのURLは送り先と同じサーバ() {
    assertEquals(
      "https://slope.example.app/api/auth/check",
      SessionCheckRules.checkUrl("https://slope.example.app/api/device-status/report"),
    )
    assertEquals("http://10.0.2.2:3000/api/auth/check", SessionCheckRules.checkUrl("http://10.0.2.2:3000/api/device-status/report"))
    // 形が違う送り先では確かめない
    assertNull(SessionCheckRules.checkUrl("https://slope.example.app/api/other"))
  }

  @Test
  fun 理由のない401のあとは_画面がついていても15分ごとに確かめ続ける() {
    // 監視が動いている間は合言葉を消さず、いちばん長い間隔で確かめる（あとで外されたら family_unlink を受けて止まれるように）
    val f = SessionCheckRules.REJECTED_FAILURES
    assertEquals(SessionCheckRules.MAX_BACKOFF_MS, SessionCheckRules.backoffMs(f))
    assertFalse(SessionCheckRules.shouldCheck(t0 + 14 * min, t0, f, interactive = true))
    assertTrue(SessionCheckRules.shouldCheck(t0 + 15 * min, t0, f, interactive = true))
    assertFalse(SessionCheckRules.shouldCheck(t0 + 14 * min, t0, f, interactive = false))
    assertTrue(SessionCheckRules.shouldCheck(t0 + 15 * min, t0, f, interactive = false))
    // 時計が戻ったら、すぐ確かめる（今までどおり）
    assertTrue(SessionCheckRules.shouldCheck(t0 - min, t0, f, interactive = true))
  }

  @Test
  fun 返事の読み方() {
    assertEquals(ReportOutcome.Sent, SessionCheckRules.outcome(200, null))
    // 外された（family_unlink）ときだけ Unlinked = 監視を止める
    assertEquals(
      ReportOutcome.Unlinked,
      SessionCheckRules.outcome(401, "{\"code\":\"unauthorized\",\"message\":\"x\",\"hint\":\"y\",\"reason\":\"family_unlink\"}"),
    )
    // 理由のない 401 は監視を止めない（合言葉を残すか消すかは、監視が動いているかで決める。StatusReportRules.replyAction）
    assertEquals(
      ReportOutcome.Unauthorized,
      SessionCheckRules.outcome(401, "{\"code\":\"unauthorized\",\"message\":\"x\",\"hint\":\"y\"}"),
    )
    // 通信の仕組みの 401・503・404（古いサーバに authCheck がない）は失敗（何も止めない）
    assertTrue(SessionCheckRules.outcome(401, "<html>") is ReportOutcome.Failed)
    assertTrue(SessionCheckRules.outcome(503, null) is ReportOutcome.Failed)
    assertTrue(SessionCheckRules.outcome(404, null) is ReportOutcome.Failed)
  }
}
