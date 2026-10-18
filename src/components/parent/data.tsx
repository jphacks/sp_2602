// 保護者の画面で共通の、データの受け取り方。
//   - ChildGate: 見ている子ども（useParentData().child）が決まるまでの状態（読み込み中・取得不可・まだつながっていない）を出し、
//                決まったら children(child) を出す。親01・親02・親03・親09・親16 で同じ出し分けをするため
//   - useUsage : C6 の実績（call("usageGet")）を 30 秒ごとに取り直す。失敗したら、前に取れた値を stale として残す（0 分にしない）
//   - useDeviceStatus : 子どもの端末の許可の状態（call("deviceStatusGet")。D-113）を 30 秒ごとに取り直す（親01 の注意の帯）
import type { ApiError } from "@contracts/errors";
import type { Child, ChildDeviceStatus, ParentUsageView } from "@contracts/schemas";
import { router } from "expo-router";
import { Fragment, type ReactNode, useCallback, useState } from "react";
import { StateView } from "@/components";
import { familyGate, scanQrAction } from "@/components/parent/gate";
import { call, errorOf } from "@/lib/api";
import { useParentData } from "@/lib/parent-data";
import { usePolling } from "@/lib/polling";

export function ChildGate({ children }: { children: (child: Child) => ReactNode }) {
  const { child, family, familyError, refresh } = useParentData();
  const gate = familyGate(child, family, familyError);
  switch (gate.kind) {
    case "child":
      // key: 見ている子どもが変わったら中身を作り直す（前の子どもの実績を、次の取り直しまで出し続けないため）
      return <Fragment key={gate.child.id}>{children(gate.child)}</Fragment>;
    case "unknown":
      return (
        <StateView
          state="unknown"
          message="つながりの状態を確かめられません"
          hint={gate.error.hint}
          onRetry={() => void refresh()}
        />
      );
    case "loading":
      return <StateView state="loading" />;
    case "unlinked":
      return (
        <StateView
          state="empty"
          message="まだ子どもとつながっていません"
          hint="子どものスマホに出したQRコードを読み取ると、使用状況を見られます"
          action={{ label: scanQrAction.label, onPress: () => router.navigate(scanQrAction.href) }}
        />
      );
  }
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

// D-113: 子どもの端末の許可の状態（親01 の注意の帯 DeviceAlertBanner に渡す）。null = まだ一度も届いていない・まだ読めていない
// （どちらも帯を出さない）。読めなかったときは前の値のまま（帯を消したり出し直したりしない。古いサーバでまだ API がないときも何も出さない）
// checkedAt = 最後にサーバから読めた時刻。「30分以上連絡が取れていません」は、今ではなくこの時刻と lastSeenAt を比べる
// （保護者のスマホが通信できないだけのときに、子どものスマホと連絡が取れないと言わないため）
export function useDeviceStatus(childId: string): { status: ChildDeviceStatus | null; checkedAt: Date | null } {
  const [read, setRead] = useState<{ status: ChildDeviceStatus | null; checkedAt: Date | null }>({
    status: null,
    checkedAt: null,
  });
  const load = useCallback(async () => {
    try {
      const { status } = await call("deviceStatusGet", { childId });
      setRead({ status, checkedAt: new Date() });
    } catch {
      // 黙って前の値のまま
    }
  }, [childId]);
  usePolling(load);
  return read;
}
