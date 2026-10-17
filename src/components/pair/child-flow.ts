// 子ども側の QR の紐づけ（Figma 子13〜子19）で「今どの表示を出すか」を決める純粋な関数（画面 src/app/pair/child.tsx が使う）。
// 画面は、通信の結果や時計の進みを「出来事（ChildPairEvent）」として childPairReducer に渡すだけにし、分かれ道はここに集める。
//   子13 issuing（QR をつくっている）→ 子14 showing（QR を出して保護者の読み取りを待つ）
//   → 子18 asking（「〇〇さんの家族に入りますか？」）→ answering（はい/いいえを送っている）
//   → 子19 linked（D2 に保存が確定した）
//   途中: 子15 expired（サーバが期限切れ・取消と判定）/ 子16 issueFailed（QR をつくれない）/
//         子17 checking（答えを送ったが結果が分からない。MVP_SPEC 4.1「レスポンス消失時は照会して成功/失敗/不明を区別」）/
//         rejected（「いいえ」を押した）/ failed（業務上の理由で確定できなかった。共03 の形で出す）
import type { ApiError } from "@contracts/errors";
import type { PairStatus, PairTicket } from "@contracts/schemas";

// QR の有効期限は未決。expiresAt がある場合のみ、端末の時計で表示用に扱う。
// 読み取りを待つ間に pairStatus を聞く間隔（保護者が読んだら数秒で「家族に入りますか？」を出したいので短め）
export const PAIR_POLL_MS = 3_000;

// 出している QR。deadline はこの端末の時計での締め切り（ミリ秒）
export type ShownTicket = PairTicket & { deadline: number };

export type ChildPairView =
  | { screen: "issuing" } // 子13
  | { screen: "issueFailed"; error: ApiError } // 子16
  | { screen: "showing"; ticket: ShownTicket; offline: boolean } // 子14（offline = 進み具合を聞けていない）
  | { screen: "asking"; ticket: ShownTicket; parentName: string } // 子18
  | { screen: "answering"; ticket: ShownTicket; parentName: string; accept: boolean } // 子18 で送っている間
  | { screen: "checking"; ticket: ShownTicket; busy: boolean } // 子17
  | { screen: "expired" } // 子15
  | { screen: "linked"; parentName: string | null } // 子19
  | { screen: "rejected" } // 「いいえ」→ 役割選びへ戻る
  | { screen: "failed"; error: ApiError }; // 共03（まだつながっていません）＋理由

export type ChildPairEvent =
  | { type: "start" } // QR をつくる（最初・つくり直す・もう一度つくる）
  | { type: "issued"; ticket: PairTicket; receivedAt: number }
  | { type: "issueFailed"; error: ApiError }
  | { type: "status"; status: PairStatus } // pairStatus・pairConfirm の応答
  | { type: "statusFailed"; error: ApiError } // pairStatus が失敗した
  | { type: "answer"; accept: boolean } // 子18 で「はい、入る」「いいえ」を押した
  | { type: "answerFailed"; error: ApiError } // pairConfirm が失敗した
  | { type: "recheck" } // 子17 の「もう一度確かめる」
  | { type: "tick"; now: number }; // 1秒ごとの時計

export const initialChildPairView: ChildPairView = { screen: "issuing" };

// この端末の時計での締め切り。サーバが期限を設定しない場合は無期限表示にする。
export function localDeadline(expiresAt: string | null, receivedAt: number): number {
  if (expiresAt === null) return Number.POSITIVE_INFINITY;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

// 子14 のチップの「9分41秒」。0 未満は 0 秒。1分未満は「41秒」だけ
export function remainingLabel(deadline: number, now: number): string {
  const sec = Math.max(0, Math.ceil((deadline - now) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

// 今出している QR（なければ null）。pairStatus を聞くのに使う
export function ticketOf(view: ChildPairView): ShownTicket | null {
  return "ticket" in view ? view.ticket : null;
}

// pairStatus を定期的に聞くべき表示か（子14・子18・子17。送っている間は応答を待つので聞かない）
export function shouldPoll(view: ChildPairView): boolean {
  return view.screen === "showing" || view.screen === "asking" || view.screen === "checking";
}

// 結果が分からない失敗か（通信が切れた・時間切れ・サーバの一時的な不具合）。これは「失敗」と決めつけず照会する
export function isUncertain(error: ApiError): boolean {
  return (
    error.code === "network" ||
    error.code === "timeout" ||
    error.code === "internal" ||
    error.code === "upstream_failed" ||
    error.code === "rate_limited"
  );
}

// サーバの進み具合（PairStatus）を表示に直す
function fromStatus(view: ChildPairView, ticket: ShownTicket, status: PairStatus): ChildPairView {
  switch (status.state) {
    case "waiting":
      return { screen: "showing", ticket, offline: false };
    case "claimed": {
      const parentName = status.parentName ?? "保護者";
      // 送っている間に届いた古い「claimed」で、送信中の表示を戻さない
      if (view.screen === "answering") return view;
      if (view.screen === "asking" && view.parentName === parentName) return view;
      return { screen: "asking", ticket, parentName };
    }
    case "linked":
      return { screen: "linked", parentName: status.parentName };
    case "expired":
      return { screen: "expired" };
    case "rejected":
      return { screen: "rejected" };
  }
}

export function childPairReducer(view: ChildPairView, event: ChildPairEvent): ChildPairView {
  switch (event.type) {
    case "start":
      return { screen: "issuing" };
    case "issued":
      if (view.screen !== "issuing") return view;
      return {
        screen: "showing",
        ticket: { ...event.ticket, deadline: localDeadline(event.ticket.expiresAt, event.receivedAt) },
        offline: false,
      };
    case "issueFailed":
      return view.screen === "issuing" ? { screen: "issueFailed", error: event.error } : view;
    case "status": {
      const ticket = ticketOf(view);
      // 前に出した QR の応答（出し直した後に遅れて届いたもの）は捨てる
      if (!ticket || event.status.pairId !== ticket.pairId) return view;
      return fromStatus(view, ticket, event.status);
    }
    case "statusFailed": {
      const ticket = ticketOf(view);
      if (!ticket) return view;
      // not_found = サーバがこのペアリングを知らない → QR の状態を確認できない
      if (event.error.code === "not_found") return { screen: "expired" };
      if (view.screen === "showing") return view.offline ? view : { ...view, offline: true };
      if (view.screen === "checking") return view.busy ? { ...view, busy: false } : view;
      return view; // 子18・送信中は、聞けなくても表示を変えない（次の回でまた聞く）
    }
    case "answer":
      if (view.screen !== "asking") return view;
      return { screen: "answering", ticket: view.ticket, parentName: view.parentName, accept: event.accept };
    case "answerFailed":
      if (view.screen !== "answering") return view;
      // 応答が届かなかった・サーバの不具合 → D2 に保存されたかもしれないので、成功とも失敗とも言わず照会する（子17）
      if (isUncertain(event.error)) return { screen: "checking", ticket: view.ticket, busy: false };
      if (event.error.code === "not_found") return { screen: "expired" };
      // 期限切れ・使用済みなど、サーバがはっきり断った → まだつながっていない（共03）
      return { screen: "failed", error: event.error };
    case "recheck":
      return view.screen === "checking" ? { ...view, busy: true } : view;
    case "tick":
      // 送っている間・確かめている間は、時計では切らない（サーバの答えを待つ）
      if (
        (view.screen === "showing" || view.screen === "asking") &&
        view.ticket.expiresAt !== null &&
        event.now >= view.ticket.deadline
      )
        return { screen: "expired" };
      return view;
  }
}
