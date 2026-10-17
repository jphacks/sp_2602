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
   - パッケージ名: `app.json` の `android.package` の値（**決めてから登録する。あとで変えると登録し直し**）
   - SHA-1 証明書フィンガープリント（この PC の開発用の署名）:
     `FB:6E:3A:CA:EA:04:BC:B1:41:71:04:CF:6E:D5:C3:2B:C0:88:FC:D9`
5. リポジトリの直下の `.env` に、3 で控えた Web のクライアント ID を2行足す。

   ```
   GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```

   1行目はサーバが証明書の宛先を確かめるため、2行目はアプリがログインを始めるために使う。
6. アプリを作り直して端末に入れる（`npm run android`）。Google ログインは端末側の部品を使うので、作り直しが要る。

## 気をつけること

- **署名は PC ごとに違う。** 別の PC でアプリを作って入れるなら、その PC の SHA-1 で Android のクライアントをもう1つ登録する。
  SHA-1 の調べ方（Android Studio に付いている keytool を使う）:

  ```
  "C:\Program Files\Android\Android Studio\jbr\bin\keytool" -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
  ```

  出力の `SHA1:` の行を使う。
- 発表用に **release 版**（別の鍵で署名）を作るときも、その鍵の SHA-1 で Android のクライアントを登録する。
- 「DEVELOPER_ERROR」でログインが失敗するときは、ほぼ「パッケージ名か SHA-1 が登録と合っていない」か「Web のクライアント ID が違う」。
- クライアント ID は秘密ではないが、`.env` は Git に入れない（`.gitignore` 済み）。
