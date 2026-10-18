package dev.hackathon.kit.kitnative.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

// ── デバイス管理の受け手（Device Owner。デモ専用）─────────────────────────────
//
// 何のための部品か:
//   `adb shell dpm set-device-owner com.quedotcom.androidslope/dev.hackathon.kit.kitnative.admin.SlopeDeviceAdminReceiver`
//   で指名する「受け手」。Android は Device Owner を、アプリそのものではなくこの受け手のクラスで覚える。
//
// なぜこの方法か（Android の制約）:
//   - Device Owner になれるのは DeviceAdminReceiver を継いだ受け手だけ（AndroidManifest に BIND_DEVICE_ADMIN の権限と
//     res/xml/slope_device_admin.xml をつけて宣言する）。
//   - 受け手のクラスの名前・置き場所を変えると、Device Owner の指名が外れる（端末の初期化からやり直し）。動かさないこと。
//
// 管理者になった直後に、アンインストールの止めをかける（DeviceOwnerPolicy.apply）。
class SlopeDeviceAdminReceiver : DeviceAdminReceiver() {
  override fun onEnabled(context: Context, intent: Intent) {
    super.onEnabled(context, intent)
    DeviceOwnerPolicy.apply(context)
  }
}
