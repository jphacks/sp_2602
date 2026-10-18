// 保護者側の QR の読み取り（親10〜親15）の表示の分かれ道のテスト（src/components/pair/parent-flow.ts）。
// MVP_SPEC 4.1: カメラ権限・読取・期限切れ・使用済み・重複連携の失敗系、保存の確定（linked）まで成功を出さない、応答消失は照会。
import type { ApiError } from "@contracts/errors";
import { demoChild, mockPair } from "@contracts/fixtures";
import type { PairStatus } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  initialParentPairView,
  notSlopeQr,
  type ParentPairEvent,
  type ParentPairView,
  parentPairReducer,
  qrCodeOf,
  shouldPollParent,
  shouldScan,
} from "@/components/pair/parent-flow";

const err = (code: ApiError["code"], message = "x"): ApiError => ({ code, message, hint: "y" });
const status = (state: PairStatus["state"], over: Partial<PairStatus> = {}): PairStatus => ({
  ...mockPair[state],
  ...over,
});
const run = (events: ParentPairEvent[], from: ParentPairView = initialParentPairView) =>
  events.reduce(parentPairReducer, from);

const granted: ParentPairEvent = { type: "permission", granted: true, canAskAgain: true };
const scanning = run([granted]);
const verifying = run([{ type: "scanned", data: "demo-code-123456" }], scanning);
const waiting = run([{ type: "claimed", status: status("claimed") }], verifying);

describe("親10: カメラの権限", () => {
  it("確かめ終わるまでは親10 を出さない。許可されていれば親11", () => {
    expect(initialParentPairView).toEqual({ screen: "permissionChecking" });
    expect(scanning).toEqual({ screen: "scanning" });
  });

  it("断られた: まだ聞ける → 親10（許可する）、もう聞けない → 親10（設定を開く）", () => {
    expect(run([{ type: "permission", granted: false, canAskAgain: true }])).toEqual({
      screen: "permission",
      canAskAgain: true,
    });
    expect(run([{ type: "permission", granted: false, canAskAgain: false }])).toEqual({
      screen: "permission",
      canAskAgain: false,
    });
  });

  it("設定で許可して戻ってきたら親11。読み取り中に権限を外されたら親10 に戻す", () => {
    const denied = run([{ type: "permission", granted: false, canAskAgain: false }]);
    expect(run([granted], denied)).toEqual({ screen: "scanning" });
    expect(run([{ type: "permission", granted: false, canAskAgain: false }], scanning)).toMatchObject({
      screen: "permission",
    });
  });

  it("検証中・待っている間に権限の知らせが来ても、表示を変えない", () => {
    expect(run([granted], verifying)).toBe(verifying);
    expect(run([granted], waiting)).toBe(waiting);
  });
});

describe("親11 → 親12: 読み取る", () => {
  it("Slope の QR（使い捨ての番号）なら親12 へ（番号の前後の空白は落とす）", () => {
    expect(verifying).toEqual({ screen: "verifying", code: "demo-code-123456" });
    expect(qrCodeOf("  abcdef0123456789  ")).toBe("abcdef0123456789");
  });

  it("ほかの QR（URL・短すぎる・日本語）はサーバに送らず親13", () => {
    for (const data of ["https://example.com/", "abc", "こんにちは12345678", ""]) {
      expect(qrCodeOf(data)).toBeNull();
      expect(run([{ type: "scanned", data }], scanning)).toEqual({ screen: "scanFailed", error: notSlopeQr });
    }
  });

  it("1回読んだら、続けて届いた読み取りは無視する（同じ QR を何度も送らない）", () => {
    expect(run([{ type: "scanned", data: "another-code-0000" }], verifying)).toBe(verifying);
    expect(shouldScan(scanning)).toBe(true);
    expect(shouldScan(verifying)).toBe(false);
    expect(shouldScan(run([{ type: "scanned", data: "x" }], scanning))).toBe(false); // 親13 のダイアログ中
  });
});

describe("親12 の結果", () => {
  it("claimed → 子どもの確認待ち（まだ成功を出さない）", () => {
    expect(waiting).toMatchObject({ screen: "waitingChild", offline: false });
    expect(shouldPollParent(waiting)).toBe(true);
  });

  it("期限切れ・使用済み・すでに連携済み（conflict）・知らない番号（not_found）・子どもの端末（forbidden）→ 親13", () => {
    for (const code of ["conflict", "not_found", "forbidden", "bad_request"] as const) {
      expect(run([{ type: "claimFailed", error: err(code) }], verifying)).toEqual({
        screen: "scanFailed",
        error: err(code),
      });
    }
  });

  it("サーバの不具合 → 親14（同じ番号でもう一度ためせる）", () => {
    const failed = run([{ type: "claimFailed", error: err("internal") }], verifying);
    expect(failed).toMatchObject({ screen: "saveFailed", code: "demo-code-123456" });
    expect(run([{ type: "retrySave" }], failed)).toEqual({ screen: "verifying", code: "demo-code-123456" });
  });

  it("応答が届かない（通信・時間切れ）→ 共02（読み取りが通ったか分からないので照会する）", () => {
    expect(run([{ type: "claimFailed", error: err("network") }], verifying)).toEqual({ screen: "unsure" });
    expect(run([{ type: "claimFailed", error: err("timeout") }], verifying)).toEqual({ screen: "unsure" });
  });

  it("親13「もう一度読み取る」→ 親11", () => {
    const failed = run([{ type: "claimFailed", error: err("conflict") }], verifying);
    expect(run([{ type: "rescan" }], failed)).toEqual({ screen: "scanning" });
  });
});

describe("子どもの確認待ち → 親15 / 共03", () => {
  it("linked のときだけ親15。つながった子どもを持つ", () => {
    expect(run([{ type: "status", status: status("linked") }], waiting)).toEqual({
      screen: "linked",
      child: demoChild,
    });
  });

  it("子どもが「いいえ」→ 共03（rejected）、期限切れ・ペアリングが消えた → 共03（expired）", () => {
    expect(run([{ type: "status", status: status("rejected") }], waiting)).toEqual({
      screen: "incomplete",
      reason: "rejected",
    });
    expect(run([{ type: "status", status: status("expired") }], waiting)).toEqual({
      screen: "incomplete",
      reason: "expired",
    });
    expect(run([{ type: "statusFailed", error: err("not_found") }], waiting)).toEqual({
      screen: "incomplete",
      reason: "expired",
    });
  });

  it("聞けない間は「通信できません」を足して待ち続ける。つながったら戻す", () => {
    const off = run([{ type: "statusFailed", error: err("network") }], waiting);
    expect(off).toMatchObject({ screen: "waitingChild", offline: true });
    expect(run([{ type: "status", status: status("claimed") }], off)).toMatchObject({ offline: false });
  });

  it("別のペアリングの応答は捨てる", () => {
    expect(run([{ type: "status", status: status("linked", { pairId: "other" }) }], waiting)).toBe(waiting);
  });

  it("共03「もう一度はじめる」→ 親11", () => {
    const incomplete = run([{ type: "status", status: status("rejected") }], waiting);
    expect(run([{ type: "rescan" }], incomplete)).toEqual({ screen: "scanning" });
  });
});
