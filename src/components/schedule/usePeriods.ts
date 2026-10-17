// 日程（テスト期間・空白期間）の一覧を、画面が出ている間（開いたとき・30秒ごと・アプリが前面に戻ったとき）に取り直す。
// 一覧と一緒に「今の版」（保存のときの expectedVersion）も取る。取れなければ、前に取れた一覧か C7 の設定の組（fallback）を
// 「古い」として出す（logic.ts の periodsOnError）。どちらもなければ取得不可（0件とは出さない）。
import { useCallback, useRef, useState } from "react";
import { errorOf } from "@/lib/api";
import { usePolling } from "@/lib/polling";
import { fetchPeriods } from "./actions";
import { type PeriodKind, type PeriodSource, type PeriodsState, periodsOnError } from "./logic";

// 一覧を取り続ける。childId が null（子どもがまだ決まっていない）の間は何もしない。
// 見る子どもが変わるときは、呼ぶ側が key を変えて作り直す（前の子どもの一覧を出さないため）
export function usePeriods(kind: PeriodKind, childId: string | null, fallback: PeriodSource | null) {
  const [state, setState] = useState<PeriodsState>({ status: "loading" });
  // fallback（C7 の組）は 30 秒ごとに作り直されるので、取り直しのたびに最新を見るよう ref に置く
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const reload = useCallback(async (): Promise<PeriodSource | null> => {
    if (!childId) return null;
    try {
      const data = await fetchPeriods(kind, childId);
      setState({ status: "fresh", data });
      return data;
    } catch (e) {
      const error = errorOf(e);
      if (error) setState((prev) => periodsOnError(prev, fallbackRef.current, error));
      return null;
    }
  }, [kind, childId]);

  usePolling(reload, { enabled: childId != null });
  return { state, reload };
}
