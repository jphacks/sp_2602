// 画面間の受け渡し（lead の担当）。contracts/screens.md の「前の画面から受け取る / 次の画面へ渡す」をここで実装する。
// 画面同士は直接 import し合わず、必ずここを経由する。
// アプリのメモリにだけ持つ（アプリを閉じると消える）。端末に残したいもの（制限ルールなど）は、画面ではなく Kotlin 側・端末の保存領域で持つ。
// 受け渡すものを足すときは、Saved と setter を1つずつ足す。

import type { Rules } from "@contracts/schemas";
import { createContext, type ReactNode, useContext, useState } from "react";

type Saved = { rules: Rules | null };
const empty: Saved = { rules: null };

type Flow = Saved & {
  setRules: (r: Rules | null) => void;
  reset: () => void;
};

const FlowContext = createContext<Flow | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Saved>(empty);

  const value: Flow = {
    ...state,
    setRules: (rules) => setState((s) => ({ ...s, rules })),
    reset: () => setState(empty),
  };
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("FlowProvider の外で useFlow が呼ばれました");
  return flow;
}
