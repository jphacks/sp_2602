package dev.hackathon.kit.kitnative.widget

import android.app.AppOpsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import dev.hackathon.kit.kitnative.engine.DayLimit
import dev.hackathon.kit.kitnative.engine.DayWindow
import dev.hackathon.kit.kitnative.engine.EngineStore
import dev.hackathon.kit.kitnative.engine.TodaySummary
import org.json.JSONArray
import org.json.JSONObject

// ── 子どものウィジェット（C5・Figma 子12）が表示するデータを「読む側」 ─────────────────
//
// 何のための部品か:
//   ホーム画面のウィジェットは、Slope の画面（React Native）が動いていないときにも OS（ランチャー）から描き直しを頼まれる。
//   そのとき JS の値（C3 の計算結果など）は使えないので、端末に保存された値を Kotlin で読んで、ここで表示の形に直す。
//
// なぜこの形か（Android の制約）:
//   - ウィジェットは別のアプリ（ランチャー）の中に RemoteViews で描かれ、こちらの処理は「描き直しを頼まれた一瞬」しか動かない。
//     そのため、読む値はすべて端末の保存（SharedPreferences）に置いておく必要がある。読むのは readWidgetSnapshot() の1か所だけ。
//   - 今日の使用量・上限・使った割合は、K-A の監視（C2・C4）が保存する "slope_engine" の "today_usage" を
//     EngineStore.loadToday() で読む（engine/EngineStore.kt の「共有の約束」）。割合は K-A が C3 と同じ規則（LimitRules.judge）で
//     出した usedPercent をそのまま使い、ここでは計算し直さない。
//   - テストの日程は K-A の保存に無いので、ウィジェット用の "slope.widget" に置く（WidgetKeys・WidgetStore.saveTests）。
//     書くのは JS の窓口 saveRestriction（KitNativeModule.kt）。
//   - 保護者の端末（Figma 親08）の「初日からの減り」は JS の saveParentWidget が "slope.widget" に置く（WidgetKeys.PARENT_DAYS）。
//   - 「取れない値を 0 にしない」（docs/architecture.md 4章）: データが無い・権限が無い・制限なし・上限未設定は、
//     0% ではなくそれぞれの文を出す。
//   - 日付は K-A の DayWindow（日本時間・0時区切り。contracts/dates.ts の todayString と同じ）。

// ウィジェットだけが持つ保存（テストの日程）の場所とキー
object WidgetKeys {
  const val PREFS = "slope.widget" // SharedPreferences のファイル名

  // String。JSON の配列 [{"name":"数学","startDate":"2026-10-28","endDate":"2026-10-30"}, …]（C7 の設定の testPeriods）
  // 次のテストは描くたびにここから選ぶ（日がたっても、アプリを開かずに「あと◯日」が正しく減るように）
  const val TEST_PERIODS = "tests.periods"
  const val TESTS_KNOWN = "tests.known" // Boolean。設定を一度でも取れたか（false = テストがあるか分からない。「予定なし」と言わない）

  // String。この端末でログインしている人の役割 "child" / "parent"（無い = ログアウト中・まだ分からない → 子どもの形で「まだ分かりません」）。
  // ウィジェットは1つ（SlopeWidget）で、役割に合わせて子12（今日の残り）か親08（初日からの減り）の形で描く。
  // 書くのは JS の窓口: saveRestriction（子ども）・saveParentWidget（保護者）。clearLocalData で消える
  const val ROLE = "role"

  // String。保護者のウィジェット（親08）の左「初日から」の、今日から先の日ごとの値（contracts/native.ts の NativeParentWidget.days）
  // [{"date":"2026-10-15","reduction":{"kind":"ok","reducedMinutes":40,"fromLimit":300,"toLimit":260}}, …]
  // {"kind":"message","title":"…","body":"…"} は数字を出せない日の文
  const val PARENT_DAYS = "parent.days"
}

object WidgetRole {
  const val CHILD = "child"
  const val PARENT = "parent"
}

// 1つのテスト期間（contracts/schemas.ts の testPeriods の一部）
data class WidgetTest(val name: String, val startDate: String, val endDate: String)

// 保存から読んだ値
data class WidgetSnapshot(
  val today: String, // 今日（日本時間）"YYYY-MM-DD"
  val usageAccessGranted: Boolean, // 使用状況へのアクセスが今許可されているか（OS に直接聞く）
  val todayUsage: TodaySummary?, // K-A の "today_usage"。無い・壊れている = null
  val testsKnown: Boolean,
  val tests: List<WidgetTest>,
  val role: String? = null, // WidgetRole.CHILD / PARENT。null = 分からない（子どもの形で描く）
  val parentDays: List<ParentDay>? = null, // 保護者の日ごとの減り。null = まだ保存されていない
)

// 保護者のウィジェットの、ある日の「初日から」（contracts/native.ts の NativeParentReduction）
sealed class ParentReduction {
  data class Ok(val reducedMinutes: Double, val fromLimit: Double, val toLimit: Double) : ParentReduction()
  data class Message(val title: String, val body: String) : ParentReduction()
}

data class ParentDay(val date: String, val reduction: ParentReduction)

// 読む側の関数（ここ1か所だけ）。保存の形が変わったら、この中身だけを直す
fun readWidgetSnapshot(context: Context, nowMillis: Long = System.currentTimeMillis()): WidgetSnapshot {
  val p = context.getSharedPreferences(WidgetKeys.PREFS, Context.MODE_PRIVATE)
  return WidgetSnapshot(
    today = DayWindow.dateOf(nowMillis),
    usageAccessGranted = hasUsageAccess(context),
    todayUsage = EngineStore.loadToday(context),
    testsKnown = p.getBoolean(WidgetKeys.TESTS_KNOWN, false),
    tests = parseTests(p.getString(WidgetKeys.TEST_PERIODS, null)),
    role = p.getString(WidgetKeys.ROLE, null),
    parentDays = p.getString(WidgetKeys.PARENT_DAYS, null)?.let { parseParentDays(it) },
  )
}

// 書く側の補助（テストの日程）。JS の窓口から呼ぶ想定。書いたあとに SlopeWidget.requestUpdate(context) で描き直す
object WidgetStore {
  private fun prefs(context: Context) = context.getSharedPreferences(WidgetKeys.PREFS, Context.MODE_PRIVATE)

  // テストの日程（C7 の設定の testPeriods。0件なら空の一覧を渡す = 「予定なし」）
  fun saveTests(context: Context, tests: List<WidgetTest>) {
    val arr = JSONArray()
    for (t in tests) arr.put(JSONObject().put("name", t.name).put("startDate", t.startDate).put("endDate", t.endDate))
    prefs(context).edit()
      .putString(WidgetKeys.TEST_PERIODS, arr.toString())
      .putBoolean(WidgetKeys.TESTS_KNOWN, true)
      .apply()
  }

  // 子どもの端末として描く（JS の saveRestriction のとき）
  fun markChild(context: Context) {
    prefs(context).edit().putString(WidgetKeys.ROLE, WidgetRole.CHILD).apply()
  }

  // 保護者のウィジェットの値（JS の saveParentWidget）。days は NativeParentWidget.days の JSON 配列そのまま。
  // 役割を保護者にして、テストの日程も子どもと同じ場所に置く（右「テストまで」は同じ決め方で選ぶ）
  fun saveParent(context: Context, days: JSONArray, tests: List<WidgetTest>) {
    val arr = JSONArray()
    for (t in tests) arr.put(JSONObject().put("name", t.name).put("startDate", t.startDate).put("endDate", t.endDate))
    prefs(context).edit()
      .putString(WidgetKeys.ROLE, WidgetRole.PARENT)
      .putString(WidgetKeys.PARENT_DAYS, days.toString())
      .putString(WidgetKeys.TEST_PERIODS, arr.toString())
      .putBoolean(WidgetKeys.TESTS_KNOWN, true)
      .apply()
  }

  // ログアウトしたときに消す（前の人の日程を次の人のウィジェットに出さない。src/lib/sign-out.ts と同じ考え）
  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
  }

  // 保護者として使ったときの値だけを消す（監視が動いている端末でログアウトしたとき。LocalData.clearParent）。
  // ウィジェットが保護者の形なら全部消す（テストの日程も保護者の画面から入れたもの。子どもの値は次の saveRestriction で入れ直す）。
  // 子どもの形なら、保護者の日ごとの減りだけを消す（子どものテストの日程は残す）
  fun clearParent(context: Context) {
    val p = prefs(context)
    if (p.getString(WidgetKeys.ROLE, null) == WidgetRole.PARENT) p.edit().clear().apply()
    else p.edit().remove(WidgetKeys.PARENT_DAYS).apply()
  }
}

// ── 表示の形（ここで判断し、SlopeWidget は描くだけ）────────────────────────────

sealed class UsageCardView {
  // 「54 % 残り」とバー。TODO(未決): Q18 割合の向き。Figma 子12 どおり「残り」を出している（アプリの中は「使いました」）。
  // B（使った割合にそろえる）に決まったら、ここを usedPercent のまま渡し、文言（res/values/slope_widget_strings.xml）を
  // 「今日の使用量」「% 使用」に変える
  data class Percent(val remainingPercent: Int) : UsageCardView()

  // 数字の代わりに出す文（0% と出さない）
  data class Message(val title: String, val body: String) : UsageCardView()
}

sealed class TestCardView {
  data class Days(val days: Long) : TestCardView() // 「あと 13 日」
  data class Message(val title: String, val body: String) : TestCardView()
}

val UNKNOWN_USAGE = UsageCardView.Message("まだ分かりません", "Slope を開くと出ます")
val UNKNOWN_TEST = TestCardView.Message("--", "Slope を開くと出ます")
private val NEED_PERMISSION = UsageCardView.Message("アクセスを許可してください", "押すと Slope が開きます")

fun usageCardView(s: WidgetSnapshot): UsageCardView {
  // 権限は OS に直接聞く（保存が古くても、今の状態を出す）
  if (!s.usageAccessGranted) return NEED_PERMISSION
  // 今日の値がまだ無い（アプリを一度も開いていない・監視が今日まだ測っていない）。0% と言わない
  val u = s.todayUsage
  if (u == null || u.date != s.today) return UNKNOWN_USAGE
  when (u.status) {
    "ok" -> {}
    "permission_denied" -> return NEED_PERMISSION
    else -> return UsageCardView.Message("取得できませんでした", "Slope を開いてください")
  }
  return when (u.limit) {
    null -> UNKNOWN_USAGE // その日のルールが無い（設定をまだ取り込んでいない）
    DayLimit.Unlimited -> UsageCardView.Message("今日は制限なし", "上限はありません")
    DayLimit.Unset -> UsageCardView.Message("まだ決まっていません", "おうちの人が決めると出ます")
    is DayLimit.Limited -> {
      // usedPercent は K-A が C3 と同じ規則で出した値（0 分は到達で 100・到達していなければ最大 99）。上限が負だと null
      val used = u.usedPercent ?: return UsageCardView.Message("設定が正しくありません", "おうちの人に確かめてもらってください")
      UsageCardView.Percent((100 - used).coerceIn(0, 100)) // 残り = max(0, 100 − 使った表示)（MVP_SPEC 4.2）
    }
  }
}

// 保護者の左「初日から」: 「40 分 減」「上限 300→260分」。増えた日は「分 増」
sealed class ReductionCardView {
  data class Minutes(val minutes: String, val increased: Boolean, val fromLimit: String, val toLimit: String) : ReductionCardView()
  data class Message(val title: String, val body: String) : ReductionCardView()
}

val UNKNOWN_REDUCTION = ReductionCardView.Message("まだ分かりません", "Slope を開くと出ます")

// 今日の分を選ぶ。保存が無い・今日の分が無い（保護者が長く Slope を開いていない）なら「まだ分かりません」（0 分減と言わない）
fun reductionCardView(s: WidgetSnapshot): ReductionCardView {
  val day = s.parentDays?.firstOrNull { it.date == s.today } ?: return UNKNOWN_REDUCTION
  return when (val r = day.reduction) {
    is ParentReduction.Message -> ReductionCardView.Message(r.title, r.body)
    is ParentReduction.Ok -> ReductionCardView.Minutes(
      minutes = minutesText(Math.abs(r.reducedMinutes)),
      increased = r.reducedMinutes < 0,
      fromLimit = minutesText(r.fromLimit),
      toLimit = minutesText(r.toLimit),
    )
  }
}

// 分の表示（整数ならそのまま、端数があれば小数1桁）
fun minutesText(m: Double): String =
  if (m == Math.floor(m) && !m.isInfinite()) m.toLong().toString() else String.format(java.util.Locale.ROOT, "%.1f", m)

// 次のテスト: 終わっていない（終了日 ≥ 今日）もので、いちばん早く始まるもの。期間中は日数を数えない（child-view.ts の nextTestView と同じ）
fun testCardView(s: WidgetSnapshot): TestCardView {
  if (!s.testsKnown) return UNKNOWN_TEST
  val next = s.tests
    .filter { DayWindow.isDate(it.startDate) && DayWindow.isDate(it.endDate) && it.endDate >= s.today }
    .minByOrNull { it.startDate } // "YYYY-MM-DD" は文字の順 = 日付の順
    ?: return TestCardView.Message("予定なし", "テストの日程はまだありません")
  if (next.startDate <= s.today) return TestCardView.Message("テスト中", next.name)
  return TestCardView.Days((DayWindow.startOf(next.startDate) - DayWindow.startOf(s.today)) / DayWindow.DAY_MS)
}

// ── 小さな道具 ──────────────────────────────────────────────

private fun parseTests(json: String?): List<WidgetTest> {
  if (json == null) return emptyList()
  return try {
    val arr = JSONArray(json)
    (0 until arr.length()).mapNotNull { i ->
      val o = arr.optJSONObject(i) ?: return@mapNotNull null
      val start = o.optString("startDate", "")
      if (start.isEmpty()) return@mapNotNull null
      WidgetTest(o.optString("name", ""), start, o.optString("endDate", "").ifEmpty { start })
    }
  } catch (_: Exception) {
    emptyList() // 壊れていたら「無い」として扱う（src/lib/storage.ts の readJson と同じ考え）
  }
}

// 保護者の日ごとの減り（WidgetKeys.PARENT_DAYS）。壊れた要素は飛ばし、全体が壊れていたら「無い」（null）
private fun parseParentDays(json: String): List<ParentDay>? {
  return try {
    val arr = JSONArray(json)
    (0 until arr.length()).mapNotNull { i ->
      val o = arr.optJSONObject(i) ?: return@mapNotNull null
      val date = o.optString("date", "")
      val r = o.optJSONObject("reduction") ?: return@mapNotNull null
      if (!DayWindow.isDate(date)) return@mapNotNull null
      val reduction = when (r.optString("kind")) {
        "ok" -> {
          val reduced = r.optDouble("reducedMinutes", Double.NaN)
          val from = r.optDouble("fromLimit", Double.NaN)
          val to = r.optDouble("toLimit", Double.NaN)
          if (reduced.isNaN() || from.isNaN() || to.isNaN()) return@mapNotNull null
          ParentReduction.Ok(reduced, from, to)
        }
        "message" -> ParentReduction.Message(r.optString("title", ""), r.optString("body", ""))
        else -> return@mapNotNull null
      }
      ParentDay(date, reduction)
    }
  } catch (_: Exception) {
    null
  }
}

// 使用状況へのアクセス（UsageStatsManager）が許可されているか
private fun hasUsageAccess(context: Context): Boolean {
  val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
  @Suppress("DEPRECATION")
  val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
  } else {
    ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
  }
  // MODE_DEFAULT は「権限の付与で決める」の意味（端末によってはこちらになる）
  if (mode == AppOpsManager.MODE_DEFAULT) {
    return context.checkCallingOrSelfPermission("android.permission.PACKAGE_USAGE_STATS") == PackageManager.PERMISSION_GRANTED
  }
  return mode == AppOpsManager.MODE_ALLOWED
}
