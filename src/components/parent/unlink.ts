// 親04 設定の「子どもとの連携を外す」（D-133。Figma にない）の分かれ道と文（純粋な関数。UnlinkChildItem.tsx が使う。tests/parent/unlink.test.ts）。
// 流れ（ダイアログは1つで、中身を順に替える。どの段でもキャンセル・Android の戻るで閉じる。キャンセルが既定）:
//   closed → warn（何が起きるかの警告。「次へ」）→ confirm（もう一度だけ確かめる。「連携を外す」）→ sending（押せない）
//     → done（「連携を外しました」。OK で QR の読み取り（/pair/parent）へ置き換えて移る。設定の画面には戻らない）
//     → 失敗したら閉じて、設定の画面の上に帯（ErrorBanner）を出す（PeriodEditor の削除と同じ流儀）
// なぜ二段階か: 外すと子どもの利用記録・設定がすべて消え、元に戻せない（backend/src/db/family-unlink.ts）。1回押しただけで
//   消えないように、警告を読んで「次へ」、もう一度「連携を外す」の2回押してはじめて送る
// すばやい二度押しで一段階にならないように: 「次へ」と「連携を外す」は同じ位置に描かれるので、confirm に入ってから
//   UNLINK_CONFIRM_DELAY_MS（400ms）の間は「連携を外す」を押せない（見た目も押せない形。unlinkSendWait・canSendUnlink）
import type { ApiError } from "@contracts/errors";
import type { Child } from "@contracts/schemas";

export type UnlinkStep = "closed" | "warn" | "confirm" | "sending" | "done";

// 失敗を設定の画面に出す形。reload: 子どもの一覧を読み直す。retry: 帯に「もう一度ためす」を出す（confirm からやり直す）
export type UnlinkFailure = { error: ApiError; reload: boolean; retry: boolean };

// child: 外そうとしている子ども（開いたときの名前のまま出す。外したあとに一覧から消えても、done の文に名前が残るように）
// confirmedAt: confirm に入った時刻（ミリ秒。confirm でなければ null）。すぐあとの「連携を外す」を止めるのに使う
export type UnlinkView = {
  step: UnlinkStep;
  child: Child | null;
  failure: UnlinkFailure | null;
  confirmedAt: number | null;
};

export type UnlinkEvent =
  | { type: "open"; child: Child } // 行を押した
  | { type: "next"; at: number } // warn の「次へ」（at は押した時刻）
  | { type: "cancel" } // キャンセル・戻る（送っている間は閉じない）
  | { type: "send"; at: number } // confirm の「連携を外す」（confirm に入ってすぐは無視する）
  | { type: "succeeded" }
  | { type: "failed"; error: ApiError }
  | { type: "retry"; at: number } // 帯の「もう一度ためす」（警告は読んだので confirm から）
  | { type: "gone"; childId: string } // 失敗のあと読み直したら、その子どもが一覧から消えていた（外れていた）
  | { type: "finish" }; // done の OK

export const initialUnlinkView: UnlinkView = { step: "closed", child: null, failure: null, confirmedAt: null };

// confirm に入ってから「連携を外す」を押せるまでの間（すばやい二度押しで、確かめを読まずに送らないように）
export const UNLINK_CONFIRM_DELAY_MS = 400;

// 「連携を外す」を押せるようになるまで、あと何ミリ秒か（0 = もう押せる）。confirm でなければ null（押せない）。
// 時計が戻った（now が入った時刻より前）ときは、入った時刻から数え直す形で待たせる
export function unlinkSendWait(view: UnlinkView, now: number): number | null {
  if (view.step !== "confirm" || view.confirmedAt == null) return null;
  const passed = now - view.confirmedAt;
  if (passed < 0) return UNLINK_CONFIRM_DELAY_MS;
  return Math.max(0, UNLINK_CONFIRM_DELAY_MS - passed);
}

// 今「連携を外す」を受け付けるか（confirm の段で、入ってから UNLINK_CONFIRM_DELAY_MS たった）
export function canSendUnlink(view: UnlinkView, now: number): boolean {
  return unlinkSendWait(view, now) === 0;
}

// 失敗のあと（帯で「もう一度ためす」を出している）、読み直した子どもの一覧に、外そうとした子どもがもういないか。
// いなければ、返事が届かなかっただけでサーバでは外れていた（通信・時間切れ）。family が null（まだ読めていない）なら分からないので false
export function unlinkedAfterFailure(view: UnlinkView, family: readonly Pick<Child, "id">[] | null): boolean {
  const target = view.child;
  if (view.step !== "closed" || !view.failure?.retry || !target || family == null) return false;
  return !family.some((c) => c.id === target.id);
}

// 失敗のあと読み直したら外れていたときの帯（「もう一度ためす」は出さない。送り直しても not_found になるだけ）
export const UNLINK_GONE_ERROR: ApiError = {
  code: "not_found",
  message: "連携は外れていました",
  hint: "返事は届きませんでしたが、子どもの一覧から消えていました",
};

export function unlinkReducer(view: UnlinkView, event: UnlinkEvent): UnlinkView {
  switch (event.type) {
    case "open":
      return view.step === "closed" ? { step: "warn", child: event.child, failure: null, confirmedAt: null } : view;
    case "next":
      return view.step === "warn" ? { ...view, step: "confirm", confirmedAt: event.at } : view;
    case "cancel":
      return view.step === "warn" || view.step === "confirm" ? { ...view, step: "closed", confirmedAt: null } : view;
    case "send":
      return canSendUnlink(view, event.at) ? { ...view, step: "sending", failure: null, confirmedAt: null } : view;
    case "succeeded":
      return view.step === "sending" ? { ...view, step: "done" } : view;
    case "failed":
      return view.step === "sending" ? { ...view, step: "closed", failure: unlinkFailure(event.error) } : view;
    case "retry":
      return view.step === "closed" && view.failure?.retry && view.child
        ? { ...view, step: "confirm", failure: null, confirmedAt: event.at }
        : view;
    case "gone":
      return view.step === "closed" && view.failure?.retry && view.child?.id === event.childId
        ? { ...view, failure: { error: UNLINK_GONE_ERROR, reload: false, retry: false } }
        : view;
    case "finish":
      return view.step === "done" ? initialUnlinkView : view;
  }
}

// 失敗の出し方。
//   not_found（もう外れている）・forbidden（連携していない子ども・保護者でなくなった）: 一覧を読み直す。送り直しても同じなので「もう一度」は出さない
//   network・timeout: サーバでは外れたのに返事だけ届かなかったかもしれないので、一覧を読み直したうえで「もう一度」も出す
//     （読み直したら子どもが一覧から消えていた＝外れていたなら、「gone」で「もう一度」を消す。unlinkedAfterFailure）
//   rate_limited・unavailable など: サーバの文（待ってから）をそのまま出し、「もう一度」を出す
export function unlinkFailure(error: ApiError): UnlinkFailure {
  if (error.code === "not_found" || error.code === "forbidden")
    return { error: { ...error, hint: "子どもの一覧を読み直しました" }, reload: true, retry: false };
  if (error.code === "network" || error.code === "timeout") return { error, reload: true, retry: true };
  return { error, reload: false, retry: true };
}

// 子どもの名前（空なら「子ども」）
const nameOf = (child: Child | null) => `「${child?.name || "子ども"}」`;

// 外すと起きること（warn の本文の箇条書き）
export const UNLINK_EFFECTS = [
  "子どものスマホはログアウトされ、使える時間の制限が止まります",
  "利用記録・計画・テスト日程・空白期間・制限対象外アプリ・制限する Web サイトの設定が、すべて消えます",
  "もう一度つなぐときは、子どものスマホで QR コードを出すところからやり直します",
] as const;

// done の下に小さく添える、次に起きること（OK で QR の読み取りへ移る）
export const UNLINK_DONE_NEXT = "OK を押すと、新しくつなぐための QR コードの読み取りに進みます。";

export type UnlinkText = { title: string; body: string };

export function unlinkText(step: UnlinkStep, child: Child | null): UnlinkText {
  switch (step) {
    case "warn":
      return { title: `${nameOf(child)}との連携を外しますか？`, body: "外すと、次のようになります。元に戻せません。" };
    case "confirm":
    case "sending":
      return {
        title: "本当に外しますか？",
        body: `${nameOf(child)}との連携を外します。消えた記録と設定は元に戻せません。`,
      };
    case "done":
      return {
        title: "連携を外しました",
        body: `${nameOf(child)}のスマホは、次に通信したときにログアウトされ、制限が止まります。`,
      };
    case "closed":
      return { title: "", body: "" };
  }
}
