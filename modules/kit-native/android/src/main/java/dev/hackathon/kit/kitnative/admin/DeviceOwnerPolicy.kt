package dev.hackathon.kit.kitnative.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log

// ── Device Owner（デモ専用）: Slope をアンインストールできないようにする ───────────────────
//
// 何のための部品か:
//   デモの間、子どもの端末から Slope を消して制限を外す、ができないようにする。
//
// なぜこの方法か（Android の制約）:
//   - ふつうのアプリは、自分のアンインストールを止められない。止められるのは「Device Owner（端末の管理者）」になったアプリだけで、
//     DevicePolicyManager.setUninstallBlocked(admin, 自分のパッケージ, true) を呼ぶ。
//   - Device Owner には、アプリの中からはなれない。初期化した直後（Google アカウントを入れる前）の端末に、PC から
//     `adb shell dpm set-device-owner …` で設定する（手順は docs/device-owner.md）。そのため「デモ専用」。
//   - Device Owner になっていない端末（ふつうの端末）では、何もしない（エラーにもしない）。
//   - Device Owner は `adb shell dpm remove-active-admin` では外せない（testOnly のアプリだけの例外）。外すには
//     アプリ自身が clearDeviceOwnerApp を呼ぶ必要があるので、release() を用意した（PC からは DeviceOwnerReleaseReceiver を使う）。
//
// 呼ばれるところ: 管理者になったとき（SlopeDeviceAdminReceiver.onEnabled）・アプリの起動（DeviceOwnerStartupPackage）・
// 端末の再起動とアプリの更新（DeviceOwnerBootReceiver）。何度呼んでも同じ結果になる。
object DeviceOwnerPolicy {
  private const val TAG = "SlopeDeviceOwner"

  fun admin(context: Context): ComponentName = ComponentName(context, SlopeDeviceAdminReceiver::class.java)

  private fun dpm(context: Context): DevicePolicyManager =
    context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  // この端末で Slope が Device Owner か
  fun isDeviceOwner(context: Context): Boolean = dpm(context).isDeviceOwnerApp(context.packageName)

  // Device Owner なら、アンインストールを止める。そうでなければ何もしない。止めたら true
  fun apply(context: Context): Boolean {
    if (!isDeviceOwner(context)) return false
    return try {
      val dpm = dpm(context)
      if (!dpm.isUninstallBlocked(admin(context), context.packageName)) {
        dpm.setUninstallBlocked(admin(context), context.packageName, true)
        Log.i(TAG, "アンインストールを止めました")
      }
      true
    } catch (e: SecurityException) {
      Log.w(TAG, "アンインストールを止められませんでした", e)
      false
    }
  }

  // デモの後に解除する: アンインストールの止めを外し、Device Owner をやめる。やめられたら true（もともと違えば false）
  @Suppress("DEPRECATION") // clearDeviceOwnerApp は API 26 で非推奨だが、Device Owner が自分をやめる手段として今も動く
  fun release(context: Context): Boolean {
    if (!isDeviceOwner(context)) return false
    return try {
      val dpm = dpm(context)
      dpm.setUninstallBlocked(admin(context), context.packageName, false)
      dpm.clearDeviceOwnerApp(context.packageName)
      Log.i(TAG, "Device Owner を解除しました")
      true
    } catch (e: SecurityException) {
      Log.w(TAG, "Device Owner を解除できませんでした", e)
      false
    }
  }

  // 状態（JS の窓口や確認用）。uninstallBlocked は Device Owner でなければ false
  fun status(context: Context): Map<String, Boolean> {
    val owner = isDeviceOwner(context)
    val blocked = owner && try {
      dpm(context).isUninstallBlocked(admin(context), context.packageName)
    } catch (_: SecurityException) {
      false
    }
    return mapOf("deviceOwner" to owner, "uninstallBlocked" to blocked)
  }
}
