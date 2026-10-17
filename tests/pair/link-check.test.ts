// 連携状態の照会（共01〜共03・役割選びの前の確認）の表示の分かれ道のテスト（src/components/pair/link-check.ts）。
// MVP_SPEC 4.1: レスポンス消失時は D2 を照会し、成功（linked）／失敗（unlinked）／不明（照会できない）を区別する。
import type { ApiError } from "@contracts/errors";
import type { LinkStatus } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { linkCheckReasonOf, linkCheckView, restartHref } from "@/components/pair/link-check";

const network: ApiError = { code: "network", message: "通信できませんでした", hint: "接続を確認して" };
const linked: LinkStatus = {
  state: "linked",
  role: "parent",
  partners: [{ userId: "demo-child", name: "デモの子ども", role: "child" }],
};
const unlinked: LinkStatus = { state: "unlinked", role: null, partners: [] };

describe("check（ログイン後、QR に進む前の確認）", () => {
  it("照会している間は読み込み中", () => {
    expect(linkCheckView("check", { kind: "idle" })).toEqual({ screen: "loading" });
    expect(linkCheckView("check", { kind: "loading" })).toEqual({ screen: "loading" });
  });

  it("未連携 → 役割選び、連携済み → 入口へ", () => {
    expect(linkCheckView("check", { kind: "ok", link: unlinked })).toEqual({ screen: "unlinked" });
    expect(linkCheckView("check", { kind: "ok", link: linked })).toEqual({ screen: "linked" });
  });

  it("照会できない → 共01（未連携と決めつけず、QR へは進まない）", () => {
    expect(linkCheckView("check", { kind: "error", error: network })).toEqual({ screen: "unknown", error: network });
  });
});

describe("unsure（紐づけの途中で通信が切れた）", () => {
  it("まず共02「結果がまだ分かりません」を出す（すぐには照会しない）", () => {
    expect(linkCheckView("unsure", { kind: "idle" })).toEqual({ screen: "unsure", error: null });
  });

  it("照会して linked → 入口へ（成功）、unlinked → 共03（まだつながっていません）", () => {
    expect(linkCheckView("unsure", { kind: "ok", link: linked })).toEqual({ screen: "linked" });
    expect(linkCheckView("unsure", { kind: "ok", link: unlinked })).toEqual({ screen: "incomplete" });
  });

  it("照会もできない → 共02 のまま（不明のまま。失敗と言わない）", () => {
    expect(linkCheckView("unsure", { kind: "error", error: network })).toEqual({ screen: "unsure", error: network });
  });
});

describe("URL の引数", () => {
  it("reason は unsure 以外は check とみなす", () => {
    expect(linkCheckReasonOf("unsure")).toBe("unsure");
    expect(linkCheckReasonOf("check")).toBe("check");
    expect(linkCheckReasonOf(undefined)).toBe("check");
    expect(linkCheckReasonOf(["unsure"])).toBe("check");
  });

  it("共03「もう一度はじめる」は同じ役割の紐づけへ。分からなければ役割選び", () => {
    expect(restartHref("child")).toBe("/pair/child");
    expect(restartHref("parent")).toBe("/pair/parent");
    expect(restartHref(undefined)).toBe("/pair");
  });
});
