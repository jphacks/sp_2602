// 保護者の画面で共通の、データの受け取り方。
//   - ChildGate: 見ている子ども（useParentData().child）が決まるまでの状態（読み込み中・取得不可・まだつながっていない）を出し、
//                決まったら children(child) を出す。親01・親02・親03・親09・親16 で同じ出し分けをするため
//   - useUsage : C6 の実績（call("usageGet")）を 30 秒ごとに取り直す。失敗したら、前に取れた値を stale として残す（0 分にしない）
import type { ApiError } from "@contracts/errors";
import type { Child, ParentUsageView } from "@contracts/schemas";
import { Fragment, type ReactNode, useCallback, useState } from "react";
import { StateView } from "@/components";
import { call, errorOf } from "@/lib/api";
import { useParentData } from "@/lib/parent-data";
import { usePolling } from "@/lib/polling";

export function ChildGate({ children }: { children: (child: Child) => ReactNode }) {
  const { child, family, familyError, refresh } = useParentData();
  // key: 見ている子どもが変わったら中身を作り直す（前の子どもの実績を、次の取り直しまで出し続けないため）
  if (child) return <Fragment key={child.id}>{children(child)}</Fragment>;
  if (familyError)
    return (
      <StateView
        state="unknown"
        message="つながりの状態を確かめられません"
        hint={familyError.hint}
        onRetry={() => void refresh()}
      />
    );
  if (!family) return <StateView state="loading" />;
  return (
    <StateView
      state="empty"
      message="まだ子どもとつながっていません"
      hint="子どものスマホに出したQRコードを読み取ると、使用状況を見られます"
    />
  );
}

export type UsageState =
  | { status: "loading" }
  | { status: "ok"; view: ParentUsageView }
  | { status: "stale"; view: ParentUsageView; error: ApiError } // 前に取れた値（最新でない可能性）
  | { status: "error"; error: ApiError }; // 一度も取れていない（取得不可）

// from〜to の実績を取る。期間が変わったら（日付が変わったなど）前の値は使わない
export function useUsage(
  childId: string,
  from: string,
  to: string,
): { state: UsageState; reload: () => Promise<void> } {
  const [state, setState] = useState<UsageState>({ status: "loading" });
  const load = useCallback(async () => {
    try {
      const view = await call("usageGet", { childId, from, to });
      setState({ status: "ok", view });
    } catch (e) {
      const error = errorOf(e);
      if (!error) return; // 自分で中断した
      setState((prev) =>
        (prev.status === "ok" || prev.status === "stale") && prev.view.from === from && prev.view.to === to
          ? { status: "stale", view: prev.view, error }
          : { status: "error", error },
      );
    }
  }, [childId, from, to]);
  usePolling(load);
  return { state, reload: load };
}
