// 子どもの端末のデータを、子ども用の画面（src/app/child/）全体で共有する Context。child/_layout.tsx が ChildDataProvider で包む。
// 画面が出ている間は 30 秒ごと・画面を開いたとき・アプリが前面に戻ったときに、次を行う（どれかが失敗しても、ほかは続ける。MVP_SPEC 4.3）:
//   C7: 設定の組を取りに行く（config-cache.ts。今使っている版を送るので、親の画面に「反映済み」が出る。Q6）
//   C2: 今日と昨日のアプリ別の使用時間を取る（native.ts）
//   C3: 今日の使用済みの割合・到達状態を計算する（usage-calc.ts）
//   C8: 前に送った中身から変わっていれば、今日と昨日の2日分を送信待ちに入れて送る（usage-outbox.ts。Q8・Q9）
//   Q15: ホーム画面に出るアプリの一覧を、起動して最初の回と1日1回だけ確かめ、前に送った中身から変わっていれば送る
//        （child-apps-sync.ts。親16 の候補。待たずに裏で行い、失敗しても画面は止めない）
//   C4: 判定に使う値を Kotlin に渡し（native.saveRestriction）、監視を始める（native.startEngine。Kotlin がなければ何もしない）
//   権限: 使用状況へのアクセス・重ねて表示・通知・電池の最適化の状態を読み直す（設定画面で許可して戻ってきたときに出し分けを変える）
// 監視（Kotlin の Foreground Service）を始めるきっかけ: この Provider が出たとき（＝子どもとしてログインした後）と、設定を取れたとき。
//   監視は Slope の画面が閉じても続き、上限に届いたら Kotlin が案内を前に出す（modules/kit-native/.../engine/MonitorService.kt）。
//   止めるのはログアウトのとき（session.tsx の signOut）。
// 画面では: const { config, usage, calc, test, blank, permissions, refresh } = useChildData();
import { addDays, todayString } from "@contracts/dates";
import type { NativePermissionStatus, NativeUsageResult } from "@contracts/native";
import type { UsageDayReport } from "@contracts/schemas";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { needsIdentityCheck } from "./api";
import { childAppsSync } from "./child-apps-sync";
import { type ConfigState, configCache } from "./config-cache";
import { native } from "./native";
import { usePolling } from "./polling";
import { keepIfSame } from "./same";
import { useSession } from "./session";
import {
  type CalcInput,
  calcUsage,
  currentBlankPeriod,
  ESSENTIAL_PACKAGES,
  LEARNING_PACKAGES,
  limitForDate,
  nextTest,
  toNativeRestriction,
  toUsageDayReport,
  type UsageCalc,
} from "./usage-calc";
import { usageOutbox } from "./usage-outbox";

// C4 で誘導する学習用アプリ（子11 の「お勧めアプリ」と同じ1つの一覧。中身は usage-calc.ts の TODO(未決)）。
// 画面はここから使う（React Native を読み込まない計算の場所に置いてあるので、テストからも使える）
export { LEARNING_PACKAGES };

type ChildData = {
  childId: string;
  today: string; // YYYY-MM-DD（日本時間）
  config: ConfigState | null; // null = まだ読み込み中
  usage: NativeUsageResult | null; // 今日の C2 の結果（null = まだ読み込み中）
  calc: UsageCalc | null; // 今日の C3 の結果（null = まだ読み込み中）
  test: ReturnType<typeof nextTest>; // 次のテスト（なければ null）
  blank: ReturnType<typeof currentBlankPeriod>; // 今日が空白期間ならその期間（制限なし。Q7）
  permissions: NativePermissionStatus | null; // 権限の状態（null = まだ読んでいない）
  refresh: () => Promise<void>; // 今すぐ取り直す（日程を保存した後など）
};

const ChildDataContext = createContext<ChildData | null>(null);

export function ChildDataProvider({ childId, children }: { childId: string; children: ReactNode }) {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [usage, setUsage] = useState<NativeUsageResult | null>(null);
  const [today, setToday] = useState(() => todayString());
  const [permissions, setPermissions] = useState<NativePermissionStatus | null>(null);
  const lastSent = useRef<string | null>(null); // 前に送信待ちへ入れた中身（変化がなければ送らない。Q9）
  const { refresh: recheckSession } = useSession();

  // 起動直後は端末に保存してある設定をすぐ出す（通信を待たない）
  useEffect(() => {
    void configCache.load(childId).then((s) => setConfig((cur) => cur ?? s));
  }, [childId]);

  // C4: 子どもとしてログインしたら監視を始める（判定の値がまだなければ、Kotlin は使用量を測るだけで案内は出さない）
  useEffect(() => {
    native.startEngine();
  }, []);

  const refresh = useCallback(async () => {
    const date = todayString();
    const yesterday = addDays(date, -1);
    setToday(date);
    // 設定の組・権限・使用時間は、中身が変わっていなければ前の値のまま（30 秒ごとに子どもの全部の画面を描き直さない）
    const perms = native.getPermissions();
    setPermissions((prev) => keepIfSame(prev, perms));
    const [cfg, use, useYesterday] = await Promise.all([
      configCache.refresh(childId),
      native.getDailyUsage(date),
      native.getDailyUsage(yesterday),
    ]);
    setConfig((prev) => keepIfSame(prev, cfg));
    setUsage((prev) => keepIfSame(prev, use));
    // 自分の設定なのに 403 → サーバ上の自分の id・役割が変わった。確かめ直す（id が変われば child/_layout.tsx が新しい id で作り直し、
    // 役割がなくなっていれば入口へ戻る。needsIdentityCheck）
    if (cfg.status !== "fresh" && needsIdentityCheck(cfg.error)) void recheckSession();
    // Q15: アプリの一覧（設定を取った後に呼ぶ。DB が作り直されたかを、取り直した epoch で見られるように）。
    // 待たない（一覧を取る・送るのに時間がかかっても、画面の更新と C8 の送信を遅らせない）。時刻が来ていなければ何もしない
    void childAppsSync.run(childId, native.getLauncherApps);
    const snapshot = cfg.status === "unavailable" ? null : cfg.snapshot;
    const excluded = snapshot?.excludedApps.map((a) => a.packageName) ?? [];

    // C4: Kotlin に判定の値を渡す（設定が分からないときは渡さない = 前の値で判定を続ける）。
    // 先の日の上限も渡す（Slope を開かない日が続いても、Kotlin が日付の変わり目から判定できるように。toNativeRestriction）。
    // 監視が止まっていたら（OS に止められた・権限を許可した直後など）始め直す。動いていれば読み直すだけ
    if (snapshot) {
      native.saveRestriction(
        toNativeRestriction(snapshot, date, {
          essentialPackages: ESSENTIAL_PACKAGES,
          learningPackages: LEARNING_PACKAGES,
        }),
      );
      native.startEngine();
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
  }, [childId, recheckSession]);

  usePolling(refresh);

  // 割合・次のテスト・空白期間は、設定・使用時間・日付が変わったときだけ作り直す
  // （権限の状態だけが変わったときに calc が新しくなり、calc を依存に入れた画面の effect がやり直されないように）
  const derived = useMemo(() => {
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
      calc: input ? calcUsage(input) : null,
      test: nextTest(snapshot, today),
      blank: currentBlankPeriod(snapshot, today),
    };
  }, [today, config, usage]);

  const value = useMemo<ChildData>(
    () => ({ childId, today, config, usage, ...derived, permissions, refresh }),
    [childId, today, config, usage, derived, permissions, refresh],
  );

  return <ChildDataContext.Provider value={value}>{children}</ChildDataContext.Provider>;
}

export function useChildData(): ChildData {
  const v = useContext(ChildDataContext);
  if (!v) throw new Error("ChildDataProvider の外で useChildData が呼ばれました（子ども用の画面の中で使ってください）");
  return v;
}
