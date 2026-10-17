// 保護者側の QR の読み取り（Figma 親10 カメラ権限の案内 108:9050・親11 QR読み取り中 108:9065・親12 QR検証中 108:9077・
// 親13 QR読み取り失敗 108:9092・親14 連携の保存失敗 108:9115・親15 連携完了 108:9130）。
// データ: expo-camera の useCameraPermissions で権限を確かめ、CameraView で QR を読む。読んだ code を call("pairClaim") に送る。
//   子どもの「はい」を待つ間は usePolling で call("pairStatus")。保存の確定（linked）を見るまで成功を出さない（MVP_SPEC 4.1）。
//   どの表示を出すかは src/components/pair/parent-flow.ts の parentPairReducer が決める（ここは出来事を渡して描くだけ）。
// 行き先: 親15 → useSession().refresh()（役割が parent になる）→ /pair/usual-limit（1日の上限を決める。Q7）。
//   pairClaim の応答が届かない → /pair/status（共02 連携結果が未確定）。「中止する」「やめる」→ 役割選び（/pair）。下部タブなし（Q12）。
import { tokens } from "@contracts/tokens";
import { useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useState } from "react";
import { AppState, BackHandler, Linking, StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Dialog, MessageView, Screen, StateView } from "@/components";
import {
  initialParentPairView,
  LinkIncomplete,
  PAIR_POLL_MS,
  parentPairReducer,
  QrScanner,
  shouldPollParent,
  shouldScan,
} from "@/components/pair";
import { call, errorOf, timeoutSignal } from "@/lib/api";
import { useFlow } from "@/lib/flow";
import { usePolling } from "@/lib/polling";
import { useSession } from "@/lib/session";

const REQUEST_TIMEOUT_MS = 15_000;

export default function PairParent() {
  const { refresh } = useSession();
  const { setChild } = useFlow();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [view, dispatch] = useReducer(parentPairReducer, initialParentPairView);
  const [leaving, setLeaving] = useState(false);

  // カメラの権限: まだ聞いていなければ OS の確認を出す。結果を表示に渡す
  useEffect(() => {
    if (!permission) return;
    if (permission.status === "undetermined" && permission.canAskAgain) {
      void requestPermission();
      return;
    }
    dispatch({ type: "permission", granted: permission.granted, canAskAgain: permission.canAskAgain });
  }, [permission, requestPermission]);

  // 設定アプリで許可して戻ってきたら、権限を取り直す
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void getPermission();
    });
    return () => sub.remove();
  }, [getPermission]);

  // 親12: 読んだ code を送る（画面を離れた後に届いた応答は捨てる）
  useEffect(() => {
    if (view.screen !== "verifying") return;
    let alive = true;
    call("pairClaim", { code: view.code }, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) })
      .then((status) => {
        if (alive) dispatch({ type: "claimed", status });
      })
      .catch((e) => {
        const error = errorOf(e);
        if (alive && error) dispatch({ type: "claimFailed", error });
      });
    return () => {
      alive = false;
    };
  }, [view]);

  // 親12 の確かめている間は、Android の戻るボタンでも離れない（「やめる」も押せない）。
  // なぜ: 離れると応答を捨てるが、サーバでは読み取りが通っていることがある。そのまま子どもが「はい」を押すと、
  // この端末は何も知らないまま家族になってしまう
  const verifying = view.screen === "verifying";
  useEffect(() => {
    if (!verifying) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [verifying]);

  // 子どもの「はい」を待つ間、数秒ごとに進み具合を聞く
  const pairId = view.screen === "waitingChild" ? view.status.pairId : null;
  const askStatus = useCallback(async () => {
    if (!pairId) return;
    try {
      dispatch({
        type: "status",
        status: await call("pairStatus", { pairId }, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) }),
      });
    } catch (e) {
      const error = errorOf(e);
      if (error) dispatch({ type: "statusFailed", error });
    }
  }, [pairId]);
  usePolling(askStatus, { intervalMs: PAIR_POLL_MS, enabled: shouldPollParent(view) });

  // 連携が確定した子どもを、この後の画面（通常上限・親のホーム）に渡す
  useEffect(() => {
    if (view.screen === "linked") setChild(view.child);
  }, [view, setChild]);

  // 応答が届かず、読み取りが通ったか分からない → 連携状態を照会する画面へ（共02）
  useEffect(() => {
    if (view.screen === "unsure")
      router.replace({ pathname: "/pair/status", params: { reason: "unsure", role: "parent" } });
  }, [view.screen]);

  // 役割選びへは「戻る」（dismissTo）。置き換えると、下に残っている役割選びの上にもう1枚重なり、戻るボタンで役割選びが2回出る
  const quit = () => router.dismissTo("/pair");
  const later = () => router.replace("/");
  const rescan = () => dispatch({ type: "rescan" });
  const next = async () => {
    setLeaving(true);
    await refresh();
    router.replace("/pair/usual-limit");
  };

  switch (view.screen) {
    case "permissionChecking":
    case "unsure":
      return (
        <Screen title="Slope" scroll={false}>
          <StateView state="loading" message="カメラを準備しています…" />
        </Screen>
      );
    case "permission":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="camera"
            title="カメラを使わせてください"
            // 手で改行しない（端末の幅・文字の大きさで「に、」だけが1行に落ちていた。文の終わりの切れ方は AppText が防ぐ）
            body="子どものスマホのQRコードを読み取るために、カメラを使います。"
            actions={
              <>
                {view.canAskAgain ? (
                  <Button label="カメラを許可する" onPress={() => void requestPermission()} />
                ) : (
                  // 「今後表示しない」で断られた → OS の確認はもう出せないので、アプリの設定を開く
                  <Button label="設定を開く" onPress={() => void Linking.openSettings()} />
                )}
                <Button variant="outline" label="中止する" onPress={quit} />
              </>
            }
          />
        </Screen>
      );
    case "scanning":
    case "verifying":
    case "scanFailed":
      return (
        <Screen
          title="Slope"
          scroll={false}
          footer={<Button variant="outline" label="やめる" onPress={quit} disabled={view.screen === "verifying"} />}
        >
          <QrScanner
            scanning={shouldScan(view)}
            verifying={view.screen === "verifying"}
            onScanned={(data) => dispatch({ type: "scanned", data })}
          />
          <Dialog
            visible={view.screen === "scanFailed"}
            icon="error"
            iconTone="danger"
            title="読み取れませんでした"
            body={
              "QRコードが正しくないか、期限が切れているか、すでに使われています。\n子どものスマホで新しいQRコードを出してもらってね。"
            }
            actionsDirection="column"
            onClose={rescan}
            actions={
              <>
                <Button label="もう一度読み取る" onPress={rescan} />
                <Button variant="outline" label="やめる" onPress={quit} />
              </>
            }
          >
            {view.screen === "scanFailed" ? (
              <AppText variant="caption" tone="muted">
                {view.error.message}
              </AppText>
            ) : null}
          </Dialog>
        </Screen>
      );
    case "saveFailed":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="error"
            iconTone="danger"
            title="つながりを保存できませんでした"
            body={"まだ家族にはなっていません。\n通信を確かめて、もう一度ためしてください。"}
            actions={
              <>
                <Button label="もう一度ためす" onPress={() => dispatch({ type: "retrySave" })} />
                <Button variant="outline" label="やめる" onPress={quit} />
              </>
            }
          >
            <AppText variant="caption" tone="muted" center>
              {view.error.message}
            </AppText>
          </MessageView>
        </Screen>
      );
    case "waitingChild":
      // TODO(未決): Figma にない表示（読み取りが通り、子どもの「はい」を待っている）。QR・連携の画面と同じ形にした
      return (
        <Screen title="Slope" scroll={false}>
          {view.offline && (
            <View style={styles.banner}>
              <Banner
                tone="warning"
                icon="cloud_off"
                message="通信できません"
                hint="つながったら、子どもの返事を自動で確かめます"
              />
            </View>
          )}
          <MessageView
            spinner
            title={`${view.status.child.name}さんの返事を待っています`}
            body={"子どものスマホで「はい、入る」を押してもらってね。\nまだ家族にはなっていません。"}
            actions={<Button variant="outline" label="やめる" onPress={quit} />}
          />
        </Screen>
      );
    case "incomplete":
      return (
        <Screen title="Slope" scroll={false}>
          <LinkIncomplete
            onRestart={rescan}
            onLater={later}
            detail={
              view.reason === "rejected"
                ? "子どものスマホで「いいえ」が押されました"
                : "QRコードの期限が切れました。子どものスマホで新しいQRコードを出してもらってね。"
            }
          />
        </Screen>
      );
    case "linked":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="check_circle"
            iconTone="success"
            title={`${view.child.name}さんとつながりました`}
            body={`${view.child.name}さんの使用状況を見られるようになりました。`}
            // TODO(未決): Figma のボタンは「使用状況を見る」（親01 へ）。Q7 で紐づけ直後に1日の上限を決めることになったので、
            //   先に上限を決める画面へ進む文言にした（決めた後に親01 へ進む）
            actions={<Button label="1日の上限を決める" onPress={next} loading={leaving} />}
          />
        </Screen>
      );
  }
}

const styles = StyleSheet.create({
  banner: { paddingBottom: tokens.space[2] },
});
