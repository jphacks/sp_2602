package dev.hackathon.kit.kitnative

import android.content.Context
import android.os.Build
import dev.hackathon.kit.kitnative.engine.AppVisibility
import dev.hackathon.kit.kitnative.engine.DailyUsage
import dev.hackathon.kit.kitnative.engine.DayWindow
import dev.hackathon.kit.kitnative.engine.EnginePermissions
import dev.hackathon.kit.kitnative.engine.EngineStore
import dev.hackathon.kit.kitnative.engine.LimitPrompt
import dev.hackathon.kit.kitnative.engine.LimitRules
import dev.hackathon.kit.kitnative.engine.MonitorService
import dev.hackathon.kit.kitnative.engine.UsageReader
import dev.hackathon.kit.kitnative.widget.SlopeWidget
import dev.hackathon.kit.kitnative.widget.WidgetStore
import dev.hackathon.kit.kitnative.widget.WidgetTest
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Android 固有の処理（使用中アプリの検出・使用時間の取得・制限画面の表示など）は、このモジュールに足していく。
// 画面や共通の処理は、ここを直接呼ばず src/lib/native.ts を経由する（将来 iOS の Swift に差し替えられるようにするため）。
// Kotlin を書き換えたら、アプリを作り直す（npm run android）。Fast Refresh では反映されない。
// Function の名前・引数・戻り値は contracts/native.ts の NativeEngine と1対1（中身は engine/ の部品）:
//   C2: getPermissions・openPermissionSettings・getDailyUsage
//   C4: saveRestriction・startEngine・stopEngine・getEngineStatus・showLimitReached・openApp・clearLocalData
//   C5: saveParentWidget（保護者のウィジェット。子どものウィジェットの値は saveRestriction と監視が保存する）
class KitNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KitNative")

    // JavaScript から Kotlin を呼べるかの確認用（足し方の見本。要らなくなったら消してよい）
    Function("ping") {
      "Kotlin から返事です（Android API ${Build.VERSION.SDK_INT}）"
    }

    // Slope の画面が前に出ているかを覚える（前にいる間は、監視から案内を出さない。engine/MonitorService.kt の AppVisibility）
    OnActivityEntersForeground { AppVisibility.slopeInForeground = true }
    OnActivityEntersBackground { AppVisibility.slopeInForeground = false }

    // ── C2 ──────────────────────────────────────────────

    // 権限の状態 { usageAccess, overlay, notifications, batteryOptimization }（engine/EnginePermissions.kt）
    Function("getPermissions") {
      EnginePermissions.status(context)
    }

    // 権限の設定画面を開く（許可はユーザーが設定画面で行う）。開けたら true
    Function("openPermissionSettings") { permission: String ->
      EnginePermissions.open(context, appContext.currentActivity, permission)
    }

    // 指定した日（日本時間 0:00〜24:00）のアプリ別の使用時間。contracts/native.ts の NativeUsageResult の形で返す。
    // 時間がかかることがある（OS のイベントを読む）ので、JS の画面を止めないよう非同期にする
    AsyncFunction("getDailyUsage") { date: String ->
      val ctx = context
      val now = System.currentTimeMillis()
      val usage = UsageReader(ctx).read(date, now)
      // 今日の分を読んだら、ウィジェット用のまとめも新しくする（監視が止まっていても、Slope を開けば新しくなるように）
      if (date == DayWindow.dateOf(now)) {
        EngineStore.saveToday(ctx, LimitRules.summarize(date, usage, EngineStore.loadRestriction(ctx), now))
      }
      when (usage) {
        is DailyUsage.Ok ->
          mapOf(
            "status" to "ok",
            "date" to usage.date,
            "measuredAt" to isoUtc(usage.measuredAt),
            "apps" to
              usage.apps.map {
                mapOf("packageName" to it.packageName, "label" to it.label, "usedMinutes" to it.usedMinutes)
              },
          )
        DailyUsage.PermissionDenied -> mapOf("status" to "permission_denied")
        is DailyUsage.Unavailable -> mapOf("status" to "unavailable", "reason" to usage.reason)
      }
    }

    // ── C4 ──────────────────────────────────────────────

    // 判定に使う値（NativeRestriction）を端末に保存する。以後は電波がなくてもこれで判定する。保存できたら true。
    // 形が違うときは保存せず false（前の値で判定を続ける。JS の画面の処理は止めない）。
    // テストの日程（testPeriods）は判定には使わず、ウィジェット（C5。K-B の widget/）の保存へ渡して描き直させる
    Function("saveRestriction") { restriction: Map<String, Any?> ->
      val ctx = context
      try {
        val json = JSONObject(restriction)
        val rule = EngineStore.restrictionFromJson(json, System.currentTimeMillis())
        EngineStore.saveRestriction(ctx, rule)
        MonitorService.checkNow() // 上限が変わったら、次の回を待たずに判定し直す
        json.optJSONArray("testPeriods")?.let { WidgetStore.saveTests(ctx, testsFromJson(it)) }
        WidgetStore.markChild(ctx) // ウィジェットを子どもの形（子12）で描く
        SlopeWidget.requestUpdate(ctx)
        true
      } catch (e: Exception) {
        false
      }
    }

    // 監視を始める（ログイン後・設定を取れたときに JS が呼ぶ。動いていれば読み直すだけ）。始められたら true
    Function("startEngine") {
      val ctx = context
      EngineStore.setEngineEnabled(ctx, true)
      MonitorService.start(ctx)
    }

    // 監視を止める（ログアウトのとき）。再起動しても始めない
    Function("stopEngine") {
      val ctx = context
      EngineStore.setEngineEnabled(ctx, false)
      MonitorService.stop(ctx)
    }

    // ログアウトのときに、この端末に残した値を全部消す（監視を止め、判定の値・今日の使用量・ウィジェットのテストの日程を消して、
    // ウィジェットを描き直す）。前の人の値が、次にログインした人の判定やウィジェットに残らないようにするため
    Function("clearLocalData") {
      val ctx = context
      EngineStore.setEngineEnabled(ctx, false) // 先に印を消す（動いている監視が、消した値を書き戻さないように）
      MonitorService.stop(ctx)
      EngineStore.clear(ctx)
      LimitPrompt.cancelLimitNotification(ctx)
      WidgetStore.clear(ctx)
      SlopeWidget.requestUpdate(ctx)
    }

    // ── C5（保護者のウィジェット・Figma 親08）──────────────────────

    // 保護者のウィジェットの値（contracts/native.ts の NativeParentWidget）を端末に保存し、ウィジェットを保護者の形で描き直す。
    // 形が違うときは保存せず false（前の値のまま。JS の画面の処理は止めない）
    Function("saveParentWidget") { data: Map<String, Any?> ->
      val ctx = context
      try {
        val json = JSONObject(data)
        val days = json.optJSONArray("days") ?: JSONArray()
        val tests = json.optJSONArray("testPeriods")?.let { testsFromJson(it) } ?: emptyList()
        WidgetStore.saveParent(ctx, days, tests)
        SlopeWidget.requestUpdate(ctx)
        true
      } catch (e: Exception) {
        false
      }
    }

    // 監視の状態 { running, restrictionDate }
    Function("getEngineStatus") {
      mapOf(
        "running" to MonitorService.running,
        "restrictionDate" to EngineStore.loadRestriction(context)?.date,
      )
    }

    // 「時間は終わりです」の画面（子11）を前に出す。Slope が前にいるときは JS の画面が自分で出すので、何もせず true。
    // OS が許さない（重ねて表示も通知も許可されていない）ときは false
    Function("showLimitReached") {
      if (AppVisibility.slopeInForeground) true else LimitPrompt.show(context)
    }

    // アプリを開く（学習用アプリへの誘導）。入っていない・開けなければ false
    Function("openApp") { packageName: String ->
      LimitPrompt.openApp(context, packageName)
    }
  }

  // JS の testPeriods（[{name, startDate, endDate}]）→ ウィジェットのテストの日程。日付の形でないものは入れない
  private fun testsFromJson(a: JSONArray): List<WidgetTest> {
    val out = ArrayList<WidgetTest>()
    for (i in 0 until a.length()) {
      val o = a.optJSONObject(i) ?: continue
      val start = o.optString("startDate", "")
      val end = o.optString("endDate", "")
      if (DayWindow.isDate(start) && DayWindow.isDate(end)) out.add(WidgetTest(o.optString("name", ""), start, end))
    }
    return out
  }

  // 時刻 → "2026-10-17T03:00:00.000Z"（契約の IsoDateTime。minSdk 24 では java.time が使えないので SimpleDateFormat）
  private fun isoUtc(epochMs: Long): String {
    val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT)
    f.timeZone = TimeZone.getTimeZone("UTC")
    return f.format(Date(epochMs))
  }
}
