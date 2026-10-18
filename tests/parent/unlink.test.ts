// 親04 設定の「子どもとの連携を外す」の分かれ道と文（src/components/parent/unlink.ts。D-133）。
// 二段階（警告 →「次へ」→ もう一度確かめる →「連携を外す」）を通らないと送らないこと、送っている間は閉じないこと、
// 失敗の出し方（読み直す・もう一度）を確かめる
import type { ApiError } from "@contracts/errors";
import { describe, expect, it } from "vitest";
import {
  initialUnlinkView,
  UNLINK_EFFECTS,
  type UnlinkEvent,
  type UnlinkView,
  unlinkFailure,
  unlinkReducer,
  unlinkText,
} from "@/components/parent/unlink";

const child = { id: "6f1c2e7a-1b2c-4d3e-8f90-123456789abc", name: "たろう" };
const run = (events: UnlinkEvent[], from: UnlinkView = initialUnlinkView) => events.reduce(unlinkReducer, from);
const err = (code: ApiError["code"]): ApiError => ({ code, message: `m-${code}`, hint: `h-${code}` });

describe("unlinkReducer: 二段階の確認", () => {
  it("行を押す → 警告 →「次へ」→ 確かめ →「連携を外す」で、はじめて送る（sending）。成功で done、OK で閉じる", () => {
    let v = run([{ type: "open", child }]);
    expect(v).toEqual({ step: "warn", child, failure: null });
    // 警告の段では送れない（「連携を外す」の出来事が来ても無視）
    expect(unlinkReducer(v, { type: "send" }).step).toBe("warn");
    v = unlinkReducer(v, { type: "next" });
    expect(v.step).toBe("confirm");
    v = unlinkReducer(v, { type: "send" });
    expect(v.step).toBe("sending");
    v = unlinkReducer(v, { type: "succeeded" });
    expect(v).toEqual({ step: "done", child, failure: null });
    expect(unlinkReducer(v, { type: "finish" })).toEqual(initialUnlinkView);
  });

  it("警告・確かめのどちらでもキャンセルで閉じる。送っている間・外したあとはキャンセルで閉じない", () => {
    expect(run([{ type: "open", child }, { type: "cancel" }]).step).toBe("closed");
    expect(run([{ type: "open", child }, { type: "next" }, { type: "cancel" }]).step).toBe("closed");
    const sending = run([{ type: "open", child }, { type: "next" }, { type: "send" }]);
    expect(unlinkReducer(sending, { type: "cancel" }).step).toBe("sending");
    const done = unlinkReducer(sending, { type: "succeeded" });
    expect(unlinkReducer(done, { type: "cancel" }).step).toBe("done");
  });

  it("開いたあとに「もう一度開く」が来ても、段は戻らない（二度押し）", () => {
    const v = run([{ type: "open", child }, { type: "next" }]);
    expect(unlinkReducer(v, { type: "open", child }).step).toBe("confirm");
  });

  it("失敗したら閉じて帯を出す。「もう一度ためす」は確かめの段から（警告はもう読んだ）", () => {
    const failed = run([
      { type: "open", child },
      { type: "next" },
      { type: "send" },
      { type: "failed", error: err("rate_limited") },
    ]);
    expect(failed.step).toBe("closed");
    expect(failed.failure).toEqual({ error: err("rate_limited"), reload: false, retry: true });
    const again = unlinkReducer(failed, { type: "retry" });
    expect(again).toEqual({ step: "confirm", child, failure: null });
  });

  it("もう外れていた（not_found）・403 は「もう一度」を出さない（retry は無視）", () => {
    const failed = run([
      { type: "open", child },
      { type: "next" },
      { type: "send" },
      { type: "failed", error: err("not_found") },
    ]);
    expect(unlinkReducer(failed, { type: "retry" })).toBe(failed);
  });

  it("また行を押したら、前の帯は消える", () => {
    const failed = run([
      { type: "open", child },
      { type: "next" },
      { type: "send" },
      { type: "failed", error: err("network") },
    ]);
    expect(unlinkReducer(failed, { type: "open", child }).failure).toBeNull();
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
  });

  it("名前が空なら「子ども」と出す", () => {
    expect(unlinkText("warn", { ...child, name: "" }).title).toBe("「子ども」との連携を外しますか？");
  });
});
