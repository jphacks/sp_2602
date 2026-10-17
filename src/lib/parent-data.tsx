// 保護者の端末のデータを、親用の画面（src/app/parent/）全体で共有する Context。parent/_layout.tsx が ParentDataProvider で包む。
//   - 連携済みの子どもの一覧（familyGet）を取り、見ている子ども（flow.tsx の child）がいなければ1人目にする
//   - 見ている子どもの設定の組（C7: 日程・日別上限・対象外アプリ・版）を 30 秒ごとに取り直す
// 子どもの実績（分）は画面ごとに期間が違うので、各画面で call("usageGet", { childId, from, to }) を呼ぶ（親01・親03・親09）。
// 親の端末の使用時間は子どもの記録として使わない（MVP_SPEC 5.2）。
// 画面では: const { child, family, config, refresh } = useParentData();
import type { ApiError } from "@contracts/errors";
import type { Child } from "@contracts/schemas";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { call, errorOf } from "./api";
import { type ConfigState, configCache } from "./config-cache";
import { useFlow } from "./flow";
import { usePolling } from "./polling";
import { keepIfSame } from "./same";

type ParentData = {
  child: Child | null; // 見ている子ども（連携済みの子どもがいなければ null）
  family: Child[] | null; // 連携済みの子ども（null = まだ読み込み中）
  familyError: ApiError | null; // 一覧を取れなかったとき（共01「連携状態を取得できない」）
  config: ConfigState | null; // 見ている子どもの設定の組（null = まだ読み込み中・子どもがいない）
  refresh: () => Promise<void>;
};

const ParentDataContext = createContext<ParentData | null>(null);

export function ParentDataProvider({ children }: { children: ReactNode }) {
  const { child, setChild } = useFlow();
  const [family, setFamily] = useState<Child[] | null>(null);
  const [familyError, setFamilyError] = useState<ApiError | null>(null);
  const [config, setConfig] = useState<ConfigState | null>(null);
  // 今見ている子ども（取得の途中で子どもが変わったら、前の子どもの設定を入れないため）
  const viewing = useRef<string | null>(child?.id ?? null);
  viewing.current = child?.id ?? null;

  // 見ている子どもが変わったら、端末に保存してある設定をすぐ出す
  useEffect(() => {
    setConfig(null);
    if (child)
      void configCache.load(child.id).then((s) => {
        if (viewing.current === child.id) setConfig((cur) => cur ?? s);
      });
  }, [child]);

  const refresh = useCallback(async () => {
    let current = child;
    try {
      const f = await call("familyGet");
      // 中身が同じなら前の一覧のまま（30 秒ごとに全部の画面を描き直さない）
      setFamily((prev) => keepIfSame(prev, f.children));
      setFamilyError(null);
      if (!current || !f.children.some((c) => c.id === current?.id)) {
        current = f.children[0] ?? null;
        setChild(current);
        viewing.current = current?.id ?? null;
      }
    } catch (e) {
      setFamilyError(errorOf(e));
    }
    if (!current) return;
    const id = current.id;
    const next = await configCache.refresh(id);
    // 待っている間に別の子どもに切り替わっていたら捨てる。中身が同じなら前の値のまま（ウィジェットの保存などをやり直さない）
    if (viewing.current === id) setConfig((prev) => keepIfSame(prev, next));
  }, [child, setChild]);

  usePolling(refresh);

  const value = useMemo<ParentData>(
    () => ({ child, family, familyError, config, refresh }),
    [child, family, familyError, config, refresh],
  );
  return <ParentDataContext.Provider value={value}>{children}</ParentDataContext.Provider>;
}

export function useParentData(): ParentData {
  const v = useContext(ParentDataContext);
  if (!v) throw new Error("ParentDataProvider の外で useParentData が呼ばれました（親用の画面の中で使ってください）");
  return v;
}
