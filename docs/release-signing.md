# release 版の署名（自分たちの鍵を作って使う）

Slope の **release 版**（発表やデモで配る、開発用の画面がない版）は、**自分たちだけが持っている鍵**で署名します。
開発版（`npm run android` で作る debug 版・dev client）は今までどおり Expo の開発用の鍵のままで、この手順は要りません。

## なぜ要るか

- prebuild が作る `android/app/build.gradle` は、そのままだと release も**開発用の鍵 `debug.keystore`** で署名します。
  この鍵は Expo の雛形に入っている公開の鍵で、**誰でも同じものを持っています**。
- 同じ鍵で署名した APK は「同じアプリの新しい版」として上書きできます。誰かが書き換えた Slope を作って上書きすると、
  **Device Owner（消せない管理者）の力もそのまま引き継がれます**。
- そこで `plugins/with-release-signing.ts`（config plugin。`app.json` の `plugins` に登録済み）が、prebuild のたびに
  release の署名を「自分たちの鍵」に書き換えます。`android/` は生成物なので、`android/app/build.gradle` を手で直しても次の prebuild で消えます。

## 仕組み

- 鍵のファイルの場所とパスワードは**リポジトリに入れません**。次の4つの値を、PC のユーザーごとのファイル
  `%USERPROFILE%\.gradle\gradle.properties`（Mac・Linux は `~/.gradle/gradle.properties`）か、同じ名前の環境変数から読みます。

  | 名前 | 中身 |
  |---|---|
  | `SLOPE_UPLOAD_STORE_FILE` | 鍵のファイル（`.jks`）の場所。フルパスで書く |
  | `SLOPE_UPLOAD_STORE_PASSWORD` | 鍵のファイルのパスワード |
  | `SLOPE_UPLOAD_KEY_ALIAS` | 鍵の名前（下の例では `slope-upload`） |
  | `SLOPE_UPLOAD_KEY_PASSWORD` | 鍵のパスワード（PKCS12 の鍵ではファイルのパスワードと同じ） |

- 値が足りない・鍵のファイルが見つからないまま release を作ろうとすると、**開発用の鍵には戻さずに止まります**
  （`slopeCheckReleaseSigning` というタスクが `preReleaseBuild` の前に走る）。止まったときの表示:

  ```
  Slope: release 版を署名する鍵の設定が足りないので止めました（debug 鍵には戻しません）。
  release signing is not configured (SLOPE_UPLOAD_*). See docs/release-signing.md
    - SLOPE_UPLOAD_STORE_FILE がありません
    ...
  ```

- debug 版・dev client は、この4つの値がなくても今までどおり作れます。
- EAS Build（環境変数 `EAS_BUILD=true`）は、EAS が自分の鍵（credentials）で署名するので、この確認を飛ばします。
  EAS で作るときは、その鍵の SHA-1 を別に Google Cloud に登録します（下の4）。

## 手順

### 1. 鍵を作る（1回だけ）

鍵は**リポジトリの外**に置きます（例: `%USERPROFILE%\.slope\`）。`.gitignore` に `*.jks` と `*.keystore` が入っていますが、リポジトリの中には置かないでください。

```
mkdir "%USERPROFILE%\.slope"
"%JAVA_HOME%\bin\keytool" -genkeypair -v -storetype PKCS12 -keystore "%USERPROFILE%\.slope\slope-upload.jks" -alias slope-upload -keyalg RSA -keysize 2048 -validity 10000
```

- `JAVA_HOME` は Android Studio の Java（例: `C:\Program Files\Android\Android Studio\jbr`）。
- パスワードを2回と、名前・組織などを聞かれます（名前などは何でもよい）。PKCS12 では鍵のパスワードはファイルのパスワードと同じになります。
- **鍵とパスワードをなくすと、同じ Slope として上書き更新できなくなります。** 鍵のファイルを安全な場所にもう1つ写し、パスワードはパスワード管理の道具に控えてください。鍵は人に渡さない・チャットに貼らない。

### 2. gradle.properties に書く

`%USERPROFILE%\.gradle\gradle.properties` を作る（あれば足す）。**パスは `\` ではなく `/` で書きます**（`\` はこのファイルでは特別な文字）。

```
SLOPE_UPLOAD_STORE_FILE=C:/Users/<自分のユーザー名>/.slope/slope-upload.jks
SLOPE_UPLOAD_STORE_PASSWORD=<1 で決めたパスワード>
SLOPE_UPLOAD_KEY_ALIAS=slope-upload
SLOPE_UPLOAD_KEY_PASSWORD=<1 で決めたパスワード>
```

このファイルはリポジトリの外（PC のユーザーごと）なので Git には入りません。リポジトリの `android/gradle.properties` には書かないでください。

### 3. release 版を作る

```
npx expo prebuild --platform android --no-install --clean
cd android
.\gradlew.bat assembleRelease
```

できた APK は `android/app/build/outputs/apk/release/app-release.apk`。端末に入れたまま確かめるなら `npx expo run:android --variant release` でもよい。

署名を確かめる（`SHA-1 digest` が 4 で出す値と同じならよい）:

```
"%LOCALAPPDATA%\Android\Sdk\build-tools\<版>\apksigner.bat" verify --print-certs android\app\build\outputs\apk\release\app-release.apk
```

### 4. Google ログイン用に、新しい鍵の SHA-1 を登録する

Google ログインは「パッケージ名 + 署名の SHA-1」で端末のアプリを見分けます。鍵が変わると SHA-1 も変わるので、**登録しないと release 版のログインが `DEVELOPER_ERROR` で失敗します。**

1. SHA-1 を出す:

   ```
   "%JAVA_HOME%\bin\keytool" -list -v -keystore "%USERPROFILE%\.slope\slope-upload.jks" -alias slope-upload
   ```

   `SHA1:` の行（`AA:BB:…` の 20 組）を控える。
2. [google-login-setup.md](google-login-setup.md) の 4 と同じように、Google Cloud の「クライアント」→「クライアントを作成」→ 種類「**Android**」。
   - 名前: 「Slope Android (release)」
   - パッケージ名: `com.quedotcom.androidslope`（開発版と同じ）
   - SHA-1: 1 で控えた値
3. 開発版の Android のクライアント（「Slope Android (debug)」）は消さずに残す（debug 版のログインに使う）。
4. Web のクライアント ID は変わらないので、`.env` は直さなくてよい。
5. EAS Build で作る版は EAS の鍵で署名されるので、その SHA-1 でもう1つ Android のクライアントを作る。

### 5. 端末の Slope を release 版に入れ替える

開発版（開発用の鍵）で入っている Slope に、release 版（自分たちの鍵）は**上書きできません**（署名が違う）。

1. Device Owner にしている端末は、先に [device-owner.md](device-owner.md) の「6. 解除のしかた」で解除する（管理者のままだと消せない）。
2. Slope を消す（端末の中の合言葉・設定も消えるので、ログインと QR の紐づけはやり直し）。
3. release 版を入れる（`adb install android\app\build\outputs\apk\release\app-release.apk`）。
4. Device Owner を使うなら、[device-owner.md](device-owner.md) の手順で指名し直す。

## 気をつけること

- 鍵のファイル・パスワード・`gradle.properties` は Git に入れない・人に渡さない。
- 別の PC で release 版を作るときは、同じ鍵のファイルと `gradle.properties` の4つの値が要る（違う鍵で作ると、上書きできない別の署名になる）。
- `plugins/with-release-signing.ts` は、Expo の雛形の `build.gradle` が想定と違うと prebuild を止めます（黙って開発用の鍵のままにしないため）。Expo を上げて止まったら、plugin を新しい雛形に合わせて直してください。
