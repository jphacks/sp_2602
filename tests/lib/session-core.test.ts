// ログイン状態の分かれ道（src/lib/session-core.ts。session.tsx の adopt・forget・verify = refresh）。
// 封ができない端末（Keystore が使えない・古い dev client）でも、確かめ直し（refresh）でログイン画面へ戻されないこと、
// ログアウト・401 の後にメモリの値でログイン状態に戻らないことを確かめる
import { mockSessions } from "@contracts/fixtures";
import type { Session } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { createSessionCore, type SessionState } from "@/lib/session-core";
import { loadSession, type SecretBox, saveSession } from "@/lib/session-store";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";

const child = mockSessions["mock-google-child"];
const parent = mockSessions["mock-google-parent"];

const box: SecretBox = {
  sealSecret: (plain) => `sb1:${[...plain].reverse().join("")}`,
  openSecret: (sealed) => (sealed.startsWith("sb1:") ? [...sealed.slice(4)].reverse().join("") : null),
};
const noBox: SecretBox = { sealSecret: () => null, openSecret: () => null };

class Unauthorized extends Error {}
class Offline extends Error {}

// authMe の返事は me で差し替える（関数なら呼ばれるまで待たせられる）
function setup(secretBox: SecretBox) {
  const data = new Map<string, string>();
  const storage: KeyValueStorage = {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
  const t = {
    data,
    storage,
    token: null as string | null,
    state: { status: "checking" } as SessionState,
    me: (async () => child) as () => Promise<Session>,
  };
  const core = createSessionCore({
    storage,
    box: secretBox,
    setToken: (token) => {
      t.token = token;
    },
    authMe: () => t.me(),
    isUnauthorized: (e) => e instanceof Unauthorized,
    clearSaved: async () => void data.delete(storageKeys.session),
    setState: (s) => {
      t.state = s;
    },
  });
  return { t, core };
}

describe("session-core", () => {
  it("何も置いていなければ、起動時の確かめはログアウト状態", async () => {
    const { t, core } = setup(box);
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: null });
    expect(t.token).toBeNull();
  });

  it("封ができず端末に置けなくても、確かめ直し（refresh）でログイン状態のまま。役割の変化も受け取る", async () => {
    const { t, core } = setup(noBox);
    const fresh = mockSessions["mock-google-new"]; // 役割なし
    await core.adopt(fresh);
    expect(t.data.has(storageKeys.session)).toBe(false);
    expect(t.state).toEqual({ status: "signedIn", session: fresh, offline: false });

    // QR で紐づけた後の「ホームへ」: サーバは新しい役割を返す
    const linked: Session = { ...fresh, role: "child" };
    t.me = async () => linked;
    await core.verify();
    expect(t.state).toEqual({ status: "signedIn", session: linked, offline: false });
    expect(t.token).toBe(fresh.token);
  });

  it("封ができず、確かめ直しで通信できないときも、メモリの Session で続ける（offline）", async () => {
    const { t, core } = setup(noBox);
    await core.adopt(child);
    t.me = async () => {
      throw new Offline();
    };
    await core.verify();
    expect(t.state).toEqual({ status: "signedIn", session: child, offline: true });
    expect(t.token).toBe(child.token);
  });

  it("ログアウト（forget）の後は、確かめ直してもメモリの値で戻らない", async () => {
    const { t, core } = setup(noBox);
    await core.adopt(child);
    await core.forget(null);
    expect(t.state).toEqual({ status: "signedOut", error: null });
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: null });
    expect(t.token).toBeNull();
  });

  it("確かめ直しで 401 なら、保存もメモリも消してログアウト状態", async () => {
    const { t, core } = setup(box);
    await core.adopt(child);
    expect(await loadSession(t.storage, box)).toEqual(child);
    t.me = async () => {
      throw new Unauthorized();
    };
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: null });
    expect(t.data.has(storageKeys.session)).toBe(false);
    expect(t.token).toBeNull();
    t.me = async () => child;
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: null });
  });

  it("確かめ直しの返事を待つ間にログアウト（401）したら、遅れて届いた返事でログイン状態に戻らない", async () => {
    const { t, core } = setup(noBox);
    await core.adopt(child);
    let reply: (s: Session) => void = () => undefined;
    t.me = () => new Promise<Session>((resolve) => (reply = resolve));
    const pending = core.verify();
    await new Promise((r) => setTimeout(r, 0));
    await core.forget({ code: "unauthorized", message: "ログインの期限が切れました", hint: "もう一度" });
    reply(child);
    await pending;
    expect(t.state).toMatchObject({ status: "signedOut" });
    expect(t.token).toBeNull();
  });

  it("確かめ直しの返事を待つ間に別の人でログインし直したら、そちらを残す", async () => {
    const { t, core } = setup(box);
    await core.adopt(child);
    let reply: (s: Session) => void = () => undefined;
    t.me = () => new Promise<Session>((resolve) => (reply = resolve));
    const pending = core.verify();
    await new Promise((r) => setTimeout(r, 0));
    await core.adopt(parent);
    reply(child);
    await pending;
    expect(t.state).toEqual({ status: "signedIn", session: parent, offline: false });
    expect(t.token).toBe(parent.token);
  });

  it("起動時（メモリが空）は端末に置いた Session で確かめる", async () => {
    const { t, core } = setup(box);
    await saveSession(t.storage, box, child);
    await core.verify();
    expect(t.state).toEqual({ status: "signedIn", session: child, offline: false });
    expect(t.token).toBe(child.token);
  });
});
