package dev.hackathon.kit.kitnative

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android 固有の処理（使用中アプリの検出・使用時間の取得・制限画面の表示など）は、このモジュールに足していく。
// 画面や共通の処理は、ここを直接呼ばず src/lib/native.ts を経由する（将来 iOS の Swift に差し替えられるようにするため）。
// Kotlin を書き換えたら、アプリを作り直す（npm run android）。Fast Refresh では反映されない。
class KitNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KitNative")

    // JavaScript から Kotlin を呼べるかの確認用（足し方の見本。要らなくなったら消してよい）
    Function("ping") {
      "Kotlin から返事です（Android API ${Build.VERSION.SDK_INT}）"
    }
  }
}
