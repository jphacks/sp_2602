package dev.hackathon.kit.kitnative.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// 制限する Web サイト（D-111）の規則のテスト（Android の端末なしで JVM で動く）。
//   cd android && ./gradlew :kit-native:testDebugUnitTest
// 確かめること:
//   - 登録のそろえ方と一致が、JS（contracts/web-sites.ts）と同じ例の表（src/test/resources/web-site-cases.tsv）で同じ答えになる
//   - 止めるのは、見守りが動いていて・今日の上限に達していて・登録があり・アドレス欄が入力中でないときだけ（WebBlockRules）
//   - 戻す・案内を出す間隔（WebBlockGate）
class WebSitesTest {
  private data class Case(val kind: String, val cols: List<String>)

  // 例の表を読む（タブ区切り。# で始まる行と空の行は読まない。前後の空白は入力の一部なので trim しない）
  private val cases: List<Case> by lazy {
    val stream =
      javaClass.classLoader?.getResourceAsStream("web-site-cases.tsv")
        ?: throw IllegalStateException("web-site-cases.tsv が見つかりません（src/test/resources）")
    stream.bufferedReader(Charsets.UTF_8).readLines()
      .filter { it.isNotBlank() && !it.startsWith("#") }
      .map { line -> line.split('\t').let { Case(it[0], it.drop(1)) } }
  }

  @Test
  fun 例の表_登録のそろえ方がJSと同じ() {
    val normalize = cases.filter { it.kind == "normalize" }
    assertTrue(normalize.size > 15)
    for (c in normalize) {
      val want = c.cols[1]
      val got = WebSites.normalizePattern(c.cols[0])
      assertEquals("「${c.cols[0]}」", if (want == "ERR") null else want, got)
    }
  }

  @Test
  fun 例の表_アドレスと登録の一致がJSと同じ() {
    val match = cases.filter { it.kind == "match" }
    assertTrue(match.size > 25)
    for (c in match) {
      val want = c.cols[2] == "true"
      assertEquals("「${c.cols[0]}」と「${c.cols[1]}」", want, WebSites.matches(c.cols[0], c.cols[1]))
    }
  }

  @Test
  fun 例の表_表の登録はどれもそろえた形() {
    for (c in cases.filter { it.kind == "match" }) {
      assertEquals(c.cols[1], WebSites.normalizePattern(c.cols[1]))
    }
  }

  @Test
  fun 当たった最初の登録を返す() {
    val sites = listOf("youtube.com/shorts", "tiktok.com")
    assertEquals("youtube.com/shorts", WebSites.firstMatch("https://m.youtube.com/shorts/abc", sites))
    assertEquals("tiktok.com", WebSites.firstMatch("www.tiktok.com/@user", sites))
    assertNull(WebSites.firstMatch("youtube.com/watch?v=1", sites))
  }

  // ── WebBlockRules ──
  private val day = "2026-10-17"

  private fun rule(sites: List<String>) =
    Restriction(
      date = day,
      limit = DayLimit.Limited(60.0),
      excludedPackages = setOf("com.android.chrome"), // ブラウザが対象外アプリでも、登録したサイトは止める
      essentialPackages = emptySet(),
      learningPackages = emptyList(),
      configVersion = 3,
      upcoming = emptyMap(),
      savedAt = 0L,
      blockedSites = sites,
    )

  private fun summary(reached: Boolean, date: String = day, limit: DayLimit? = DayLimit.Limited(60.0)) =
    TodaySummary(date, "ok", if (reached) 60.0 else 10.0, limit, if (reached) 100 else 16, reached, 0L)

  @Test
  fun 止めるのは上限に達した日だけ() {
    val r = rule(listOf("youtube.com/shorts"))
    val url = "m.youtube.com/shorts/abc"
    assertEquals("youtube.com/shorts", WebBlockRules.blockedPattern(url, false, r, summary(true), day, true))
    // 上限に達していない
    assertNull(WebBlockRules.blockedPattern(url, false, r, summary(false), day, true))
    // 制限なし（空白期間）・未設定の日は、監視のまとめが reached: false になるので止めない
    assertNull(WebBlockRules.blockedPattern(url, false, r, summary(false, limit = DayLimit.Unlimited), day, true))
    assertNull(WebBlockRules.blockedPattern(url, false, r, summary(false, limit = DayLimit.Unset), day, true))
    // まとめが昨日の分（日付が変わってまだ測っていない）・まだない
    assertNull(WebBlockRules.blockedPattern(url, false, r, summary(true, date = "2026-10-16"), day, true))
    assertNull(WebBlockRules.blockedPattern(url, false, r, null, day, true))
  }

  @Test
  fun 止めない_ログアウト後_登録なし_入力中_当たらないアドレス() {
    val r = rule(listOf("youtube.com/shorts"))
    val reached = summary(true)
    assertNull(WebBlockRules.blockedPattern("youtube.com/shorts/a", false, r, reached, day, false))
    assertNull(WebBlockRules.blockedPattern("youtube.com/shorts/a", false, rule(emptyList()), reached, day, true))
    assertNull(WebBlockRules.blockedPattern("youtube.com/shorts/a", false, null, reached, day, true))
    assertNull(WebBlockRules.blockedPattern("youtube.com/shorts/a", true, r, reached, day, true))
    assertNull(WebBlockRules.blockedPattern("youtube.com/watch?v=1", false, r, reached, day, true))
    assertNull(WebBlockRules.blockedPattern(null, false, r, reached, day, true))
    assertNull(WebBlockRules.blockedPattern("", false, r, reached, day, true))
  }

  @Test
  fun 画面の中を読む前に止める状態かを確かめる() {
    assertTrue(WebBlockRules.isActive(rule(listOf("tiktok.com")), summary(true), day, true))
    assertFalse(WebBlockRules.isActive(rule(listOf("tiktok.com")), summary(false), day, true))
    assertFalse(WebBlockRules.isActive(rule(emptyList()), summary(true), day, true))
  }

  // ── WebBlockGate ──
  @Test
  fun 戻すのは同じ登録に2秒あけ_案内は60秒あける() {
    val g = WebBlockGate()
    val s = 1_000L
    assertEquals(WebBlockGate.Action(back = true, prompt = true), g.decide("youtube.com", 0))
    // 戻した直後に同じページのアドレスがまた届いても、続けて戻さない（2つ前・ブラウザの外まで戻らないように）
    assertEquals(WebBlockGate.Action(back = false, prompt = false), g.decide("youtube.com", 1 * s))
    // 2 秒たったら戻す。案内は 60 秒たつまで出さない（閉じたあとすぐ開き直したときは戻すだけ）
    assertEquals(WebBlockGate.Action(back = true, prompt = false), g.decide("youtube.com", 3 * s))
    assertEquals(WebBlockGate.Action(back = true, prompt = true), g.decide("youtube.com", 61 * s))
    // 別の登録でも、前の案内から 10 秒は案内を出さない（戻すのはする）
    assertEquals(WebBlockGate.Action(back = true, prompt = false), g.decide("tiktok.com", 65 * s))
    assertEquals(WebBlockGate.Action(back = true, prompt = true), g.decide("tiktok.com", 75 * s))
    // 日付が変わったら忘れる
    g.reset()
    assertEquals(WebBlockGate.Action(back = true, prompt = true), g.decide("tiktok.com", 76 * s))
  }
}
