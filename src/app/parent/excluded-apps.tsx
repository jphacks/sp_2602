// 親16 制限対象外アプリの管理（Figma 108:9446）。下部タブは出たまま（「設定」が選択中）。保存できるのは保護者だけ（C9。サーバも確かめる）。
// データ: call("excludedAppsGet")（保存済みの対象外アプリ・最新の版・子どもの端末が使っている版。30 秒ごとに取り直して反映の状態を更新）、
//         保存は call("excludedAppsSave", { expectedVersion, apps: 全件 })。確定を待ってから「保存しました」。
// 行き先: 「←」→ 親04 設定（Figma には戻るボタンがないが、タブの外の画面なので戻れるようにした）。
// 「反映済み／反映待ち」は子どもの端末が使っている版と、そのアプリが変わった版の比較（Q6。excluded.ts）。
//   どちらの版もサーバの応答（sinceVersion・removedApps・appsChangedVersion）にあるので、開き直しても正しく出る。
// 候補（Q15・D-110）: call("childAppsGet")（子どもの端末から届いたアプリ一覧）を表示名の順に並べ、保存済みの対象外アプリで一覧にない
//   もの（消されたアプリなど）を後ろに足す（excluded.ts の candidateApps）。一覧は開いたときに1回読む（まだ届いていない・読めない
//   ときは、届くまで 30 秒ごとの取り直しのたびに読み直す）。届いていなければ見本で埋めず「まだ届いていません」と出す。
//   アプリが多いので名前で絞り込める（filterRows）。アイコンは子どもの端末から届いた本物（useAppIcons。なければ頭文字）。
import type { ApiError } from "@contracts/errors";
import type { ChildAppsView, ExcludedAppsView } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  AppText,
  Banner,
  Button,
  Chip,
  ErrorBanner,
  PopIn,
  Reveal,
  RevealGroup,
  Screen,
  StateView,
  TextField,
} from "@/components";
import { ChildGate } from "@/components/parent/data";
import {
  appsToSave,
  type ExcludedRow,
  excludedListStatus,
  excludedRows,
  filterRows,
  hasUnsaved,
  removedVersions,
  syncExcludedDraft,
} from "@/components/parent/excluded";
import { AppIcon, Toggle } from "@/components/parent/parts";
import { call, errorOf } from "@/lib/api";
import { appIconCache, useAppIcons } from "@/lib/app-icons";
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
  const [draft, setDraft] = useState<ReadonlySet<string> | null>(null); // スイッチが ON のアプリ
  // 保存するときの expectedVersion。スイッチを読み込んだときの版（ほかの端末が先に変えていたら conflict で気づける）
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  // 子どもの端末のアプリ一覧（候補）。null = まだ読めていない
  const [childApps, setChildApps] = useState<ChildAppsView | null>(null);
  const [childAppsError, setChildAppsError] = useState<ApiError | null>(null);
  const [query, setQuery] = useState(""); // 名前での絞り込み
  // 一覧が届いたら、30 秒ごとの取り直しでは読み直さない（数百件の一覧を何度も運ばないため。画面に戻ったときは読み直す）
  const childAppsDone = useRef(false);
  // 取り直しの関数から、今の保存済みの一覧・スイッチ・版を読むため（関数を作り直さずに済むように）
  const latest = useRef({ saved: view?.apps ?? null, draft, baseVersion });
  useEffect(() => {
    latest.current = { saved: view?.apps ?? null, draft, baseVersion };
  }, [view, draft, baseVersion]);

  const loadChildApps = useCallback(async () => {
    if (childAppsDone.current) return;
    try {
      const v = await call("childAppsGet", { childId });
      appIconCache.rememberList(childId, v.apps); // アイコンのハッシュを覚える（アイコンを読むときに一覧を読み直さない）
      setChildApps(v);
      setChildAppsError(null);
      childAppsDone.current = v.receivedAt != null;
    } catch (e) {
      const error = errorOf(e);
      if (error) setChildAppsError(error);
    }
  }, [childId]);

  const load = useCallback(async () => {
    void loadChildApps(); // 候補の一覧は別に読む（失敗しても対象外アプリの一覧は出す）
    try {
      const v = await call("excludedAppsGet", { childId });
      // 動かしかけのスイッチは戻さない（取り直しで消えないように）。保存していない変更がなければ、サーバの今の一覧と版に合わせる
      const next = syncExcludedDraft(latest.current, v);
      setView(v);
      setLoadError(null);
      setDraft(next.draft);
      setBaseVersion(next.baseVersion);
    } catch (e) {
      const error = errorOf(e);
      if (error) setLoadError(error);
    }
  }, [childId, loadChildApps]);
  usePolling(load);
  // 候補: 一覧が届いていれば一覧＋保存済み、届いていなければ保存済みだけ
  const listed = childApps?.receivedAt ? childApps.apps : null;
  const rows =
    view && draft
      ? excludedRows({
          childApps: listed,
          saved: view.apps,
          draft,
          childAppliedVersion: view.childAppliedVersion,
          removedAt: removedVersions(view.removedApps),
        })
      : [];
  const shown = filterRows(rows, query);
  const icons = useAppIcons(
    childId,
    rows.map((r) => r.packageName),
  );
  // 画面を離れたら「保存しました」の帯を消す（なぜ: この画面はタブの中にあり、離れても消えずに残るので、
  //   あとで開き直したときに、今の操作の結果のように古い「保存しました」が出たままになっていた）。
  // 候補の一覧も、次に画面に戻ったときに1回読み直す（離れている間に子どもがアプリを入れた・消したかもしれないため）
  useFocusEffect(
    useCallback(
      () => () => {
        setSavedOk(false);
        childAppsDone.current = false;
      },
      [],
    ),
  );

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
    const apps = appsToSave(listed, view.apps, draft);
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
    // 「保存しました」は、保存が確定したときに高さを広げて入れる（ボタンがガタッと上がらない）
    <RevealGroup>
      <ErrorBanner error={saveError} />
      <Reveal show={savedOk}>
        <Banner tone="success" message="保存しました" hint="子どものスマホには、次につながったときに届きます" />
      </Reveal>
      <Button
        label="変更を保存する"
        icon="check_circle"
        onPress={() => void save()}
        loading={saving}
        disabled={!hasUnsaved(view.apps, draft)}
      />
    </RevealGroup>
  ) : undefined;

  return (
    <Screen title={TITLE} onBack={() => router.back()} bottomInset={false} footer={footer}>
      {!ready ? (
        <StateView state={loadError ? "unknown" : "loading"} error={loadError} onRetry={() => void load()} />
      ) : (
        // 読み込めたら上から順にふわっと出す（ホームと同じ）。後から出る帯は高さを広げて入れる
        <RevealGroup>
          <Reveal index={0} show={loadError != null}>
            <Banner
              tone="warning"
              icon="cloud_off"
              message="最新でない可能性があります"
              hint="反映の状態は、通信できると自動で更新します"
            />
          </Reveal>
          <Reveal index={1}>
            {/* 見ているのは保護者なので「変更できるのは保護者だけです」は言わない */}
            <Banner icon="edit" message="選んだアプリは、使用時間にふくまれなくなります" />
          </Reveal>
          <Reveal index={2}>
            <View style={styles.listHead}>
              <AppText variant="label">子どものアプリ</AppText>
              {/* 一覧の全体が子どもの端末に届いたか（取り直せていないときは古い値なので出さない） */}
              {!loadError && <ListStatus status={excludedListStatus(view)} />}
            </View>
          </Reveal>
          {/* 子どもの端末の一覧が届いていない・読めないときの帯は、後から分かったら高さを広げて入れる */}
          <Reveal index={3} show={childApps != null && !childApps.receivedAt}>
            <Banner
              icon="info"
              message="子どものスマホからアプリの一覧がまだ届いていません"
              hint="子どものスマホで Slope を開くと届きます。届くまでは、対象外にしたアプリだけを出しています"
            />
          </Reveal>
          <Reveal index={3} show={!childApps && childAppsError != null}>
            <Banner
              tone="warning"
              icon="cloud_off"
              message="子どものスマホのアプリの一覧を読み込めませんでした"
              hint="通信できると自動で読み込み直します。それまでは、対象外にしたアプリだけを出しています"
            />
          </Reveal>
          <Reveal index={3} show={listed != null && rows.length > 0}>
            <TextField
              label="アプリの名前でしぼりこむ"
              value={query}
              onChangeText={setQuery}
              placeholder="例: ゲーム"
              autoCorrect={false}
              returnKeyType="search"
            />
          </Reveal>
          {/* 一覧はひとまとまりで出す（アプリが数百あり、絞り込むたびに1行ずつ動かすと重いため） */}
          <Reveal index={4}>
            <View style={styles.list}>
              {shown.map((r) => (
                <AppRow
                  key={r.packageName}
                  row={r}
                  icon={icons.get(r.packageName)}
                  onToggle={(on) => toggle(r.packageName, on)}
                  disabled={saving}
                />
              ))}
              {rows.length > 0 && shown.length === 0 && (
                <AppText tone="muted">「{query.trim()}」に合うアプリはありません</AppText>
              )}
              {listed && rows.length === 0 && (
                <AppText tone="muted">子どものスマホにアプリが見つかりませんでした</AppText>
              )}
            </View>
          </Reveal>
          <Reveal index={5}>
            <AppText variant="caption" tone="muted">
              電話・緊急通報などは、いつも制限されません（ここでは変えられません）。
            </AppText>
          </Reveal>
        </RevealGroup>
      )}
    </Screen>
  );
}

const statusText = { applied: "反映済み", pending: "反映待ち", unsaved: "まだ保存していません" } as const;

// 反映待ち → 反映済み に変わったら、札を小さく弾ませて知らせる
function ListStatus({ status }: { status: "applied" | "pending" }) {
  return (
    <PopIn replayKey={status}>
      {status === "applied" ? (
        <Chip tone="success" icon="check_circle" label="子どものスマホに反映済み" />
      ) : (
        <Chip tone="warning" icon="sync" label="子どものスマホへの反映待ち" />
      )}
    </PopIn>
  );
}

function AppRow({
  row,
  icon,
  onToggle,
  disabled,
}: {
  row: ExcludedRow;
  icon: string | undefined;
  onToggle: (on: boolean) => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <AppIcon initial={row.initial} uri={icon} />
      <View style={styles.middle}>
        <AppText variant="body" strong>
          {row.label}
        </AppText>
        {/* 反映済みの行は何も出さない（見出しの札が「反映済み」と言っている）。読み上げには残す */}
        {/* 対象外にしたが、子どもの端末の一覧にない（消されたかもしれない）。OFF にできるように残して出す */}
        {row.missing && (
          <AppText variant="caption" tone="muted">
            子どものスマホに見つかりません（消されたかもしれません）
          </AppText>
        )}
        {row.status === "pending" ? (
          <View style={styles.chipRow}>
            <PopIn replayKey={row.status}>
              <Chip label={statusText.pending} small />
            </PopIn>
          </View>
        ) : row.status === "unsaved" ? (
          <AppText variant="caption" tone="warning">
            {statusText.unsaved}
          </AppText>
        ) : null}
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
    // 一覧の行の間隔（Screen の本文の間隔と同じ）
    list: { gap: tokens.layout.cardGap },
  }),
);
