// ログイン状態（C1）の分かれ道。React の Context（session.tsx）が使う。React・expo を読まないので Node のテストで確かめられる
// （tests/lib/session-core.test.ts）。
//   - adopt : ログインした・サーバで確かめ直した Session を使い始める（api.ts の合言葉・端末の保存・メモリ・状態をそろえる）
//   - forget: ログアウト状態にする（合言葉・端末の保存・メモリを消す）
//   - verify: 今の合言葉でサーバに確かめ直す（起動時と refresh）
//   - expire: 使っている途中で合言葉が無効と言われた（401。api.ts の setUnauthorizedHandler から）
// 401 のうち、保護者が連携を外した（reason: family_unlink。D-133）ときだけ、ログアウト状態にしたあとで clearUnlinked を呼ぶ
// （端末の制限を止め、その子どもの送信待ち・設定のキャッシュを消す）。ログイン画面には「保護者との連携が外れました」を出す。
//   なぜ外れたときだけか: 期限切れなどほかの 401 で制限を止めると、子どもが合言葉の期限切れを待つ（端末を 30 日使わない等）だけで
//   制限から逃げられてしまう。送信待ちも、同じ人がログインし直せば送れるので残す（sign-out.ts）。
//   外れたときは、送信待ちを残すと次に紐づけた保護者へ前の家庭の時期の記録が送られる（セキュリティ検査 F-2 の残り）
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

// 使っている途中で 401 になったときに、ログイン画面に出す帯（連携が外れたときは、サーバの文をそのまま出す）
export const EXPIRED_NOTICE: ApiError = {
  code: "unauthorized",
  message: "ログインの期限が切れました",
  hint: "もう一度ログインしてください",
};

// 保護者が連携を外したので合言葉が無効になった、という 401 か（contracts/errors.ts の UnauthorizedReason）
export function isFamilyUnlinked(error: ApiError | null | undefined): boolean {
  return error?.code === "unauthorized" && error.reason === "family_unlink";
}

// 自分でログアウトできるか（D-136。2026-10-18 ユーザーが決めた「子どものログアウトをなくす」）。
// 子ども（役割 child）はできない。なぜ: ログアウトすると端末の制限（Kotlin の監視）が止まり、制限から逃げる道になるため。
//   子どもの端末がログイン状態から抜けるのは、保護者が連携を外したとき（401 の family_unlink。D-133）だけ。
// 保護者・役割が決まる前（/pair の役割選び。まだ制限がかかっていない）・ログインしていないときはできる。
// session.tsx の signOut（子どもなら何もしない）と、入口 /pair の「ログアウト」（子どもには出さない）が使う
export function canSignOut(session: Pick<Session, "role"> | null): boolean {
  return session?.role !== "child";
}

export type SessionCoreDeps = {
  storage: KeyValueStorage;
  box: SecretBox; // 合言葉の封（native.ts）
  setToken: (token: string | null) => void; // api.ts の setSessionToken
  authMe: () => Promise<Session>; // サーバに「自分は誰か」を聞く
  isUnauthorized: (e: unknown) => boolean; // 合言葉が無効（401）か
  errorOf: (e: unknown) => ApiError | null; // 例外 → サーバの返事（api.ts の errorOf。401 の理由を読むため）
  clearUnlinked: (userId: string) => Promise<void>; // 連携が外れたときの片付け（端末の制限を止め、送信待ち・設定を消す）
  clearSaved: () => Promise<void>; // 端末に置いた Session を消す（storage.ts の clearSessionData）
  setState: (state: SessionState) => void;
};

export type SessionCore = {
  adopt: (session: Session) => Promise<void>;
  forget: (error: ApiError | null) => Promise<void>;
  verify: () => Promise<void>;
  expire: (error: ApiError) => Promise<void>;
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

  // 合言葉が無効と言われた（401）。who はその合言葉の持ち主（分からなければ null）。
  // 連携が外れた 401 なら、先にログアウト状態にして（子どもの画面を閉じ、制限の値を書き直す処理を止める）から片付ける
  const lose = async (who: Session | null, error: ApiError | null, notice: ApiError | null) => {
    const unlinked = isFamilyUnlinked(error);
    await forget(unlinked ? error : notice);
    if (unlinked && who) await d.clearUnlinked(who.userId).catch(() => undefined);
  };

  const expire = (error: ApiError) => lose(kept, error, EXPIRED_NOTICE);

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
    // 確かめている間の 401（api.ts から expire が先に呼ばれる）でも、持ち主が分かるようにメモリにも置く
    kept = saved;
    d.setToken(saved.token);
    let me: Session;
    try {
      me = await d.authMe();
    } catch (e) {
      if (epoch !== at) return;
      // 401 なら（本文の code が読めなくても）保存を消してログイン画面へ（連携が外れたなら片付けて知らせる）。
      // 通信できないときだけ今の Session で続ける
      if (d.isUnauthorized(e)) {
        await lose(saved, d.errorOf(e), null);
      } else {
        kept = saved;
        d.setState({ status: "signedIn", session: saved, offline: true });
      }
      return;
    }
    if (epoch !== at) return;
    await adopt(me);
  };

  return { adopt, forget, verify, expire };
}
