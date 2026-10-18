# 別アプリUIDからのAndroidアクセス検査

対象: 既報のSlope debug APK、専用AVD `SlopeVerify` / Android17。検査アプリ `local.slope.securityprobe` はこの検査のために作成し、要求権限なし・INTERNET権限なし・独立した合成署名鍵とした。

## 結果

- Slope UID **10234**、検査アプリUID **10235**。署名証明書SHA256の相違も比較して確認した。
- Slopeの `databases/RKStorage` に対する `File.canRead()` はfalse。DBが存在することは先行のAVD内集計で確認済み。
- 次の4つのContentProviderは、別UIDからのqueryをすべて **SecurityExceptionで拒否**。取得行やデータ値は一切読んでいない。
  - FileSystemFileProvider
  - MlKitInitProvider
  - AndroidContextProvider
  - androidx.startup.InitializationProvider
- 非公開MonitorServiceとWebGuardServiceの明示的なstartServiceも **SecurityExceptionで拒否**。

証跡: [実行結果](runtime-evidence.json)、[APK識別・署名比較](build-evidence.json)。ソースとビルド手順は同じフォルダーのJava・Manifest・Pythonに保存。元のSlopeソースは変更していない。

## 判定と限界

AND-13の非公開データ境界は、実際の別署名・別UIDアプリによる今回の読出し・起動経路では **PASS**。通常shellによる先行確認から証拠を追加した。

Android OSの未知の脆弱性、root、全URI・全メソッド、exported部品の全入力、release APKを網羅した結果ではない。返されたDB行の中身を検査したものでもない。AND-01/02等のexported入力検査とは区別する。

検査アプリは実行後にforce-stopした。専用AVDへ検査用APKを追加した以外に、実端末・本番・既存アプリのデータ消去・device owner操作は行っていない。生成したAPK・一時鍵はリポジトリのtmp内にある。鍵は公開・製品署名には使わない。
