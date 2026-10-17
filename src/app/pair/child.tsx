// 子ども側の QR の紐づけ（Figma 子13 QR発行中 108:8926・子14 QR表示 108:8943・子15 QR期限切れ 108:8963・
// 子16 QR発行失敗 108:8978・子17 連携結果の確認中 108:8993・子18 家族に入りますか？確認 108:9006・子19 連携完了 108:9037）。
// データ: call("pairStart") で QR のチケット（code・期限）を受け取り、code だけを QR にする（合言葉・個人情報は入れない）。
//   待つ間は usePolling で数秒ごとに call("pairStatus")。保護者が読んだら（claimed）子18 で「はい / いいえ」→ call("pairConfirm")。
//   どの表示を出すかは src/components/pair/child-flow.ts の childPairReducer が決める（ここは出来事を渡して描くだけ）。
// 行き先: 子19「ホームへ」→ useSession().refresh()（役割が child になる）→ 入口（/）→ 子どものホーム。
//   「やめる」（出した QR を call("pairCancel") で取り消してから）・「いいえ」→ 役割選び（/pair）。未連携のまま。下部タブなし（Q12）。
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useCallback, useEffect, useReducer, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Chip, Dialog, MessageView, Screen } from "@/components";
import {
  childPairReducer,
  initialChildPairView,
  LinkIncomplete,
  PAIR_POLL_MS,
  QrCard,
  remainingLabel,
  shouldPoll,
  ticketOf,
} from "@/components/pair";
import { call, errorOf, timeoutSignal } from "@/lib/api";
import { usePolling } from "@/lib/polling";
import { useSession } from "@/lib/session";

// 1回の通信を待つ長さ（これを過ぎたら「時間切れ」= 結果が分からない扱い）
const REQUEST_TIMEOUT_MS = 15_000;
// 「やめる」で QR を取り消すときに待つ長さ（待ちすぎない。取り消せなくても画面は戻る）
const CANCEL_TIMEOUT_MS = 3_000;

export default function PairChild() {
  const { refresh } = useSession();
  const [view, dispatch] = useReducer(childPairReducer, initialChildPairView);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);

  // 子13: QR をつくる（最初・つくり直す）。画面を離れた後に届いた応答は捨てる
  useEffect(() => {
    if (view.screen !== "issuing") return;
    let alive = true;
    call("pairStart", {}, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) })
      .then((ticket) => {
        if (alive) dispatch({ type: "issued", ticket, receivedAt: Date.now() });
      })
      .catch((e) => {
        const error = errorOf(e);
        if (alive && error) dispatch({ type: "issueFailed", error });
      });
    return () => {
      alive = false;
    };
  }, [view.screen]);

  // 子18: 「はい / いいえ」を送る。応答が届かなければ子17（結果が分からない → 照会する）
  useEffect(() => {
    if (view.screen !== "answering") return;
    let alive = true;
    call(
      "pairConfirm",
      { pairId: view.ticket.pairId, accept: view.accept },
      { signal: timeoutSignal(REQUEST_TIMEOUT_MS) },
    )
      .then((status) => {
        if (alive) dispatch({ type: "status", status });
      })
      .catch((e) => {
        const error = errorOf(e);
        if (alive && error) dispatch({ type: "answerFailed", error });
      });
    return () => {
      alive = false;
    };
  }, [view]);

  // 子14・子18・子17: 進み具合を数秒ごとに聞く（保護者が読んだか・期限が切れたか・確定したか）
  const pairId = ticketOf(view)?.pairId ?? null;
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
  usePolling(askStatus, { intervalMs: PAIR_POLL_MS, enabled: shouldPoll(view) });

  // 子17「もう一度確かめる」: すぐ聞き直す（自動の照会も続ける）
  const recheck = () => {
    dispatch({ type: "recheck" });
    void askStatus();
  };

  // 子14 の残り時間（1秒ごと）。0 になったら子15
  const counting = view.screen === "showing" || view.screen === "asking";
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    }, 1000);
    return () => clearInterval(timer);
  }, [counting]);

  // 「いいえ」が確定した → 役割選びへ戻る（未連携のまま）
  useEffect(() => {
    if (view.screen === "rejected") router.replace("/pair");
  }, [view.screen]);

  // やめる: 出した QR を取り消して（pairCancel。以後その QR は読めない）、未連携のまま役割選びへ。
  // 取り消しの応答は短く待つだけにする（なぜ: 通信できないときに「やめる」が効かないと困るため。取り消せなくても、
  // 子どもが「はい」を押さない限りつながらない。QR をまだ受け取っていない（つくっている途中）なら送らない
  const cancel = async () => {
    setLeaving(true);
    const id = ticketOf(view)?.pairId;
    if (id) await call("pairCancel", { pairId: id }, { signal: timeoutSignal(CANCEL_TIMEOUT_MS) }).catch(() => null);
    router.replace("/pair");
  };
  const start = () => dispatch({ type: "start" });
  const later = () => router.replace("/");
  const goHome = async () => {
    setLeaving(true);
    await refresh();
    router.replace("/");
  };

  const quit = <Button variant="outline" label="やめる" onPress={() => void cancel()} loading={leaving} />;

  switch (view.screen) {
    case "issuing":
      return (
        <Screen title="Slope" scroll={false}>
          <Banner icon="info" message="QRコードを準備しています" />
          <MessageView spinner title="QRコードをつくっています" body="しばらく待ってね。" actions={quit} />
        </Screen>
      );
    case "issueFailed":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="error"
            iconTone="danger"
            title="QRコードをつくれませんでした"
            body={"通信を確かめて、\nもう一度ためしてください。"}
            actions={
              <>
                <Button label="もう一度つくる" onPress={start} />
                {quit}
              </>
            }
          >
            <AppText variant="caption" tone="muted" center>
              {view.error.message}
            </AppText>
          </MessageView>
        </Screen>
      );
    case "expired":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="clock"
            title="QRコードを使えません"
            body={"期限切れまたは取り消しになりました。\nもう一度つくりましょう。"}
            actions={
              <>
                <Button label="QRコードをつくり直す" onPress={start} />
                {quit}
              </>
            }
          />
        </Screen>
      );
    case "checking":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="sync"
            title="つながりを確かめています"
            body={"通信が切れて、結果がまだ分かりません。\nつながったら、もう一度確かめます。"}
            actions={<Button label="もう一度確かめる" onPress={recheck} loading={view.busy} />}
          />
        </Screen>
      );
    case "linked":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView
            icon="check_circle"
            iconTone="success"
            title="家族に入りました"
            body={"保護者がきめた時間のルールが、\nこのスマホに届きます。"}
            actions={<Button label="ホームへ" onPress={goHome} loading={leaving} />}
          />
        </Screen>
      );
    case "failed":
      return (
        <Screen title="Slope" scroll={false}>
          <LinkIncomplete onRestart={start} onLater={later} detail={view.error.message} />
        </Screen>
      );
    case "rejected":
      return (
        <Screen title="Slope" scroll={false}>
          <MessageView spinner title="もどっています…" />
        </Screen>
      );
    case "showing":
    case "asking":
    case "answering":
      // 子14（子18 はこの上のダイアログ）
      return (
        <Screen title="Slope" footer={quit}>
          <Banner icon="info" message="保護者のスマホで、このQRコードを読み取ってもらおう" />
          {view.screen === "showing" && view.offline && (
            <Banner
              tone="warning"
              icon="cloud_off"
              message="通信できません"
              hint="つながったら、読み取られたかを自動で確かめます"
            />
          )}
          <View style={styles.qr}>
            <QrCard code={view.ticket.code} />
            {view.ticket.expiresAt !== null ? (
              <Chip icon="clock" label={`あと ${remainingLabel(view.ticket.deadline, now)}で使えなくなります`} />
            ) : null}
            <AppText variant="caption" tone="muted" center>
              QRコードを読み取ると、子どもの確認待ちになります。
            </AppText>
          </View>
          <Dialog
            visible={view.screen !== "showing"}
            icon="group"
            title={`${view.screen === "showing" ? "" : view.parentName}さんの家族に入りますか？`}
            body={"保護者のスマホがQRコードを読み取りました。\n心当たりがないときは「いいえ」を押してね。"}
            actionsDirection="column"
            // 戻るボタンで閉じても「いいえ」にはしない（押し間違いで断らないように。決めるまで出したまま）
            onClose={() => undefined}
            actions={
              <>
                <Button
                  label="はい、入る"
                  onPress={() => dispatch({ type: "answer", accept: true })}
                  loading={view.screen === "answering" && view.accept}
                  disabled={view.screen === "answering"}
                />
                <Button
                  variant="outline"
                  label="いいえ"
                  onPress={() => dispatch({ type: "answer", accept: false })}
                  loading={view.screen === "answering" && !view.accept}
                  disabled={view.screen === "answering"}
                />
              </>
            }
          />
        </Screen>
      );
  }
}

const styles = StyleSheet.create({
  qr: { flex: 1, justifyContent: "center", gap: tokens.space[4], paddingVertical: tokens.space[8] },
});
