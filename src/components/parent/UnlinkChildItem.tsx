// 親04 設定の「子どもとの連携を外す」の行と、二段階の確認のダイアログ（D-133。Figma にないので、親07 ログアウト確認・
// 日程の削除の確認と同じ形: 中央・枠付きの丸いボタンを2つ横に並べる。危ない操作なので、行・アイコン・押すボタンを赤（danger）にする）。
// 分かれ道と文は unlink.ts（警告 →「次へ」→ もう一度確かめる →「連携を外す」→ 外しました）。どの段でもキャンセルが左・戻るで閉じる。
// データ: call("familyUnlink", { childId })。外せたら、この端末に残したその子どもの設定のキャッシュとアプリのアイコンを消し、
//   保護者のウィジェット（親08）を「つながっていません」にし（前の子どもの数字を残さない）、子どもの一覧を読み直す（useParentData().refresh）。
// 行き先: 「連携を外しました」の OK（戻るも同じ）→ QR の読み取り（/pair/parent。親10〜親15）へ置き換えて移る
//   （router.replace。読み取りの画面から戻っても、外す前の設定の画面には戻らない。2026-10-18 ユーザーが決めた）。
// 失敗は閉じて、行の上に帯（ErrorBanner）を出す。もう外れていた（not_found）・403 は一覧を読み直す。
//   通信・時間切れのあと読み直したら子どもが一覧から消えていた（外れていた）ときは、「もう一度ためす」を消し、
//   外せたときと同じく端末の設定のキャッシュとアイコンを消す（保護者のウィジェットは ParentWidgetSync が家族の一覧で決める）。
// 二度押し: confirm に入ってから 400ms は「連携を外す」を押せない（「次へ」と同じ位置なので、すばやい二度押しで確かめを飛ばさない）。
//   送っている間（sendingRef）・confirm でないときは send を呼んでも何もしない（familyUnlink を2回送らない）。
//   <UnlinkChildItem index={4} />（index は設定の画面の並びの順番。子どもがいなければ行は縮めて消す）
import { todayString } from "@contracts/dates";
import { errorText } from "@contracts/errors";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Button, Dialog, ErrorBanner, ListItem, Reveal } from "@/components";
import { call, errorOf } from "@/lib/api";
import { appIconCache } from "@/lib/app-icons";
import { configCache } from "@/lib/config-cache";
import { native } from "@/lib/native";
import { useParentData } from "@/lib/parent-data";
import {
  canSendUnlink,
  initialUnlinkView,
  UNLINK_DONE_NEXT,
  UNLINK_EFFECTS,
  unlinkedAfterFailure,
  unlinkFailure,
  unlinkReducer,
  unlinkSendWait,
  unlinkText,
} from "./unlink";
import { unlinkedParentWidgetData } from "./widget";

export function UnlinkChildItem({ index }: { index: number }) {
  const { child, family, refresh } = useParentData();
  const [view, dispatch] = useReducer(unlinkReducer, initialUnlinkView);
  const text = unlinkText(view.step, view.child);
  const sending = view.step === "sending";
  // 送っている途中か（描き直す前の二度押しでも、2回目を送らない）
  const sendingRef = useRef(false);
  // confirm に入ってから少したったか（「連携を外す」を押せる見た目にする）
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const wait = unlinkSendWait(view, Date.now());
    setArmed(wait === 0);
    if (wait == null || wait === 0) return;
    const timer = setTimeout(() => setArmed(true), wait);
    return () => clearTimeout(timer);
  }, [view]);

  // 失敗のあと読み直したら、外そうとした子どもが一覧にいない（返事が届かなかっただけで外れていた）
  useEffect(() => {
    const target = view.child;
    if (!target || !unlinkedAfterFailure(view, family)) return;
    dispatch({ type: "gone", childId: target.id });
    void configCache.clear(target.id).catch(() => undefined);
    appIconCache.clear();
  }, [view, family]);

  const send = async () => {
    const target = view.child;
    const now = Date.now();
    if (sendingRef.current || !target || !canSendUnlink(view, now)) return;
    sendingRef.current = true;
    dispatch({ type: "send", at: now });
    try {
      await call("familyUnlink", { childId: target.id });
      // 外した子どもの設定・アイコンを、この端末にも残さない（サーバではもう消えている）
      await configCache.clear(target.id).catch(() => undefined);
      appIconCache.clear();
      native.saveParentWidget(unlinkedParentWidgetData(todayString()));
      dispatch({ type: "succeeded" });
      void refresh();
    } catch (e) {
      const error = errorOf(e) ?? { code: "internal", ...errorText.internal };
      dispatch({ type: "failed", error });
      if (unlinkFailure(error).reload) void refresh();
    } finally {
      sendingRef.current = false;
    }
  };

  const finish = () => {
    dispatch({ type: "finish" });
    router.replace("/pair/parent");
  };
  const cancel = () => dispatch({ type: "cancel" });

  const failure = view.failure;
  return (
    <>
      {failure && (
        <ErrorBanner
          error={failure.error}
          onRetry={failure.retry ? () => dispatch({ type: "retry", at: Date.now() }) : undefined}
        />
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
              <Button variant="pill" label="次へ" onPress={() => dispatch({ type: "next", at: Date.now() })} danger />
            </>
          ) : (
            <>
              <Button variant="pill" label="キャンセル" onPress={cancel} disabled={sending} />
              <Button
                variant="pill"
                label="連携を外す"
                onPress={() => void send()}
                loading={sending}
                disabled={!sending && !armed}
                danger
              />
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
            {UNLINK_DONE_NEXT}
          </AppText>
        ) : null}
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  effects: { gap: tokens.space[2] },
});
