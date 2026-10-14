# 検討中のこと（枠組みの未決事項）

決まったら該当のファイルを直して、ここから消す。

## 1. 当日の時刻表（未定）
- [ ] milestones の時刻（今は仮: 契約凍結 10:00 / 同期点 12:00・14:00 / フリーズ 17:30 / 録画 18:30）
- [ ] 同期点の数（今は 12:00・14:00・フリーズの3回が「合流を決める・見直す」時刻。16:00 を足すか）
- [ ] 切り出し型の合流を始めてよい期限（今は仮でフリーズの90分前: `help.carveOutCutoffMinBeforeFreeze`）

## 2. 合流の細部（ルール本体は docs/rules/help.md に移した）
- [ ] 緑 / 黄 / 赤の線引き（例：残りステップ × 45分 が残り時間の 70% 以下なら緑）
- [ ] 切り出したファイルの所有者を、終わったら元に戻すか（戻さなくても困らない、が今の考え）
- [ ] lead が全員の状況を一目で見る `npm run status` を作るか（全員の残りステップ・PR・blocked・合流中を一覧）

## 3. 前日までに lead がやること（Vercel + Neon。決定は docs/rules/stack.md）
- [ ] GitHub の個人アカウントにリポジトリを作り、メンバーを招待（Hobby は組織の非公開リポジトリから公開できない）
- [ ] Vercel でリポジトリを読み込み、Marketplace から Neon を追加（DATABASE_URL が自動で入る）。ANTHROPIC_API_KEY を設定
- [ ] `vercel env pull .env.local` → `npm run db:push` が Neon に通るか確かめる（未確認: drizzle-kit は Neon に WebSocket でつなぐ）
- [ ] 本番の URL で /api/health と、DB に書く API を1回ずつ叩く
