// ログイン状態の分かれ道（src/lib/session-core.ts。session.tsx の adopt・forget・verify = refresh）。
// 封ができない端末（Keystore が使えない・古い dev client）でも、確かめ直し（refresh）でログイン画面へ戻されないこと、
// ログアウト・401 の後にメモリの値でログイン状態に戻らないこと、待っている間にログイン・ログアウトしたら
// 遅れて終わった処理の結果を使わないこと（epoch の確かめ）を確かめる。
// 401 のうち、保護者が連携を外した（reason: family_unlink。D-133）ときだけ片付け（制限を止める・送信待ちを消す）を呼び、
// ログイン画面に「連携が外れました」を出すことも確かめる
import type { ApiError } from "@contracts/errors";
import { mockSessions } from "@contracts/fixtures";
import type { Session } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { createSessionCore, EXPIRED_NOTICE, isFamilyUnlinked, type SessionState } from "@/lib/session-core";
import { loadSession, type SecretBox, saveSession } from "@/lib/session-store";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";

const child = mockSessions["mock-google-child"];
const parent = mockSessions["mock-google-parent"];

const box: SecretBox = {
  sealSecret: (plain) => `sb1:${[...plain].reverse().join("")}`,
  openSecret: (sealed) => (sealed.startsWith("sb1:") ? [...sealed.slice(4)].reverse().join("") : null),
};
const noBox: SecretBox = { sealSecret: () => null, openSecret: () => null };

// 401（error はサーバの返事。理由付きの 401 を作れる）
class Unauthorized extends Error {
  constructor(readonly error: ApiError = { code: "unauthorized", message: "m", hint: "h" }) {
    super(error.message);
  }
}
class Offline extends Error {}

const unlinkedError: ApiError = {
  code: "unauthorized",
  message: "保護者との連携が外れました",
  hint: "また使うときは、ログインしてから保護者と QR でつなぎ直してください",
  reason: "family_unlink",
};

// 外から「もういいよ」と言うまで待たせる道具（保存・読み出し・消すのを途中で止めて、その間にログイン・ログアウトする）
function pause() {
  let release: () => void = () => undefined;
  const until = new Promise<void>((resolve) => (release = resolve));
  return { until, release };
}

// 待っている処理が先へ進むのを待つ（then を何回かまわす）
const tick = () => new Promise((r) => setTimeout(r, 0));

// authMe の返事は me で差し替える（関数なら呼ばれるまで待たせられる）。
// hold に Promise を入れると、端末の読み出し（getItem）・書き込み（setItem）・消す（clearSaved）がそこで止まる
function setup(secretBox: SecretBox) {
  const data = new Map<string, string>();
  const hold: { get?: Promise<void>; set?: Promise<void>; clear?: Promise<void> } = {};
  const storage: KeyValueStorage = {
    // 読んだ値は止まる前に取っておく（読み終わった後、返事が届く前にログアウトした、の形にする）
    getItem: async (k) => {
      const v = data.get(k) ?? null;
      await hold.get;
      return v;
    },
    setItem: async (k, v) => {
      await hold.set;
      data.set(k, v);
    },
    removeItem: async (k) => void data.delete(k),
  };
  const t = {
    data,
    storage,
    hold,
    token: null as string | null,
    state: { status: "checking" } as SessionState,
    me: (async () => child) as () => Promise<Session>,
    cleared: [] as string[], // 連携が外れたときの片付け（clearUnlinked）を呼んだ子ども
  };
  const core = createSessionCore({
    storage,
    box: secretBox,
    setToken: (token) => {
      t.token = token;
    },
    authMe: () => t.me(),
    isUnauthorized: (e) => e instanceof Unauthorized,
    errorOf: (e) => (e instanceof Unauthorized ? e.error : null),
    clearUnlinked: async (userId) => void t.cleared.push(userId),
    clearSaved: async () => {
      await hold.clear;
      data.delete(storageKeys.session);
    },
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

  it("ログイン（adopt）で端末に置くのを待つ間にログアウトしたら、置き終わってもログイン状態に戻らない", async () => {
    const { t, core } = setup(box);
    const saving = pause();
    t.hold.set = saving.until;
    const pending = core.adopt(child);
    await tick();
    await core.forget(null);
    saving.release();
    await pending;
    expect(t.state).toEqual({ status: "signedOut", error: null });
    expect(t.token).toBeNull();
  });

  it("ログアウト（forget）で消すのを待つ間にログインし直したら、消し終わってもログインした人を残す", async () => {
    const { t, core } = setup(box);
    await core.adopt(child);
    const clearing = pause();
    t.hold.clear = clearing.until;
    const pending = core.forget(null);
    await tick();
    await core.adopt(parent);
    clearing.release();
    await pending;
    expect(t.state).toEqual({ status: "signedIn", session: parent, offline: false });
    expect(t.token).toBe(parent.token);
  });

  it("起動時に端末の保存を読むのを待つ間にログアウトしたら、読んだ古い合言葉を api.ts に戻さない", async () => {
    const { t, core } = setup(box);
    await saveSession(t.storage, box, child);
    const loading = pause();
    t.hold.get = loading.until;
    const pending = core.verify();
    await tick();
    await core.forget(null);
    loading.release();
    await pending;
    expect(t.token).toBeNull();
    expect(t.state).toEqual({ status: "signedOut", error: null });
  });

  it("確かめ直しの返事を待つ間にログアウトし、その後に通信エラーが届いても、offline のログイン状態に戻らない", async () => {
    const { t, core } = setup(noBox);
    await core.adopt(child);
    let fail: (e: unknown) => void = () => undefined;
    t.me = () => new Promise<Session>((_, reject) => (fail = reject));
    const pending = core.verify();
    await tick();
    await core.forget(null);
    fail(new Offline());
    await pending;
    expect(t.state).toEqual({ status: "signedOut", error: null });
    expect(t.token).toBeNull();
    // メモリにも戻していない（次の確かめ直しでもログアウトのまま）
    t.me = async () => child;
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: null });
  });

  it("起動時（メモリが空）は端末に置いた Session で確かめる", async () => {
    const { t, core } = setup(box);
    await saveSession(t.storage, box, child);
    await core.verify();
    expect(t.state).toEqual({ status: "signedIn", session: child, offline: false });
    expect(t.token).toBe(child.token);
  });
});

describe("session-core: 401 の理由（D-133）", () => {
  it("isFamilyUnlinked: unauthorized で reason が family_unlink のときだけ", () => {
    expect(isFamilyUnlinked(unlinkedError)).toBe(true);
    expect(isFamilyUnlinked({ code: "unauthorized", message: "m", hint: "h" })).toBe(false);
    expect(isFamilyUnlinked({ ...unlinkedError, code: "forbidden" })).toBe(false);
    expect(isFamilyUnlinked(null)).toBe(false);
  });

  it("使っている途中の 401 で連携が外れていたら、ログアウト状態にして片付け、ログイン画面に理由を出す", async () => {
    const { t, core } = setup(box);
    await core.adopt(child);
    await core.expire(unlinkedError);
    expect(t.state).toEqual({ status: "signedOut", error: unlinkedError });
    expect(t.cleared).toEqual([child.userId]);
    expect(t.data.has(storageKeys.session)).toBe(false);
    expect(t.token).toBeNull();
  });

  it("理由のない 401（期限切れ・ログアウトされた）では片付けない（制限を止めない・送信待ちを残す）。帯は「期限が切れました」", async () => {
    const { t, core } = setup(box);
    await core.adopt(child);
    await core.expire({ code: "unauthorized", message: "ログインが確認できませんでした", hint: "h" });
    expect(t.state).toEqual({ status: "signedOut", error: EXPIRED_NOTICE });
    expect(t.cleared).toEqual([]);
  });

  it("起動時の確かめ（端末に置いた Session）で連携が外れた 401 なら、その子どもの分を片付けて理由を出す", async () => {
    const { t, core } = setup(box);
    await saveSession(t.storage, box, child);
    t.me = async () => {
      throw new Unauthorized(unlinkedError);
    };
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: unlinkedError });
    expect(t.cleared).toEqual([child.userId]);
  });

  it("起動時の確かめで api.ts が先に expire を呼んだときも、持ち主（端末に置いた Session）の分を片付ける", async () => {
    const { t, core } = setup(box);
    await saveSession(t.storage, box, child);
    t.me = async () => {
      // api.ts の send は、例外を投げる前に登録した関数（session.tsx → expire）を呼ぶ
      await core.expire(unlinkedError);
      throw new Unauthorized(unlinkedError);
    };
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: unlinkedError });
    expect(t.cleared).toEqual([child.userId]);
  });

  it("起動時の確かめで理由のない 401 なら、片付けずに帯なしでログイン画面へ（今までどおり）", async () => {
    const { t, core } = setup(box);
    await saveSession(t.storage, box, child);
    t.me = async () => {
      throw new Unauthorized();
    };
    await core.verify();
    expect(t.state).toEqual({ status: "signedOut", error: null });
    expect(t.cleared).toEqual([]);
  });

  it("片付けが失敗しても、ログアウト状態と理由の帯はそのまま", async () => {
    const { t, core } = setup(box);
    await core.adopt(child);
    const failing = createSessionCore({
      storage: t.storage,
      box,
      setToken: () => undefined,
      authMe: async () => child,
      isUnauthorized: () => true,
      errorOf: () => null,
      clearUnlinked: async () => {
        throw new Error("消せなかった");
      },
      clearSaved: async () => undefined,
      setState: (s) => {
        t.state = s;
      },
    });
    await failing.adopt(child);
    await expect(failing.expire(unlinkedError)).resolves.toBeUndefined();
    expect(t.state).toEqual({ status: "signedOut", error: unlinkedError });
  });
});
