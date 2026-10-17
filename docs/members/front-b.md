# front-b — アプリの UX（流れ）: FigJam の状態遷移・画面の本体（Expo Router）・通しの確認

## 人間向け（最初に読む）
- ミッション: 使う人が迷わず DEMO.md の流れをたどれるよう、状態とイベントを決め、画面の本体で状態・イベント・通信をつなぐ
- 担当の場所: 画面の本体 `src/app/<画面id>/`（キックオフで画面 id に書き換え。`index.tsx` が画面の本体）・`docs/flow/`（状態遷移と状態・イベントの表）・`tests/e2e/`
- 動作確認: `.env` を MOCK=1 にして `npm run dev:server`（API）と `npm run android`（Android 16 の実機に入れて起動）を動かし、画面を操作する。見た目は `npm run shot`（adb で画面を撮る）で確かめる
- 詰まったら: 30分で解決しなければまとめ役（lead）に声をかける / `blocked` Issue。契約・API のことは lead へ
- Figma は Dev 席でよい（FigJam は編集できる。Figma Design は見る・Dev Mode で数値を読むだけ）

## front-a（UI）との分け方
画面は「front-a が見た目の部品（`src/components/`）を作り、front-b が画面の本体でそれを並べ、状態・イベント・通信をつなぐ」。同じファイルを2人で触らない。
- Kotlin の機能（使用時間の取得・制限の状態など）は、画面から `src/lib/native.ts` の窓口だけを通して呼ぶ。Android の機能を直接触らない（Kotlin は back-a）
- 画面の本体の仕事: 今どの状態か（読み込み中・成功・失敗・データなし）を持つ、`call()` / `stream()` でサーバとやり取りする、`useFlow()` で次の画面にデータを渡す、`contracts/screens.md` どおりに画面を移る
- 見た目は部品に任せる。画面の本体には並べ方（余白・順番）だけを書く。足りない部品・状態は front-a に Issue
- まだ部品がない時は、`src/components/ui/` の共通部品で仮に組んでよい（後で front-a の部品に差し替える）

## 状態遷移（FigJam）
状態遷移図と状態・イベントの表が **チームの流れの元**。front-a の線画（画面遷移の試作）と lead の契約は、ここから作る。書き方は `docs/flow/README.md`。

| いつ | やること | 置き場所 |
|---|---|---|
| キックオフ〜11:10 | DEMO.md の流れから **状態遷移図**（状態とイベント）を描き、**状態・イベントの表** にする（状態ごとに: 出す内容・押せるもの・次の状態・必要なデータ） | FigJam、`docs/flow/README.md` |
| 11:20（5分） | **全員で試作を触る** を進行する（front-a の線画を実機で開く）。聞くこと: この画面で一番知りたい答えはどこに出ているか／足りない状態（待ち・失敗・データなし）はないか | — |
| 11:20〜11:30 | 試して直した表を lead に渡す。lead が状態ごとに受け渡すデータ・MOCK の固定データを契約に入れる | lead が `contracts/` |
| 状態を足す・変える時 | 先に表を直し、front-a（線画・部品）と lead（契約）に知らせる | — |

## 図の担当: フローチャート（FigJam）
- 流れ: フローチャート（front-b）→ UI（front-a）／データフローチャート（back-a）→ データフローダイアグラム（DFD）と ER図（lead）。全体は docs/rules/team.md「図の流れ」
- 描くもの: 状態と、状態が変わるきっかけ（イベント）・分かれ道の条件。下の「状態遷移（FigJam）」の図がこれにあたる
- 元にするもの: DEMO.md ／ 渡す先: front-a（UI の線画）と back-a（データフローチャート）
- 目安: キックオフ〜11:10 に下書き、11:20 に全員で試作を触る。状態が増えた・変わったら front-a と back-a に Issue で知らせる

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（画面遷移の `screens.md` も。変えたい時は change-request Issue）
- 部品 `src/components/`（front-a）、`modules/kit-native/`（Kotlin は back-a）、`docs/design/`（front-a）、`docs/DEMO.md`・`docs/pitch/`（lead）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 状態遷移図（FigJam）と状態・イベントの表（`docs/flow/README.md`。FigJam のリンクも）。11:20 に全員で試作を触り、直した表を lead に渡す — 完了確認: `npm run check`
- S2 画面の本体を組む（`src/app/<画面id>/`。状態・イベントの表の行ごとに状態を持ち、部品を並べる。部品がまだなら共通部品で仮に） — 完了確認: `npm run check`
- S3 画面をサーバとつなぐ（`call()` / `stream()`・`useFlow()`）。待ち・失敗・データなしは表どおり（screens.md の UX の約束） — 完了確認: `npm run check`
- S4 front-a の画面ごとの部品に差し替え、表どおりに画面を移るか実機で確かめる — 完了確認: `npm run check`
- S5 状態・イベントの表を e2e に（`tests/e2e/`。表の行ごとに、その状態で出る文言を確かめる）。DEMO.md どおりに main を通しで操作して問題を Issue に — 完了確認: `npm run check`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
