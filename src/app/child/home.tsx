// 子01 ホーム（Figma 108:6714）。子どもが最初に見る画面。上から:
//   （上限に達した日・設定が古いときだけ）帯 → 「今日の使用量」のカード（46 ％ 使いました・進捗バー・詳しく見る ›）→ 「次のテスト」のカード
//   →（まだ許可していないものがあるときだけ）「見守りのための許可」のカード（C4。Figma にない。PermissionGuideCard）
// データ: useChildData()（src/lib/child-data.tsx）の calc（C3 の結果）・config（C7）・test（次のテスト）・blank（今日の空白期間）。
//   表示の決め方は src/components/child/child-view.ts（usageView・nextTestView・staleNotice・shouldOpenLimitScreen）。
// 進む先: 「詳しく見る ›」→ /child/usage（子02）。上限に達したら、その日に1回だけ /child/limit-reached（子11）へ進み、
//   native.showLimitReached()（C4。Kotlin が OS の許す範囲で前面に出す）も呼ぶ。
// 割合を出せない状態（上限未設定・制限なし・権限なし・取得不可）は 0% と出さず、それぞれの文で出す（MVP_SPEC 5.3・AC-09）。
// 子どもには分数を見せない（割合が主。MVP_SPEC 4.2）。
// 動き（Figma にない。src/lib/motion.ts の決まり・src/components/Reveal.tsx）:
//   - 画面を開いたときだけ、帯・カードが上から順に 80 ミリ秒ずつずれて、下から 16 上がりながら 400 ミリ秒で出てくる
//     （30 秒ごとの取り直しで描き直されても、もう一度は出さない）
//   - 後から出た帯（上限に達した・設定が古い）・許可のカードは、高さを広げて入れる（下のカードがなめらかに下がる）。消えるときは縮める
//   - 「今日の使用量」の数字とバーは、カードが見えてから 0 → 値へ 900 ミリ秒で伸びる。値が変わったら今の位置から 600 ミリ秒で動く
//   - 「次のテスト」が近い（3日以内・期間中。child-view.ts の nextTestEmphasis）ときは、カードのまわりが2回だけゆっくり光る
//   - 端末の「動きを減らす」がオンなら、どれも動かさずに最後の形を出す
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { Banner, Reveal, RevealGroup, Screen } from "@/components";
import {
  LIMIT_REACHED_MESSAGE,
  nextTestEmphasis,
  nextTestView,
  permissionGuide,
  shouldOpenLimitScreen,
  staleNotice,
  usageView,
} from "@/components/child/child-view";
import { NextTestCard } from "@/components/child/NextTestCard";
import { PermissionGuideCard } from "@/components/child/PermissionGuideCard";
import { UsageSummaryCard } from "@/components/child/UsageSummaryCard";
import { useChildData } from "@/lib/child-data";
import { native } from "@/lib/native";

export default function ChildHome() {
  const { config, calc, test, blank, today, permissions, refresh } = useChildData();
  const view = usageView(calc, blank);
  const stale = staleNotice(config);
  // 子11 を出した日。タブの画面は出たままなので、ここに覚えておけば「閉じる」で戻ったときに出し直さない
  const shownFor = useRef<string | null>(null);

  // ホームが見えている間に上限に達したら、子11 へ進む（C4）。見えていない間は進まない（ほかのタブの操作を邪魔しない）
  useFocusEffect(
    useCallback(() => {
      if (!shouldOpenLimitScreen(calc, today, shownFor.current)) return;
      shownFor.current = today;
      native.showLimitReached(); // Kotlin がないときは何もしない（false）。画面の中の案内は下の push で必ず出す
      router.push("/child/limit-reached");
    }, [calc, today]),
  );

  const onAction = (kind: "permission" | "retry") => {
    if (kind === "permission") native.openPermissionSettings("usageAccess");
    else void refresh();
  };

  const reached = view.kind === "percent" && view.reached;
  const guide = permissionGuide(permissions, native.available);
  // 画面を開いたときに出す順番（見えているものだけを上から数える。出ていない帯の分は詰める）
  const order = { stale: reached ? 1 : 0, usage: (reached ? 1 : 0) + (stale ? 1 : 0) };

  return (
    <Screen title="Slope" bottomInset={false}>
      <RevealGroup>
        <Reveal index={0} show={reached}>
          <Banner icon="block" message={LIMIT_REACHED_MESSAGE} />
        </Reveal>
        {/* 消えていく間は、Reveal が消える前の帯を描き続ける */}
        <Reveal index={order.stale} show={stale != null}>
          {stale && <Banner tone="warning" icon="cloud_off" message={stale.message} hint={stale.hint} />}
        </Reveal>
        <Reveal index={order.usage}>
          <UsageSummaryCard view={view} onDetail={() => router.navigate("/child/usage")} onAction={onAction} />
        </Reveal>
        <Reveal index={order.usage + 1}>
          <NextTestCard view={nextTestView(config, test)} emphasis={nextTestEmphasis(test)} />
        </Reveal>
        <Reveal index={order.usage + 2} show={guide.length > 0}>
          <PermissionGuideCard items={guide} onOpen={(permission) => native.openPermissionSettings(permission)} />
        </Reveal>
      </RevealGroup>
    </Screen>
  );
}
