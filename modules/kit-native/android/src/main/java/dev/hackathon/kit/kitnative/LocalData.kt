package dev.hackathon.kit.kitnative

import android.content.Context
import dev.hackathon.kit.kitnative.admin.DeviceOwnerPolicy
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

  /**
   * Kotlin がサーバから「保護者が連携を外した」401（reason: family_unlink）を受けたときの片付け（D-133・D-134）。
   * 呼ぶところ: 許可の状態の送信（StatusReporter）と、合言葉の確かめ（SessionCheck）。
   * 送ったときの合言葉がまだ保存してある合言葉のときだけ（送っている間に JS が新しい合言葉を渡していたら＝ログインし直して
   * 紐づけ直していたら、何もしない）、clear と同じく監視を止めて値を消し、デモ用の Device Owner（アンインストールの止め）もやめる。
   * 合言葉の確かめと clear は EngineStore の同じロックの中で行う（ifReporterToken。間に新しい合言葉が入って、それごと消さないように）。
   * Device Owner をやめられなくても、ほかの片付けは済ませる。消したら true
   */
  fun clearUnlinked(context: Context, sentToken: String): Boolean {
    val ctx = context.applicationContext
    if (!EngineStore.ifReporterToken(ctx, sentToken) { clear(ctx) }) return false
    try {
      DeviceOwnerPolicy.release(ctx)
    } catch (e: Exception) {
      // Device Owner でない・やめられない。監視は止めたので、そのまま進める
    }
    return true
  }
}
