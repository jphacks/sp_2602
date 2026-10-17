// 画面の間の受け渡し（src/lib/flow.tsx）の withChild。同じ子どもを入れ直しても中身を変えないこと
// （親の QR の画面が数秒ごとに同じ子どもを入れ直し、描き直しが止まらなくなった不具合の回帰テスト）。
import { describe, expect, it } from "vitest";
import { forOwner, withChild } from "@/lib/flow";

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

// ログアウト・合言葉の無効（401）のあとにログインし直すと、見ていた子どもがメモリに残っていた。
// サーバが DB 版に替わる（id が uuid になる）と、もういない子どもの id で取りに行って 403 を出した
describe("forOwner（ログインしている人ごとの受け渡し）", () => {
  const owned = { ...withChild(base, taro), editTest: null, owner: "p1" };

  it("同じ人のあいだは中身をそのまま返す（描き直しを起こさない）", () => {
    expect(forOwner(owned, "p1")).toBe(owned);
  });

  it("ログアウトした（null）・別の人（新しいサーバの uuid）になったら、見ていた子どもを空にする", () => {
    expect(forOwner(owned, null)).toEqual({ child: null, editTest: null, owner: null });
    const next = forOwner(owned, "00000000-0000-4000-8000-0000000000a1");
    expect(next.child).toBeNull();
    expect(next.owner).toBe("00000000-0000-4000-8000-0000000000a1");
  });
});
