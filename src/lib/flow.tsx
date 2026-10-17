// 画面の間の受け渡し（メモリだけ。アプリを閉じると消える）。画面同士は直接 import し合わず、ここを経由する。
// 持ち物:
//   child     : 保護者が今見ている子ども（親の画面。parent-data.tsx が家族の1人目を入れる。QR の紐づけ直後はその子ども）
//   editTest  : 日程の一覧から編集画面へ渡すテスト期間（子05・親05。編集画面は id でも取り直せるが、すぐ出すために渡す）
// 受け渡すものを足すときは、Saved と setter を1つずつ足す。端末に残したいもの（合言葉・設定のキャッシュ）は storage.ts へ。
import type { Child, TestPeriod } from "@contracts/schemas";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type Saved = { child: Child | null; editTest: TestPeriod | null };
const empty: Saved = { child: null, editTest: null };

type Flow = Saved & {
  setChild: (c: Child | null) => void;
  setEditTest: (t: TestPeriod | null) => void;
  reset: () => void;
};

const FlowContext = createContext<Flow | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Saved>(empty);
  const value = useMemo<Flow>(
    () => ({
      ...state,
      setChild: (child) => setState((s) => ({ ...s, child })),
      setEditTest: (editTest) => setState((s) => ({ ...s, editTest })),
      reset: () => setState(empty),
    }),
    [state],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("FlowProvider の外で useFlow が呼ばれました");
  return flow;
}
