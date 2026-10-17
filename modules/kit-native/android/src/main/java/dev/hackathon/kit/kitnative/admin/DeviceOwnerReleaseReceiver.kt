package dev.hackathon.kit.kitnative.admin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

// ── PC から Device Owner を解除する入口（デモ専用）──────────────────────────────
//
// 何のための部品か:
//   デモの後、PC につないで次のコマンドを打つと、アンインストールの止めを外して Device Owner をやめる（docs/device-owner.md）。
//     adb shell am broadcast -a dev.hackathon.kit.kitnative.action.RELEASE_DEVICE_OWNER -n com.quedotcom.androidslope/dev.hackathon.kit.kitnative.admin.DeviceOwnerReleaseReceiver
//
// なぜこの方法か（Android の制約）:
//   - Device Owner は `adb shell dpm remove-active-admin` では外せない（testOnly のアプリだけの例外）。アプリ自身が
//     clearDeviceOwnerApp を呼ぶ必要がある。画面に隠し操作を足すと JS の担当のファイルを触ることになるので、
//     PC から呼べる受け手にした（JS の窓口を足すときは DeviceOwnerPolicy.release を呼べばよい）。
//   - 誰でも送れると、ほかのアプリが Slope の Device Owner を外せてしまう。AndroidManifest でこの受け手に
//     android.permission.DUMP を求めている。DUMP は普通のアプリには与えられず、PC の adb（shell）は持っているので、
//     実質「USB でつないだ PC からだけ」送れる。
class DeviceOwnerReleaseReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_RELEASE) return
    val released = DeviceOwnerPolicy.release(context)
    Log.i("SlopeDeviceOwner", if (released) "解除しました" else "Device Owner ではありませんでした")
    resultCode = if (released) 1 else 0
    resultData = if (released) "released" else "not_device_owner"
  }

  companion object {
    const val ACTION_RELEASE = "dev.hackathon.kit.kitnative.action.RELEASE_DEVICE_OWNER"
  }
}
