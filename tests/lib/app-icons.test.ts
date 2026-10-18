// Q15: 保護者の端末のアイコンの置き場（src/lib/app-icons.ts。docs/decisions.md D-110）のテスト。
// 確かめること: 持っていない・ハッシュが変わったアイコンだけを 50 個ずつ読む（一覧を取り直すたびに全部を読み直さない）・
//   ハッシュの一覧は覚えて使い回す・アイコンのないアプリ／読めなかったアプリは何も返さない（画面は頭文字のまま）・ログアウトで消す。
import type { ChildAppEntry, ChildAppIcon } from "@contracts/schemas";
import { MAX_APP_ICONS_PER_CALL } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { createAppIconCache, HASH_LIST_TTL_MS, iconUri } from "@/lib/app-icons";

const h = (c: string) => c.repeat(64);

function setup(initial: ChildAppEntry[]) {
  let list = initial;
  const clock = { ms: 0 };
  const listCalls: number[] = [];
  const iconCalls: string[][] = [];
  let failIcons = false;
  const cache = createAppIconCache({
    now: () => clock.ms,
    fetchList: async () => {
      listCalls.push(clock.ms);
      return { apps: list };
    },
    fetchIcons: async (_childId, packageNames) => {
      iconCalls.push(packageNames);
      if (failIcons) throw new Error("offline");
      return packageNames.flatMap((p): ChildAppIcon[] => {
        const entry = list.find((a) => a.packageName === p);
        return entry?.iconHash
          ? [{ packageName: p, iconHash: entry.iconHash, png: `png-${p}-${entry.iconHash[0]}` }]
          : [];
      });
    },
  });
  return {
    cache,
    listCalls,
    iconCalls,
    setList: (next: ChildAppEntry[]) => {
      list = next;
    },
    advance: (ms: number) => {
      clock.ms += ms;
    },
    setFailIcons: (v: boolean) => {
      failIcons = v;
    },
  };
}

const apps: ChildAppEntry[] = [
  { packageName: "a", label: "A", iconHash: h("a") },
  { packageName: "b", label: "B", iconHash: h("b") },
  { packageName: "c", label: "C", iconHash: null }, // アイコンが届いていない
];

describe("appIconCache", () => {
  it("はじめは一覧（ハッシュ）を読んで、アイコンのあるアプリだけを読む。2回目は通信しない", async () => {
    const s = setup(apps);
    const got = await s.cache.load("child", ["a", "b", "c", "x"]);
    expect([...got]).toEqual([
      ["a", iconUri(`png-a-a`)],
      ["b", iconUri(`png-b-b`)],
    ]);
    expect(s.iconCalls).toEqual([["a", "b"]]);
    await s.cache.load("child", ["a", "b", "c"]);
    expect(s.iconCalls).toHaveLength(1);
    expect(s.listCalls).toHaveLength(1);
    // 通信しないで答える peek も同じ画像
    expect(s.cache.peek("child", ["a", "c"])).toEqual(new Map([["a", iconUri("png-a-a")]]));
  });

  it("一覧のハッシュが変わったアイコンだけを読み直す（覚えた一覧は 10 分使い回し、過ぎたら読み直す）", async () => {
    const s = setup(apps);
    await s.cache.load("child", ["a", "b"]);
    s.setList([{ ...apps[0], iconHash: h("d") } as ChildAppEntry, apps[1] as ChildAppEntry]);
    s.advance(HASH_LIST_TTL_MS - 1);
    await s.cache.load("child", ["a", "b"]);
    expect(s.iconCalls).toHaveLength(1); // まだ前の一覧を使っている
    s.advance(1);
    const got = await s.cache.load("child", ["a", "b"]);
    expect(s.iconCalls.at(-1)).toEqual(["a"]);
    expect(got.get("a")).toBe(iconUri("png-a-d"));
    expect(s.listCalls).toHaveLength(2);
  });

  it("画面が読んだ一覧を rememberList で渡せば、一覧を読み直さない", async () => {
    const s = setup(apps);
    s.cache.rememberList("child", apps);
    await s.cache.load("child", ["a"]);
    expect(s.listCalls).toEqual([]);
    expect(s.iconCalls).toEqual([["a"]]);
  });

  it("多いときは 50 個ずつ読む", async () => {
    const many = Array.from({ length: MAX_APP_ICONS_PER_CALL + 7 }, (_, i) => ({
      packageName: `p${i}`,
      label: `P${i}`,
      iconHash: h("e"),
    }));
    const s = setup(many);
    const got = await s.cache.load(
      "child",
      many.map((m) => m.packageName),
    );
    expect(s.iconCalls.map((c) => c.length)).toEqual([MAX_APP_ICONS_PER_CALL, 7]);
    expect(got.size).toBe(many.length);
  });

  it("読めなかったら何も返さず（頭文字のまま）、次の回にもう一度読む。例外は投げない", async () => {
    const s = setup(apps);
    s.setFailIcons(true);
    expect((await s.cache.load("child", ["a"])).size).toBe(0);
    s.setFailIcons(false);
    expect((await s.cache.load("child", ["a"])).get("a")).toBe(iconUri("png-a-a"));
    expect(s.iconCalls).toHaveLength(2);
  });

  it("一覧でアイコンがなくなった（null）アプリは、前に読んだ画像も出さない", async () => {
    const s = setup(apps);
    await s.cache.load("child", ["a"]);
    s.setList([{ packageName: "a", label: "A", iconHash: null }]);
    s.cache.rememberList("child", [{ packageName: "a", iconHash: null }]);
    expect((await s.cache.load("child", ["a"])).size).toBe(0);
    expect(s.cache.peek("child", ["a"]).size).toBe(0);
  });

  it("clear（ログアウト）で全部消し、次は読み直す", async () => {
    const s = setup(apps);
    await s.cache.load("child", ["a"]);
    s.cache.clear();
    expect(s.cache.peek("child", ["a"]).size).toBe(0);
    await s.cache.load("child", ["a"]);
    expect(s.iconCalls).toHaveLength(2);
    expect(s.listCalls).toHaveLength(2);
  });
});
