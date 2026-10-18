// 連携状態を確かめる画面（Figma 共01 連携状態を取得できない 108:9143・共02 連携結果が未確定 108:9156・共03 連携未完了 108:9171）。
// 紐づけの途中で通信が切れて結果が分からなくなったとき（保護者の pairClaim の応答が届かない等）に来る。
// データ: call("linkStatus") で D2 に保存が確定した連携状態を照会し、成功（linked）／失敗（unlinked）／不明（照会できない）を区別する
//   （MVP_SPEC 4.1）。どの表示を出すかは src/components/pair/link-check.ts の linkCheckView が決める。
// URL の引数: reason = "unsure"（共02 から始める）/ "check"（すぐ照会する。照会できなければ共01）、role = "child" / "parent"（共03 の行き先）
// 行き先: linked → useSession().refresh()（役割が決まる）→ 入口（/）→ 各ホーム（保護者で通常上限が未設定なら親02 でも決められる）。
//   共03「もう一度はじめる」→ 同じ役割の紐づけ（/pair/child・/pair/parent）。「あとで」→ 入口（/）。下部タブなし（Q12）。
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Screen, StateView } from "@/components";
import {
  LinkIncomplete,
  type LinkQuery,
  LinkUnknown,
  LinkUnsure,
  linkCheckReasonOf,
  linkCheckView,
  restartHref,
} from "@/components/pair";
import { withKidsUI } from "@/kids/KidsUI";
import { call, errorOf, timeoutSignal } from "@/lib/api";
import { useSession } from "@/lib/session";

const REQUEST_TIMEOUT_MS = 15_000;

function PairStatus() {
  const params = useLocalSearchParams<{ reason?: string; role?: string }>();
  const reason = linkCheckReasonOf(params.reason);
  const { refresh } = useSession();
  const [query, setQuery] = useState<LinkQuery>({ kind: "idle" });

  const check = useCallback(async () => {
    setQuery({ kind: "loading" });
    try {
      setQuery({
        kind: "ok",
        link: await call("linkStatus", undefined, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) }),
      });
    } catch (e) {
      const error = errorOf(e);
      if (error) setQuery({ kind: "error", error });
    }
  }, []);

  // check はすぐ照会する（unsure は共02 を見せてから、押したら照会する）
  useEffect(() => {
    if (reason === "check") void check();
  }, [reason, check]);

  const view = linkCheckView(reason, query);

  // 連携が確定していた → 役割を取り直して入口で振り分ける
  useEffect(() => {
    if (view.screen === "linked" || view.screen === "unlinked") {
      if (view.screen === "linked") void refresh().then(() => router.replace("/"));
      else router.dismissTo("/pair");
    }
  }, [view.screen, refresh]);

  const later = () => router.replace("/");

  switch (view.screen) {
    case "unknown":
      return (
        <Screen title="Slope" scroll={false}>
          <LinkUnknown onRetry={check} detail={view.error?.message} />
        </Screen>
      );
    case "unsure":
      return (
        <Screen title="Slope" scroll={false}>
          <LinkUnsure onCheck={check} onLater={later} detail={view.error?.message} />
        </Screen>
      );
    case "incomplete":
      return (
        <Screen title="Slope" scroll={false}>
          <LinkIncomplete onRestart={() => router.replace(restartHref(params.role))} onLater={later} />
        </Screen>
      );
    default:
      return (
        <Screen title="Slope" scroll={false}>
          <StateView state="loading" message="つながりの状態を確かめています…" />
        </Screen>
      );
  }
}

// 親子どちらにも出る入口の画面。Figma の子ども用のデザイン（入01・入02・子08・子09・共01〜共03 など）があるので、今は子ども用の見た目（src/kids）で描く。
export default withKidsUI(PairStatus);
