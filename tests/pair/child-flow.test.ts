// 子ども側の QR の紐づけ（子13〜子19）の表示の分かれ道のテスト（src/components/pair/child-flow.ts）。
// MVP_SPEC 4.1: 保存の確定（linked）まで成功を出さない・応答が消えたら照会して成功/失敗/不明を区別する・Q10 の 10 分。
import type { ApiError } from "@contracts/errors";
import { mockPair } from "@contracts/fixtures";
import type { PairStatus } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  type ChildPairEvent,
  type ChildPairView,
  childPairReducer,
  initialChildPairView,
  issueFailedText,
  localDeadline,
  PAIR_TTL_MS,
  remainingLabel,
  shouldPoll,
  ticketOf,
} from "@/components/pair/child-flow";

const t0 = Date.parse("2026-10-17T10:00:00+09:00");
const ticket = { pairId: "demo-pair", code: "demo-code-123456", expiresAt: "2026-10-17T10:10:00+09:00" };
const err = (code: ApiError["code"], message = "x"): ApiError => ({ code, message, hint: "y" });
const status = (state: PairStatus["state"], over: Partial<PairStatus> = {}): PairStatus => ({
  ...mockPair[state],
  ...over,
});

const run = (events: ChildPairEvent[], from: ChildPairView = initialChildPairView) =>
  events.reduce(childPairReducer, from);
const issued: ChildPairEvent = { type: "issued", ticket, receivedAt: t0 };
const showing = run([issued]);
const asking = run([{ type: "status", status: status("claimed") }], showing);
const answeringYes = run([{ type: "answer", accept: true }], asking);

describe("子13 → 子14 → 子16: QR をつくる", () => {
  it("最初は子13（つくっている）", () => {
    expect(initialChildPairView).toEqual({ screen: "issuing" });
  });

  it("チケットが届いたら子14。QR に入れるのは code だけ（チケットの code をそのまま持つ）", () => {
    expect(showing).toMatchObject({ screen: "showing", offline: false, ticket: { code: "demo-code-123456" } });
    expect(ticketOf(showing)?.deadline).toBe(Date.parse(ticket.expiresAt));
  });

  it("つくれなかったら子16（理由を持つ）。「もう一度つくる」で子13 に戻る", () => {
    const failed = run([{ type: "issueFailed", error: err("network", "通信できませんでした") }]);
    expect(failed).toEqual({ screen: "issueFailed", error: err("network", "通信できませんでした") });
    expect(run([{ type: "start" }], failed)).toEqual({ screen: "issuing" });
  });

  it("子14 を出した後に届いたチケット・失敗は無視する（二重に届いても表示を壊さない）", () => {
    expect(run([{ ...issued, ticket: { ...ticket, pairId: "other" } }], showing)).toBe(showing);
    expect(run([{ type: "issueFailed", error: err("network") }], showing)).toBe(showing);
  });
});

describe("子14: 読み取りを待つ", () => {
  it("waiting の間は子14 のまま。通信できなければ「通信できません」を足す（QR は出したまま）", () => {
    expect(run([{ type: "status", status: status("waiting") }], showing)).toMatchObject({ screen: "showing" });
    const off = run([{ type: "statusFailed", error: err("network") }], showing);
    expect(off).toMatchObject({ screen: "showing", offline: true });
    expect(run([{ type: "status", status: status("waiting") }], off)).toMatchObject({ offline: false });
  });

  it("保護者が読んだ（claimed）→ 子18「〇〇さんの家族に入りますか？」に保護者の名前を出す", () => {
    expect(asking).toMatchObject({ screen: "asking", parentName: "デモの保護者" });
  });

  it("名前がないときは「保護者」と出す（空の名前にしない）", () => {
    expect(run([{ type: "status", status: status("claimed", { parentName: null }) }], showing)).toMatchObject({
      parentName: "保護者",
    });
  });

  it("前に出した QR の応答（pairId が違う）は捨てる", () => {
    const old = status("claimed", { pairId: "old-pair" });
    expect(run([{ type: "status", status: old }], showing)).toBe(showing);
  });

  it("サーバがこのペアリングを知らない（not_found）→ 子15（もう使えない）", () => {
    expect(run([{ type: "statusFailed", error: err("not_found") }], showing)).toEqual({ screen: "expired" });
  });

  it("サーバが expired → 子15。「つくり直す」で子13", () => {
    const expired = run([{ type: "status", status: status("expired") }], showing);
    expect(expired).toEqual({ screen: "expired" });
    expect(run([{ type: "start" }], expired)).toEqual({ screen: "issuing" });
  });
});

describe("子14 の残り時間（Q10: 10分）", () => {
  it("「9分41秒」の形。1分未満は秒だけ。過ぎたら 0秒", () => {
    const deadline = t0 + PAIR_TTL_MS;
    expect(remainingLabel(deadline, t0)).toBe("10分0秒");
    expect(remainingLabel(deadline, t0 + 19_000)).toBe("9分41秒");
    expect(remainingLabel(deadline, deadline - 41_000)).toBe("41秒");
    expect(remainingLabel(deadline, deadline + 5_000)).toBe("0秒");
  });

  it("締め切りを過ぎたら、サーバの答えを待たずに子15", () => {
    expect(run([{ type: "tick", now: t0 + PAIR_TTL_MS - 1 }], showing)).toBe(showing);
    expect(run([{ type: "tick", now: t0 + PAIR_TTL_MS }], showing)).toEqual({ screen: "expired" });
    expect(run([{ type: "tick", now: t0 + PAIR_TTL_MS }], asking)).toEqual({ screen: "expired" });
  });

  it("はい/いいえを送っている間・確かめている間は、時計では切らない（サーバの結果を待つ）", () => {
    expect(run([{ type: "tick", now: t0 + PAIR_TTL_MS * 2 }], answeringYes)).toBe(answeringYes);
  });

  it("端末の時計がずれて、期限が過ぎている／10分より先に見えるときは、受け取ってから10分にする", () => {
    expect(localDeadline(ticket.expiresAt, t0)).toBe(t0 + PAIR_TTL_MS);
    expect(localDeadline(ticket.expiresAt, t0 + 20 * 60_000)).toBe(t0 + 30 * 60_000);
    expect(localDeadline(ticket.expiresAt, t0 - 60 * 60_000)).toBe(t0 - 50 * 60_000);
    expect(localDeadline("こわれた日時", t0)).toBe(t0 + PAIR_TTL_MS);
  });
});

describe("子18 → 子19 / 子17: 「はい、入る」", () => {
  it("押したら送信中（ボタンを押せない）。サーバが linked を返したときだけ子19", () => {
    expect(answeringYes).toMatchObject({ screen: "answering", accept: true });
    expect(run([{ type: "status", status: status("linked") }], answeringYes)).toEqual({
      screen: "linked",
      parentName: "デモの保護者",
    });
  });

  it("送信中に届いた古い claimed で、子18 に戻さない", () => {
    expect(run([{ type: "status", status: status("claimed") }], answeringYes)).toBe(answeringYes);
  });

  it("応答が届かない（通信・時間切れ・サーバの不具合）→ 成功とも失敗とも言わず子17", () => {
    for (const code of ["network", "timeout", "internal", "upstream_failed"] as const) {
      expect(run([{ type: "answerFailed", error: err(code) }], answeringYes)).toMatchObject({
        screen: "checking",
        busy: false,
      });
    }
  });

  it("子17 で照会: linked → 子19、claimed（届いていなかった）→ 子18 に戻る、聞けない → 子17 のまま", () => {
    const checking = run([{ type: "answerFailed", error: err("network") }], answeringYes);
    expect(run([{ type: "status", status: status("linked") }], checking)).toMatchObject({ screen: "linked" });
    expect(run([{ type: "status", status: status("claimed") }], checking)).toMatchObject({ screen: "asking" });
    const busy = run([{ type: "recheck" }], checking);
    expect(busy).toMatchObject({ screen: "checking", busy: true });
    expect(run([{ type: "statusFailed", error: err("network") }], busy)).toMatchObject({
      screen: "checking",
      busy: false,
    });
  });

  it("サーバがはっきり断った（期限切れ・すでに連携済みの conflict）→ 共03（まだつながっていない）に理由を出す", () => {
    const e = err("conflict", "いまは保護者1人と子ども1人だけで連携できます");
    expect(run([{ type: "answerFailed", error: e }], answeringYes)).toEqual({ screen: "failed", error: e });
    expect(run([{ type: "answerFailed", error: err("not_found") }], answeringYes)).toEqual({ screen: "expired" });
  });
});

describe("子18: 「いいえ」", () => {
  it("rejected になったら、役割選びへ戻る表示", () => {
    const no = run([{ type: "answer", accept: false }], asking);
    expect(no).toMatchObject({ screen: "answering", accept: false });
    expect(run([{ type: "status", status: status("rejected") }], no)).toEqual({ screen: "rejected" });
  });
});

describe("進み具合を聞くか（usePolling の enabled）", () => {
  it("子14・子18・子17 だけ聞く。送信中・結果が出た後・つくっている間は聞かない", () => {
    const checking = run([{ type: "answerFailed", error: err("network") }], answeringYes);
    expect([showing, asking, checking].map(shouldPoll)).toEqual([true, true, true]);
    expect(
      [
        initialChildPairView,
        answeringYes,
        { screen: "expired" } as const,
        { screen: "linked", parentName: null } as const,
      ].map(shouldPoll),
    ).toEqual([false, false, false, false]);
  });
});

// 子16: すでに連携済みの子どもが QR を出そうとすると 409（conflict）が返る（実機 A53 で再現: 「通信を確かめて」と出ていた）
describe("子16 の文とボタン（issueFailedText）", () => {
  it("連携済み（conflict）は通信のせいにせず、サーバの hint を出してホームへ（もう一度つくっても同じ失敗になる）", () => {
    const r = issueFailedText({
      code: "conflict",
      message: "すでにほかの家族と連携しています",
      hint: "いまは保護者1人と子ども1人だけで連携できます（2人目は連携できません）",
    });
    expect(r.body).not.toContain("通信");
    expect(r.body).toBe("いまは保護者1人と子ども1人だけで連携できます（2人目は連携できません）");
    expect(r.next).toBe("home");
  });

  it("通信できない・時間切れは「通信を確かめて」ともう一度つくる", () => {
    for (const code of ["network", "timeout"] as const) {
      const r = issueFailedText(err(code));
      expect(r.body).toContain("通信を確かめて");
      expect(r.next).toBe("retry");
    }
  });

  it("サーバの一時的な不具合・混み合いは、通信のせいにせず待ってもう一度", () => {
    for (const code of ["internal", "upstream_failed", "rate_limited"] as const) {
      const r = issueFailedText(err(code));
      expect(r.body).not.toContain("通信");
      expect(r.next).toBe("retry");
    }
  });

  it("forbidden・bad_request もサーバの hint を出してホームへ", () => {
    for (const code of ["forbidden", "bad_request", "not_found"] as const) {
      expect(issueFailedText(err(code))).toEqual({ body: "y", next: "home" });
    }
  });
});
