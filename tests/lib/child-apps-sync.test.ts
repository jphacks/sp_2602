// Q15: 子どもの端末のアプリ一覧の送り方のテスト（src/lib/child-apps-sync.ts。docs/decisions.md D-110）。
// 確かめること: 起動して最初の回と1日1回だけ確かめる（30 秒ごとの取得で毎回は取らない・送らない）・前に送った中身と同じなら送らない・
//   サーバの DB が作り直された（epoch が変わった）ら同じ中身でも送る・送れなかったら少しあとに送り直す・一覧が取れないときは送らない・
//   契約に合う形に整える・アイコンはサーバが足りないと言ったものだけを 50 枚ずつ送る。
//   最後にサーバとつないで、送った一覧とアイコンを保護者が読めることも確かめる。
import { createHash } from "node:crypto";
import type { NativeLauncherApp, NativeLauncherAppsResult } from "@contracts/native";
import {
  type ChildApp,
  type ChildAppIcon,
  ChildAppsUpload,
  MAX_APP_ICONS_PER_CALL,
  MAX_CHILD_APPS,
} from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  CHECK_INTERVAL_MS,
  createChildAppsSync,
  normalizeChildApps,
  prepareChildApps,
  RETRY_INTERVAL_MS,
} from "@/lib/child-apps-sync";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";
import { CHILD_ID, fresh, newFamily, ok, PARENT, post } from "../verify/helpers";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

const okApps = (...apps: NativeLauncherApp[]): NativeLauncherAppsResult => ({ status: "ok", apps });
const A = { packageName: "com.example.a", label: "A" };
const B = { packageName: "com.example.b", label: "B" };

// 本物の PNG の頭を持つ小さな仮のアイコン（中身が違えばハッシュも違う）
function fakePng(seed: string): { iconPng: string; iconHash: string } {
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(seed)]);
  return { iconPng: bytes.toString("base64"), iconHash: createHash("sha256").update(bytes).digest("hex") };
}

// 時計・一覧・送信・epoch を差し替えた1組
function setup(opts: { failUpload?: boolean } = {}) {
  const storage = memoryStorage();
  const clock = { ms: Date.parse("2026-10-15T03:00:00Z") };
  const sent: ChildApp[][] = [];
  const iconCalls: ChildAppIcon[][] = [];
  let iconsNeeded: string[] = [];
  let failIcons = false;
  let apps: NativeLauncherAppsResult = okApps(A, B);
  let reads = 0;
  let epoch: string | null = "epoch-1";
  let failUpload = opts.failUpload ?? false;
  const sync = createChildAppsSync({
    storage,
    now: () => clock.ms,
    epoch: async () => epoch,
    upload: async (_childId, list) => {
      if (failUpload) throw new Error("offline");
      sent.push(list);
      return { iconsNeeded };
    },
    uploadIcons: async (_childId, icons) => {
      if (failIcons) throw new Error("offline");
      iconCalls.push(icons);
      return {};
    },
  });
  const getApps = async () => {
    reads += 1;
    return apps;
  };
  return {
    storage,
    sent,
    iconCalls,
    setIconsNeeded: (next: string[]) => {
      iconsNeeded = next;
    },
    setFailIcons: (next: boolean) => {
      failIcons = next;
    },
    run: () => sync.run("child-a", getApps),
    sync,
    getApps,
    advance: (ms: number) => {
      clock.ms += ms;
    },
    setApps: (next: NativeLauncherAppsResult) => {
      apps = next;
    },
    setEpoch: (next: string | null) => {
      epoch = next;
    },
    setFailUpload: (next: boolean) => {
      failUpload = next;
    },
    reads: () => reads,
  };
}

describe("いつ確かめて、いつ送るか", () => {
  it("起動して最初の回は確かめて送る。そのあとの 30 秒ごとの回は、1日たつまで一覧も取らない", async () => {
    const s = setup();
    expect(await s.run()).toBe("sent");
    expect(s.sent).toEqual([[A, B]]);
    for (let i = 0; i < 10; i++) {
      s.advance(30_000);
      expect(await s.run()).toBe("skipped");
    }
    expect(s.reads()).toBe(1);
    expect(s.sent).toHaveLength(1);
  });

  it("1日たったら確かめる。中身が同じなら送らず、変わっていれば送る", async () => {
    const s = setup();
    await s.run();
    s.advance(CHECK_INTERVAL_MS);
    expect(await s.run()).toBe("unchanged");
    expect(s.sent).toHaveLength(1);
    s.setApps(okApps(A, B, { packageName: "com.example.c", label: "C" }));
    s.advance(CHECK_INTERVAL_MS);
    expect(await s.run()).toBe("sent");
    expect(s.sent).toHaveLength(2);
  });

  it("アプリを起動し直しても（覚えた中身が端末に残っていれば）、同じ中身なら送らない", async () => {
    const s = setup();
    await s.run();
    // 起動し直した = メモリの上の「次に確かめる時刻」がない新しい1つ。端末の保存は同じ
    const again = createChildAppsSync({
      storage: s.storage,
      epoch: async () => "epoch-1",
      upload: async () => {
        throw new Error("送らないはず");
      },
      uploadIcons: async () => ({}),
    });
    expect(await again.run("child-a", s.getApps)).toBe("unchanged");
  });

  it("OS が返す並びが変わっただけなら、同じ中身として送らない", async () => {
    const s = setup();
    await s.run();
    s.setApps(okApps(B, A));
    s.advance(CHECK_INTERVAL_MS);
    expect(await s.run()).toBe("unchanged");
  });

  it("サーバの DB が作り直された（C7 の epoch が変わった）ら、同じ中身でも送り直す", async () => {
    const s = setup();
    await s.run();
    s.setEpoch("epoch-2");
    s.advance(CHECK_INTERVAL_MS);
    expect(await s.run()).toBe("sent");
    expect(s.sent).toHaveLength(2);
  });

  it("epoch がまだ分からない（設定を一度も取れていない）ときは、中身だけで比べる", async () => {
    const s = setup();
    await s.run();
    s.setEpoch(null);
    s.advance(CHECK_INTERVAL_MS);
    expect(await s.run()).toBe("unchanged");
  });

  it("送れなかったら、覚えずに 30 分あとにもう一度確かめる（画面は止めない＝例外を投げない）", async () => {
    const s = setup({ failUpload: true });
    expect(await s.run()).toBe("failed");
    expect(await s.storage.getItem(storageKeys.childApps("child-a"))).toBeNull();
    s.advance(RETRY_INTERVAL_MS - 1);
    expect(await s.run()).toBe("skipped");
    s.setFailUpload(false);
    s.advance(1);
    expect(await s.run()).toBe("sent");
  });

  it("一覧が取れない（Kotlin がない・OS のエラー）ときは送らない（空の一覧で親16 の候補を消さない）", async () => {
    const s = setup();
    s.setApps({ status: "unavailable", reason: "Kotlin がない" });
    expect(await s.run()).toBe("unavailable");
    expect(s.sent).toEqual([]);
    // 一覧を取る関数が例外を出しても同じ
    const sync = createChildAppsSync({
      storage: memoryStorage(),
      epoch: async () => null,
      upload: async () => ({ iconsNeeded: [] }),
      uploadIcons: async () => ({}),
    });
    expect(
      await sync.run("child-a", async () => {
        throw new Error("boom");
      }),
    ).toBe("unavailable");
  });

  it("同じ子どもの回が重ならない（送っている間の次の回は何もしない）", async () => {
    const s = setup();
    const [first, second] = await Promise.all([s.run(), s.run()]);
    expect([first, second].sort()).toEqual(["sent", "skipped"]);
    expect(s.sent).toHaveLength(1);
  });
});

describe("アイコン", () => {
  it("一覧にはハッシュだけを入れ、サーバが足りないと言ったアイコンだけを 50 枚ずつ送る", async () => {
    const s = setup();
    const many = Array.from({ length: MAX_APP_ICONS_PER_CALL + 3 }, (_, i) => ({
      packageName: `com.example.app${String(i).padStart(3, "0")}`,
      label: `アプリ${i}`,
      ...fakePng(`icon-${i}`),
    }));
    s.setApps(okApps(...many));
    s.setIconsNeeded(many.slice(0, MAX_APP_ICONS_PER_CALL + 2).map((a) => a.packageName));
    expect(await s.run()).toBe("sent");
    expect(s.sent[0]?.[0]).toEqual({
      packageName: many[0]?.packageName,
      label: "アプリ0",
      iconHash: many[0]?.iconHash,
    });
    expect(JSON.stringify(s.sent[0])).not.toContain("iconPng");
    expect(s.iconCalls.map((c) => c.length)).toEqual([MAX_APP_ICONS_PER_CALL, 2]);
    expect(s.iconCalls[0]?.[0]).toEqual({
      packageName: many[0]?.packageName,
      iconHash: many[0]?.iconHash,
      png: many[0]?.iconPng,
    });
  });

  it("アイコンが変わったら（名前が同じでも）一覧を送り直し、サーバが足りないと言ったアイコンを送る", async () => {
    const s = setup();
    s.setApps(okApps({ ...A, ...fakePng("old") }));
    await s.run();
    s.setApps(okApps({ ...A, ...fakePng("new") }));
    s.setIconsNeeded([A.packageName]);
    s.advance(CHECK_INTERVAL_MS);
    expect(await s.run()).toBe("sent");
    expect(s.iconCalls.at(-1)?.[0]?.iconHash).toBe(fakePng("new").iconHash);
  });

  it("アイコンを送り切れなかったら「送った」と覚えず、30 分あとに一覧から送り直す", async () => {
    const s = setup();
    s.setApps(okApps({ ...A, ...fakePng("a") }));
    s.setIconsNeeded([A.packageName]);
    s.setFailIcons(true);
    expect(await s.run()).toBe("failed");
    expect(await s.storage.getItem(storageKeys.childApps("child-a"))).toBeNull();
    s.setFailIcons(false);
    s.advance(RETRY_INTERVAL_MS);
    expect(await s.run()).toBe("sent");
    expect(s.sent).toHaveLength(2);
    expect(s.iconCalls).toHaveLength(1);
  });

  it("契約に合わないアイコン（ハッシュの形・base64 でない・大きすぎる）は付けない（一覧は送る）", () => {
    const { apps, icons } = prepareChildApps([
      { packageName: "a", label: "A", iconPng: "iVBORw0KGgo=", iconHash: "XYZ" },
      { packageName: "b", label: "B", iconPng: "not base64!", iconHash: "a".repeat(64) },
      { packageName: "c", label: "C", iconPng: "A".repeat(40_000), iconHash: "a".repeat(64) },
      { packageName: "d", label: "D", iconPng: null, iconHash: null },
      { packageName: "e", label: "E", ...fakePng("e") },
    ]);
    expect(apps.map((a) => [a.packageName, a.iconHash ?? null])).toEqual([
      ["a", null],
      ["b", null],
      ["c", null],
      ["d", null],
      ["e", fakePng("e").iconHash],
    ]);
    expect(icons.map((i) => i.packageName)).toEqual(["e"]);
  });
});

describe("normalizeChildApps（契約に合う形に整える）", () => {
  it("空白を除き、空の名前は packageName、同じアプリは1つ、packageName の順", () => {
    expect(
      normalizeChildApps([
        { packageName: " com.example.b ", label: "  " },
        { packageName: "com.example.a", label: " A " },
        { packageName: "com.example.a", label: "A2" },
        { packageName: "   ", label: "x" },
      ]),
    ).toEqual([
      { packageName: "com.example.a", label: "A" },
      { packageName: "com.example.b", label: "com.example.b" },
    ]);
  });

  it("長すぎる名前は 120 文字で切り（絵文字の途中では切らない）、長すぎる packageName は入れない。件数は上限まで", () => {
    const long = normalizeChildApps([{ packageName: "p", label: `${"a".repeat(119)}😀` }]);
    expect(long[0]?.label).toBe("a".repeat(119));
    expect(normalizeChildApps([{ packageName: "p".repeat(256), label: "x" }])).toEqual([]);
    const many = Array.from({ length: MAX_CHILD_APPS + 5 }, (_, i) => ({
      packageName: `com.example.app${String(i).padStart(5, "0")}`,
      label: `アプリ${i}`,
    }));
    const out = normalizeChildApps(many);
    expect(out).toHaveLength(MAX_CHILD_APPS);
    // 整えた一覧は契約の検査を必ず通る
    expect(ChildAppsUpload.safeParse({ childId: "c", apps: out }).success).toBe(true);
  });
});

describe("サーバとつないで", () => {
  it("子どもが送った一覧とアイコンを、連携している保護者が表示名の順で読める。サーバにあるアイコンは送り直さない", async () => {
    await fresh("2026-10-15T03:00:00Z");
    const { child, parent } = await newFamily("child-apps-sync");
    let iconUploads = 0;
    const deps = {
      epoch: async () => null,
      upload: (childId: string, apps: ChildApp[]) =>
        ok<{ iconsNeeded: string[] }>(post("/api/child-apps/upload", { childId, apps }, child.token)),
      uploadIcons: (childId: string, icons: ChildAppIcon[]) => {
        iconUploads += 1;
        return ok(post("/api/child-apps/icons/upload", { childId, icons }, child.token));
      },
    };
    const video = { packageName: "jp.example.only.video", label: "ビデオ", ...fakePng("video") };
    const camera = { packageName: "jp.example.only.camera", label: "カメラ", iconPng: null, iconHash: null };
    const getApps = async () => okApps(video, camera);
    expect(await createChildAppsSync({ storage: memoryStorage(), ...deps }).run(child.userId, getApps)).toBe("sent");
    expect(iconUploads).toBe(1);
    const view = await ok<{ apps: { label: string; iconHash: string | null }[]; receivedAt: string | null }>(
      post("/api/child-apps/get", { childId: child.userId }, parent.token),
    );
    expect(view.apps.map((a) => [a.label, a.iconHash])).toEqual([
      ["カメラ", null],
      ["ビデオ", video.iconHash],
    ]);
    expect(view.receivedAt).not.toBeNull();
    const icons = await ok<{ icons: ChildAppIcon[] }>(
      post("/api/child-apps/icons/get", { childId: child.userId, packageNames: [video.packageName] }, parent.token),
    );
    expect(icons.icons).toEqual([{ packageName: video.packageName, iconHash: video.iconHash, png: video.iconPng }]);
    // 端末の覚えが消えても（入れ直した端末など）、サーバにもうあるアイコンは送らない（一覧だけ送る）
    expect(await createChildAppsSync({ storage: memoryStorage(), ...deps }).run(child.userId, getApps)).toBe("sent");
    expect(iconUploads).toBe(1);
    // デモの親子（MOCK の見本）には見本の一覧が入っている。ほかの家族の一覧とは混ざらない
    const demo = await ok<{ apps: ChildApp[] }>(post("/api/child-apps/get", { childId: CHILD_ID }, PARENT));
    expect(demo.apps.some((a) => a.packageName.startsWith("jp.example.only."))).toBe(false);
  });
});
