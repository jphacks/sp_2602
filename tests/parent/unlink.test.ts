// 親04 設定の「子どもとの連携を外す」の分かれ道と文（src/components/parent/unlink.ts。D-133）。
// 二段階（警告 →「次へ」→ もう一度確かめる →「連携を外す」）を通らないと送らないこと、送っている間は閉じないこと、
// 失敗の出し方（読み直す・もう一度）を確かめる
import type { ApiError } from "@contracts/errors";
import { describe, expect, it } from "vitest";
import {
  canSendUnlink,
  initialUnlinkView,
  UNLINK_CONFIRM_DELAY_MS,
  UNLINK_DONE_NEXT,
  UNLINK_EFFECTS,
  UNLINK_GONE_ERROR,
  type UnlinkEvent,
  type UnlinkView,
  unlinkedAfterFailure,
  unlinkFailure,
  unlinkReducer,
  unlinkSendWait,
  unlinkText,
} from "@/components/parent/unlink";

const child = { id: "6f1c2e7a-1b2c-4d3e-8f90-123456789abc", name: "たろう" };
const run = (events: UnlinkEvent[], from: UnlinkView = initialUnlinkView) => events.reduce(unlinkReducer, from);
const err = (code: ApiError["code"]): ApiError => ({ code, message: `m-${code}`, hint: `h-${code}` });
// 時刻（ミリ秒）。「次へ」を T0 に押し、「連携を外す」は待つ間（UNLINK_CONFIRM_DELAY_MS）がたってから押す
const T0 = 1_000_000;
const LATER = T0 + UNLINK_CONFIRM_DELAY_MS;
const next: UnlinkEvent = { type: "next", at: T0 };
const send: UnlinkEvent = { type: "send", at: LATER };

describe("unlinkReducer: 二段階の確認", () => {
  it("行を押す → 警告 →「次へ」→ 確かめ →「連携を外す」で、はじめて送る（sending）。成功で done、OK で閉じる", () => {
    let v = run([{ type: "open", child }]);
    expect(v).toEqual({ step: "warn", child, failure: null, confirmedAt: null });
    // 警告の段では送れない（「連携を外す」の出来事が来ても無視）
    expect(unlinkReducer(v, send).step).toBe("warn");
    v = unlinkReducer(v, next);
    expect(v.step).toBe("confirm");
    v = unlinkReducer(v, send);
    expect(v.step).toBe("sending");
    v = unlinkReducer(v, { type: "succeeded" });
    expect(v).toEqual({ step: "done", child, failure: null, confirmedAt: null });
    expect(unlinkReducer(v, { type: "finish" })).toEqual(initialUnlinkView);
  });

  it("警告・確かめのどちらでもキャンセルで閉じる。送っている間・外したあとはキャンセルで閉じない", () => {
    expect(run([{ type: "open", child }, { type: "cancel" }]).step).toBe("closed");
    expect(run([{ type: "open", child }, next, { type: "cancel" }]).step).toBe("closed");
    const sending = run([{ type: "open", child }, next, send]);
    expect(unlinkReducer(sending, { type: "cancel" }).step).toBe("sending");
    const done = unlinkReducer(sending, { type: "succeeded" });
    expect(unlinkReducer(done, { type: "cancel" }).step).toBe("done");
  });

  it("開いたあとに「もう一度開く」が来ても、段は戻らない（二度押し）", () => {
    const v = run([{ type: "open", child }, next]);
    expect(unlinkReducer(v, { type: "open", child }).step).toBe("confirm");
  });

  it("失敗したら閉じて帯を出す。「もう一度ためす」は確かめの段から（警告はもう読んだ）", () => {
    const failed = run([{ type: "open", child }, next, send, { type: "failed", error: err("rate_limited") }]);
    expect(failed.step).toBe("closed");
    expect(failed.failure).toEqual({ error: err("rate_limited"), reload: false, retry: true });
    const again = unlinkReducer(failed, { type: "retry", at: LATER });
    expect(again).toEqual({ step: "confirm", child, failure: null, confirmedAt: LATER });
  });

  it("もう外れていた（not_found）・403 は「もう一度」を出さない（retry は無視）", () => {
    const failed = run([{ type: "open", child }, next, send, { type: "failed", error: err("not_found") }]);
    expect(unlinkReducer(failed, { type: "retry", at: LATER })).toBe(failed);
  });

  it("また行を押したら、前の帯は消える", () => {
    const failed = run([{ type: "open", child }, next, send, { type: "failed", error: err("network") }]);
    expect(unlinkReducer(failed, { type: "open", child }).failure).toBeNull();
  });
});

describe("すばやい二度押しで一段階にならない（「次へ」と「連携を外す」は同じ位置）", () => {
  const confirm = run([{ type: "open", child }, next]);

  it("confirm に入ってから UNLINK_CONFIRM_DELAY_MS（400ms）の間は「連携を外す」を受け付けない", () => {
    expect(UNLINK_CONFIRM_DELAY_MS).toBe(400);
    expect(confirm.confirmedAt).toBe(T0);
    for (const at of [T0, T0 + 1, T0 + 100, LATER - 1])
      expect(unlinkReducer(confirm, { type: "send", at })).toBe(confirm);
    expect(unlinkReducer(confirm, { type: "send", at: LATER }).step).toBe("sending");
  });

  it("unlinkSendWait: 押せるまでの残り。confirm でなければ null（押せない）", () => {
    expect(unlinkSendWait(confirm, T0)).toBe(UNLINK_CONFIRM_DELAY_MS);
    expect(unlinkSendWait(confirm, T0 + 150)).toBe(UNLINK_CONFIRM_DELAY_MS - 150);
    expect(unlinkSendWait(confirm, LATER)).toBe(0);
    expect(unlinkSendWait(confirm, LATER + 60_000)).toBe(0);
    expect(unlinkSendWait(initialUnlinkView, LATER)).toBeNull();
    expect(unlinkSendWait(run([{ type: "open", child }]), LATER)).toBeNull();
    expect(unlinkSendWait(unlinkReducer(confirm, send), LATER)).toBeNull();
  });

  it("時計が戻った（入った時刻より前）ときは押せない（入り直した形で待たせる）", () => {
    expect(unlinkSendWait(confirm, T0 - 5_000)).toBe(UNLINK_CONFIRM_DELAY_MS);
    expect(canSendUnlink(confirm, T0 - 5_000)).toBe(false);
  });

  it("canSendUnlink: confirm の段で待つ間がたったときだけ true（警告・送っている間・外したあとは false）", () => {
    expect(canSendUnlink(confirm, LATER)).toBe(true);
    expect(canSendUnlink(confirm, LATER - 1)).toBe(false);
    const sending = unlinkReducer(confirm, send);
    expect(canSendUnlink(sending, LATER + 1_000)).toBe(false);
    // 送っている間の2回目の「連携を外す」は無視（familyUnlink を2回送らない）
    expect(unlinkReducer(sending, { type: "send", at: LATER + 1_000 })).toBe(sending);
    const done = unlinkReducer(sending, { type: "succeeded" });
    expect(canSendUnlink(done, LATER + 1_000)).toBe(false);
  });

  it("帯の「もう一度ためす」から confirm に入ったときも、すぐには押せない", () => {
    const failed = run([{ type: "open", child }, next, send, { type: "failed", error: err("network") }]);
    const again = unlinkReducer(failed, { type: "retry", at: T0 + 10_000 });
    expect(canSendUnlink(again, T0 + 10_000 + 100)).toBe(false);
    expect(canSendUnlink(again, T0 + 10_000 + UNLINK_CONFIRM_DELAY_MS)).toBe(true);
  });

  it("キャンセルして開き直したら、また待つ（前に入った時刻は持ち越さない）", () => {
    const closed = unlinkReducer(confirm, { type: "cancel" });
    expect(closed.confirmedAt).toBeNull();
    const reopened = run(
      [
        { type: "open", child },
        { type: "next", at: LATER + 5_000 },
      ],
      closed,
    );
    expect(canSendUnlink(reopened, LATER + 5_000)).toBe(false);
  });
});

describe("通信エラーのあと読み直したら、子どもが一覧から消えていた（外れていた）", () => {
  const failed = run([{ type: "open", child }, next, send, { type: "failed", error: err("network") }]);
  const other = { id: "7a2d3f8b-2c3d-4e5f-9a01-23456789abcd", name: "はなこ" };

  it("unlinkedAfterFailure: 「もう一度」を出している間に、読み直した一覧にその子どもがいなければ true", () => {
    expect(unlinkedAfterFailure(failed, [])).toBe(true);
    expect(unlinkedAfterFailure(failed, [other])).toBe(true);
    // まだいる・まだ読めていない（null）なら分からないので false
    expect(unlinkedAfterFailure(failed, [child, other])).toBe(false);
    expect(unlinkedAfterFailure(failed, null)).toBe(false);
  });

  it("「もう一度」を出していない失敗・ダイアログを出している間・何もないときは false", () => {
    const notFound = run([{ type: "open", child }, next, send, { type: "failed", error: err("not_found") }]);
    expect(unlinkedAfterFailure(notFound, [])).toBe(false);
    expect(unlinkedAfterFailure(run([{ type: "open", child }]), [])).toBe(false);
    expect(unlinkedAfterFailure(initialUnlinkView, [])).toBe(false);
  });

  it("gone で「もう一度ためす」を消し、外れていたことを帯で知らせる（もう一度は押せない）", () => {
    const gone = unlinkReducer(failed, { type: "gone", childId: child.id });
    expect(gone.step).toBe("closed");
    expect(gone.failure).toEqual({ error: UNLINK_GONE_ERROR, reload: false, retry: false });
    expect(unlinkReducer(gone, { type: "retry", at: LATER })).toBe(gone);
    expect(unlinkedAfterFailure(gone, [])).toBe(false);
  });

  it("別の子どもの gone・「もう一度」を出していないときの gone は無視", () => {
    expect(unlinkReducer(failed, { type: "gone", childId: other.id })).toBe(failed);
    const confirm = run([{ type: "open", child }, next]);
    expect(unlinkReducer(confirm, { type: "gone", childId: child.id })).toBe(confirm);
  });
});

describe("unlinkFailure: 失敗の出し方", () => {
  it("not_found・forbidden は子どもの一覧を読み直し、もう一度は出さない（文は読み直したことを伝える）", () => {
    for (const code of ["not_found", "forbidden"] as const) {
      const f = unlinkFailure(err(code));
      expect(f).toMatchObject({ reload: true, retry: false });
      expect(f.error.message).toBe(`m-${code}`);
      expect(f.error.hint).toBe("子どもの一覧を読み直しました");
    }
  });

  it("通信できない・時間切れは、外れたのに返事だけ届かなかったかもしれないので読み直し、もう一度も出す", () => {
    expect(unlinkFailure(err("network"))).toEqual({ error: err("network"), reload: true, retry: true });
    expect(unlinkFailure(err("timeout"))).toEqual({ error: err("timeout"), reload: true, retry: true });
  });

  it("混み合い（429）・一時的に使えない（503）・サーバの不具合は、サーバの文のまま「もう一度」", () => {
    for (const code of ["rate_limited", "unavailable", "internal"] as const)
      expect(unlinkFailure(err(code))).toEqual({ error: err(code), reload: false, retry: true });
  });
});

describe("unlinkText: ダイアログの文", () => {
  it("警告には子どもの名前と「元に戻せません」。箇条書きに、ログアウト・制限が止まる・消えるもの・QR からやり直すを書く", () => {
    const t = unlinkText("warn", child);
    expect(t.title).toBe("「たろう」との連携を外しますか？");
    expect(t.body).toContain("元に戻せません");
    const effects = UNLINK_EFFECTS.join("\n");
    for (const word of [
      "ログアウト",
      "制限が止まります",
      "利用記録",
      "計画",
      "テスト日程",
      "空白期間",
      "制限対象外アプリ",
      "Web サイト",
      "QR コード",
    ])
      expect(effects).toContain(word);
  });

  it("確かめ・送っている間は同じ文。外したあとは「連携を外しました」", () => {
    expect(unlinkText("confirm", child)).toEqual(unlinkText("sending", child));
    expect(unlinkText("confirm", child).title).toBe("本当に外しますか？");
    expect(unlinkText("done", child).title).toBe("連携を外しました");
    // OK のあとは QR の読み取りへ移ることを、押す前に知らせる
    expect(UNLINK_DONE_NEXT).toContain("QR コードの読み取り");
  });

  it("名前が空なら「子ども」と出す", () => {
    expect(unlinkText("warn", { ...child, name: "" }).title).toBe("「子ども」との連携を外しますか？");
  });
});
