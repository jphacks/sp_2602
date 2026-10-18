// 画面の間の受け渡し（メモリだけ。アプリを閉じると消える）。画面同士は直接 import し合わず、ここを経由する。
// 持ち物:
//   child     : 保護者が今見ている子ども（親の画面。parent-data.tsx が家族の1人目を入れる。QR の紐づけ直後はその子ども）
//   editTest  : 日程の一覧から編集画面へ渡すテスト期間（子05・親05。編集画面は id でも取り直せるが、すぐ出すために渡す）
// 持ち主（owner = ログインしている人の userId。_layout.tsx が渡す）が変わったら、中身を空に戻す（forOwner）。
// 受け渡すものを足すときは、Saved と setter を1つずつ足す。端末に残したいもの（合言葉・設定のキャッシュ）は storage.ts へ。
import type { Child, TestPeriod } from "@contracts/schemas";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";

type Saved = { child: Child | null; editTest: TestPeriod | null };
type Owned = Saved & { owner: string | null };
const empty: Saved = { child: null, editTest: null };

// 同じ子ども（id と名前が同じ）を入れ直すときは、前の中身をそのまま返す（描き直しを起こさない）。
// なぜ: 親の QR の画面（pair/parent.tsx）は数秒ごとに状態を聞き直し、そのたびに同じ子どもを setChild する。
// 中身が毎回新しくなると、それを見ている画面が描き直され、effect がまた setChild する、をくり返して止まらなくなった
// （実機 SC-53C/SCG13 で「Maximum update depth exceeded」）。
export function withChild(s: Saved, child: Child | null): Saved {
  const cur = s.child;
  if (cur === child) return s;
  if (cur && child && cur.id === child.id && cur.name === child.name) return s;
  return { ...s, child };
}

// 持ち主が同じなら中身をそのまま、違えば空にする（null = ログインしていない）。
// なぜ: 前はログアウト・合言葉の無効（401）でログイン画面へ戻っても、見ていた子どもがメモリに残った。ログインし直すと
//   （サーバが DB 版に替わって id が uuid になった・別の保護者が入った）、家族の一覧が届くまでの間、もういない子どもの id で
//   実績・設定を取りに行って 403 を出し、端末に残った前の子どもの設定のキャッシュまで画面に出した。一覧が取れないとそのまま残った
export function forOwner(s: Owned, owner: string | null): Owned {
  return s.owner === owner ? s : { ...empty, owner };
}

type Flow = Saved & {
  setChild: (c: Child | null) => void;
  setEditTest: (t: TestPeriod | null) => void;
  reset: () => void;
};

const FlowContext = createContext<Flow | null>(null);

export function FlowProvider({ owner, children }: { owner: string | null; children: ReactNode }) {
  const [state, setState] = useState<Owned>({ ...empty, owner });
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  // 持ち主が変わったら空に戻して保存し直す（描くときは下の current で、先に空として扱う）
  useEffect(() => {
    setState((s) => forOwner(s, owner));
  }, [owner]);
  // 書き換える関数は最初に1回だけ作る（中身が変わっても同じ関数のまま）。
  // effect の依存に setChild を入れている画面が、中身の変化のたびに effect をやり直さないようにするため
  const setters = useMemo(
    () => ({
      setChild: (child: Child | null) =>
        setState((s) => {
          const mine = forOwner(s, ownerRef.current);
          const next = withChild(mine, child);
          return next === mine ? mine : { ...next, owner: mine.owner };
        }),
      setEditTest: (editTest: TestPeriod | null) => setState((s) => ({ ...forOwner(s, ownerRef.current), editTest })),
      reset: () => setState({ ...empty, owner: ownerRef.current }),
    }),
    [],
  );
  const current = forOwner(state, owner);
  const value = useMemo<Flow>(
    () => ({ child: current.child, editTest: current.editTest, ...setters }),
    [current.child, current.editTest, setters],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("FlowProvider の外で useFlow が呼ばれました");
  return flow;
}
