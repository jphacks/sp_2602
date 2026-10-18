package dev.hackathon.kit.kitnative

import android.content.Context
import dev.hackathon.kit.kitnative.engine.EngineStore
import dev.hackathon.kit.kitnative.engine.LimitPrompt
import dev.hackathon.kit.kitnative.engine.MonitorService
import dev.hackathon.kit.kitnative.engine.PermissionNudge
import dev.hackathon.kit.kitnative.engine.StatusReporter
import dev.hackathon.kit.kitnative.widget.SlopeWidget
import dev.hackathon.kit.kitnative.widget.WidgetStore

// この端末に Slope の監視が残した値を全部消す（監視を止め、判定の値・今日の使用量・許可の状態の送り先と合言葉・
// ウィジェットのテストの日程を消して、ウィジェットを描き直す）。再起動しても監視を始めない。
// 呼ぶところ:
//   - JS の clearLocalData（ログアウト・保護者に連携を外されたと分かったとき。KitNativeModule）
//   - 許可の状態を送ったら「保護者が連携を外した」401 が返ったとき（engine/StatusReporter.kt。D-133）。
//     アプリを開かなくても、外された端末の制限がそこで止まるように
object LocalData {
  fun clear(context: Context) {
    val ctx = context.applicationContext
    EngineStore.setEngineEnabled(ctx, false) // 先に印を消す（動いている監視が、消した値を書き戻さないように）
    MonitorService.stop(ctx)
    EngineStore.clear(ctx) // 許可の状態の送り先と合言葉（D-113）もここで消える
    StatusReporter.cancelHeartbeat(ctx)
    PermissionNudge.cancel(ctx)
    LimitPrompt.cancelLimitNotification(ctx)
    WidgetStore.clear(ctx)
    SlopeWidget.requestUpdate(ctx)
  }
}
