package dev.hackathon.kit.kitnative.engine

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

// 監視・制限エンジン（C4）が端末に残す値の置き場（SharedPreferences）。ウィジェット（C5。K-B の担当）もここを読む。
// なぜ端末に保存するか: 電波がないときや、Slope の画面（JavaScript）が動いていないときでも、Kotlin だけで判定を続けるため。
// なぜ SharedPreferences か: 値が小さく（数 KB）、ウィジェット・再起動後の受信機（BootReceiver）・監視の Service の
//   どこからでも同じプロセスで手早く読めるため（Room の表にするほどの量ではない）。
//
// ── 共有の約束（K-B のウィジェットはこの形を読む。変えるときは両方を直す）──────────────────────────
// ファイル名: "slope_engine"（Context.MODE_PRIVATE）。読むときは EngineStore.loadToday(context) を使えば、形を知らなくてよい。
// キー:
//   "restriction"    … String（JSON）。JS の saveRestriction で受け取った判定の値。形:
//        {"date":"2026-10-17",
//         "limit":{"kind":"limited","limitMinutes":60} | {"kind":"unlimited"} | {"kind":"unset"},
//         "excludedPackages":["…"], "essentialPackages":["…"], "learningPackages":["…"],
//         "configVersion":3,
//         "upcoming":[{"date":"2026-10-18","limit":{…上と同じ形…}}, …],   // 翌日から先（なければ []）
//         "savedAt":1760659200000}                                        // 保存した時刻（ミリ秒）
//   "today_usage"    … String（JSON）。今日の使用量のまとめ（監視の Service が 30 秒ごと、JS が使用時間を取るたびに書く）。形:
//        {"date":"2026-10-17",              // 日本時間の日付。今日でなければ古い値（ウィジェットは「取得中」などと出す）
//         "status":"ok" | "permission_denied" | "unavailable",
//         "restrictedMinutes":42.5 | null,  // 制限対象の合計（分。0.1 分単位）。status が ok でなければ null
//         "limit":{"kind":"limited","limitMinutes":60} | {"kind":"unlimited"} | {"kind":"unset"} | null,  // null = その日のルールがない
//         "usedPercent":70 | null,          // 使用済みの割合 0〜100（C3 と同じ規則）。出せない状態（制限なし・未設定・ルールなし・取得不可）は null
//         "reached":false,                  // 上限に届いたか
//         "measuredAt":1760659200000}       // 測った時刻（ミリ秒）
//   "engine_enabled" … Boolean。startEngine で true、stopEngine・clearLocalData（ログアウト）で false。再起動後に監視を始めるかの印
// テストの日程はここには置かない: JS の saveRestriction が渡す testPeriods を、KitNativeModule が K-B の WidgetStore.saveTests へ渡す。
// ログアウトのとき（JS の clearLocalData）は、このファイルの値を全部消し（clear）、WidgetStore.clear も呼ぶ。
// 変わったとき: "today_usage" を書いたら、ブロードキャスト ACTION_TODAY_UPDATED を自分のアプリにだけ送る
//   （Intent.setPackage(自分)。ウィジェットの受信機は intent-filter にこの action を足せば受け取れる）。
// ─────────────────────────────────────────────────────────────────────────────────────

// 今日の使用量のまとめ（"today_usage" の中身）
data class TodaySummary(
  val date: String,
  val status: String, // "ok" | "permission_denied" | "unavailable"
  val restrictedMinutes: Double?,
  val limit: DayLimit?,
  val usedPercent: Int?,
  val reached: Boolean,
  val measuredAt: Long,
) {
  // 測った時刻を除いて同じか（同じなら書き直さない・ウィジェットに知らせない）
  fun sameContent(other: TodaySummary?): Boolean =
    other != null && copy(measuredAt = 0) == other.copy(measuredAt = 0)
}

object EngineStore {
  const val PREFS_NAME = "slope_engine"
  const val KEY_RESTRICTION = "restriction"
  const val KEY_TODAY = "today_usage"
  const val KEY_ENGINE_ENABLED = "engine_enabled"
  const val ACTION_TODAY_UPDATED = "dev.hackathon.kit.kitnative.TODAY_UPDATED"

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  // ── 判定の値 ──
  fun saveRestriction(context: Context, rule: Restriction) {
    prefs(context).edit().putString(KEY_RESTRICTION, restrictionToJson(rule).toString()).apply()
  }

  fun loadRestriction(context: Context): Restriction? {
    val raw = prefs(context).getString(KEY_RESTRICTION, null) ?: return null
    return try {
      restrictionFromJson(JSONObject(raw), null)
    } catch (e: Exception) {
      null // 壊れていたら「ない」として扱う（判定しない）
    }
  }

  // ── 今日の使用量 ──
  // 中身が変わったときだけ書いて、ウィジェットに知らせる。書いたら true
  // （監視の Service と JS の getDailyUsage が別のスレッドから呼ぶので、読んで比べて書くまでを1つずつ行う）
  @Synchronized
  fun saveToday(context: Context, summary: TodaySummary): Boolean {
    if (summary.sameContent(loadToday(context))) return false
    prefs(context).edit().putString(KEY_TODAY, todayToJson(summary).toString()).apply()
    val intent = Intent(ACTION_TODAY_UPDATED).setPackage(context.packageName)
    context.sendBroadcast(intent)
    return true
  }

  fun loadToday(context: Context): TodaySummary? {
    val raw = prefs(context).getString(KEY_TODAY, null) ?: return null
    return try {
      val o = JSONObject(raw)
      TodaySummary(
        date = o.getString("date"),
        status = o.getString("status"),
        restrictedMinutes = if (o.isNull("restrictedMinutes")) null else o.getDouble("restrictedMinutes"),
        limit = if (o.isNull("limit")) null else limitFromJson(o.getJSONObject("limit")),
        usedPercent = if (o.isNull("usedPercent")) null else o.getInt("usedPercent"),
        reached = o.optBoolean("reached", false),
        measuredAt = o.optLong("measuredAt", 0L),
      )
    } catch (e: Exception) {
      null
    }
  }

  // ── 監視を続けるかの印 ──
  fun setEngineEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENGINE_ENABLED, enabled).apply()
  }

  fun isEngineEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENGINE_ENABLED, false)

  // ログアウトのときに全部消す（判定の値・今日の使用量・監視の印）。前の人の値を次の人の判定やウィジェットに使わないため。
  // 同期で書く（commit）: このあとすぐウィジェットを描き直すので、消えたあとの値を読ませる
  @Synchronized
  fun clear(context: Context) {
    prefs(context).edit().clear().commit()
  }

  // ── JSON との変換 ──
  // JS から来た値（NativeRestriction を JSON にしたもの）を読む。形が違えば IllegalArgumentException / JSONException
  fun restrictionFromJson(o: JSONObject, savedAt: Long?): Restriction {
    val date = o.getString("date")
    require(DayWindow.isDate(date)) { "date が日付の形ではありません: $date" }
    val upcoming = LinkedHashMap<String, DayLimit>()
    val up = o.optJSONArray("upcoming") ?: JSONArray()
    for (i in 0 until up.length()) {
      val item = up.getJSONObject(i)
      val d = item.getString("date")
      if (DayWindow.isDate(d) && d > date) upcoming[d] = limitFromJson(item.getJSONObject("limit"))
    }
    return Restriction(
      date = date,
      limit = limitFromJson(o.getJSONObject("limit")),
      excludedPackages = stringList(o.optJSONArray("excludedPackages")).toSet(),
      essentialPackages = stringList(o.optJSONArray("essentialPackages")).toSet(),
      learningPackages = stringList(o.optJSONArray("learningPackages")),
      configVersion = o.optLong("configVersion", 0L),
      upcoming = upcoming,
      savedAt = savedAt ?: o.optLong("savedAt", 0L),
    )
  }

  fun restrictionToJson(r: Restriction): JSONObject =
    JSONObject()
      .put("date", r.date)
      .put("limit", limitToJson(r.limit))
      .put("excludedPackages", JSONArray(r.excludedPackages.toList()))
      .put("essentialPackages", JSONArray(r.essentialPackages.toList()))
      .put("learningPackages", JSONArray(r.learningPackages))
      .put("configVersion", r.configVersion)
      .put(
        "upcoming",
        JSONArray(r.upcoming.map { (d, l) -> JSONObject().put("date", d).put("limit", limitToJson(l)) }),
      ).put("savedAt", r.savedAt)

  fun limitFromJson(o: JSONObject): DayLimit =
    when (val kind = o.getString("kind")) {
      "limited" -> DayLimit.Limited(o.getDouble("limitMinutes"))
      "unlimited" -> DayLimit.Unlimited
      "unset" -> DayLimit.Unset
      else -> throw IllegalArgumentException("limit.kind が分かりません: $kind")
    }

  fun limitToJson(l: DayLimit): JSONObject =
    when (l) {
      is DayLimit.Limited -> JSONObject().put("kind", "limited").put("limitMinutes", l.limitMinutes)
      DayLimit.Unlimited -> JSONObject().put("kind", "unlimited")
      DayLimit.Unset -> JSONObject().put("kind", "unset")
    }

  private fun todayToJson(s: TodaySummary): JSONObject =
    JSONObject()
      .put("date", s.date)
      .put("status", s.status)
      .put("restrictedMinutes", s.restrictedMinutes ?: JSONObject.NULL)
      .put("limit", s.limit?.let { limitToJson(it) } ?: JSONObject.NULL)
      .put("usedPercent", s.usedPercent ?: JSONObject.NULL)
      .put("reached", s.reached)
      .put("measuredAt", s.measuredAt)

  private fun stringList(a: JSONArray?): List<String> {
    if (a == null) return emptyList()
    val out = ArrayList<String>(a.length())
    for (i in 0 until a.length()) {
      val s = a.optString(i, "")
      if (s.isNotEmpty()) out.add(s)
    }
    return out
  }
}
