// 保護者の画面で、見ている子どもが決まるまでの出し分け（src/components/parent/gate.ts）。
// 連携を外された・サーバが作り直されて家族が空になった保護者が、画面から QR の読み取りへ戻れること（前は案内の文だけで道がなかった）。
import { describe, expect, it } from "vitest";
import { familyGate, scanQrAction } from "@/components/parent/gate";

const child = { id: "6f1c2e7a-1b2c-4d3e-8f90-123456789abc", name: "たろう" };
const error = { code: "network", message: "通信できませんでした", hint: "通信を確かめてください" } as const;

describe("familyGate", () => {
  it("見ている子どもが決まっていれば中身を出す（id の形は問わない。uuid でもそのまま）", () => {
    expect(familyGate(child, [child], null)).toEqual({ kind: "child", child });
  });

  it("家族の一覧が空なら unlinked。ボタンは QR の読み取り（/pair/parent）へ", () => {
    expect(familyGate(null, [], null)).toEqual({ kind: "unlinked" });
    expect(scanQrAction.href).toBe("/pair/parent");
  });

  it("一覧を取れなければ unknown（もう一度ためす）、読み込み中・子どもを入れる前は loading", () => {
    expect(familyGate(null, null, error)).toEqual({ kind: "unknown", error });
    expect(familyGate(null, null, null)).toEqual({ kind: "loading" });
    expect(familyGate(null, [child], null)).toEqual({ kind: "loading" });
  });
});
