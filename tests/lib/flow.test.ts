// 画面の間の受け渡し（src/lib/flow.tsx）の withChild。同じ子どもを入れ直しても中身を変えないこと
// （親の QR の画面が数秒ごとに同じ子どもを入れ直し、描き直しが止まらなくなった不具合の回帰テスト）。
import { describe, expect, it } from "vitest";
import { withChild } from "@/lib/flow";

const base = { child: null, editTest: null };
const taro = { id: "c1", name: "たろう" };

describe("withChild", () => {
  it("子どもを入れると新しい中身になる", () => {
    const next = withChild(base, taro);
    expect(next).not.toBe(base);
    expect(next.child).toEqual(taro);
  });

  it("同じ id と名前の子どもを入れ直しても、前の中身をそのまま返す（描き直しを起こさない）", () => {
    const s = withChild(base, taro);
    expect(withChild(s, { id: "c1", name: "たろう" })).toBe(s);
  });

  it("名前が変わったら新しい中身になる", () => {
    const s = withChild(base, taro);
    expect(withChild(s, { id: "c1", name: "はなこ" }).child?.name).toBe("はなこ");
  });

  it("null を入れ直しても前の中身のまま、子どもから null にすると変わる", () => {
    expect(withChild(base, null)).toBe(base);
    const s = withChild(base, taro);
    expect(withChild(s, null).child).toBeNull();
  });
});
