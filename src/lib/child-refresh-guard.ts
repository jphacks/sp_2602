// 子どもの画面の定期取得（child-data.tsx の refresh）で、取得を待ったあとに続き（C4: 判定の値を Kotlin に渡す saveRestriction・
// 監視を始める startEngine、C8: 送信待ちに入れる enqueue・送る flush、Q15: アプリの一覧）をしてよいか（D-133 の再検査）。
// してはいけないとき:
//   - 待っている間に Session が入れ替わった・消えた（合言葉が始めと違う・null。session-core.ts はログアウト状態にするとき、まず null にする）
//   - 設定の取得（configGet）が unauthorized（401）だった（合言葉がもう無効。連携が外れた 401 なら、片付けが走っている）
// なぜ: 連携が外れた 401 の片付け（Kotlin の監視を止め、送り先も消す）が走っている間に、getDailyUsage などの続きが終わると、
//   そのあとで saveRestriction・startEngine が走って制限が戻る。Kotlin の送り先は消えているので、二度と止まらない。
//   同じ流れで enqueue が送信待ちを消した（removeChild）あとに書くと、外された子どもの記録が送信待ちに戻る
// 純粋な関数（tests/lib/child-refresh-guard.test.ts）。React・expo を読まない
import type { ConfigState } from "./config-cache";

export function canApplyChildRefresh(
  tokenAtStart: string | null,
  tokenNow: string | null,
  config: ConfigState,
): boolean {
  if (tokenAtStart == null || tokenNow !== tokenAtStart) return false;
  return config.status === "fresh" || config.error?.code !== "unauthorized";
}
