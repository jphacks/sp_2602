// 許可の見張りと親への通告（docs/decisions.md D-113）: Kotlin の監視（MonitorService）に、許可の状態の送り先と合言葉を渡すかを決める。
// session.tsx がログインの状態が変わるたびに呼ぶ（ログイン時・起動時に渡し、ログアウト・401 で消す）。
//   - 子どもとしてログインしている（オフラインで続けている間も）→ 渡す
//   - 保護者・役割のない人・ログアウトした・合言葉が無効になった（401）→ 消す
//   - 確かめ中 → 何もしない（起動直後に、前回の送り先を一度消してから渡し直すことをしない）
// 中身は純粋な関数（tests/lib/status-reporter.test.ts）。native.ts を読まない（Node のテストで expo を読まないため）
import type { Session } from "@contracts/schemas";

export type StatusReporterAction =
  | { kind: "set"; url: string; token: string; childId: string }
  | { kind: "clear" }
  | { kind: "keep" };

type State = { status: "checking" } | { status: "signedOut" } | { status: "signedIn"; session: Session };

export function statusReporterAction(state: State, url: string): StatusReporterAction {
  if (state.status === "checking") return { kind: "keep" };
  if (state.status === "signedIn" && state.session.role === "child")
    return { kind: "set", url, token: state.session.token, childId: state.session.userId };
  return { kind: "clear" };
}

export function applyStatusReporter(
  action: StatusReporterAction,
  target: { setStatusReporter: (url: string, token: string, childId: string) => void; clearStatusReporter: () => void },
): void {
  if (action.kind === "set") target.setStatusReporter(action.url, action.token, action.childId);
  else if (action.kind === "clear") target.clearStatusReporter();
}
