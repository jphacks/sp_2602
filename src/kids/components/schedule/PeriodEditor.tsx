// tmp/animations/rnweb/whiteboard/components/schedule/PeriodEditor.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 期間の登録・変更の1画面ぶん（子03・子05、親05 の追加・変更、空白期間の追加・変更で同じものを使う）。
// props・保存の流れ・版の扱いはアプリの PeriodEditor（src/components/schedule/PeriodEditor.tsx）と同じ。変えたのは並べ方と動きだけ:
//   - 下のボタン（Figma 子05・子05-B）: 「変更する」（主）→「削除する」（線だけ・delete のアイコン）→「キャンセル」（線だけ）を縦に間 8 で。
//     アプリは「削除する」を入力欄の下（本文の中）に置いていたが、Figma は下のボタンの並びの真ん中。本文の中だと、帯が増えたとき
//     下のボタンの裏に回り込んで重なる（子05-B）ので、下に固定する。登録（子03）は「登録する」「キャンセル」の2つ（アプリと同じ）
//   - 帯が2つ以上（説明の帯＋失敗・古いの帯。子05-B）のときは、画面に入るよう間を詰める（帯の間 12・欄の間 8。Figma 子05-B）
//   - 画面を開いたときは上から順にふわっと出る（Reveal）。失敗・古いの帯は、後から出たら高さを広げて入り、消えるときは縮める
// 保存の流れ（アプリと同じ）:
//   1. 送る前に入力を検査する（空の名前・終了日 < 開始日・同じ種類の期間との重なり。logic.ts の validatePeriod）。だめなら入力を残して欄に文を出す
//   2. expectedVersion（今の版）を付けて保存する。サーバが保存と C10 の再計算を終えて返すまで「登録する」は押せない
//   3. 返ってきたら完了のダイアログ（子04「登録しました。」）を出し、一覧と設定の組を取り直す（afterChange）
//   失敗: conflict（版のずれ）→「読み込み直す」/ bad_request → 入力を残してサーバの文 / not_found → 一覧へ / 通信 → もう一度
// 版の扱い（なぜ）: 変更では、入力を始めた時点の版を覚えて送る。一覧は30秒ごとに取り直されるので、最新の版をそのまま送ると
//   ほかの端末の変更を黙って上書きしてしまうため。登録（新しく足す）は上書きするものがないので、最新の版を送る。
import type { Role } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { Banner, Button, Dialog, ErrorBanner, Reveal, RevealGroup, Screen, StateView } from "@/kids/components";
import { errorOf } from "@/lib/api";
import { motion, useReducedMotion } from "@/lib/motion";
import { deletePeriod, savePeriod } from "./actions";
import { DeletePeriodDialog } from "./DeletePeriodDialog";
import {
  type DoneKind,
  doneDialog,
  draftOf,
  emptyDraft,
  type Period,
  type PeriodDraft,
  type PeriodErrors,
  type PeriodKind,
  type PeriodSource,
  type PeriodsState,
  periodTexts,
  resolveEditTarget,
  type SaveFailure,
  saveFailure,
  sourceOf,
  validatePeriod,
} from "./logic";
import { FormDensity, PeriodForm } from "./PeriodForm";

// edit の known は一覧の画面から受け取った1件（flow の editTest など）。一覧が届く前でもすぐ出すため。なければ null
export type EditorMode = { type: "create" } | { type: "edit"; id: string; known: Period | null };

type Props = {
  kind: PeriodKind;
  viewer: Role;
  childId: string;
  mode: EditorMode;
  periods: PeriodsState; // 一覧の取得結果（今の版・重なりの検査に使う）
  reload: () => Promise<PeriodSource | null>;
  onBack?: () => void; // 左上の戻る（あれば出す）
  onCancel: () => void; // 「キャンセル」
  onDone: (what: DoneKind) => void; // 完了のダイアログの「OK」のあと
  onMissing: () => void; // 対象がもうない（not_found）→ 一覧へ
  afterChange?: () => void; // 保存・削除が確定したあと（設定の組の取り直しなど）
};

type Op = "save" | "delete";

export function PeriodEditor({
  kind,
  viewer,
  childId,
  mode,
  periods,
  reload,
  onBack,
  onCancel,
  onDone,
  onMissing,
  afterChange,
}: Props) {
  const t = periodTexts(kind, viewer);
  const [edited, setEdited] = useState<PeriodDraft | null>(null); // null = まだ触っていない（一覧の最新の値を出す）
  const [pinned, setPinned] = useState<number | null>(null); // 変更を始めたときの版
  const [errors, setErrors] = useState<PeriodErrors>({});
  const [failure, setFailure] = useState<(SaveFailure & { op: Op }) | null>(null);
  const [busy, setBusy] = useState<Op | "reload" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState<{ what: DoneKind; title: string; body: string } | null>(null);

  // 変更する1件。一覧がサーバから取れていてその中にない → ほかの端末で消された（missing）。
  // ただし自分で消した直後・保存中は、一覧の取り直しで消えても完了のダイアログを出し切るため、最後に見つかった値を使い続ける
  const lastFound = useRef<Period | null>(null);
  const target = mode.type === "edit" ? resolveEditTarget(mode.id, mode.known, periods) : null;
  if (target?.status === "found") lastFound.current = target.period;
  const holding = done != null || busy != null;
  const editing =
    target == null ? null : target.status === "found" ? target.period : holding ? lastFound.current : null;

  const data = sourceOf(periods);
  const latestVersion = data?.configVersion ?? null;
  const baseVersion = editing ? (pinned ?? latestVersion) : latestVersion;
  const draft = edited ?? (editing ? draftOf(editing) : emptyDraft);

  const change = (next: PeriodDraft) => {
    if (editing && edited == null) setPinned(latestVersion);
    setEdited(next);
    setErrors({});
  };

  const clear = () => {
    setEdited(null);
    setPinned(null);
    setErrors({});
    setFailure(null);
  };

  const submit = async () => {
    const v = validatePeriod(draft, data?.periods ?? [], kind, editing?.id);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    if (baseVersion == null) return; // 版が分からないうちは送らない（ボタンも押せない）
    setErrors({});
    setFailure(null);
    setBusy("save");
    try {
      await savePeriod(kind, { childId, expectedVersion: baseVersion, id: editing?.id, ...v.value });
      const what: DoneKind = editing ? "updated" : "created";
      setDone({ what, ...doneDialog(what, kind, v.value) });
      void reload();
      afterChange?.();
    } catch (e) {
      const error = errorOf(e);
      if (error) setFailure({ ...saveFailure(error, kind), op: "save" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!editing || baseVersion == null) return;
    setFailure(null);
    setBusy("delete");
    try {
      await deletePeriod(kind, { childId, expectedVersion: baseVersion, id: editing.id });
      setConfirmDelete(false);
      setDone({ what: "deleted", ...doneDialog("deleted", kind, editing) });
      void reload();
      afterChange?.();
    } catch (e) {
      setConfirmDelete(false);
      const error = errorOf(e);
      if (error) setFailure({ ...saveFailure(error, kind), op: "delete" });
    } finally {
      setBusy(null);
    }
  };

  // 失敗の帯のボタン
  const onFailureAction = async () => {
    if (!failure) return;
    if (failure.action === "back") {
      clear();
      onMissing();
      return;
    }
    if (failure.action === "retry") {
      if (failure.op === "delete") void remove();
      else void submit();
      return;
    }
    if (failure.action === "reload") {
      setBusy("reload");
      const fresh = await reload();
      setBusy(null);
      if (!fresh) return; // 読み込めなかった（帯はそのまま。もう一度押せる）
      // 変更は最新の内容を出し直す（ほかの端末の変更を確かめてから直してもらう）。登録は入力を残す
      if (editing) setEdited(null);
      setPinned(null);
      setFailure(null);
    }
  };

  const finish = () => {
    const what = done?.what;
    setDone(null);
    clear();
    if (what) onDone(what);
  };

  const cancel = () => {
    clear();
    onCancel();
  };

  // 帯（説明の帯のほかに出ているもの）。2つ以上で間を詰める（Figma 子05-B）
  const stale = periods.status === "stale";
  // 今の版が分からないと保存できない（サーバに「どの版を見て変えたか」を伝えられない）
  const unavailable = periods.status === "unavailable" && failure == null;
  const dense = stale || unavailable || failure != null;
  // hooks は途中の return より上で呼ぶ（「読み込み中 → 見つかった」で hooks の数が変わると画面が落ちる）
  const space = useSqueeze(dense);

  // 変更する1件が出せないとき（読み込み中・取得不可・もうない）
  if (target != null && editing == null) {
    const state = target.status === "loading" ? "loading" : target.status === "unavailable" ? "unknown" : "empty";
    return (
      <Screen title={t.editTitle} onBack={onBack} bottomInset={false}>
        <StateView
          state={state}
          error={target.status === "unavailable" ? target.error : null}
          message={target.status === "missing" ? t.missing : undefined}
          hint={target.status === "missing" ? "ほかの端末で削除された可能性があります" : undefined}
          onRetry={() => void reload()}
          action={target.status === "missing" ? { label: "一覧に戻る", onPress: onMissing } : undefined}
        />
      </Screen>
    );
  }

  // 出る順番: 説明の帯 → 古いの帯 → 失敗の帯 → 欄3つ（画面を開いたときに見えているものだけが順番に入る）
  const revealFrom = 1 + Number(stale) + Number(unavailable || failure != null);

  return (
    <Screen
      title={editing ? t.editTitle : t.createTitle}
      onBack={onBack}
      bottomInset={false}
      footer={
        <>
          <Button
            label={editing ? "変更する" : "登録する"}
            icon="check_circle"
            onPress={() => void submit()}
            loading={busy === "save"}
            disabled={baseVersion == null || (busy != null && busy !== "save")}
          />
          {editing && (
            <Button
              variant="outline"
              label="削除する"
              icon="delete"
              danger
              onPress={() => setConfirmDelete(true)}
              disabled={baseVersion == null || busy != null}
            />
          )}
          <Button variant="outline" label="キャンセル" onPress={cancel} disabled={busy != null} />
        </>
      }
    >
      <RevealGroup>
        {/* 間は Reveal の中の上の余白で空ける（帯と一緒に縮む・広がる。詰めるときも、帯が広がるのと同じ速さで詰める） */}
        <View>
          <Reveal index={0} gap={0}>
            <Banner icon="edit" message={editing ? t.editBanner : t.createBanner} />
          </Reveal>
          <Reveal index={1} show={stale} gap={0}>
            <Animated.View style={{ paddingTop: space.block }}>
              <Banner
                tone="warning"
                icon="cloud_off"
                message="最新でない可能性があります"
                hint="通信できるようになると自動で更新します"
              />
            </Animated.View>
          </Reveal>
          <Reveal index={1 + Number(stale)} show={unavailable} gap={0}>
            {periods.status === "unavailable" && (
              <Animated.View style={{ paddingTop: space.block }}>
                <ErrorBanner error={periods.error} onRetry={() => void reload()} retryLabel="読み込み直す" />
              </Animated.View>
            )}
          </Reveal>
          <Reveal index={1 + Number(stale)} show={failure != null} gap={0}>
            {failure && (
              <Animated.View style={{ paddingTop: space.block }}>
                <ErrorBanner
                  error={failure.error}
                  onRetry={failure.actionLabel ? () => void onFailureAction() : undefined}
                  retryLabel={failure.actionLabel ?? undefined}
                />
              </Animated.View>
            )}
          </Reveal>
          <Animated.View style={{ paddingTop: space.block }}>
            <FormDensity.Provider value={{ gap: space.field, revealFrom }}>
              <PeriodForm kind={kind} draft={draft} errors={errors} onChange={change} editable={busy == null} />
            </FormDensity.Provider>
          </Animated.View>
        </View>
      </RevealGroup>

      <DeletePeriodDialog
        kind={kind}
        period={confirmDelete ? editing : null}
        busy={busy === "delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
      <Dialog
        visible={done != null}
        icon="check_circle"
        iconTone="success"
        title={done?.title ?? ""}
        body={done?.body}
        centered
        onClose={finish}
        actions={<Button variant="pill" label="OK" onPress={finish} />}
      />
    </Screen>
  );
}

// 帯が増えたときに間を詰める（帯の間 16 → 12・欄の間 16 → 8。Figma 子05-B）。
// ぱっと詰めると、帯が広がり始める前に欄が一度上に跳ねるので、帯が広がるのと同じ速さ（Reveal と同じ medium・enter）で詰める。
// 動きを減らす設定なら、すぐ最後の間にする
function useSqueeze(dense: boolean) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(dense ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.stopAnimation();
      v.setValue(dense ? 1 : 0);
      return;
    }
    const anim = Animated.timing(v, {
      toValue: dense ? 1 : 0,
      duration: motion.duration.medium,
      easing: motion.easing.enter,
      useNativeDriver: false, // 余白（並び）は端末側で動かせない
    });
    anim.start();
    return () => anim.stop();
  }, [dense, reduced, v]);
  const loose = tokens.layout.cardGap;
  return useRef({
    block: v.interpolate({ inputRange: [0, 1], outputRange: [loose, tokens.space[3]] }),
    field: v.interpolate({ inputRange: [0, 1], outputRange: [loose, tokens.space[2]] }),
  }).current;
}
