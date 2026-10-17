# Google ログインの準備（Google Cloud への登録）

Slope は、保護者も子どもも Google アカウントでログインします。
本物の Google ログインを使うには、Google Cloud に「このアプリ」を登録して、**クライアント ID**（アプリを見分ける番号）をもらう必要があります。
登録が終わるまでは、アプリは「MOCK のログイン」（保護者・子ども・はじめての人をボタンで選ぶ）で動きます。

## 仕組み（なぜ2つ登録するのか）

```
[端末のアプリ] --Google にログイン--> [Google]
      |  ID トークン（Google が発行した「この人です」という証明書）を受け取る
      v
[Slope のサーバ] -- 証明書の署名と宛先（Web のクライアント ID）を確かめる --> 合言葉（セッション）を発行
```

- **Web のクライアント ID**: 証明書の「宛先」になる番号。アプリとサーバの両方に同じ値を入れる。
- **Android のクライアント ID**: 「このアプリ（識別子 + 署名）が Google ログインを使ってよい」という登録。値はどこにも入れないが、登録がないとログインが失敗する。

## 手順

1. https://console.cloud.google.com/ を開き、新しいプロジェクト「Slope」を作る。
2. 左のメニューの「Google Auth Platform」（または「API とサービス」→「OAuth 同意画面」）を開く。
   - アプリ名: `Slope`、サポートのメール: 自分のアドレス。
   - 対象（Audience）: 「外部」。公開の状態は「テスト」のままでよい。
   - **テストユーザーに、2台の Galaxy で使う Google アカウントをすべて足す**（テスト中は、ここに足した人しかログインできない）。
3. 「クライアント」→「クライアントを作成」→ 種類「**ウェブ アプリケーション**」、名前「Slope server」。
   - できたクライアント ID（`xxxx.apps.googleusercontent.com`）を控える。シークレットは使わない。
4. もう一度「クライアントを作成」→ 種類「**Android**」、名前「Slope Android (debug)」。
   - パッケージ名: `com.quedotcom.androidslope`（`app.json` の `android.package` と同じ。**変えると登録し直し**）
   - SHA-1 証明書フィンガープリント（Expo が作る開発用の鍵 `android/app/debug.keystore` の署名）:
     `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
     （`npx expo prebuild` が毎回同じ鍵を置くので、どの PC で作っても同じ値になる。
     `%USERPROFILE%\.android\debug.keystore`（PC ごとの鍵）の値ではないので注意）
5. リポジトリの直下の `.env` に、3 で控えた Web のクライアント ID を2行足す。

   ```
   GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```

   1行目はサーバが証明書の宛先を確かめるため、2行目はアプリがログインを始めるために使う。
6. アプリを作り直して端末に入れる（`npm run android`）。Google ログインは端末側の部品を使うので、作り直しが要る。

## 気をつけること

- **開発版の署名はどの PC でも同じ**（上の `5E:8F:…:F6:25`）。端末に入っているアプリの署名を確かめるには、
  端末から APK を取り出して Android SDK の apksigner で見る:

  ```
  adb shell pm path com.quedotcom.androidslope
  adb pull <上で出たパス> slope.apk
  "%LOCALAPPDATA%\Android\Sdk\build-tools\<版>\apksigner.bat" verify --print-certs slope.apk
  ```

  出力の `SHA-1 digest` が登録した値と同じならよい。
- 発表用に **release 版**（別の鍵で署名）を作るときも、その鍵の SHA-1 で Android のクライアントを登録する。
- 「DEVELOPER_ERROR」でログインが失敗するときは、ほぼ「パッケージ名か SHA-1 が登録と合っていない」か「Web のクライアント ID が違う」。
- クライアント ID は秘密ではないが、`.env` は Git に入れない（`.gitignore` 済み）。
