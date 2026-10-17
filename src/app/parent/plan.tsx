// 親02 計画を作る（Figma 108:7371）。計画の開始日・開始上限 S・最終目標 G・通常上限を決める（Q14・Q7）。
// データ: 今の計画と版は call("planGet")（30 秒ごとに取り直し、子どもの端末への反映済み／反映待ち（Q6）を更新）、
//         保存は call("planSave")（サーバが保存と C10 の再計算を1回で済ませてから返す。Q5）。
//         上限の下がり方のグラフは useParentData().config の日別上限（サーバの C10 の結果）。クライアントで C10 を計算し直さない。
// 行き先: 「空白期間（夏休みなど）」→ /parent/blank-periods（Q7。設定の項目は Figma どおり4つにしたいので、上限に関わるこの画面に置いた）。
// 成功は、保存の応答を受け取り、設定の組を取り直して新しい日別上限がそろってから出す（操作しただけで成功と出さない）。
import { todayString } from "@contracts/dates";
import type { ApiError } from "@contracts/errors";
import type { ConfigSnapshot, PlanView } from "@contracts/schemas";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  DateField,
  Dialog,
  ErrorBanner,
  ListItem,
  Screen,
  StateView,
} from "@/components";
import { planTrendBars } from "@/components/parent/charts";
import { DurationField } from "@/components/parent/DurationField";
import { ChildGate } from "@/components/parent/data";
import { md } from "@/components/parent/format";
import {
  type PlanField,
  type PlanForm,
  type PlanFormErrors,
  planAlreadyStarted,
  planFormFromView,
  reflectState,
  saveConfirmation,
  syncPlanInput,
  validatePlanForm,
} from "@/components/parent/plan-form";
import { WeekBars } from "@/components/parent/WeekBars";
import { call, errorOf } from "@/lib/api";
import { useParentData } from "@/lib/parent-data";
import { usePolling } from "@/lib/polling";

export default function ParentPlan() {
  const { child } = useParentData();
  // key: 子どもが変わったら、前の子どもの入力・版を持ち越さない
  if (child) return <PlanBody key={child.id} childId={child.id} />;
  // 見ている子どもが決まるまで（読み込み中・取得不可・まだつながっていない）
  return (
    <Screen title="計画を作る" bottomInset={false}>
      <ChildGate>{() => null}</ChildGate>
    </Screen>
  );
}

function PlanBody({ childId }: { childId: string }) {
  const today = todayString();
  const { config, refresh } = useParentData();
  const [view, setView] = useState<PlanView | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [form, setForm] = useState<PlanForm | null>(null);
  // 保存するときの expectedVersion。入力を始めたときの版（ほかの端末が先に変えていたら conflict で気づける）
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [errors, setErrors] = useState<PlanFormErrors>({});
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  // 入力欄を触り始めたか。触る前は取り直しのたびにサーバの値と版に合わせる（plan-form.ts の syncPlanInput）
  const edited = useRef(false);
  // 取り直しの関数から、今の入力欄と版を読むため（関数を作り直さずに済むように）
  const latest = useRef({ form, baseVersion });
  useEffect(() => {
    latest.current = { form, baseVersion };
  }, [form, baseVersion]);

  const load = useCallback(async () => {
    try {
      const v = await call("planGet", { childId });
      setView(v);
      setLoadError(null);
      // 触り始めた入力は上書きしない（30 秒ごとの取り直しで打ちかけが消えないように）。触る前はサーバの今の値と版に合わせる
      const next = syncPlanInput(latest.current, v, today, edited.current);
      setForm(next.form);
      setBaseVersion(next.baseVersion);
    } catch (e) {
      const error = errorOf(e);
      if (error) setLoadError(error);
    }
  }, [childId, today]);
  usePolling(load);

  const update = <K extends PlanField>(field: K, value: PlanForm[K]) => {
    edited.current = true;
    setForm((f) => (f ? { ...f, [field]: value } : f));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setSaveError(null);
  };

  const save = async () => {
    if (!form || baseVersion == null) return;
    const checked = validatePlanForm(form, today);
    if (!checked.ok) {
      setErrors(checked.errors);
      setSaveError({ code: "bad_request", message: "入力を見直してください", hint: "赤い欄を直してください" });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await call("planSave", { childId, expectedVersion: baseVersion, ...checked.value });
      // サーバでは保存と C10 の再計算が済んでいる（Q5）。画面の設定の組（日別上限）を取り直してから成功を出す
      await refresh();
      const v = await call("planGet", { childId }).catch(() => null);
      if (v) setView(v);
      const next: PlanView = v ?? {
        childId,
        plan: res.plan,
        usualLimitMinutes: res.usualLimitMinutes,
        configVersion: res.configVersion,
        childAppliedVersion: view?.childAppliedVersion ?? null,
      };
      setForm(planFormFromView(next, today));
      setBaseVersion(v?.configVersion ?? res.configVersion);
      edited.current = false; // 保存できたので、また取り直しに合わせる
      setSavedVersion(res.configVersion);
    } catch (e) {
      const error = errorOf(e);
      if (!error) return;
      if (error.code === "conflict") {
        // ほかの端末（子どもがテストを足した等）が先に設定を変えた。入力は残したまま版だけ取り直し、もう一度押してもらう
        const v = await call("planGet", { childId }).catch(() => null);
        if (v) {
          setView(v);
          setBaseVersion(v.configVersion);
        }
        setSaveError({
          code: "conflict",
          message: "ほかの端末で設定が変わりました",
          hint: "入力はそのまま残しています。内容を確かめて、もう一度「計画を作る」を押してください",
        });
      } else setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const confirmation = savedVersion == null ? null : saveConfirmation(savedVersion, snapshot?.configVersion ?? null);
  const footer = form ? (
    <>
      <ErrorBanner error={saveError} />
      <Button label="計画を作る" icon="check_circle" onPress={() => void save()} loading={saving} />
    </>
  ) : undefined;

  return (
    <Screen title="計画を作る" bottomInset={false} footer={footer}>
      {!form ? (
        <StateView state={loadError ? "unknown" : "loading"} error={loadError} onRetry={() => void load()} />
      ) : (
        <>
          {loadError ? (
            // 開いた後の取り直しに失敗している（反映済み／反映待ちが古いかもしれない。入力はそのまま使える）
            <Banner
              tone="warning"
              icon="cloud_off"
              message="最新でない可能性があります"
              hint="通信できるようになると自動で更新します"
            />
          ) : null}
          <Banner icon="edit" message="計画をはじめる日と、1日の使用時間の上限を入れてください" />
          {view?.plan ? <ReflectChip view={view} /> : null}
          <DateField
            label="計画の開始日"
            value={form.startDate}
            onChange={(d) => update("startDate", d)}
            minimumDate={today}
            error={errors.startDate}
            disabled={saving}
          />
          {planAlreadyStarted(view, today) && view?.plan ? (
            <AppText variant="caption" tone="muted">
              今の計画は {md(view.plan.planStartDate)}{" "}
              から始まっています。作り直すと、新しい開始日から上限が下がり始めます。
            </AppText>
          ) : null}
          <DurationField
            label="開始上限（今の1日の使用時間）"
            value={form.start}
            onChange={(v) => update("start", v)}
            error={errors.start}
            editable={!saving}
          />
          <DurationField
            label="最終目標（めざす1日の使用時間）"
            value={form.goal}
            onChange={(v) => update("goal", v)}
            error={errors.goal}
            editable={!saving}
          />
          <DurationField
            label="通常上限（テストがない日の上限）"
            value={form.usual}
            onChange={(v) => update("usual", v)}
            error={errors.usual}
            editable={!saving}
            hint={
              view?.usualLimitMinutes == null
                ? "決めていないと、テストも計画もない日は「上限未設定」になります"
                : "空のままにすると、今の通常上限のままです"
            }
          />
          <AppText tone="muted">テストが近づくほど上限が少しずつ小さくなり、テストが終わると一度少し戻ります。</AppText>
          <ListItem
            icon="event"
            title="空白期間（夏休みなど）"
            subtitle="この期間は、上限なしで使えるようにします"
            onPress={() => router.push("/parent/blank-periods")}
          />
          <TrendCard snapshot={snapshot} today={today} />
        </>
      )}
      <Dialog
        visible={confirmation != null}
        icon="check_circle"
        iconTone="success"
        centered
        title="計画を作りました"
        body={
          confirmation === "confirmed"
            ? "上限を計算し直しました。下のグラフが新しい上限です。子どものスマホには、次につながったときに届きます。"
            : "保存して、上限を計算し直しました。新しい上限のグラフは、通信できると自動で表示されます。"
        }
        onClose={() => setSavedVersion(null)}
        // 完了のダイアログは Figma 子04 と同じ形（中央・枠付きの丸い「OK」）にそろえる
        actions={<Button variant="pill" label="OK" onPress={() => setSavedVersion(null)} />}
      />
    </Screen>
  );
}

// 保存されている計画が、子どもの端末に届いたか（Q6）
function ReflectChip({ view }: { view: PlanView }) {
  if (!view.plan) return null;
  const s = reflectState(view.childAppliedVersion, view.plan.version);
  return s === "applied" ? (
    <Chip tone="success" icon="check_circle" label="今の計画は子どものスマホに反映済み" />
  ) : (
    <Chip icon="sync" label="今の計画は子どものスマホへの反映待ち" />
  );
}

// 今の計画での上限の下がり方（サーバの日別上限を拾うだけ。保存すると作り直される）
function TrendCard(props: { snapshot: ConfigSnapshot | null; today: string }) {
  const { snapshot, today } = props;
  if (!snapshot)
    return (
      <Card>
        <AppText variant="label">今の計画での上限の下がり方（分）</AppText>
        <AppText tone="muted">上限の予定を読み込めていません。通信できると表示します。</AppText>
      </Card>
    );
  if (!snapshot.plan)
    return (
      <Card>
        <AppText variant="label">今の計画での上限の下がり方（分）</AppText>
        <AppText tone="muted">計画を作ると、テストに向けて上限がどう下がるかがここに出ます。</AppText>
      </Card>
    );
  return (
    <Card>
      <AppText variant="label">今の計画での上限の下がり方（分）</AppText>
      <WeekBars bars={planTrendBars(snapshot, today)} accessibilityLabel="今の計画での上限の下がり方" />
      <AppText variant="caption" tone="muted">
        保存されている計画から計算した上限です。入力を変えて「計画を作る」を押すと、計算し直します。
      </AppText>
    </Card>
  );
}
