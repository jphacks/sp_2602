// 役割を選ぶ画面（Q1。ログイン後、役割がまだない人が来る。Figma にない画面なので、Figma の QR・連携の画面と同じ見た目にした。
// 下部タブなし。Q12）。この端末を保護者の端末にするか、子どもの端末にするかを選ぶ。サーバ上の役割は QR の紐づけ（linked）で決まる。
// データ: 開いたら call("linkStatus") で D2 の連携状態を確かめる（FigJam: ログイン後に D2 を取得してから QR へ）。
//   照会できない → 共01（QR の画面へは進まない。もう一度確かめる）。連携済み → 役割を取り直して入口へ。未連携 → 選択肢を出す
// 行き先: 「保護者として使う」→ /pair/parent（親10〜親15）、「子どもとして使う」→ /pair/child（子13〜子19）、ログアウト → 入口
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Screen, StateView } from "@/components";
import { type LinkQuery, LinkUnknown, linkCheckView, RoleChoice } from "@/components/pair";
import { call, errorOf, timeoutSignal } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function PairStart() {
  const { signOut, refresh } = useSession();
  const [query, setQuery] = useState<LinkQuery>({ kind: "idle" });

  const check = useCallback(async () => {
    setQuery({ kind: "loading" });
    try {
      setQuery({ kind: "ok", link: await call("linkStatus", undefined, { signal: timeoutSignal(15_000) }) });
    } catch (e) {
      const error = errorOf(e);
      if (error) setQuery({ kind: "error", error });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const view = linkCheckView("check", query);

  // すでに連携済み（別の端末で紐づけが終わっていた・役割の取り直しが遅れた）→ 役割を取り直して入口で振り分け直す
  useEffect(() => {
    if (view.screen !== "linked") return;
    void refresh().then(() => router.replace("/"));
  }, [view.screen, refresh]);

  const logout = async () => {
    await signOut();
    router.replace("/");
  };

  if (view.screen === "unknown")
    return (
      <Screen title="Slope" scroll={false}>
        <LinkUnknown onRetry={check} detail={view.error?.message} />
      </Screen>
    );

  if (view.screen !== "unlinked")
    return (
      <Screen title="Slope" scroll={false}>
        <StateView state="loading" message="つながりの状態を確かめています…" />
      </Screen>
    );

  return (
    <Screen title="Slope" footer={<Button variant="text" label="ログアウト" onPress={logout} />}>
      {/* 幅まかせだと「くだ／さい」で切れるので、言葉の切れ目で改行する */}
      <Banner icon="group" message={"このスマホを使う人を\nえらんでください"} />
      <View style={styles.choices}>
        <RoleChoice
          icon="camera"
          title="保護者として使う"
          description="子どものスマホに出たQRコードを、このスマホで読み取ります。"
          // navigate: すばやく2回押しても、カメラの画面を2枚重ねない
          onPress={() => router.navigate("/pair/parent")}
        />
        <RoleChoice
          icon="qr_code"
          title="子どもとして使う"
          description="このスマホにQRコードを出して、保護者に読み取ってもらいます。"
          onPress={() => router.navigate("/pair/child")}
        />
      </View>
      <AppText variant="caption" tone="muted">
        保護者と子どものスマホがQRコードでつながると、役割が決まります。つながったあとは役割を変えられません。
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { gap: tokens.layout.listGap },
});
