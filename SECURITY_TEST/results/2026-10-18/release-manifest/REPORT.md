# Release用merged Manifestの追加検査

元ソース `0ddfc7e` の隔離コピーで、`processReleaseMainManifest` が成功。結果を [AndroidManifest.xml](AndroidManifest.xml) と [inventory.json](inventory.json) に保存。

## 生成方法・制限

`gradlew :app:processReleaseMainManifest -x :app:slopeCheckReleaseSigning --no-daemon --max-workers=2`

署名鍵の検査タスクは、Manifestだけの検査のため明示的に除外した。**署名済みrelease APKのビルド成功、署名設定の合格を意味しない。** 配布・インストール・公開は行っていない。最初のoffline実行は不足依存により失敗。その後、専用Gradleキャッシュに公開依存を取得して成功した。製品ソース・署名鍵・ユーザー用Gradle設定は変更していない。

## 観測

- targetSdk36、allowBackup=false、専用dataExtractionRules指定。
- applicationに `debuggable` / `usesCleartextTraffic` / `networkSecurityConfig` の明示属性なし。debugで見られたtrueの属性はこのrelease mergeにはない。
- exportedはdebugの11個から **8個**。除去されたのはDevLauncherActivity、DevLauncherAuthActivity、ComposePreviewActivity。
- 残るexported部品はMainActivity、SlopeWidget、DeviceAdminReceiver、DeviceOwnerBootReceiver、DeviceOwnerReleaseReceiver、BootReceiver、Google RevocationBoundService、ProfileInstallReceiver。
- DeviceAdminReceiverはBIND_DEVICE_ADMIN、DeviceOwnerReleaseReceiverとProfileInstallReceiverはDUMP、Googleのserviceは専用権限で保護。
- 2つのBootReceiverはソース上、BOOT_COMPLETED / MY_PACKAGE_REPLACEDだけに処理を限定。監視再開には保存状態、device-owner処理には既存の所有者状態を使う。高権限処理を試しに実行することはしていない。
- 非公開Provider・アプリの非公開serviceはdebug上で別UIDアプリから拒否を検証済み。releaseの実機動作へそのまま一般化しない。

## 残る確認

署名済みrelease APKでの最終Manifest・証明書・TLS/HTTP拒否・高権限部品の安全な入力検査は未完了。属性の省略だけから、実通信が拒否されたとは判定しない。NET-01/02とAND-01は部分確認を追加したうえでBLOCKEDを維持する。
