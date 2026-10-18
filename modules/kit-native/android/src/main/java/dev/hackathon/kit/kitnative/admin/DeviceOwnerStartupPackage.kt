package dev.hackathon.kit.kitnative.admin

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

// ── アプリの起動のたびに、アンインストールの止めを確かめ直す（Device Owner。デモ専用）──────────
//
// 何のための部品か:
//   Slope が起動したとき（Application.onCreate）に DeviceOwnerPolicy.apply を呼ぶ。Device Owner でなければ何もしない。
//
// なぜこの方法か（Android / Expo の制約）:
//   - android/ は prebuild の生成物なので MainApplication.kt を直接書き換えられない（作り直すと消える）。
//   - Expo は、モジュールの中の「名前が …Package.kt で expo.modules.core.interfaces.Package を import しているクラス」を
//     自動で見つけ、起動時に ApplicationLifecycleListener.onCreate を呼んでくれる（expo-modules-autolinking）。
//     このファイル名（DeviceOwnerStartupPackage.kt）と import を変えると見つからなくなるので注意。
class DeviceOwnerStartupPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          DeviceOwnerPolicy.apply(application)
        }
      },
    )
}
