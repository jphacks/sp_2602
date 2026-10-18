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

  it("開けない（鍵が作り直された）・壊れている・形が違うときは消して null（ログインし直し）", async () => {
    for (const raw of [
      JSON.stringify({ v: 1, sealed: "sb1:xxxx" }),
      JSON.stringify({ v: 1, sealed: "plain-token" }),
      "{not json",
      JSON.stringify({ hello: "world" }),
    ]) {
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
