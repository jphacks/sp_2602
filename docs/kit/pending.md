# 検討中のこと（枠組みの未決事項）

決まったら該当のファイルを直して、ここから消す。

## 1. 当日の時刻表（運営の日程は確定: 10/17 10:20〜 / 中間発表 18:50 / 10/18 Code Freeze 15:00 / ピッチ 16:00・90秒）
- [ ] 締め切りのやること（kit.config.json の deadlines）の中身・担当・優先度をチームで見直す（今は案）
- [ ] 目安（milestones）の時刻（今は案: 契約凍結 11:30 / 同期点1 14:00 / 第1統合 17:00 / 夜 20:30 / 2日目 9:50 / フリーズ 13:30 / 録画 14:30）
- [ ] 切り出し型の合流を始めてよい期限（今は仮でフリーズの90分前: `help.carveOutCutoffMinBeforeFreeze`）

## 2. 合流の細部（ルール本体は docs/rules/help.md に移した）
- [ ] 緑 / 黄 / 赤の線引き（例：残りステップ × 45分 が残り時間の 70% 以下なら緑）
- [ ] 切り出したファイルの所有者を、終わったら元に戻すか（戻さなくても困らない、が今の考え）

## 3. 前日までに lead がやること（Vercel + Neon。決定は docs/rules/stack.md）
- [ ] JPHACKS のチームのリポジトリに push できるか・自分たちの権限（ブランチ保護・Secrets・ラベルを作れるか）を確かめる
- [ ] JPHACKS のルールで、事前に用意してよい範囲（このキット・ひな型・動画の枠）を確かめる（作業メモ14: 製品の中心は Hack Day に作る）
- [ ] Vercel への公開を A（GitHub 連携）か B（Vercel CLI）に決める（docs/rules/stack.md）
- [ ] Vercel でリポジトリを読み込み、Marketplace から Neon を追加（DATABASE_URL が自動で入る）。ANTHROPIC_API_KEY を設定
- [ ] `vercel env pull .env.local` → `npm run db:push` が Neon に通るか確かめる（未確認: drizzle-kit は Neon に WebSocket でつなぐ）
- [ ] 本番の URL で /api/health と、DB に書く API を1回ずつ叩く
