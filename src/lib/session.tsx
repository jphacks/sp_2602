// ログイン状態（C1）を画面全体で共有する Context。src/app/_layout.tsx が SessionProvider で包む。
//   - ログインしたら、合言葉と本人（Session）を端末に保存し、api.ts に合言葉を覚えさせる
//   - 起動時は保存した合言葉で authMe を呼び、サーバで確かめる（役割が変わっていれば新しい役割になる）
//       401（合言葉が無効）→ 保存を消してログアウト状態
//       通信できない → 保存してある Session で続ける（offline: true。子どもの端末が電波なしでも使えるように）
//   - ログアウトは保存を消し、Google のログインも外す。設定のキャッシュとその人の送信待ちも消す（sign-out.ts。
//     別の人で入り直したときに、前の人の設定やデータが混ざらないように）
// 画面では: const { state, signIn, signOut, refresh } = useSession();
//   state.status: "checking"（確かめ中）/ "signedOut"（ログインしていない）/ "signedIn"（session あり）
import type { ApiError } from "@contracts/errors";
import { Session } from "@contracts/schemas";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiCallError, call, errorOf, setSessionToken, setUnauthorizedHandler } from "./api";
import { signOutGoogle } from "./google";
import { clearLocalDataFor } from "./sign-out";
import { appStorage, clearSessionData, readJson, storageKeys, writeJson } from "./storage";

export type SessionState =
  | { status: "checking" }
  | { status: "signedOut"; error: ApiError | null } // error はログインに失敗したとき（子09 のダイアログ）
  | { status: "signedIn"; session: Session; offline: boolean }; // offline = サーバで確かめられていない（通信できない）

type SessionContextValue = {
  state: SessionState;
  // idToken（Google または MOCK）でログインする。成功すれば signedIn になる。失敗は state.error と戻り値で分かる
  signIn: (idToken: string) => Promise<ApiError | null>;
  // ログアウト（端末の合言葉を消す）
  signOut: () => Promise<void>;
  // サーバに本人と役割を確かめ直す（QR の紐づけが終わった後に呼ぶと、role が parent / child になる）
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "checking" });
  // 今ログインしている人（ログアウトのときに、その人の送信待ちを消すため）
  const current = useRef<Session | null>(null);
  current.current = state.status === "signedIn" ? state.session : null;

  const forget = useCallback(async (error: ApiError | null) => {
    setSessionToken(null);
    await clearSessionData().catch(() => undefined);
    setState({ status: "signedOut", error });
  }, []);

  const adopt = useCallback(async (session: Session) => {
    setSessionToken(session.token);
    await writeJson(appStorage, storageKeys.session, session).catch(() => undefined);
    setState({ status: "signedIn", session, offline: false });
  }, []);

  // 保存してある合言葉で、サーバに確かめる
  const verify = useCallback(async () => {
    const saved = await readJson(appStorage, storageKeys.session, Session);
    if (!saved) {
      setState({ status: "signedOut", error: null });
      return;
    }
    setSessionToken(saved.token);
    try {
      await adopt(await call("authMe"));
    } catch (e) {
      if (e instanceof ApiCallError && e.error.code === "unauthorized") await forget(null);
      else setState({ status: "signedIn", session: saved, offline: true });
    }
  }, [adopt, forget]);

  useEffect(() => {
    // 使っている途中で合言葉が無効になったら（401）、ログアウト状態にする
    setUnauthorizedHandler(() => {
      void forget({
        code: "unauthorized",
        message: "ログインの期限が切れました",
        hint: "もう一度ログインしてください",
      });
    });
    void verify();
    return () => setUnauthorizedHandler(null);
  }, [verify, forget]);

  const signIn = useCallback(
    async (idToken: string) => {
      try {
        await adopt(await call("authGoogle", { idToken }));
        return null;
      } catch (e) {
        const error = errorOf(e);
        setState({ status: "signedOut", error });
        return error;
      }
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    const who = current.current;
    await signOutGoogle();
    if (who) await clearLocalDataFor(who.userId).catch(() => undefined);
    await forget(null);
  }, [forget]);

  const value = useMemo<SessionContextValue>(
    () => ({ state, signIn, signOut, refresh: verify }),
    [state, signIn, signOut, verify],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("SessionProvider の外で useSession が呼ばれました");
  return v;
}

// ログイン済みの Session を取り出す（ログイン後の画面でだけ使う。入口の振り分けで signedIn が保証されている）
export function useSignedInSession(): Session {
  const { state } = useSession();
  if (state.status !== "signedIn") throw new Error("ログインしていない状態で useSignedInSession が呼ばれました");
  return state.session;
}
