// 紐づけ直後に保護者が1日の上限（通常上限）を決める画面（Q7。Figma にない。親02 の入力欄と同じ見た目。下部タブなし。Q12）。
// 親15「連携完了」の次に来る。あとから親02（計画）でも変えられる。
// データ: 子どもは flow の child（親15 で入れた子ども）。なければ call("familyGet") の1人目。
//   call("planGet") で今の版（expectedVersion）と、決めてあれば今の通常上限を取る。
//   「決める」→ call("usualLimitSave")。サーバの保存（C10 の作り直しまで）が確定してから成功にする（Q5）。
// 行き先: 保存できたら useSession().refresh() → 入口（/）→ 保護者のホーム（親01）。
//   「あとで決める」→ 入口へ（子どもの画面は「上限未設定」になる。0 分とも制限なしとも違う）。
//   親01 の帯から来たとき（URL の from=home）は、どちらもホームへ戻る（usual-limit-input.ts の usualLimitExit）。
import type { ApiError } from "@contracts/errors";
import type { PlanView } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, ErrorBanner, Screen, StateView, TextField } from "@/components";
import { formatHoursMinutes, parseUsualLimit, splitMinutes, usualLimitExit, usualLimitFromOf } from "@/components/pair";
import { call, errorOf, timeoutSignal } from "@/lib/api";
import { useFlow } from "@/lib/flow";
import { useSession } from "@/lib/session";

const REQUEST_TIMEOUT_MS = 15_000;

type Load = { kind: "loading" } | { kind: "error"; error: ApiError } | { kind: "ready"; plan: PlanView };

export default function PairUsualLimit() {
  const { refresh } = useSession();
  const from = usualLimitFromOf(useLocalSearchParams<{ from?: string }>().from);
  // 閉じるときの行き先（ホームから来たら戻る。紐づけの直後なら入口で振り分け直す。usual-limit-input.ts）
  const leave = () => (usualLimitExit(from) === "back" && router.canGoBack() ? router.back() : router.replace("/"));
  const { child, setChild } = useFlow();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  // 子どもを決めて、今の通常上限と版を取る
  const fetchPlan = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      let target = child;
      if (!target) {
        const family = await call("familyGet", undefined, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
        target = family.children[0] ?? null;
        if (target) setChild(target);
      }
      if (!target) {
        setLoad({
          kind: "error",
          error: {
            code: "not_found",
            message: "つながっている子どもが見つかりません",
            hint: "QRコードの読み取りからやり直してください",
          },
        });
        return;
      }
      const plan = await call("planGet", { childId: target.id }, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
      setLoad({ kind: "ready", plan });
      // 決めてあれば入力欄に入れておく（まだなら空。勝手な値を入れない）
      if (plan.usualLimitMinutes != null) {
        const s = splitMinutes(plan.usualLimitMinutes);
        setHours(s.hours);
        setMinutes(s.minutes);
      }
    } catch (e) {
      const error = errorOf(e);
      if (error) setLoad({ kind: "error", error });
    }
  }, [child, setChild]);

  // 開いたときに1回だけ取る（child が入った後に取り直さない）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 開いたときに1回だけ取る
  useEffect(() => {
    void fetchPlan();
  }, []);

  const parsed = parseUsualLimit(hours, minutes);

  const save = async () => {
    if (load.kind !== "ready") return;
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    setSaveError(null);
    setSaving(true);
    try {
      await call(
        "usualLimitSave",
        {
          childId: load.plan.childId,
          expectedVersion: load.plan.configVersion,
          usualLimitMinutes: parsed.minutes,
        },
        { signal: timeoutSignal(REQUEST_TIMEOUT_MS) },
      );
      await refresh();
      leave();
    } catch (e) {
      const error = errorOf(e);
      setSaving(false);
      if (!error) return;
      setSaveError(error);
      // 版がずれていた（ほかの端末が先に変えた）→ 今の版を取り直す。入力した値は残す
      if (error.code === "conflict") {
        try {
          const plan = await call("planGet", { childId: load.plan.childId });
          setLoad({ kind: "ready", plan });
        } catch {
          // 取り直せなくても、帯でエラーを出しているので、もう一度押してもらう
        }
      }
    }
  };

  const later = leave;

  if (load.kind !== "ready")
    return (
      <Screen
        title="1日の上限を決める"
        scroll={false}
        footer={<Button variant="outline" label="あとで決める" onPress={later} />}
      >
        <StateView
          state={load.kind === "loading" ? "loading" : "unknown"}
          error={load.kind === "error" ? load.error : null}
          onRetry={fetchPlan}
        />
      </Screen>
    );

  return (
    <Screen
      title="1日の上限を決める"
      footer={
        <>
          <Button label="決める" icon="check_circle" onPress={save} loading={saving} />
          <Button variant="outline" label="あとで決める" onPress={later} disabled={saving} />
        </>
      }
    >
      <Banner icon="edit" message="1日に使える時間の上限を入れてください" />
      <ErrorBanner error={saveError} />
      <AppText variant="label">通常上限（テストがない日の上限）</AppText>
      <View style={styles.row}>
        <View style={styles.cell}>
          <TextField
            label="時間"
            value={hours}
            onChangeText={(t) => {
              setHours(t);
              setInputError(null);
            }}
            keyboardType="number-pad"
            editable={!saving}
            maxLength={2}
            placeholder="3"
            trailingIcon="clock"
          />
        </View>
        <View style={styles.cell}>
          <TextField
            label="分"
            value={minutes}
            onChangeText={(t) => {
              setMinutes(t);
              setInputError(null);
            }}
            keyboardType="number-pad"
            editable={!saving}
            maxLength={2}
            placeholder="0"
          />
        </View>
      </View>
      {inputError ? (
        <AppText variant="caption" tone="danger">
          {inputError}
        </AppText>
      ) : parsed.ok ? (
        <AppText tone="primary">1日 {formatHoursMinutes(parsed.minutes)} まで</AppText>
      ) : null}
      <AppText variant="caption" tone="muted">
        テストが近づくと、計画にそって上限が少しずつ小さくなります。この上限は、あとから「計画」の画面でも変えられます。
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space[3] },
  cell: { flex: 1 },
});
