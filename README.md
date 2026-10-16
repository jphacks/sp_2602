# （プロダクト名）

（1文で：誰の、どんな困りごとを、どう解決するか）

Android 向けのペアレンタルコントロールアプリ（React Native + Expo、Android 固有の処理は Kotlin、API は Hono）。

## デモ
（動画 / スクリーンショット / APK の配布先）

## 使い方
```
npm ci
cp .env.example .env
npm run dev:server    # API サーバ（手元）
npm run dev           # アプリの開発サーバ（Expo Development Build につなぐ）
npm run android       # Android 16 の実機にアプリを入れて起動
```
実機の準備は docs/kit/setup.md。

## 事前に準備したもの / Hack Day に作ったもの
| 区分 | 内容 |
|---|---|
| 事前準備（道具） | チーム開発の枠組み（docs/kit/）、開発環境の設定、CI |
| Hack Day に作成 | （契約・画面・サーバ処理・Kotlin の監視・制限処理など） |

## チーム
