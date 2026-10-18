package dev.hackathon.kit.kitnative.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// engine/ の純粋な関数のテスト（Android の端末なしで JVM で動く）。
//   cd android && ./gradlew :kit-native:testDebugUnitTest
// 確かめること: 日本時間 0:00 の区切り（Q3）・前面時間の数え方（C2）・到達の判定が JS の C3（usage-calc.ts）と同じ規則か（C4）・
//   ホーム画面に出るアプリの一覧の整え方とアイコンの大きさの決め方（Q15。LauncherAppList・AppIconCodec）
class EngineRulesTest {
  private val min = 60_000L

  // ── DayWindow ──
  @Test
  fun 日本時間の0時が日の区切り() {
    // 2026-10-17 00:00 JST = 2026-10-16 15:00 UTC
    val start = DayWindow.startOf("2026-10-17")
    assertEquals(1792162800000L, start) // contracts/dates.ts と同じ値（Date.parse("2026-10-16T15:00:00Z")）
    assertEquals("2026-10-17", DayWindow.dateOf(start))
    assertEquals("2026-10-16", DayWindow.dateOf(start - 1))
    assertEquals(start + DayWindow.DAY_MS, DayWindow.endOf("2026-10-17"))
    assertEquals("2026-11-01", DayWindow.addDays("2026-10-31", 1))
    assertEquals("2028-02-29", DayWindow.addDays("2028-02-28", 1)) // うるう年
    assertEquals("2026-01-01", DayWindow.addDays("2025-12-31", 1))
  }

  @Test
  fun 日付の形を確かめる() {
    assertTrue(DayWindow.isDate("2026-10-17"))
    assertFalse(DayWindow.isDate("2026-02-30"))
    assertFalse(DayWindow.isDate("2026-13-01"))
    assertFalse(DayWindow.isDate("2026-1-1"))
  }

  // ── ForegroundTime ──
  private fun ev(pkg: String, cls: String, kind: FgKind, t: Long) = FgEvent(pkg, cls, kind, t)

  @Test
  fun 前面に来てから離れるまでを数える() {
    val r =
      ForegroundTime.compute(
        listOf(
          ev("a", "A1", FgKind.RESUMED, 0),
          ev("a", "A1", FgKind.PAUSED, 10 * min),
          ev("b", "B1", FgKind.RESUMED, 10 * min),
          ev("b", "B1", FgKind.PAUSED, 15 * min),
        ),
        0,
        60 * min,
      )
    assertEquals(10 * min, r.msByPackage["a"])
    assertEquals(5 * min, r.msByPackage["b"])
    assertNull(r.foregroundAtEnd)
  }

  @Test
  fun 同じアプリの中で画面を移っても止まらない() {
    // 新しい画面の RESUMED のあとに、古い画面の STOPPED が来る
    val r =
      ForegroundTime.compute(
        listOf(
          ev("a", "A1", FgKind.RESUMED, 0),
          ev("a", "A1", FgKind.PAUSED, 5 * min),
          ev("a", "A2", FgKind.RESUMED, 5 * min),
          ev("a", "A1", FgKind.STOPPED, 5 * min + 500),
        ),
        0,
        20 * min,
      )
    assertEquals(20 * min, r.msByPackage["a"])
    assertEquals("a", r.foregroundAtEnd) // まだ前面にいる（C4 で使う）
  }

  @Test
  fun 日をまたいだ分は0時から数える() {
    val start = DayWindow.startOf("2026-10-17")
    val r =
      ForegroundTime.compute(
        listOf(ev("a", "A1", FgKind.RESUMED, start - 30 * min), ev("a", "A1", FgKind.PAUSED, start + 10 * min)),
        start,
        start + 60 * min,
      )
    assertEquals(10 * min, r.msByPackage["a"])
  }

  @Test
  fun 画面が消えたら閉じる_離れたイベントがなくても別のアプリが来たら閉じる() {
    val r =
      ForegroundTime.compute(
        listOf(
          ev("a", "A1", FgKind.RESUMED, 0),
          ev("", "", FgKind.SCREEN_OFF, 3 * min),
          ev("b", "B1", FgKind.RESUMED, 10 * min),
          ev("launcher", "L", FgKind.RESUMED, 12 * min), // b の PAUSED を取りこぼした
        ),
        0,
        30 * min,
      )
    assertEquals(3 * min, r.msByPackage["a"])
    assertEquals(2 * min, r.msByPackage["b"])
    assertEquals("launcher", r.foregroundAtEnd)
  }

  @Test
  fun 分は0_1分の単位() {
    assertEquals(1.5, ForegroundTime.toMinutes(90_000L), 1e-9)
    assertEquals(0.0, ForegroundTime.toMinutes(2_000L), 1e-9)
  }

  // ── LimitRules（JS の calcUsage と同じ規則）──
  private fun rule(limit: DayLimit, upcoming: Map<String, DayLimit> = emptyMap()) =
    Restriction(
      date = "2026-10-17",
      limit = limit,
      excludedPackages = setOf("study"),
      essentialPackages = setOf("phone"),
      learningPackages = listOf("study"),
      configVersion = 1,
      upcoming = upcoming,
      savedAt = 0,
    )

  @Test
  fun 対象外アプリと必須例外を除いて足す() {
    val r = rule(DayLimit.Limited(60.0))
    assertEquals(30.3, LimitRules.restrictedMinutes(mapOf("game" to 30.1, "video" to 0.2, "study" to 50.0, "phone" to 9.0), r), 1e-9)
  }

  @Test
  fun 到達の判定と表示の割合() {
    // 46%
    assertEquals(Judgement(27.6, 46, false), LimitRules.judge(27.6, DayLimit.Limited(60.0)))
    // 99.5% 以上でも、届いていなければ 99
    assertEquals(99, LimitRules.judge(59.9, DayLimit.Limited(60.0)).usedPercent)
    // 使用 ≥ 上限 で到達・100
    assertEquals(Judgement(60.0, 100, true), LimitRules.judge(60.0, DayLimit.Limited(60.0)))
    // 上限 0 分は使っていなくても到達
    assertEquals(Judgement(0.0, 100, true), LimitRules.judge(0.0, DayLimit.Limited(0.0)))
    // 制限なし・未設定・ルールなし・上限が負 は、割合を出さず到達しない
    assertEquals(Judgement(500.0, null, false), LimitRules.judge(500.0, DayLimit.Unlimited))
    assertEquals(Judgement(500.0, null, false), LimitRules.judge(500.0, DayLimit.Unset))
    assertEquals(Judgement(500.0, null, false), LimitRules.judge(500.0, null))
    assertEquals(Judgement(5.0, null, false), LimitRules.judge(5.0, DayLimit.Limited(-1.0)))
  }

  @Test
  fun その日の上限_先の日は一覧から_分からない日はnull() {
    val r = rule(DayLimit.Limited(60.0), mapOf("2026-10-18" to DayLimit.Unlimited))
    assertEquals(DayLimit.Limited(60.0), r.limitOn("2026-10-17"))
    assertEquals(DayLimit.Unlimited, r.limitOn("2026-10-18"))
    assertNull(r.limitOn("2026-10-19"))
    assertNull(r.limitOn("2026-10-16"))
  }

  @Test
  fun 案内を出すのは制限対象のアプリが前面のときだけ() {
    val r = rule(DayLimit.Limited(0.0))
    val ignored = setOf("launcher", "self")
    assertTrue(LimitRules.shouldPrompt("game", r, "self", ignored))
    assertFalse(LimitRules.shouldPrompt("self", r, "self", ignored))
    assertFalse(LimitRules.shouldPrompt("launcher", r, "self", ignored))
    assertFalse(LimitRules.shouldPrompt("study", r, "self", ignored)) // 対象外
    assertFalse(LimitRules.shouldPrompt("phone", r, "self", ignored)) // 必須例外
    assertFalse(LimitRules.shouldPrompt(null, r, "self", ignored))
    // 設定アプリは案内を出さない（使用時間には数える）
    assertFalse(LimitRules.shouldPrompt("com.android.settings", r, "self", ignored))
  }

  @Test
  fun 同じアプリには間をあけて出す() {
    val t = PromptThrottle(samePackageGapMs = 60_000, anyGapMs = 10_000)
    assertTrue(t.allow("game", 0))
    t.record("game", 0)
    assertFalse(t.allow("video", 5_000)) // 前の案内から 10 秒たっていない
    assertTrue(t.allow("video", 10_000))
    assertFalse(t.allow("game", 59_999))
    assertTrue(t.allow("game", 60_000))
  }

  @Test
  fun 既定の間隔は_同じアプリ10秒_どのアプリでも3秒() {
    // 「閉じる」のあと同じアプリを開き直しても、10 秒で案内が戻る（前の既定 60 秒では 1 分近く使えた。D-112）
    val t = PromptThrottle()
    t.record("game", 0)
    assertFalse(t.allow("video", 2_999))
    assertTrue(t.allow("video", 3_000))
    assertFalse(t.allow("game", 9_999))
    assertTrue(t.allow("game", 10_000))
  }

  @Test
  fun まとめ_権限がなければ0分にしない() {
    val r = rule(DayLimit.Limited(60.0))
    val s = LimitRules.summarize("2026-10-17", DailyUsage.PermissionDenied, r, 1L)
    assertEquals("permission_denied", s.status)
    assertNull(s.restrictedMinutes)
    assertNull(s.usedPercent)
    assertFalse(s.reached)
    val ok =
      LimitRules.summarize(
        "2026-10-17",
        DailyUsage.Ok("2026-10-17", emptyList(), mapOf("game" to 61.0), "game", 1L),
        r,
        1L,
      )
    assertEquals(100, ok.usedPercent)
    assertTrue(ok.reached)
  }

  // ── LauncherAppList（Q15）──
  @Test
  fun アプリ一覧_同じアプリは1つにまとめSlope自身を除きpackageNameの順() {
    val raw =
      listOf(
        LauncherApp("com.example.video", "動画"),
        LauncherApp("dev.hackathon.slope", "Slope"),
        LauncherApp("com.example.camera", "カメラ"),
        LauncherApp("com.example.video", "動画（別の入口）"), // 入口が2つあるアプリ
        LauncherApp("", "名前だけ"),
        LauncherApp("  com.example.app  ", " アプリ "),
      )
    val apps = LauncherAppList.normalize(raw, "dev.hackathon.slope")
    assertEquals(
      listOf(
        LauncherApp("com.example.app", "アプリ"),
        LauncherApp("com.example.camera", "カメラ"),
        LauncherApp("com.example.video", "動画"), // 先に見えた方の名前
      ),
      apps,
    )
  }

  @Test
  fun アプリ一覧_OSが返す順が違っても同じ一覧になる() {
    val a = listOf(LauncherApp("b.app", "B"), LauncherApp("a.app", "A"), LauncherApp("c.app", "C"))
    assertEquals(LauncherAppList.normalize(a, "self"), LauncherAppList.normalize(a.reversed(), "self"))
  }

  @Test
  fun アプリ一覧_名前は空ならpackageName_長すぎれば120文字で切る() {
    assertEquals("com.example.blank", LauncherAppList.cleanLabel("   ", "com.example.blank"))
    val long = "あ".repeat(130)
    assertEquals(LauncherAppList.MAX_LABEL, LauncherAppList.cleanLabel(long, "x").length)
    // 120 文字目が絵文字（サロゲートペア）の前半なら、その手前で切る（半分だけの文字を送らない）
    val emoji = "a".repeat(LauncherAppList.MAX_LABEL - 1) + "😀" + "b"
    val cut = LauncherAppList.cleanLabel(emoji, "x")
    assertEquals(LauncherAppList.MAX_LABEL - 1, cut.length)
    assertFalse(Character.isHighSurrogate(cut.last()))
  }

  @Test
  fun アプリ一覧_まとめてもアイコンは残す() {
    val apps =
      LauncherAppList.normalize(
        listOf(LauncherApp(" com.example.a ", "A", iconPng = "iVBORw0KGgo=", iconHash = "ab")),
        "self",
      )
    assertEquals(LauncherApp("com.example.a", "A", "iVBORw0KGgo=", "ab"), apps.single())
  }

  // ── AppIconCodec（Q15）──
  @Test
  fun アイコン_収まる大きさまで小さくする_どれも収まらなければnull() {
    val tried = ArrayList<Int>()
    // 一辺 × 100 バイトになる仮の PNG（96px は 9600 バイト）
    val encode = { size: Int -> tried.add(size); ByteArray(size * 100) }
    assertEquals(9600, AppIconCodec.pick(intArrayOf(96, 72, 48), 20_000, encode)?.size)
    assertEquals(listOf(96), tried)
    tried.clear()
    assertEquals(4800, AppIconCodec.pick(intArrayOf(96, 72, 48), 5_000, encode)?.size)
    assertEquals(listOf(96, 72, 48), tried)
    assertNull(AppIconCodec.pick(intArrayOf(96, 72, 48), 100, encode))
    // 作れなかった大きさは飛ばす・空は使わない
    assertNull(AppIconCodec.pick(intArrayOf(96), 20_000) { null })
    assertNull(AppIconCodec.pick(intArrayOf(96), 20_000) { ByteArray(0) })
  }

  @Test
  fun アイコン_ハッシュはSHA256の16進小文字() {
    // "abc" の SHA-256（サーバの node:crypto と同じ値になること）
    assertEquals(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      AppIconCodec.sha256Hex("abc".toByteArray(Charsets.UTF_8)),
    )
  }

  // ── 封を開けた合言葉のメモリの置き場（EngineStore。見張りのたびに Keystore で開けない）──
  @Test
  fun 開けた合言葉は同じ封の間はメモリから返し_封が変わったら開け直す() {
    val cache = OpenedSecretCache()
    var opens = 0
    val open = { s: String -> opens++; if (s.startsWith("sb1:")) s.removePrefix("sb1:") else null }
    assertEquals("t1", cache.get("sb1:t1", open))
    assertEquals("t1", cache.get("sb1:t1", open))
    assertEquals("t1", cache.get("sb1:t1", open))
    assertEquals(1, opens) // 2回目からは開けない
    // 置いてある封が変わった（JS が新しい合言葉を渡した）ら開け直して入れ替える
    assertEquals("t2", cache.get("sb1:t2", open))
    assertEquals(2, opens)
    // 開けられない封は持たない（次にまた試す）。前の合言葉も返さない
    assertNull(cache.get("broken", open))
    assertNull(cache.get("broken", open))
    assertEquals(4, opens)
  }

  @Test
  fun 入れ替えと消すで前の合言葉を返さない() {
    val cache = OpenedSecretCache()
    var opens = 0
    val open = { s: String -> opens++; s.removePrefix("sb1:") }
    cache.put("sb1:new", "new") // saveReporter: 封をした値と組で入れ替える
    assertEquals("new", cache.get("sb1:new", open))
    assertEquals(0, opens)
    cache.clear() // clearReporter・clear・ifReporterToken のあと
    assertEquals("new", cache.get("sb1:new", open))
    assertEquals(1, opens) // 消したあとは開け直す
    assertFalse(cache.get("sb1:other", open) == "new")
  }
}
