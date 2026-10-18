// ログインした人（Session）の保存（src/lib/session-store.ts）。合言葉を平文で置かない（セキュリティ検査 PII-05 / AND-05 / IPA-13）。
// 本物の封（Android Keystore）は Node では動かないので、形だけ同じ偽の封（中身を反転した文字列）で確かめる
import { mockSessions } from "@contracts/fixtures";
import { describe, expect, it } from "vitest";
import { loadSession, type SecretBox, saveSession } from "@/lib/session-store";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";

const session = mockSessions["mock-google-child"];

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const box: SecretBox = {
  sealSecret: (plain) => `sb1:${[...plain].reverse().join("")}`,
  openSecret: (sealed) => (sealed.startsWith("sb1:") ? [...sealed.slice(4)].reverse().join("") : null),
};
const noBox: SecretBox = { sealSecret: () => null, openSecret: () => null };

describe("session-store", () => {
  it("封をして置き、読むと元の Session に戻る。置いた文字列に合言葉は出てこない", async () => {
    const storage = memory();
    expect(await saveSession(storage, box, session)).toBe(true);
    const raw = storage.data.get(storageKeys.session) ?? "";
    expect(raw).not.toContain(session.token);
    expect(JSON.parse(raw)).toMatchObject({ v: 1 });
    expect(await loadSession(storage, box)).toEqual(session);
  });

  it("封ができない（Kotlin がない）ときは平文で置かず、前の値も消す", async () => {
    const storage = memory();
    await saveSession(storage, box, session);
    expect(await saveSession(storage, noBox, session)).toBe(false);
    expect(storage.data.has(storageKeys.session)).toBe(false);
  });

  it("古い版が平文で置いた Session は、読んだときに封をし直して上書きする（この起動では使える）", async () => {
    const storage = memory();
    storage.data.set(storageKeys.session, JSON.stringify(session));
    expect(await loadSession(storage, box)).toEqual(session);
    const raw = storage.data.get(storageKeys.session) ?? "";
    expect(raw).not.toContain(session.token);
    expect(await loadSession(storage, box)).toEqual(session);
  });

  it("古い平文を封をし直せないときは消す（平文のまま残さない）", async () => {
    const storage = memory();
    storage.data.set(storageKeys.session, JSON.stringify(session));
    expect(await loadSession(storage, noBox)).toEqual(session);
    expect(storage.data.has(storageKeys.session)).toBe(false);
  });

  it("古い平文を封をし直す書き込みに失敗しても、読めた Session は返す（平文は残り、次に読んだときにやり直す）", async () => {
    const storage = memory();
    storage.data.set(storageKeys.session, JSON.stringify(session));
    const failing: KeyValueStorage = {
      ...storage,
      setItem: async () => {
        throw new Error("disk full");
      },
    };
    expect(await loadSession(failing, box)).toEqual(session);
    expect(storage.data.get(storageKeys.session)).toBe(JSON.stringify(session));
    // 書けるようになったら、次に読んだときに封をし直す
    expect(await loadSession(storage, box)).toEqual(session);
    expect(storage.data.get(storageKeys.session) ?? "").not.toContain(session.token);
  });

  it("封を開けられない（Keystore の一時的な失敗・鍵が作り直された）ときは、消さずに null。次に開けられれば使える（M-6 とそろえる）", async () => {
    const storage = memory();
    await saveSession(storage, box, session);
    const saved = storage.data.get(storageKeys.session);
    expect(await loadSession(storage, noBox)).toBeNull();
    expect(storage.data.get(storageKeys.session)).toBe(saved); // 消さない・平文に戻さない
    expect(storage.data.get(storageKeys.session) ?? "").not.toContain(session.token);
    // 次の起動で開ければ、そのまま使える
    expect(await loadSession(storage, box)).toEqual(session);
    // 封の形でない値（"sb1:" で始まらない）も、開けない値として消さずに null
    const other = memory();
    other.data.set(storageKeys.session, JSON.stringify({ v: 1, sealed: "plain-token" }));
    expect(await loadSession(other, box)).toBeNull();
    expect(other.data.has(storageKeys.session)).toBe(true);
    // 次にログインすれば上書きされる
    await saveSession(other, box, session);
    expect(await loadSession(other, box)).toEqual(session);
  });

  it("開けたのに中身が Session の形でない・壊れている・形が違うときは消して null（ログインし直し）", async () => {
    for (const raw of [JSON.stringify({ v: 1, sealed: "sb1:xxxx" }), "{not json", JSON.stringify({ hello: "world" })]) {
      const storage = memory();
      storage.data.set(storageKeys.session, raw);
      expect(await loadSession(storage, box), raw).toBeNull();
      expect(storage.data.has(storageKeys.session), raw).toBe(false);
    }
  });

  it("何も置いていなければ null", async () => {
    expect(await loadSession(memory(), box)).toBeNull();
  });
});
