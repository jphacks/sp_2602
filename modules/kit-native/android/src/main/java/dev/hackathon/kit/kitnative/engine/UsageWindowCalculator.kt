package dev.hackathon.kit.kitnative.engine

// Absolute epoch-millisecond interval [startMs, endMs). D9 wall-clock rules must be expanded
// into instants for the requested Asia/Tokyo day before reaching this pure calculator.
data class UsageTimeRange(val startMs: Long, val endMs: Long)

data class UsageWindowTotals(
  val actualMs: Long,
  val releasedMs: Long,
  val chargeableMs: Long,
) {
  // Round only after summing milliseconds, matching ForegroundTime's existing 0.1-minute unit.
  val actualMinutes: Double get() = ForegroundTime.toMinutes(actualMs)
  val releasedMinutes: Double get() = ForegroundTime.toMinutes(releasedMs)
  val chargeableMinutes: Double get() = ForegroundTime.toMinutes(chargeableMs)
}

/** Computes U, X, and C without changing the existing getDailyUsage aggregation. */
object UsageWindowCalculator {
  fun calculate(
    intervalsByPackage: Map<String, List<ForegroundInterval>>,
    releaseIntervals: List<UsageTimeRange>,
    restrictedPackages: Set<String>,
    windowStartMs: Long,
    windowEndMs: Long,
  ): UsageWindowTotals {
    require(windowEndMs >= windowStartMs) { "windowEndMs must not precede windowStartMs" }

    val releases = mergeWithinWindow(releaseIntervals, windowStartMs, windowEndMs)
    var actualMs = 0L
    var releasedMs = 0L

    for (packageName in restrictedPackages) {
      val usage = mergeWithinWindow(
        intervalsByPackage[packageName].orEmpty().map { UsageTimeRange(it.startMs, it.endMs) },
        windowStartMs,
        windowEndMs,
      )
      actualMs += duration(usage)
      releasedMs += overlapDuration(usage, releases)
    }

    return UsageWindowTotals(
      actualMs = actualMs,
      releasedMs = releasedMs,
      chargeableMs = maxOf(0L, actualMs - releasedMs),
    )
  }

  private fun mergeWithinWindow(
    ranges: List<UsageTimeRange>,
    windowStartMs: Long,
    windowEndMs: Long,
  ): List<UsageTimeRange> {
    val sorted = ranges.mapNotNull { range ->
      val start = maxOf(range.startMs, windowStartMs)
      val end = minOf(range.endMs, windowEndMs)
      if (end > start) UsageTimeRange(start, end) else null
    }.sortedWith(compareBy<UsageTimeRange> { it.startMs }.thenBy { it.endMs })

    val merged = ArrayList<UsageTimeRange>()
    for (range in sorted) {
      val last = merged.lastOrNull()
      if (last == null || range.startMs > last.endMs) {
        merged.add(range)
      } else if (range.endMs > last.endMs) {
        merged[merged.lastIndex] = UsageTimeRange(last.startMs, range.endMs)
      }
    }
    return merged
  }

  private fun duration(ranges: List<UsageTimeRange>): Long = ranges.sumOf { it.endMs - it.startMs }

  private fun overlapDuration(usage: List<UsageTimeRange>, releases: List<UsageTimeRange>): Long {
    var usageIndex = 0
    var releaseIndex = 0
    var total = 0L
    while (usageIndex < usage.size && releaseIndex < releases.size) {
      val appRange = usage[usageIndex]
      val releaseRange = releases[releaseIndex]
      total += maxOf(0L, minOf(appRange.endMs, releaseRange.endMs) - maxOf(appRange.startMs, releaseRange.startMs))
      if (appRange.endMs <= releaseRange.endMs) usageIndex++ else releaseIndex++
    }
    return total
  }
}
