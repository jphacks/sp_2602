package dev.hackathon.kit.kitnative.admin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// ── 再起動・アプリの更新のあとに、アンインストールの止めを確かめ直す（Device Owner。デモ専用）──────
//
// 何のための部品か:
//   止めの設定は OS が覚えているが、念のため端末の再起動（BOOT_COMPLETED）とアプリの更新（MY_PACKAGE_REPLACED）のあとに
//   DeviceOwnerPolicy.apply を呼び直す。Device Owner でない端末では何もしない。
//
// なぜこの方法か（Android の制約）:
//   アプリが起動していなくても再起動を知るには、BOOT_COMPLETED を受ける受け手を AndroidManifest に置くしかない
//   （RECEIVE_BOOT_COMPLETED の権限が要る）。この2つの放送は OS しか送れないが、念のため action を確かめる。
class DeviceOwnerBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> DeviceOwnerPolicy.apply(context)
    }
  }
}
