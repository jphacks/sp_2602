// 制限する Web サイトの管理（Figma にない画面。D-111）。親04 設定の「制限する Web サイト」の行から開く。下部タブは出たまま（「設定」が選択中）。
// 見た目は 親16 制限対象外アプリ（excluded-apps.tsx）にそろえた（同じ部品・同じ並び・同じ「反映済み／反映待ち」の出し方）。
// 決まり（ユーザーが決めた。docs/decisions.md D-111）:
//   - 止めるのは、その日の上限に達したあとだけ（上限なし・未設定・空白期間中は止めない）
//   - 子どもの端末のブラウザで登録したサイトを開くと、ブラウザを1つ前の画面に戻し、「時間は終わりです」（子11）を出す
//   - 登録の形は「youtube.com」（サイト全体）と「youtube.com/shorts」（そのパスから始まるページだけ）
// データ: call("blockedSitesGet")（保存済みの登録・最新の版・子どもの端末が使っている版。30 秒ごとに取り直して反映の状態を更新）、
//         保存は call("blockedSitesSave", { expectedVersion, sites: 全件 })。確定を待ってから「保存しました」。
// 入力は contracts/web-sites.ts の normalizeSitePattern でそろえてから下書きに入れる（https://・www.・大文字・末尾の / を外す。
//   ドメインらしくないものは、入れる前に入力欄の下に理由を出す）。並べ方・状態の決め方は src/components/parent/blocked-sites.ts。
// 行き先: 「←」→ 親04 設定。
import type { ApiError } from "@contracts/errors";
import type { BlockedSitesView } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Chip, ErrorBanner, Icon, Screen, StateView, TextField } from "@/components";
import {
  addSite,
  hasUnsavedSites,
  removeSite,
  restoreSite,
  type SiteRow,
  siteRows,
  sitesListStatus,
  syncSitesDraft,
} from "@/components/parent/blocked-sites";
import { ChildGate } from "@/components/parent/data";
import { call, errorOf } from "@/lib/api";
import { useParentData } from "@/lib/parent-data";
import { usePolling } from "@/lib/polling";
import { makeStyles, useColors } from "@/lib/theme";

const TITLE = "制限する Web サイト";

export default function ParentBlockedSites() {
  const { child } = useParentData();
  // key: 子どもが変わったら、前の子どもの下書き・版を持ち越さない
  if (child) return <BlockedSitesBody key={child.id} childId={child.id} />;
  return (
    <Screen title={TITLE} onBack={() => router.back()} bottomInset={false}>
      <ChildGate>{() => null}</ChildGate>
    </Screen>
  );
}

function BlockedSitesBody({ childId }: { childId: string }) {
  const styles = useStyles();
  const { refresh } = useParentData();
  const [view, setView] = useState<BlockedSitesView | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null); // 保存したい登録の全件（入れた順）
  // 保存するときの expectedVersion。下書きを読み込んだときの版（ほかの端末が先に変えていたら conflict で気づける）
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  // 取り直しの関数から、今の保存済みの一覧・下書き・版を読むため（関数を作り直さずに済むように）
  const latest = useRef({ saved: view?.sites ?? null, draft, baseVersion });
  useEffect(() => {
    latest.current = { saved: view?.sites ?? null, draft, baseVersion };
  }, [view, draft, baseVersion]);

  const load = useCallback(async () => {
    try {
      const v = await call("blockedSitesGet", { childId });
      // 触りかけの下書きは戻さない。保存していない変更がなければ、サーバの今の一覧と版に合わせる
      const next = syncSitesDraft(latest.current, v);
      setView(v);
      setLoadError(null);
      setDraft(next.draft);
      setBaseVersion(next.baseVersion);
    } catch (e) {
      const error = errorOf(e);
      if (error) setLoadError(error);
    }
  }, [childId]);
  usePolling(load);
  // 画面を離れたら「保存しました」の帯を消す（親16 と同じ。開き直したときに古い結果が出たままにならないように）
  useFocusEffect(useCallback(() => () => setSavedOk(false), []));

  const changed = () => {
    setSaveError(null);
    setSavedOk(false);
  };

  const add = () => {
    if (!draft) return;
    const r = addSite(draft, input);
    if (!r.ok) {
      setInputError(r.message);
      return;
    }
    setDraft(r.draft);
    setInput("");
    setInputError(null);
    changed();
  };

  const remove = (pattern: string) => {
    setDraft((d) => (d ? removeSite(d, pattern) : d));
    changed();
  };
  const restore = (pattern: string) => {
    setDraft((d) => (d ? restoreSite(d, pattern) : d));
    changed();
  };

  const save = async () => {
    if (!view || !draft || baseVersion == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await call("blockedSitesSave", { childId, expectedVersion: baseVersion, sites: draft });
      // 確定した結果で画面を作り直す（子どもの端末の版も取り直す。取り直せなければ保存の結果だけで作る）
      const v = await call("blockedSitesGet", { childId }).catch(() => null);
      setView(
        v ?? {
          ...view,
          sites: res.sites,
          sitesChangedVersion: res.sitesChangedVersion,
          configVersion: res.configVersion,
        },
      );
      setDraft((v ?? res).sites.map((s) => s.pattern));
      setBaseVersion(v?.configVersion ?? res.configVersion);
      setSavedOk(true);
      void refresh(); // 親04 の件数など、ほかの画面の設定の組も新しくする
    } catch (e) {
      const error = errorOf(e);
      if (!error) return;
      if (error.code === "conflict") {
        // ほかの端末が先に設定を変えた。下書きはそのまま残し、版だけ取り直してもう一度押してもらう
        const v = await call("blockedSitesGet", { childId }).catch(() => null);
        if (v) {
          setView(v);
          setBaseVersion(v.configVersion);
        }
        setSaveError({
          code: "conflict",
          message: "ほかの端末で設定が変わりました",
          hint: "入れたサイトはそのまま残しています。確かめて、もう一度「変更を保存する」を押してください",
        });
      } else setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  const ready = view && draft;
  const rows = ready ? siteRows({ saved: view.sites, draft, childAppliedVersion: view.childAppliedVersion }) : [];
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
        disabled={!hasUnsavedSites(view.sites, draft)}
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
          <Banner
            icon="edit"
            message="その日の時間が終わったあと、子どものスマホのブラウザでここに入れたサイトを開くと、前の画面に戻して「時間は終わりです」を出します。変更できるのは保護者だけです"
          />
          <TextField
            label="サイトのアドレス"
            value={input}
            onChangeText={(t) => {
              setInput(t);
              setInputError(null);
            }}
            placeholder="例: youtube.com/shorts"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={add}
            error={inputError}
          />
          <Button
            label="一覧に入れる"
            icon="add"
            variant="outline"
            onPress={add}
            disabled={saving || input.trim() === ""}
          />
          <AppText variant="caption" tone="muted">
            「youtube.com」と入れると、m.youtube.com
            などもふくめてサイト全体を止めます。「youtube.com/shorts」と入れると、ショート動画のページだけを止めます。
          </AppText>
          <View style={styles.listHead}>
            <AppText variant="label">登録したサイト</AppText>
            {/* 一覧の全体が子どもの端末に届いたか（取り直せていないときは古い値なので出さない） */}
            {!loadError && <ListStatus status={sitesListStatus(view)} />}
          </View>
          {rows.map((r) => (
            <SiteRowView
              key={r.pattern}
              row={r}
              onRemove={() => remove(r.pattern)}
              onRestore={() => restore(r.pattern)}
              disabled={saving}
            />
          ))}
          {rows.length === 0 && <AppText tone="muted">まだ登録していません</AppText>}
          <AppText variant="caption" tone="muted">
            止められるのは、子どものスマホの Chrome・Samsung Internet・Firefox・Edge
            で開いたときです（ほかのブラウザや、アプリの中で開いたページは止められません）。子どものスマホで「ユーザー補助」の許可が要ります（子どものホームに案内が出ます）。
          </AppText>
        </>
      )}
    </Screen>
  );
}

const statusText = {
  applied: "反映済み",
  pending: "反映待ち",
  unsaved: "まだ保存していません",
  removing: "外します（まだ保存していません）",
} as const;

function ListStatus({ status }: { status: "applied" | "pending" }) {
  return status === "applied" ? (
    <Chip tone="success" icon="check_circle" label="子どものスマホに反映済み" />
  ) : (
    <Chip tone="warning" icon="sync" label="子どものスマホに反映待ち" />
  );
}

function SiteRowView({
  row,
  onRemove,
  onRestore,
  disabled,
}: {
  row: SiteRow;
  onRemove: () => void;
  onRestore: () => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  const c = useColors();
  const removing = row.status === "removing";
  return (
    <View style={[styles.row, removing && styles.rowRemoving]}>
      <Icon name="language" color={removing ? c.muted : c.primary} />
      <View style={styles.middle}>
        <AppText variant="body" strong tone={removing ? "muted" : undefined}>
          {row.pattern}
        </AppText>
        <AppText variant="caption" tone="muted">
          {row.scope}
        </AppText>
        {row.status === "pending" ? (
          <View style={styles.chipRow}>
            <Chip label={statusText.pending} small />
          </View>
        ) : (
          <AppText variant="caption" tone={row.status === "applied" ? "muted" : "warning"}>
            {statusText[row.status]}
          </AppText>
        )}
      </View>
      {removing ? (
        <Button label="戻す" variant="pill" onPress={onRestore} disabled={disabled} />
      ) : (
        <Button label="外す" variant="pill" danger onPress={onRemove} disabled={disabled} />
      )}
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
    // 外しかけの行は地を消して、まだ残っている（保存すると消える）ことが分かるようにする
    rowRemoving: { backgroundColor: c.bg },
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
