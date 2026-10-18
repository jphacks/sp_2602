# 再開後の追加検査

## 別アプリの境界

権限なし・Slopeと異なる署名鍵/UIDの検査アプリを専用AVDで実行した。DBは読めず、全4 Providerとアプリ非公開2 ServiceはSecurityExceptionで拒否。詳しくは [別アプリ検査](../platform-app/REPORT.md)。AND-13は今回の読出し・起動経路でPASSへ更新。

## 最近使ったアプリのプレビュー

- [ログイン中のプレビュー](recents-protected-parent.png) には、子どもの利用分数・上限・記録時刻・権限状態が読める形で表示された。合成データのみを撮影。
- [ログアウト後のプレビュー](recents-after-signout-preview.png) はログイン画面に更新され、前の利用分数や権限状態は見えなかった。両PNGを目視確認。
- 認証秘密・QRはこの画面に表示していない。QR画面のプレビュー保護は未検査。
- 前者はプレビューへの機微情報露出という観測事項。AND-07の期待条件は「画面保護を要件に応じて判断し理由を記録」であり、保護対象画面と許可するプレビューの決定、通知画面の検査が残るため、直ちに新規FAILとはせずBLOCKEDを維持する。P0の既存FAILとは分けて担当者へ共有する。

## Intent / deep link

- [6ケースの集計](intent-followup.json): URIなしで偽のrole/型違いchildId、他家族を指定した親設定、偽pair ID、連携設定、想定外host、16KiBのextraをMainActivityへ渡した。
- 最初の4ケースはログイン画面に留まった。想定外hostはUnmatched Routeへ進み、16KiB extraだけの起動でもその画面が継続した。どちらも親の保護画面への遷移ではない。プロセスは生存していた。
- 追加の不正schemeでもログイン画面に留まった（`intent-wrong-scheme.xml`）。正規rootへ戻した証拠は `intent-final-root.xml`。
- AND-03はテストした製品MainActivityのscheme/host/path改変についてPASS。すべてのexported部品を試した結果ではなく、AND-02/IPA-10/IPA-14等は未完了のまま。dev-client専用schemeや実OAuth callbackの検証ではない。

## タイムゾーン

- 初期値GMT・auto_time_zone1。America/Los_Angelesへ変えると、端末の日付は10月17日PDTになった。
- 子どもの使用割合画面は日本時間の10月18日と同じ割合を表示（`timezone-la-usage.xml`、`timezone-la-confirmed.xml`）。`contracts/dates.ts` のAsia/Tokyo固定という仕様と一致。native UsageReaderも日本時間の区切りを使う。
- GMTへ戻した後も同日・同割合を維持（`timezone-gmt-usage.xml`）。[変更と復元の証拠](timezone-evidence.json)。最初のdate表示コマンドは引数引用の失敗があり、証拠には使わず、後続の空白なし形式で再確認した。
- 実際のシステム時計の巻き戻し・未来送り、日付境界をまたぐ長時間検査は行っていない。AND-11は部分確認。

## Release manifest

不足依存を専用キャッシュへ取得し、実際のrelease merged Manifestを生成できた。debugの開発用3画面が除かれていた。[詳しい検査結果](../release-manifest/REPORT.md)。署名済みAPKやTLS通信の検査と混同しない。


## 通常再起動と一時停止

専用AVDの通常rebootを実施。最初の31秒の待機内ではboot完了を観測できなかったが、後続確認でsys.boot_completed=1、bootanim停止を確認した。ADB reverseを復帰してアプリを開くと、有効な保存セッションで子画面・3%表示を復元。送信待ちは0だった（reboot-child-settled.xml、reboot-child-storage.json、reboot-evidence.json）。未認証扱いを迂回した結果ではなく、既存の有効なセッションによる復帰である。

ユーザーの一時停止指示により、検査をここで区切った。使用状況アクセスをdefaultへ戻し、合成ユーザーをログアウト。後片付け後の保存状態はpause-logged-out-storage.json。GMTへ復帰済み。検査用サーバー・Metro・両検査アプリを停止し、追加検査は開始しない。
