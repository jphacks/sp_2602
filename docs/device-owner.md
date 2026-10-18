# Slope を消せないようにする（Device Owner・デモ専用）

デモの間、子どものスマホから Slope を**アンインストールできないようにする**手順です。
プログラミングを知らなくても進められるように、打つコマンドはそのまま写せる形で書いています。

> **デモ専用です。** 手順の最初でスマホを**初期化（中身を全部消す）**します。ふだん使っているスマホではやらないでください。

## 1. これは何か

- Android では、ふつうのアプリは「自分を消させない」ことができません。できるのは、スマホの**管理者（Device Owner）**に指名されたアプリだけです。
- Slope を管理者に指名すると、Slope は起動のたびに「Slope をアンインストールできないようにする」設定をかけます（`DevicePolicyManager.setUninstallBlocked`）。
- 管理者には、**初期化した直後**（Google アカウントを入れる前）のスマホに、PC からコマンドで指名するしかありません（Android の決まり）。だからデモ専用です。
- 管理者になっていないスマホ（ふつうに Slope を入れたスマホ）では、Slope は何もしません。

| 部品 | ファイル |
|---|---|
| 管理者の「受け手」（指名するときに名前を使う） | `modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/admin/SlopeDeviceAdminReceiver.kt` |
| 止める・解除する処理 | 同じフォルダの `DeviceOwnerPolicy.kt` |
| 起動・再起動・更新のあとに止めをかけ直す | 同じフォルダの `DeviceOwnerStartupPackage.kt`・`DeviceOwnerBootReceiver.kt` |
| PC から解除する入口 | 同じフォルダの `DeviceOwnerReleaseReceiver.kt` |

## 2. 先に知っておくこと（注意）

- **初期化すると、スマホの写真・アプリ・設定が全部消えます。** 戻せません。
- **Google アカウント（ほかのアカウントも）を入れる前**でないと、管理者に指名できません。アカウントは指名が終わってから入れます。
- 管理者のままだと、Slope は**ふつうの方法では消せません**。デモが終わったら「6. 解除のしかた」で解除してください。
- 管理者のままでも、**同じ PC で作った Slope の上書き**（`npm run android` や `adb install -r`）はできます。
  別の PC で作った Slope や、開発版から release 版（自分たちの鍵で署名。[release-signing.md](release-signing.md)）への入れ替えなど「署名」が違うものは、いったん消してから入れ直す必要があり、管理者のままだと消せません。その前に解除してください。
- 受け手のクラスの名前（`SlopeDeviceAdminReceiver`）や置き場所を変えた Slope に上書きすると、指名が外れます。名前は変えないでください。

## 3. 用意するもの

- 初期化してよい Android のスマホ（デモで子ども役に使うもの）
- USB ケーブル、PC（`adb` が使えること。Android Studio を入れていれば `platform-tools` の中にあります）
- Slope のアプリ（`npm run android` で入れるか、作った apk のファイル）

PC で `adb version` と打って、バージョンが出れば `adb` は使えます。

## 4. 管理者にする手順

### 4-1. スマホを初期化する

1. スマホの「設定」を開く。
2. 「一般管理」→「リセット」→「工場出荷状態に初期化」（Galaxy の場合。ほかの機種は「システム」→「リセット オプション」→「全データを消去」）。
3. 画面に従って初期化する。終わると最初の設定の画面になります。

### 4-2. Google アカウントを入れずに初期設定をすませる

1. 言語・Wi-Fi は、ふつうに設定してかまいません。
2. **Google アカウントのログインは「スキップ」**します（「後で」「スキップ」を選ぶ）。
3. Galaxy の場合、**Samsung アカウントも入れません**（スキップ）。
4. ホーム画面が出るまで進めます。

### 4-3. USB デバッグをオンにする

1. 「設定」→「端末情報」→「ソフトウェア情報」を開く（機種によっては「設定」→「デバイス情報」）。
2. 「ビルド番号」を **7回続けて**押す。「開発者モードが有効になりました」と出ます。
3. 「設定」に戻り、いちばん下の「開発者向けオプション」→「USB デバッグ」をオンにする。
4. スマホと PC を USB でつなぎ、スマホに「USB デバッグを許可しますか？」と出たら「許可」を押す。
5. PC で次を打ち、スマホの番号の横に `device` と出ることを確かめる。

```
adb devices
```

### 4-4. Slope を入れる

どちらかの方法で入れます。

- 開発用の PC から: リポジトリのフォルダで `npm run android`
- apk のファイルから: `adb install app-debug.apk`（ファイル名は実際のものに合わせる）

### 4-5. Slope を管理者に指名する

PC で次の1行を**そのまま**打ちます。

```
adb shell dpm set-device-owner com.quedotcom.androidslope/dev.hackathon.kit.kitnative.admin.SlopeDeviceAdminReceiver
```

うまくいくと、次のような文が出ます。

```
Success: Device owner set to package ComponentInfo{com.quedotcom.androidslope/dev.hackathon.kit.kitnative.admin.SlopeDeviceAdminReceiver}
Active admin set to component {com.quedotcom.androidslope/dev.hackathon.kit.kitnative.admin.SlopeDeviceAdminReceiver}
```

指名されたときに、Slope はすぐに「消せない」設定をかけます。

### 4-6. 消せないことを確かめる

- スマホで Slope のアイコンを長押しして「アンインストール」を選ぶ → 「管理者によってブロックされています」のような表示になり、消せません。
- PC で次を打つ → `DELETE_FAILED_DEVICE_POLICY_MANAGER` と出て、消せません。

```
adb uninstall com.quedotcom.androidslope
```

> もし消えてしまったら、最初の指名がうまくいっていません。「5. うまくいかないとき」を見てください（消えた場合は、もう一度 4-4 から）。

管理者になっているかは、次でも確かめられます（`com.quedotcom.androidslope` の行が出れば指名されています）。

```
adb shell dpm list-owners
```

### 4-7. そのあと Google アカウントを入れる

指名が終わったら、「設定」→「アカウントとバックアップ」→「アカウント管理」→「アカウントを追加」から Google アカウントを入れてかまいません。
Play ストアなども、ふつうに使えます。

## 5. うまくいかないとき

`dpm set-device-owner` を打ったときに出る文で見分けます。

| 出た文（の一部） | 原因 | どうするか |
|---|---|---|
| `there are already some accounts on the device` | スマホにアカウントが入っている（Google・Samsung・LINE などアプリのアカウントも含む） | 「設定」→「アカウント」で全部削除してから打ち直す。消せない・分からないときは 4-1 の初期化からやり直す |
| `there are already several users on the device` | 2人目のユーザー・ゲスト・Galaxy の「セキュアフォルダ」や「デュアルメッセンジャー」がある | それらを削除してから打ち直す。分からないときは初期化からやり直す |
| `Unknown admin` | Slope が入っていない・古い Slope（この機能が入る前のもの）・コマンドの打ち間違い | 4-4 で新しい Slope を入れ直し、コマンドをコピーして貼り付ける |
| `device owner is already set` | もう管理者が指名されている（Slope か、別のアプリ） | `adb shell dpm list-owners` で確かめる。Slope なら何もしなくてよい |
| `adb: command not found`／`'adb' は…認識されていません` | PC に adb がない・場所が通っていない | Android Studio の `platform-tools` のフォルダで打つか、そのフォルダを PATH に足す |
| `unauthorized`（`adb devices` の結果） | スマホで「USB デバッグを許可」を押していない | ケーブルを抜き差しして、スマホに出る確認で「許可」を押す |
| `no devices/emulators found` | つながっていない | ケーブルを替える・USB の接続モードを「ファイル転送」にする・4-3 をやり直す |

## 6. 解除のしかた（デモのあと）

`adb shell dpm remove-active-admin …` では**解除できません**（Android の決まりで、管理者（Device Owner）はこのコマンドでは外せない）。
Slope 自身に「管理者をやめる」処理を入れてあるので、PC から次のように頼みます。

1. 4-3 と同じように、スマホを PC に USB でつなぐ（USB デバッグはオンのまま）。
2. PC で次の1行を**そのまま**打つ。

```
adb shell am broadcast -a dev.hackathon.kit.kitnative.action.RELEASE_DEVICE_OWNER -n com.quedotcom.androidslope/dev.hackathon.kit.kitnative.admin.DeviceOwnerReleaseReceiver
```

3. 次のように出たら解除できています（`result=1`・`released`）。

```
Broadcast completed: result=1, data="released"
```

   `result=0, data="not_device_owner"` と出たら、もともと管理者ではありません（そのまま消せます）。

4. ふつうにアンインストールできるようになります。PC からなら次の1行です。

```
adb uninstall com.quedotcom.androidslope
```

- この解除の入口は、USB でつないだ PC からしか使えません（ほかのアプリからは呼べないようにしてある）。
- **保護者が子どもとの連携を外したときは、Slope が自分で解除します**（D-133・D-134）。子どもの端末が「連携が外れた」401（`reason: "family_unlink"`）を受けたとき（アプリを開いたとき・監視の約1分ごとの確かめ・許可の状態の送信）に、監視を止めるのと一緒に管理者をやめます（`LocalData.clearUnlinked`・JS の `native.releaseDeviceOwner`）。ログアウト・合言葉の期限切れでは解除しません。また、送り先が http の release 版では「連携が外れた」を信じないので解除しません（偽の返事で外されないように。送り先が https か、開発用のビルドのときだけ解除する。SECURITY_TEST/fixes.md の M-8）。そのときは上の手順で解除してください。一度解除すると、もう一度管理者にするには初期化からやり直します（4章）。
- どうしても解除できないときは、**初期化すれば必ず外れます**（中身は全部消えます）。

## 7. 確かめたこと・まだのこと

- Kotlin と XML のコンパイル（`./gradlew :app:compileDebugKotlin`）と、AndroidManifest への組み込みは確かめました。
- **実機で 4〜6 の手順を通したかは、まだ確かめていません。** 確かめたら、この行を直してください。
