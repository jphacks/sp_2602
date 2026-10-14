"use client";

// 画面間の受け渡し（lead の所有）。contracts/screens.md の「前の画面から受け取る / 次の画面へ渡す」をここで実装する。
// 画面同士は直接 import し合わず、必ずここを経由する。
// デモ中にリロードしても消えないよう、sessionStorage に退避する（タブを閉じれば消える）。
// 受け渡すものを足すときは、Saved に1行（例: fooResult: FooResult.nullable()）と setter を1つずつ足す。
// npm run kit:reset 後の空の状態（受け渡しなし）。

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { z } from "zod";

const KEY = "kit-flow";
const Saved = z.object({});
type Saved = z.infer<typeof Saved>;
const empty: Saved = {};

type Flow = Saved & {
  ready: boolean; // sessionStorage からの復元が終わったか。false の間は「データなし」と表示しない
  reset: () => void;
};

const FlowContext = createContext<Flow | null>(null);

function load(): Saved {
  try {
    const parsed = Saved.safeParse(JSON.parse(sessionStorage.getItem(KEY) ?? "null"));
    return parsed.success ? parsed.data : empty; // 契約が変わって古い形が残っていたら捨てる
  } catch {
    return empty;
  }
}

function save(s: Saved) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートモード等）でも画面は動かす
  }
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Saved>(empty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  const update = (patch: Partial<Saved>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    });

  const value: Flow = {
    ...state,
    ready,
    reset: () => update(empty),
  };
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("FlowProvider の外で useFlow が呼ばれました");
  return flow;
}
