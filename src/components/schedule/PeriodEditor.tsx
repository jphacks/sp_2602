// 期間の登録・変更の1画面ぶん（子03・子05、親05 の追加・変更、空白期間の追加・変更で同じものを使う）。
// 並びは Figma 子03: 題名 → 鉛筆の帯（説明）→ 入力欄3つ → 下に「登録する」（主）と「キャンセル」（枠だけ）。変更のときは「削除する」も出す。
// 保存の流れ:
//   1. 送る前に入力を検査する（空の名前・終了日 < 開始日・同じ種類の期間との重なり。logic.ts の validatePeriod）。だめなら入力を残して欄に文を出す
//   2. expectedVersion（今の版）を付けて保存する。サーバが保存と C10 の再計算を終えて返すまで「登録する」は押せない
//   3. 返ってきたら完了のダイアログ（子04「登録しました。」）を出し、一覧と設定の組を取り直す（afterChange）
//   失敗: conflict（版のずれ）→「読み込み直す」/ bad_request → 入力を残してサーバの文 / not_found → 一覧へ / 通信 → もう一度
// 版の扱い（なぜ）: 変更では、入力を始めた時点の版を覚えて送る。一覧は30秒ごとに取り直されるので、最新の版をそのまま送ると
//   ほかの端末の変更を黙って上書きしてしまうため。登録（新しく足す）は上書きするものがないので、最新の版を送る。
import type { Role } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Dialog, ErrorBanner, Screen, StateView } from "@/components";
import { errorOf } from "@/lib/api";
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
import { PeriodForm } from "./PeriodForm";

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
          <Button variant="outline" label="キャンセル" onPress={cancel} disabled={busy != null} />
        </>
      }
    >
      <Banner icon="edit" message={editing ? t.editBanner : t.createBanner} />
      {periods.status === "stale" && (
        <Banner
          tone="warning"
          icon="cloud_off"
          message="最新でない可能性があります"
          hint="通信できるようになると自動で更新します"
        />
      )}
      {periods.status === "unavailable" && failure == null && (
        // 今の版が分からないと保存できない（サーバに「どの版を見て変えたか」を伝えられない）
        <ErrorBanner error={periods.error} onRetry={() => void reload()} retryLabel="読み込み直す" />
      )}
      {failure && (
        <ErrorBanner
          error={failure.error}
          onRetry={failure.actionLabel ? () => void onFailureAction() : undefined}
          retryLabel={failure.actionLabel ?? undefined}
        />
      )}
      <PeriodForm kind={kind} draft={draft} errors={errors} onChange={change} editable={busy == null} />
      {editing && (
        <View style={styles.delete}>
          <Button
            variant="outline"
            label="削除する"
            icon="delete"
            danger
            onPress={() => setConfirmDelete(true)}
            disabled={baseVersion == null || busy != null}
          />
        </View>
      )}

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

const styles = StyleSheet.create({
  delete: { paddingTop: tokens.space[2] },
});
