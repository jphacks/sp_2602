// ログイン状態（C1）の分かれ道。React の Context（session.tsx）が使う。React・expo を読まないので Node のテストで確かめられる
// （tests/lib/session-core.test.ts）。
//   - adopt : ログインした・サーバで確かめ直した Session を使い始める（api.ts の合言葉・端末の保存・メモリ・状態をそろえる）
//   - forget: ログアウト状態にする（合言葉・端末の保存・メモリを消す）
//   - verify: 今の合言葉でサーバに確かめ直す（起動時と refresh）
// 今の Session はメモリ（kept）にも持つ。なぜ: 合言葉は封ができないと端末に置かない（session-store.ts。平文で置かないため）。
//   前は確かめ直すときに端末の保存しか読まなかったので、Keystore が使えない端末では、ログイン→QR で紐づけ→「ホームへ」
//   （refresh）や、403 のたびの refresh（child-data.tsx・parent-data.tsx）でログイン画面へ戻されていた。
//   メモリの値は forget で必ず消し、待っている間にログイン・ログアウトしたら（epoch が変わったら）結果を使わない
//   （ログアウト・401 の後にメモリの値や遅れて届いた返事で、ログイン状態に戻らないように）
import type { ApiError } from "@contracts/errors";
import type { Session } from "@contracts/schemas";
import { loadSession, type SecretBox, saveSession } from "./session-store";
import type { KeyValueStorage } from "./storage";

export type SessionState =
  | { status: "checking" }
  | { status: "signedOut"; error: ApiError | null } // error はログインに失敗したとき（子09 のダイアログ）
  | { status: "signedIn"; session: Session; offline: boolean }; // offline = サーバで確かめられていない（通信できない）

export type SessionCoreDeps = {
  storage: KeyValueStorage;
  box: SecretBox; // 合言葉の封（native.ts）
  setToken: (token: string | null) => void; // api.ts の setSessionToken
  authMe: () => Promise<Session>; // サーバに「自分は誰か」を聞く
  isUnauthorized: (e: unknown) => boolean; // 合言葉が無効（401）か
  clearSaved: () => Promise<void>; // 端末に置いた Session を消す（storage.ts の clearSessionData）
  setState: (state: SessionState) => void;
};

export type SessionCore = {
  adopt: (session: Session) => Promise<void>;
  forget: (error: ApiError | null) => Promise<void>;
  verify: () => Promise<void>;
};

export function createSessionCore(d: SessionCoreDeps): SessionCore {
  // この起動の間に使っている Session（端末に置けなかったときも、ここにはある）。ログアウト状態では null
  let kept: Session | null = null;
  // Session が入れ替わった・消えた回数。待っている間に変わったら、その結果は捨てる
  let epoch = 0;

  const forget = async (error: ApiError | null) => {
    const at = ++epoch;
    kept = null;
    d.setToken(null);
    await d.clearSaved().catch(() => undefined);
    // 消している間に、ログインし直していたら（adopt）そちらを残す
    if (epoch === at) d.setState({ status: "signedOut", error });
  };

  const adopt = async (session: Session) => {
    const at = ++epoch;
    kept = session;
    d.setToken(session.token);
    // 合言葉は Android Keystore の鍵で封をしてから置く（session-store.ts。封ができなければ置かず、メモリの kept だけで続ける）
    await saveSession(d.storage, d.box, session).catch(() => undefined);
    // 置いている間に、ログアウトしていたら（forget）ログイン状態に戻さない
    if (epoch === at) d.setState({ status: "signedIn", session, offline: false });
  };

  // 今の合言葉（メモリ。なければ端末の保存）で、サーバに確かめる
  const verify = async () => {
    const at = epoch;
    const saved = kept ?? (await loadSession(d.storage, d.box).catch(() => null));
    if (epoch !== at) return;
    if (!saved) {
      d.setState({ status: "signedOut", error: null });
      return;
    }
    d.setToken(saved.token);
    let me: Session;
    try {
      me = await d.authMe();
    } catch (e) {
      if (epoch !== at) return;
      // 401 なら（本文の code が読めなくても）保存を消してログイン画面へ。通信できないときだけ今の Session で続ける
      if (d.isUnauthorized(e)) {
        await forget(null);
      } else {
        kept = saved;
        d.setState({ status: "signedIn", session: saved, offline: true });
      }
      return;
    }
    if (epoch !== at) return;
    await adopt(me);
  };

  return { adopt, forget, verify };
}
