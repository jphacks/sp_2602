// 子どもの端末のデータを、子ども用の画面（src/app/child/）全体で共有する Context。child/_layout.tsx が ChildDataProvider で包む。
// 画面が出ている間は 30 秒ごと・画面を開いたとき・アプリが前面に戻ったときに、次を行う（どれかが失敗しても、ほかは続ける。MVP_SPEC 4.3）:
//   C7: 設定の組を取りに行く（config-cache.ts。今使っている版を送るので、親の画面に「反映済み」が出る。Q6）
//   C2: 今日と昨日のアプリ別の使用時間を取る（native.ts）
//   C3: 今日の使用済みの割合・到達状態を計算する（usage-calc.ts）
//   C8: 前に送った中身から変わっていれば、今日と昨日の2日分を送信待ちに入れて送る（usage-outbox.ts。Q8・Q9）
//   C4: 判定に使う値を Kotlin に渡す（native.saveRestriction。Kotlin がなければ何もしない）
// 画面では: const { config, usage, calc, test, blank, refresh } = useChildData();
import { addDays, todayString } from "@contracts/dates";
import type { NativeUsageResult } from "@contracts/native";
import type { UsageDayReport } from "@contracts/schemas";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type ConfigState, configCache } from "./config-cache";
import { native } from "./native";
import { usePolling } from "./polling";
import {
  type CalcInput,
  calcUsage,
  currentBlankPeriod,
  ESSENTIAL_PACKAGES,
  limitForDate,
  nextTest,
  toUsageDayReport,
  type UsageCalc,
} from "./usage-calc";
import { usageOutbox } from "./usage-outbox";

// TODO(未決): C4 で誘導する学習用アプリ（C4 の実機検証で決める）
const LEARNING_PACKAGES: string[] = [];

type ChildData = {
  childId: string;
  today: string; // YYYY-MM-DD（日本時間）
  config: ConfigState | null; // null = まだ読み込み中
  usage: NativeUsageResult | null; // 今日の C2 の結果（null = まだ読み込み中）
  calc: UsageCalc | null; // 今日の C3 の結果（null = まだ読み込み中）
  test: ReturnType<typeof nextTest>; // 次のテスト（なければ null）
  blank: ReturnType<typeof currentBlankPeriod>; // 今日が空白期間ならその期間（制限なし。Q7）
  refresh: () => Promise<void>; // 今すぐ取り直す（日程を保存した後など）
};

const ChildDataContext = createContext<ChildData | null>(null);

export function ChildDataProvider({ childId, children }: { childId: string; children: ReactNode }) {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [usage, setUsage] = useState<NativeUsageResult | null>(null);
  const [today, setToday] = useState(() => todayString());
  const lastSent = useRef<string | null>(null); // 前に送信待ちへ入れた中身（変化がなければ送らない。Q9）

  // 起動直後は端末に保存してある設定をすぐ出す（通信を待たない）
  useEffect(() => {
    void configCache.load(childId).then((s) => setConfig((cur) => cur ?? s));
  }, [childId]);

  const refresh = useCallback(async () => {
    const date = todayString();
    const yesterday = addDays(date, -1);
    setToday(date);
    const [cfg, use, useYesterday] = await Promise.all([
      configCache.refresh(childId),
      native.getDailyUsage(date),
      native.getDailyUsage(yesterday),
    ]);
    setConfig(cfg);
    setUsage(use);
    const snapshot = cfg.status === "unavailable" ? null : cfg.snapshot;
    const excluded = snapshot?.excludedApps.map((a) => a.packageName) ?? [];

    // C4: Kotlin に判定の値を渡す（設定が分からないときは渡さない = 前の値で判定を続ける）
    if (snapshot) {
      const limit = limitForDate(snapshot, date);
      native.saveRestriction({
        date,
        limit:
          limit.kind === "set"
            ? { kind: "limited", limitMinutes: limit.minutes }
            : limit.kind === "unlimited"
              ? { kind: "unlimited" }
              : { kind: "unset" },
        excludedPackages: excluded,
        essentialPackages: [...ESSENTIAL_PACKAGES],
        learningPackages: LEARNING_PACKAGES,
        configVersion: snapshot.configVersion,
      });
    }

    // C8: 取れた日（今日・昨日）の記録を作り、前に送った中身から変わっていれば送信待ちに入れる。そのあと送れる分を送る
    // TODO(未決): 対象外アプリの設定がまだ取れていない（snapshot が null）ときは、すべて対象として送っている
    const days: UsageDayReport[] = [use, useYesterday].flatMap((u) =>
      u.status === "ok" ? [toUsageDayReport(u, excluded)] : [],
    );
    // 比べるときは測った時刻を除く（時刻だけ違って中身が同じなら送らない）
    const key = JSON.stringify(days.map((d) => ({ ...d, measuredAt: "" })));
    if (days.length > 0 && key !== lastSent.current) {
      const item = await usageOutbox.enqueue(childId, days).catch(() => null);
      if (item) lastSent.current = key;
    }
    await usageOutbox.flush().catch(() => undefined);
  }, [childId]);

  usePolling(refresh);

  const value = useMemo<ChildData>(() => {
    const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
    const input: CalcInput | null =
      usage == null || config == null
        ? null
        : {
            usage,
            limit: limitForDate(snapshot, today),
            excludedPackages: snapshot?.excludedApps.map((a) => a.packageName) ?? [],
          };
    return {
      childId,
      today,
      config,
      usage,
      calc: input ? calcUsage(input) : null,
      test: nextTest(snapshot, today),
      blank: currentBlankPeriod(snapshot, today),
      refresh,
    };
  }, [childId, today, config, usage, refresh]);

  return <ChildDataContext.Provider value={value}>{children}</ChildDataContext.Provider>;
}

export function useChildData(): ChildData {
  const v = useContext(ChildDataContext);
  if (!v) throw new Error("ChildDataProvider の外で useChildData が呼ばれました（子ども用の画面の中で使ってください）");
  return v;
}
