# 決まったこと

新しいものを下に足す。形式: `- HH:MM 決定内容（決めた場 / 決めた人）`
覆す時は消さずに `~~取り消し線~~` にして、新しい行で理由を書く。

- 10/16 データベースは Vercel 上の Neon（Postgres）にする。Supabase は使わない。端末から直接つながず、API サーバ経由にする（tmp/docs/モバイル化方針.md 2節 / lead）
- 10/16 API サーバは Hono を Vercel Functions で動かす。Next.js をやめても route.ts と同じ形で書け、Zod の型を共有できるため（モバイル化方針.md 5.1 / lead）
- 10/16 React Native のスタイルは StyleSheet + `tokens.ts`（色・余白の名前だけを使う）にする。名前だけの規則をスクリプトで検査でき、NativeWind は設定が増えるため（モバイル化方針.md 5.1 / lead）
- 10/16 パッケージ管理は npm のまま。変える理由がないため（モバイル化方針.md 5.1 / lead）
