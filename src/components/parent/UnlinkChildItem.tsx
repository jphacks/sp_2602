// 親04 設定の「子どもとの連携を外す」の行と、二段階の確認のダイアログ（D-133。Figma にないので、親07 ログアウト確認・
// 日程の削除の確認と同じ形: 中央・枠付きの丸いボタンを2つ横に並べる。危ない操作なので、行・アイコン・押すボタンを赤（danger）にする）。
// 分かれ道と文は unlink.ts（警告 →「次へ」→ もう一度確かめる →「連携を外す」→ 外しました）。どの段でもキャンセルが左・戻るで閉じる。
// データ: call("familyUnlink", { childId })。外せたら、この端末に残したその子どもの設定のキャッシュとアプリのアイコンを消し、
//   子どもの一覧を読み直す（useParentData().refresh。一覧が空になり、ほかのタブは「まだ子どもとつながっていません」になる。D-119）。
// 行き先: 「連携を外しました」の OK → 親のホーム（/parent/home。「QRコードを読み取る」で新しくつなげる）。
// 失敗は閉じて、行の上に帯（ErrorBanner）を出す。もう外れていた（not_found）・403 は一覧を読み直す。
//   <UnlinkChildItem index={4} />（index は設定の画面の並びの順番。子どもがいなければ行は縮めて消す）
import { errorText } from "@contracts/errors";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useReducer } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Button, Dialog, ErrorBanner, ListItem, Reveal } from "@/components";
import { call, errorOf } from "@/lib/api";
import { appIconCache } from "@/lib/app-icons";
import { configCache } from "@/lib/config-cache";
import { useParentData } from "@/lib/parent-data";
import { initialUnlinkView, UNLINK_EFFECTS, unlinkFailure, unlinkReducer, unlinkText } from "./unlink";

export function UnlinkChildItem({ index }: { index: number }) {
  const { child, refresh } = useParentData();
  const [view, dispatch] = useReducer(unlinkReducer, initialUnlinkView);
  const text = unlinkText(view.step, view.child);
  const sending = view.step === "sending";

  const send = async () => {
    const target = view.child;
    if (!target) return;
    dispatch({ type: "send" });
    try {
      await call("familyUnlink", { childId: target.id });
      // 外した子どもの設定・アイコンを、この端末にも残さない（サーバではもう消えている）
      await configCache.clear(target.id).catch(() => undefined);
      appIconCache.clear();
      dispatch({ type: "succeeded" });
      void refresh();
    } catch (e) {
      const error = errorOf(e) ?? { code: "internal", ...errorText.internal };
      dispatch({ type: "failed", error });
      if (unlinkFailure(error).reload) void refresh();
    }
  };

  const finish = () => {
    dispatch({ type: "finish" });
    router.navigate("/parent/home");
  };
  const cancel = () => dispatch({ type: "cancel" });

  const failure = view.failure;
  return (
    <>
      {failure && (
        <ErrorBanner error={failure.error} onRetry={failure.retry ? () => dispatch({ type: "retry" }) : undefined} />
      )}
      <Reveal index={index} show={child != null}>
        {child && (
          <ListItem
            icon="link_off"
            title="子どもとの連携を外す"
            subtitle={child.name}
            strong
            danger
            onPress={() => dispatch({ type: "open", child })}
            accessibilityLabel={`${child.name}との連携を外す`}
          />
        )}
      </Reveal>
      <Dialog
        visible={view.step !== "closed"}
        icon={view.step === "done" ? "check_circle" : view.step === "warn" ? "warning" : "link_off"}
        iconTone={view.step === "done" ? "success" : "danger"}
        title={text.title}
        body={text.body}
        centered
        // 送っている間は閉じない（結果を待つ）。外したあとの戻るは OK と同じ
        onClose={view.step === "done" ? finish : sending ? () => undefined : cancel}
        actions={
          view.step === "done" ? (
            <Button variant="pill" label="OK" onPress={finish} />
          ) : view.step === "warn" ? (
            <>
              <Button variant="pill" label="キャンセル" onPress={cancel} />
              <Button variant="pill" label="次へ" onPress={() => dispatch({ type: "next" })} danger />
            </>
          ) : (
            <>
              <Button variant="pill" label="キャンセル" onPress={cancel} disabled={sending} />
              <Button variant="pill" label="連携を外す" onPress={() => void send()} loading={sending} danger />
            </>
          )
        }
      >
        {view.step === "warn" ? (
          <View style={styles.effects}>
            {UNLINK_EFFECTS.map((line) => (
              <AppText key={line} variant="small">
                {`・${line}`}
              </AppText>
            ))}
          </View>
        ) : view.step === "done" ? (
          <AppText variant="small" tone="muted" center>
            もう一度つなぐときは、ホームの「QRコードを読み取る」から始めてください。
          </AppText>
        ) : null}
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  effects: { gap: tokens.space[2] },
});
