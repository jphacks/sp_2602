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
//         "blockedSites":["youtube.com/shorts", …],                       // 制限する Web サイト（D-111。WebGuardService が読む）
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
//   ── 許可の見張りと親への通告（D-113。StatusReporter.kt）──
//   "report_url"     … String。許可の状態の送り先（サーバの deviceStatusReport の完全な URL）。JS の setStatusReporter が書く
//   "report_token_sealed" … String。そのときの合言葉（子どもの session token）を SecretBox で封をしたもの（"sb1:…"）。
//                     clearStatusReporter・監視が止まっているときの 401・clearLocalData（LocalData.clear）で消える。平文では置かない（セキュリティ検査 PII-05 / AND-05）
//   "report_token"   … 古い版が平文で置いた合言葉。読んだときに封をし直して消す（新しくは書かない）
//   "report_child_id"… String。送る本文の childId（子ども本人の userId）
//   "report_sent"    … String。最後に届いた許可の状態（PermissionFlags.encode() の "1101" の形）
//   "report_sent_at" … Long。最後に届いた時刻（ミリ秒）
//   "report_retry_at"… Long。失敗したあと、次に送ってよい時刻（ミリ秒）
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

// 封を開けた合言葉のメモリの置き場（EngineStore の合言葉。純粋な部分。JVM のテスト EngineRulesTest）。
// 封をした値（sealed）と組にして持ち、違う封を聞かれたら開け直して入れ替える。開けられなければ何も持たない（次にまた試す）。
// ディスクには書かない（平文はプロセスのメモリにだけ）。使う側（EngineStore）のロックの中で呼ぶ
class OpenedSecretCache {
  private var sealed: String? = null
  private var plain: String? = null

  fun get(sealedNow: String, open: (String) -> String?): String? {
    if (sealed == sealedNow) plain?.let { return it }
    val p = open(sealedNow)
    if (p == null) clear() else put(sealedNow, p)
    return p
  }

  fun put(sealedNow: String, plainNow: String) {
    sealed = sealedNow
    plain = plainNow
  }

  fun clear() {
    sealed = null
    plain = null
  }
}

// 許可の状態の送り先と合言葉と子どもの id（D-113）
data class ReporterAccess(val url: String, val token: String, val childId: String)

// 許可の状態を最後に送った記録（D-113）。lastSent が null = この送り先・合言葉ではまだ届いていない
data class ReportState(val lastSent: PermissionFlags?, val lastSentAt: Long, val retryAt: Long)

object EngineStore {
  const val PREFS_NAME = "slope_engine"
  const val KEY_RESTRICTION = "restriction"
  const val KEY_TODAY = "today_usage"
  const val KEY_ENGINE_ENABLED = "engine_enabled"
  const val ACTION_TODAY_UPDATED = "dev.hackathon.kit.kitnative.TODAY_UPDATED"
  const val KEY_REPORT_URL = "report_url"
  const val KEY_REPORT_TOKEN_SEALED = "report_token_sealed"
  const val KEY_REPORT_TOKEN_LEGACY = "report_token" // 古い版の平文（読んだら封をし直して消す）
  const val KEY_REPORT_CHILD_ID = "report_child_id"
  const val KEY_REPORT_SENT = "report_sent"
  const val KEY_REPORT_SENT_AT = "report_sent_at"
  const val KEY_REPORT_RETRY_AT = "report_retry_at"

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  // 値が変わったら知らせてもらう（WebGuardService が、覚えた判定の値・今日の使用量を読み直すため）。
  // SharedPreferences は受け手を弱い参照で持つので、呼ぶ側は listener をフィールドに持ち続けること
  fun registerListener(context: Context, listener: SharedPreferences.OnSharedPreferenceChangeListener) {
    prefs(context).registerOnSharedPreferenceChangeListener(listener)
  }

  fun unregisterListener(context: Context, listener: SharedPreferences.OnSharedPreferenceChangeListener) {
    prefs(context).unregisterOnSharedPreferenceChangeListener(listener)
  }

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

  // ── 許可の状態の送り先と合言葉（D-113）──
  // なぜ合言葉を native に置くか: 送るのは Kotlin の監視（アプリを閉じていても動く）で、JS の保存場所（AsyncStorage）は読めないため。
  // 置き場所はアプリ専用（MODE_PRIVATE）で、合言葉は Android Keystore の鍵で封をしてから置く（SecretBox。JS の保存も同じ鍵）。
  // ログアウト（clear）・監視が止まっているときの 401 で消す（監視が動いている間の理由のない 401 では消さない。StatusReportRules.replyAction）

  // 封を開けた合言葉を、プロセスのメモリにだけ持つ（電池: 監視の見張り（30 秒ごと。上限に達したあとは 5 秒ごと）と
  // 許可の状態の送信のたびに、Keystore で封を開け直さないように）。ディスクには平文で置かない（置くのは封をした値だけ）。
  // 封をした値（sealed）と組にして持ち、置いてある封と違えば使わずに開け直す。
  // saveReporter（入れ替える）・clearReporter・clear（消す）・clearReporterIfToken（clearReporter で消す）・
  // ifReporterToken（中で片付けたあとに消す）で必ず合わせる。アプリが作り直されたら、最初の1回だけ開ける
  private val opened = OpenedSecretCache()

  // 今の合言葉（封を開けたもの）。ない・開けない（鍵が作り直された）ときは null。呼ぶのは @Synchronized の中だけ。
  // 古い版が平文で置いた値は、ここで封をし直して平文を消す（封ができなければ平文を消すだけ。平文のまま残さない）
  private fun currentToken(p: SharedPreferences): String? {
    p.getString(KEY_REPORT_TOKEN_SEALED, null)?.let { sealed ->
      return opened.get(sealed) { SecretBox.open(it) }
    }
    opened.clear()
    val legacy = p.getString(KEY_REPORT_TOKEN_LEGACY, null) ?: return null
    val sealed = SecretBox.seal(legacy)
    val edit = p.edit().remove(KEY_REPORT_TOKEN_LEGACY)
    if (sealed != null) edit.putString(KEY_REPORT_TOKEN_SEALED, sealed)
    edit.commit()
    if (sealed != null) opened.put(sealed, legacy)
    return if (sealed != null) legacy else null
  }

  // 送り先と合言葉を保存する。前と違えば送った記録も消して true（次の見張りですぐ送る）。同じなら何もしないで false
  @Synchronized
  fun saveReporter(context: Context, url: String, token: String, childId: String): Boolean {
    val p = prefs(context)
    if (
      p.getString(KEY_REPORT_URL, null) == url &&
      currentToken(p) == token &&
      p.getString(KEY_REPORT_CHILD_ID, null) == childId
    ) {
      return false
    }
    // 封ができない（Keystore が使えない）ときは、平文で置かずに送るのをやめる
    val sealed = SecretBox.seal(token)
    if (sealed == null) {
      clearReporter(context)
      return false
    }
    p
      .edit()
      .putString(KEY_REPORT_URL, url)
      .putString(KEY_REPORT_TOKEN_SEALED, sealed)
      .remove(KEY_REPORT_TOKEN_LEGACY)
      .putString(KEY_REPORT_CHILD_ID, childId)
      .remove(KEY_REPORT_SENT)
      .remove(KEY_REPORT_SENT_AT)
      .remove(KEY_REPORT_RETRY_AT)
      .apply()
    opened.put(sealed, token)
    return true
  }

  @Synchronized
  fun loadReporter(context: Context): ReporterAccess? {
    val p = prefs(context)
    val url = p.getString(KEY_REPORT_URL, null)
    val token = currentToken(p)
    val childId = p.getString(KEY_REPORT_CHILD_ID, null)
    if (url.isNullOrEmpty() || token.isNullOrEmpty() || childId.isNullOrEmpty()) return null
    return ReporterAccess(url, token, childId)
  }

  // 送り先・合言葉・送った記録を消す（保護者・役割のない人になった・ログアウト）
  @Synchronized
  fun clearReporter(context: Context) {
    opened.clear()
    prefs(context)
      .edit()
      .remove(KEY_REPORT_URL)
      .remove(KEY_REPORT_TOKEN_SEALED)
      .remove(KEY_REPORT_TOKEN_LEGACY)
      .remove(KEY_REPORT_CHILD_ID)
      .remove(KEY_REPORT_SENT)
      .remove(KEY_REPORT_SENT_AT)
      .remove(KEY_REPORT_RETRY_AT)
      .apply()
  }

  // 401 が返ったとき（監視が止まっている）: 送ったときの合言葉がまだ保存されていれば消して true（送っている間に JS が新しい合言葉を渡していたら消さずに false。
  // 呼ぶ側は false なら生存報告の目覚ましも止めない＝新しい合言葉の分を止めない）
  @Synchronized
  fun clearReporterIfToken(context: Context, token: String): Boolean {
    if (currentToken(prefs(context)) != token) return false
    clearReporter(context)
    return true
  }

  /**
   * 送ったときの合言葉が、まだ保存してある合言葉なら、このロックの中で block を呼んで true（連携が外れた 401 で、端末の値を消す。D-133）。
   * 確かめと片付けをひとまとまりにする（確かめたあと・片付ける前に JS が新しい合言葉を渡して（saveReporter）、
   * 新しい合言葉ごと消してしまわないように）。違えば何もしないで false
   */
  @Synchronized
  fun ifReporterToken(context: Context, token: String, block: () -> Unit): Boolean {
    if (currentToken(prefs(context)) != token) return false
    try {
      block()
    } finally {
      opened.clear() // 中で片付けた（clear）ときに、前の合言葉をメモリに残さない（残っていても次は開け直す）
    }
    return true
  }

  fun loadReportState(context: Context): ReportState {
    val p = prefs(context)
    return ReportState(
      lastSent = PermissionFlags.decode(p.getString(KEY_REPORT_SENT, null)),
      lastSentAt = p.getLong(KEY_REPORT_SENT_AT, 0L),
      retryAt = p.getLong(KEY_REPORT_RETRY_AT, 0L),
    )
  }

  // 届いた（送った合言葉がまだ今の合言葉のときだけ記録する）
  @Synchronized
  fun saveReportSent(context: Context, token: String, flags: PermissionFlags, at: Long) {
    val p = prefs(context)
    if (currentToken(p) != token) return
    p.edit().putString(KEY_REPORT_SENT, flags.encode()).putLong(KEY_REPORT_SENT_AT, at).remove(KEY_REPORT_RETRY_AT).apply()
  }

  // 届かなかった（retryAt まで送り直さない）
  @Synchronized
  fun saveReportFailed(context: Context, token: String, retryAt: Long) {
    val p = prefs(context)
    if (currentToken(p) != token) return
    p.edit().putLong(KEY_REPORT_RETRY_AT, retryAt).apply()
  }

  // ログアウトのときに全部消す（判定の値・今日の使用量・監視の印・許可の状態の送り先と合言葉）。前の人の値を次の人の判定やウィジェットに使わないため。
  // 同期で書く（commit）: このあとすぐウィジェットを描き直すので、消えたあとの値を読ませる
  @Synchronized
  fun clear(context: Context) {
    opened.clear()
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
      // 念のためもう一度そろえる（そろわない登録は使わない。同じものは1つに）。古い形の値（項目がない）は空
      blockedSites = stringList(o.optJSONArray("blockedSites")).mapNotNull { WebSites.normalizePattern(it) }.distinct(),
    )
  }

  fun restrictionToJson(r: Restriction): JSONObject =
    JSONObject()
      .put("date", r.date)
      .put("limit", limitToJson(r.limit))
      .put("excludedPackages", JSONArray(r.excludedPackages.toList()))
      .put("essentialPackages", JSONArray(r.essentialPackages.toList()))
      .put("learningPackages", JSONArray(r.learningPackages))
      .put("blockedSites", JSONArray(r.blockedSites))
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
