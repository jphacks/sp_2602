// 親16 制限対象外アプリの管理（Figma 108:9446）。下部タブは出たまま（「設定」が選択中）。保存できるのは保護者だけ（C9。サーバも確かめる）。
// データ: call("excludedAppsGet")（保存済みの対象外アプリ・最新の版・子どもの端末が使っている版。30 秒ごとに取り直して反映の状態を更新）、
//         保存は call("excludedAppsSave", { expectedVersion, apps: 全件 })。確定を待ってから「保存しました」。
// 行き先: 「←」→ 親04 設定（Figma には戻るボタンがないが、タブの外の画面なので戻れるようにした）。
// 「反映済み／反映待ち」は子どもの端末が使っている版と、そのアプリが変わった版の比較（Q6。excluded.ts）。
//   どちらの版もサーバの応答（sinceVersion・removedApps・appsChangedVersion）にあるので、開き直しても正しく出る。
// TODO(保留): Q15 候補の一覧（子どもの端末のアプリ一覧）をどこから得るかは保留。今は MOCK の候補（mockExcludedAppCandidates）を並べる。
import type { ApiError } from "@contracts/errors";
import { mockExcludedAppCandidates } from "@contracts/fixtures";
import type { ExcludedAppsView } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Chip, ErrorBanner, Screen, StateView } from "@/components";
import { ChildGate } from "@/components/parent/data";
import {
  appsToSave,
  type ExcludedRow,
  excludedListStatus,
  excludedRows,
  hasUnsaved,
  removedVersions,
} from "@/components/parent/excluded";
import { AppInitial, Toggle } from "@/components/parent/parts";
import { call, errorOf } from "@/lib/api";
import { useParentData } from "@/lib/parent-data";
import { usePolling } from "@/lib/polling";
import { makeStyles } from "@/lib/theme";

const TITLE = "制限対象外アプリ";

export default function ParentExcludedApps() {
  const { child } = useParentData();
  // key: 子どもが変わったら、前の子どものスイッチ・版を持ち越さない
  if (child) return <ExcludedBody key={child.id} childId={child.id} />;
  // 見ている子どもが決まるまで（読み込み中・取得不可・まだつながっていない）
  return (
    <Screen title={TITLE} onBack={() => router.back()} bottomInset={false}>
      <ChildGate>{() => null}</ChildGate>
    </Screen>
  );
}

function ExcludedBody({ childId }: { childId: string }) {
  const styles = useStyles();
  const { refresh } = useParentData();
  const [view, setView] = useState<ExcludedAppsView | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null); // スイッチが ON のアプリ
  // 保存するときの expectedVersion。スイッチを読み込んだときの版（ほかの端末が先に変えていたら conflict で気づける）
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const load = useCallback(async () => {
    try {
      const v = await call("excludedAppsGet", { childId });
      setView(v);
      setLoadError(null);
      // スイッチの状態は最初の1回だけ取り込む（取り直しで、動かしかけのスイッチを戻さない）
      setDraft((d) => d ?? new Set(v.apps.map((a) => a.packageName)));
      setBaseVersion((b) => b ?? v.configVersion);
    } catch (e) {
      const error = errorOf(e);
      if (error) setLoadError(error);
    }
  }, [childId]);
  usePolling(load);

  const toggle = (packageName: string, on: boolean) => {
    setDraft((d) => {
      const next = new Set(d);
      if (on) next.add(packageName);
      else next.delete(packageName);
      return next;
    });
    setSaveError(null);
    setSavedOk(false);
  };

  const save = async () => {
    if (!view || !draft || baseVersion == null) return;
    const apps = appsToSave(mockExcludedAppCandidates, view.apps, draft);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await call("excludedAppsSave", { childId, expectedVersion: baseVersion, apps });
      // 確定した結果で画面を作り直す（外したアプリの版・一覧が変わった版・子どもの端末の版も取り直す）。
      // 取り直せなかったときは保存の結果だけで作る（外したアプリの版は分からないので、次の取り直しまで前の値のまま）
      const v = await call("excludedAppsGet", { childId }).catch(() => null);
      setView(v ?? { ...view, apps: res.apps, configVersion: res.configVersion });
      setDraft(new Set(res.apps.map((a) => a.packageName)));
      setBaseVersion(v?.configVersion ?? res.configVersion);
      setSavedOk(true);
      void refresh(); // 設定の件数など、ほかの画面の設定の組も新しくする
    } catch (e) {
      const error = errorOf(e);
      if (!error) return;
      if (error.code === "conflict") {
        // ほかの端末が先に設定を変えた。スイッチはそのまま残し、版だけ取り直してもう一度押してもらう
        const v = await call("excludedAppsGet", { childId }).catch(() => null);
        if (v) {
          setView(v);
          setBaseVersion(v.configVersion);
        }
        setSaveError({
          code: "conflict",
          message: "ほかの端末で設定が変わりました",
          hint: "スイッチはそのまま残しています。確かめて、もう一度「変更を保存する」を押してください",
        });
      } else setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  const ready = view && draft;
  const footer = ready ? (
    <>
      <ErrorBanner error={saveError} />
      {savedOk && (
        <Banner tone="success" message="保存しました" hint="子どものスマホには、次につながったときに届きます" />
      )}
      <Button
        label="変更を保存する"
        icon="check_circle"
        onPress={() => void save()}
        loading={saving}
        disabled={!hasUnsaved(view.apps, draft)}
      />
    </>
  ) : undefined;

  return (
    <Screen title={TITLE} onBack={() => router.back()} bottomInset={false} footer={footer}>
      {!ready ? (
        <StateView state={loadError ? "unknown" : "loading"} error={loadError} onRetry={() => void load()} />
      ) : (
        <>
          {loadError && (
            <Banner
              tone="warning"
              icon="cloud_off"
              message="最新でない可能性があります"
              hint="反映の状態は、通信できると自動で更新します"
            />
          )}
          <Banner icon="edit" message="選んだアプリは、使用時間にふくまれなくなります。変更できるのは保護者だけです" />
          <View style={styles.listHead}>
            <AppText variant="label">子どものアプリ</AppText>
            {/* 一覧の全体が子どもの端末に届いたか（取り直せていないときは古い値なので出さない） */}
            {!loadError && <ListStatus status={excludedListStatus(view)} />}
          </View>
          {excludedRows({
            candidates: mockExcludedAppCandidates,
            saved: view.apps,
            draft,
            childAppliedVersion: view.childAppliedVersion,
            removedAt: removedVersions(view.removedApps),
          }).map((r) => (
            <AppRow key={r.packageName} row={r} onToggle={(on) => toggle(r.packageName, on)} disabled={saving} />
          ))}
          <AppText variant="caption" tone="muted">
            電話・緊急通報などは、いつも制限されません（ここでは変えられません）。
          </AppText>
        </>
      )}
    </Screen>
  );
}

const statusText = { applied: "反映済み", pending: "反映待ち", unsaved: "まだ保存していません" } as const;

function ListStatus({ status }: { status: "applied" | "pending" }) {
  return status === "applied" ? (
    <Chip tone="success" icon="check_circle" label="子どものスマホに反映済み" />
  ) : (
    <Chip tone="warning" icon="sync" label="子どものスマホに反映待ち" />
  );
}

function AppRow({ row, onToggle, disabled }: { row: ExcludedRow; onToggle: (on: boolean) => void; disabled: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <AppInitial initial={row.initial} />
      <View style={styles.middle}>
        <AppText variant="body" strong>
          {row.label}
        </AppText>
        {row.status === "pending" ? (
          <View style={styles.chipRow}>
            <Chip label={statusText.pending} small />
          </View>
        ) : (
          <AppText variant="caption" tone={row.status === "unsaved" ? "warning" : "muted"}>
            {statusText[row.status]}
          </AppText>
        )}
      </View>
      <Toggle
        value={row.on}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityLabel={`${row.label}を制限の対象外にする（${statusText[row.status]}）`}
      />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    row: {
      minHeight: tokens.size.listItemTall,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[4],
      paddingHorizontal: tokens.space[4],
      paddingVertical: tokens.space[3],
      backgroundColor: c.surface,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.size.border,
      borderColor: c.line,
    },
    middle: { flex: 1, gap: tokens.space[1] },
    listHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: tokens.space[2],
    },
    chipRow: { flexDirection: "row" },
  }),
);
