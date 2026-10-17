package dev.hackathon.kit.kitnative.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import dev.hackathon.kit.kitnative.R
import dev.hackathon.kit.kitnative.engine.EngineStore
import java.util.concurrent.Executors

// ── ホーム画面のウィジェット（C5・Figma 子12 / 親08）────────────────────────────
//
// 何のための部品か:
//   子どもがアプリを開かなくても、ホーム画面で「今日の残りの割合（とバー）」と「テストまであと何日」が見えるようにする。
//   押すと Slope の子01 ホームを開く（Figma 子12 の注記）。
//   保護者の端末では、左を「初日から 40 分 減・上限 300→260分」（Figma 親08）にし、押すと親03 振り返りを開く。
//   ウィジェットを2つに分けないのは、同じアプリで選ぶものが2つあると紛らわしいため。端末でログインしている人の役割
//   （WidgetKeys.ROLE。JS の saveRestriction = 子ども・saveParentWidget = 保護者）で、同じウィジェットの左のカードを描き分ける。
//
// なぜこの方法か（Android の制約）:
//   - ホーム画面のウィジェットは AppWidgetProvider（放送の受け手）と RemoteViews（決まった部品だけで作る XML の画面）で作る。
//     React Native の画面はランチャーの中には描けない。Glance（Compose 版）は依存が増えるので使わない。
//   - OS が描き直しを頼むのは updatePeriodMillis（最短 30 分）ごと。それより早く数字を変えるために:
//       ・K-A の監視が今日の使用量を保存すると、自分のアプリだけに EngineStore.ACTION_TODAY_UPDATED を放送する。
//         ここ（AndroidManifest の intent-filter）で受けて描き直す。
//       ・それ以外の値（テストの日程）を保存した側は、SlopeWidget.requestUpdate(context) を呼ぶ。
//   - 受け手の処理は短時間で終える決まりがあり、保存の読み出し（ファイルの読み込み）を主スレッドでしないよう、
//     goAsync() で別スレッドに移して描く。
//   - 表示の判断は WidgetData.kt（usageCardView・testCardView）。ここは描くだけ。
class SlopeWidget : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    // K-A の監視が今日の使用量を保存した（engine/EngineStore.kt の saveToday）。それ以外は AppWidgetProvider に任せる
    if (intent.action == EngineStore.ACTION_TODAY_UPDATED) {
      requestUpdate(context)
      return
    }
    super.onReceive(context, intent)
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val pending = goAsync()
    val app = context.applicationContext
    worker.execute {
      try {
        renderAll(app, appWidgetManager, appWidgetIds)
      } finally {
        pending.finish()
      }
    }
  }

  companion object {
    private const val TAG = "SlopeWidget"

    // 子01 ホームへの道（expo-router の src/app/child/home.tsx。子どもでなければ入口へ戻される）
    private const val CHILD_HOME_URI = "slope://child/home"

    // 親03 振り返りへの道（src/app/parent/review.tsx。保護者でなければ入口へ戻される）
    private const val PARENT_REVIEW_URI = "slope://parent/review"

    // 描く順番が入れ替わらないよう、1本のスレッドで順に描く
    private val worker = Executors.newSingleThreadExecutor()

    // 値を保存したあとに呼ぶ（K-A の監視・JS の窓口から）。置かれているウィジェットを全部描き直す。どのスレッドから呼んでもよい
    @JvmStatic
    fun requestUpdate(context: Context) {
      val app = context.applicationContext
      worker.execute {
        val manager = AppWidgetManager.getInstance(app)
        val ids = manager.getAppWidgetIds(ComponentName(app, SlopeWidget::class.java))
        if (ids.isNotEmpty()) renderAll(app, manager, ids)
      }
    }

    private fun renderAll(context: Context, manager: AppWidgetManager, ids: IntArray) {
      val views = try {
        build(context, readWidgetSnapshot(context))
      } catch (e: Exception) {
        // 読めなかったときも 0% と出さず「分からない」の形で描く
        Log.w(TAG, "ウィジェットの値を読めませんでした", e)
        build(context, null)
      }
      for (id in ids) manager.updateAppWidget(id, views)
    }

    private fun build(context: Context, snapshot: WidgetSnapshot?): RemoteViews {
      val v = RemoteViews(context.packageName, R.layout.slope_widget)
      val parent = snapshot?.role == WidgetRole.PARENT
      v.setViewVisibility(R.id.slope_widget_usage_card, if (parent) View.GONE else View.VISIBLE)
      v.setViewVisibility(R.id.slope_widget_reduction_card, if (parent) View.VISIBLE else View.GONE)

      if (parent) {
        // ── 左（保護者・親08）: 初日から ──
        when (val r = reductionCardView(snapshot!!)) {
          is ReductionCardView.Minutes -> {
            v.setViewVisibility(R.id.slope_widget_reduction_value_row, View.VISIBLE)
            v.setViewVisibility(R.id.slope_widget_reduction_sub, View.VISIBLE)
            v.setViewVisibility(R.id.slope_widget_reduction_message, View.GONE)
            v.setTextViewText(R.id.slope_widget_reduction_value, r.minutes)
            v.setTextViewText(
              R.id.slope_widget_reduction_unit,
              context.getString(if (r.increased) R.string.slope_widget_reduction_unit_up else R.string.slope_widget_reduction_unit),
            )
            v.setTextViewText(
              R.id.slope_widget_reduction_sub,
              context.getString(R.string.slope_widget_reduction_sub, r.fromLimit, r.toLimit),
            )
          }
          is ReductionCardView.Message -> {
            v.setViewVisibility(R.id.slope_widget_reduction_value_row, View.GONE)
            v.setViewVisibility(R.id.slope_widget_reduction_sub, View.GONE)
            v.setViewVisibility(R.id.slope_widget_reduction_message, View.VISIBLE)
            v.setTextViewText(R.id.slope_widget_reduction_message_title, r.title)
            v.setTextViewText(R.id.slope_widget_reduction_message_body, r.body)
          }
        }
      }

      // ── 左（子ども・子12）: 今日の残り ──
      val usage = snapshot?.let { usageCardView(it) } ?: UNKNOWN_USAGE
      when (usage) {
        is UsageCardView.Percent -> {
          v.setViewVisibility(R.id.slope_widget_usage_value_row, View.VISIBLE)
          v.setViewVisibility(R.id.slope_widget_usage_bar, View.VISIBLE)
          v.setViewVisibility(R.id.slope_widget_usage_message, View.GONE)
          v.setTextViewText(R.id.slope_widget_usage_value, usage.remainingPercent.toString())
          v.setProgressBar(R.id.slope_widget_usage_bar, 100, usage.remainingPercent, false)
        }
        is UsageCardView.Message -> {
          v.setViewVisibility(R.id.slope_widget_usage_value_row, View.GONE)
          v.setViewVisibility(R.id.slope_widget_usage_bar, View.GONE)
          v.setViewVisibility(R.id.slope_widget_usage_message, View.VISIBLE)
          v.setTextViewText(R.id.slope_widget_usage_message_title, usage.title)
          v.setTextViewText(R.id.slope_widget_usage_message_body, usage.body)
        }
      }

      // ── 右: テストまで ──
      val test = snapshot?.let { testCardView(it) } ?: UNKNOWN_TEST
      when (test) {
        is TestCardView.Days -> {
          v.setViewVisibility(R.id.slope_widget_test_value_row, View.VISIBLE)
          v.setViewVisibility(R.id.slope_widget_test_message, View.GONE)
          v.setTextViewText(R.id.slope_widget_test_value, test.days.toString())
        }
        is TestCardView.Message -> {
          v.setViewVisibility(R.id.slope_widget_test_value_row, View.GONE)
          v.setViewVisibility(R.id.slope_widget_test_message, View.VISIBLE)
          v.setTextViewText(R.id.slope_widget_test_message_title, test.title)
          v.setTextViewText(R.id.slope_widget_test_message_body, test.body)
          v.setViewVisibility(R.id.slope_widget_test_message_body, if (test.body.isEmpty()) View.GONE else View.VISIBLE)
        }
      }

      // 押すと Slope を開く（どこを押しても同じ。子ども = 子01 ホーム、保護者 = 親03 振り返り）
      val open = openAppIntent(context, if (parent) PARENT_REVIEW_URI else CHILD_HOME_URI)
      if (open != null) {
        v.setOnClickPendingIntent(R.id.slope_widget_root, open)
      }
      return v
    }

    // Slope の画面を開く。アプリの入口の Activity をはっきり指名し、slope://child/home などの道を渡す
    // （expo-router が道として受け取る。開けない端末でも、入口の Activity が開くので Slope は必ず開く）
    private fun openAppIntent(context: Context, uri: String): PendingIntent? {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        component = launch.component
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
