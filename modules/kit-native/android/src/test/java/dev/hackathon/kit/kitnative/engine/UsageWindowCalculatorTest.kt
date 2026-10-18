package dev.hackathon.kit.kitnative.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UsageWindowCalculatorTest {
  private val minute = 60_000L
  private val date = "2026-10-18"
  private val dayStart = DayWindow.startOf(date)

  private fun at(hour: Int, minuteOfHour: Int = 0): Long =
    dayStart + hour * 60 * minute + minuteOfHour * minute

  private fun event(packageName: String, activity: String, kind: FgKind, timeMs: Long) =
    FgEvent(packageName, activity, kind, timeMs)

  private fun calculate(
    events: List<FgEvent>,
    releases: List<UsageTimeRange>,
    restricted: Set<String> = setOf("game"),
    start: Long = dayStart,
    end: Long = DayWindow.endOf(date),
  ): Pair<ForegroundResult, UsageWindowTotals> {
    val foreground = ForegroundTime.compute(events, start, end)
    val totals = UsageWindowCalculator.calculate(foreground.intervalsByPackage, releases, restricted, start, end)
    return foreground to totals
  }

  @Test
  fun 例の利用時間と解除時間からU_X_Cを計算する() {
    val (foreground, totals) = calculate(
      listOf(
        event("game", "Main", FgKind.RESUMED, at(8, 30)),
        event("game", "Main", FgKind.PAUSED, at(10, 30)),
      ),
      listOf(UsageTimeRange(at(9), at(11))),
    )

    assertEquals(listOf(ForegroundInterval(at(8, 30), at(10, 30))), foreground.intervalsByPackage["game"])
    assertEquals(120 * minute, totals.actualMs)
    assertEquals(90 * minute, totals.releasedMs)
    assertEquals(30 * minute, totals.chargeableMs)
    assertEquals(120.0, totals.actualMinutes, 0.0)
    assertEquals(90.0, totals.releasedMinutes, 0.0)
    assertEquals(30.0, totals.chargeableMinutes, 0.0)
  }

  @Test
  fun 解除時間帯がないときはXが0でCはU() {
    val (_, totals) = calculate(
      listOf(event("game", "Main", FgKind.RESUMED, at(8)), event("game", "Main", FgKind.PAUSED, at(9))),
      emptyList(),
    )
    assertEquals(60 * minute, totals.actualMs)
    assertEquals(0L, totals.releasedMs)
    assertEquals(totals.actualMs, totals.chargeableMs)
  }

  @Test
  fun 重ならない解除時間帯ではXが0() {
    val (_, totals) = calculate(
      listOf(event("game", "Main", FgKind.RESUMED, at(8)), event("game", "Main", FgKind.PAUSED, at(9))),
      listOf(UsageTimeRange(at(10), at(11))),
    )
    assertEquals(0L, totals.releasedMs)
    assertEquals(totals.actualMs, totals.chargeableMs)
  }

  @Test
  fun 利用時間全体が解除時間帯に含まれるとCは0() {
    val (_, totals) = calculate(
      listOf(event("game", "Main", FgKind.RESUMED, at(9)), event("game", "Main", FgKind.PAUSED, at(10))),
      listOf(UsageTimeRange(at(8), at(11))),
    )
    assertEquals(totals.actualMs, totals.releasedMs)
    assertEquals(0L, totals.chargeableMs)
  }

  @Test
  fun 重複する解除時間帯は結合して二重計上しない() {
    val (_, totals) = calculate(
      listOf(event("game", "Main", FgKind.RESUMED, at(8)), event("game", "Main", FgKind.PAUSED, at(12))),
      listOf(UsageTimeRange(at(9), at(10)), UsageTimeRange(at(9, 30), at(11))),
    )
    assertEquals(4 * 60 * minute, totals.actualMs)
    assertEquals(2 * 60 * minute, totals.releasedMs)
    assertEquals(2 * 60 * minute, totals.chargeableMs)
  }

  @Test
  fun JSTの日付窓と日をまたぐ利用解除を切り詰める() {
    val start = DayWindow.startOf(date)
    val foreground = ForegroundTime.compute(
      listOf(
        event("game", "Main", FgKind.RESUMED, start - 30 * minute),
        event("game", "Main", FgKind.PAUSED, start + 30 * minute),
      ),
      start,
      start + DayWindow.DAY_MS,
    )
    val totals = UsageWindowCalculator.calculate(
      foreground.intervalsByPackage,
      listOf(UsageTimeRange(start - 15 * minute, start + 15 * minute)),
      setOf("game"),
      start,
      start + DayWindow.DAY_MS,
    )
    assertEquals(listOf(ForegroundInterval(start, start + 30 * minute)), foreground.intervalsByPackage["game"])
    assertEquals(30 * minute, totals.actualMs)
    assertEquals(15 * minute, totals.releasedMs)
    assertEquals(15 * minute, totals.chargeableMs)
    assertEquals(date, DayWindow.dateOf(start))
    assertEquals("2026-10-17", DayWindow.dateOf(start - 1))
  }

  @Test
  fun アプリ切替と画面OFFで区間を閉じ利用時間のUと一致する() {
    val (foreground, totals) = calculate(
      listOf(
        event("game", "Main", FgKind.RESUMED, at(8)),
        event("game", "Main", FgKind.PAUSED, at(9)),
        event("video", "Player", FgKind.RESUMED, at(9)),
        event("video", "Player", FgKind.STOPPED, at(10)),
        event("game", "Main", FgKind.RESUMED, at(11)),
        event("", "", FgKind.SCREEN_OFF, at(11, 30)),
      ),
      listOf(UsageTimeRange(at(8, 30), at(9, 30))),
      restricted = setOf("game", "video"),
      end = at(12),
    )

    assertEquals(listOf(ForegroundInterval(at(8), at(9)), ForegroundInterval(at(11), at(11, 30))), foreground.intervalsByPackage["game"])
    assertEquals(listOf(ForegroundInterval(at(9), at(10))), foreground.intervalsByPackage["video"])
    assertEquals(foreground.msByPackage.values.sum(), totals.actualMs)
    assertEquals(150 * minute, totals.actualMs)
    assertEquals(60 * minute, totals.releasedMs)
    assertEquals(90 * minute, totals.chargeableMs)
  }

  @Test
  fun UsageStatsイベントの終了値を公式値へ対応づける() {
    assertEquals(FgKind.SHUTDOWN, FgKind.fromUsageEventType(17))
    assertNull(FgKind.fromUsageEventType(26))
    assertEquals(FgKind.SCREEN_OFF, FgKind.fromUsageEventType(16))
    assertEquals(FgKind.STOPPED, FgKind.fromUsageEventType(23))
  }

  @Test
  fun 終了イベント欠損は次アプリのRESUMEDまで前面と推定される() {
    // PAUSED/STOPPED を失い、後続イベントも無いと実際に閉じた時刻は分からない。
    val (foreground, totals) = calculate(
      listOf(event("game", "Main", FgKind.RESUMED, at(8))),
      emptyList(),
      end = at(10),
    )
    assertEquals(2 * 60 * minute, foreground.msByPackage["game"])
    assertEquals(foreground.msByPackage.values.sum(), totals.actualMs)
  }

  @Test
  fun 既存の日別合計とミリ秒Uは一致し_分換算差は丸め単位で説明できる() {
    val (foreground, totals) = calculate(
      listOf(
        event("game", "Main", FgKind.RESUMED, at(8)),
        event("game", "Main", FgKind.PAUSED, at(8) + 20_000L),
        event("video", "Main", FgKind.RESUMED, at(9)),
        event("video", "Main", FgKind.PAUSED, at(9) + 20_000L),
      ),
      emptyList(),
      restricted = setOf("game", "video"),
      end = at(10),
    )

    val legacyPerAppMinutes = foreground.msByPackage.values.sumOf { ForegroundTime.toMinutes(it) }
    assertEquals(40_000L, totals.actualMs)
    assertEquals(0.6, legacyPerAppMinutes, 1e-9)
    assertEquals(0.7, totals.actualMinutes, 1e-9)
  }

  @Test
  fun 制限対象外パッケージをUに含めない() {
    val foreground = ForegroundTime.compute(
      listOf(
        event("game", "Main", FgKind.RESUMED, at(8)),
        event("game", "Main", FgKind.PAUSED, at(9)),
        event("study", "Main", FgKind.RESUMED, at(9)),
        event("study", "Main", FgKind.PAUSED, at(10)),
      ),
      dayStart,
      DayWindow.endOf(date),
    )
    val totals = UsageWindowCalculator.calculate(
      foreground.intervalsByPackage,
      listOf(UsageTimeRange(at(9), at(10))),
      setOf("game"),
      dayStart,
      DayWindow.endOf(date),
    )
    assertEquals(60 * minute, totals.actualMs)
    assertEquals(0L, totals.releasedMs)
    assertEquals(60 * minute, totals.chargeableMs)
  }
}
