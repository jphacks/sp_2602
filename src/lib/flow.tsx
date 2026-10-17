// 画面の間の受け渡し（メモリだけ。アプリを閉じると消える）。画面同士は直接 import し合わず、ここを経由する。
// 持ち物:
//   child     : 保護者が今見ている子ども（親の画面。parent-data.tsx が家族の1人目を入れる。QR の紐づけ直後はその子ども）
//   editTest  : 日程の一覧から編集画面へ渡すテスト期間（子05・親05。編集画面は id でも取り直せるが、すぐ出すために渡す）
// 受け渡すものを足すときは、Saved と setter を1つずつ足す。端末に残したいもの（合言葉・設定のキャッシュ）は storage.ts へ。
import type { Child, TestPeriod } from "@contracts/schemas";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type Saved = { child: Child | null; editTest: TestPeriod | null };
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

type Flow = Saved & {
  setChild: (c: Child | null) => void;
  setEditTest: (t: TestPeriod | null) => void;
  reset: () => void;
};

const FlowContext = createContext<Flow | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Saved>(empty);
  // 書き換える関数は最初に1回だけ作る（中身が変わっても同じ関数のまま）。
  // effect の依存に setChild を入れている画面が、中身の変化のたびに effect をやり直さないようにするため
  const setters = useMemo(
    () => ({
      setChild: (child: Child | null) => setState((s) => withChild(s, child)),
      setEditTest: (editTest: TestPeriod | null) => setState((s) => ({ ...s, editTest })),
      reset: () => setState(empty),
    }),
    [],
  );
  const value = useMemo<Flow>(() => ({ ...state, ...setters }), [state, setters]);
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("FlowProvider の外で useFlow が呼ばれました");
  return flow;
}
