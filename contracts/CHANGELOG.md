# 契約の変更履歴

contracts/ を変えたら、同じ PR で必ず1行足す（CI と pre-commit が検査する）。
形式: `- HH:MM [追加|破壊] 何を変えたか — 影響する人 — Issue #番号`
「破壊」（既存のフィールド削除・型変更・名前変更）は同期点でしか入れない。

- 00:00 [追加] ひな型の初期契約（Item / AnalyzeRequest / AnalyzeResult / AnalyzeChunk / ApiError / api.health / api.analyze / api.analyzeStream） — 全員 — なし
