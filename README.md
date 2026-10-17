# サンプル（プロダクト名）

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## 製品概要
### 背景(製品開発のきっかけ、課題等）
### 製品説明（具体的な製品の説明）
### 特長
#### 1. 特長1
#### 2. 特長2
#### 3. 特長3

### 解決出来ること
### 今後の展望
### 注力したこと（こだわり等）
* 
* 

## 開発技術
### 活用した技術
#### API・データ
* 
* 

#### フレームワーク・ライブラリ・モジュール
* 
* 

#### デバイス
* 
* 

### 独自技術
#### ハッカソンで開発した独自機能・技術
* 独自で開発したものの内容をこちらに記載してください
* 特に力を入れた部分をファイルリンク、またはcommit_idを記載してください。

## 動かし方（開発者向け）
Android 向けのペアレンタルコントロールアプリ（React Native + Expo、Android 固有の処理は Kotlin、API は Hono）。
```
npm run kit:setup -- <自分のid>   # 最初に1回（依存・git hooks・.env・Android の準備・環境チェック）
npm run dev:server               # API サーバ（手元。.env の MOCK=1 で固定データを返す）
npm run dev                      # アプリの開発サーバ（Expo Development Build につなぐ）
npm run android                  # Android 16 の実機にアプリを入れて起動
```
実機の準備は [docs/kit/setup.md](docs/kit/setup.md)。チーム開発の枠組み（事前に用意した道具）の説明は [docs/kit/README.md](docs/kit/README.md)。
