package dev.hackathon.kit.kitnative.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// C4: 端末を再起動したあと（BOOT_COMPLETED）と、Slope を入れ直した・更新したあと（MY_PACKAGE_REPLACED）に、監視を再開する受信機。
// 再開するのは「監視を始めたことがあり（engine_enabled）、判定の値（restriction）が保存してある」ときだけ。
//   ログアウト（stopEngine）した端末や、まだ設定を一度も受け取っていない端末では始めない。
// なぜここから始められるか: Android 12 以降は裏から Foreground Service を始められないが、BOOT_COMPLETED を受けたときは例外として許される
//   （Android 15 で禁止された種類 dataSync などに specialUse は入らない）。
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
        if (EngineStore.isEngineEnabled(context) && EngineStore.loadRestriction(context) != null) {
          MonitorService.start(context)
        }
      }
    }
  }
}
