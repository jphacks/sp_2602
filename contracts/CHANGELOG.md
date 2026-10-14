# 契約の変更履歴

contracts/ を変えたら、同じ PR で必ず1行足す（CI と pre-commit が検査する）。
形式: `- HH:MM [追加|破壊] 何を変えたか — 影響する人 — Issue #番号`
「破壊」（既存のフィールド削除・型変更・名前変更）は同期点でしか入れない。

- 00:00 [追加] ひな型の初期契約（Item / AnalyzeRequest / AnalyzeResult / AnalyzeChunk / ApiError / api.health / api.analyze / api.analyzeStream） — 全員 — なし
- 00:00 [追加] StreamDef（ストリームの API 1本の形。stream()/handleStream() が使う。ストリームの API が0本でも型が崩れない） — back・lead — なし
- 00:00 [追加] screens.md の所有者を5人構成に（home = front-a / result = front-b。型は変更なし） — front-a・front-b — なし
