// 部品の出方・消え方（アニメーション）。子01 ホームのカードや帯に使う。いつ・どう出すかの決め方は reveal-timing.ts。
//   <RevealGroup>
//     <Reveal index={0} show={reached}><Banner … /></Reveal>   … 後から出たら高さを広げて入れ、消えるときは縮めてから消す
//     <Reveal index={1}><UsageSummaryCard … /></Reveal>          … 画面を開いたときは上から順に、下からふわっと出す
//   </RevealGroup>
// 決まり（src/lib/motion.ts の冒頭と同じ）:
//   - 画面を開いたときに1回だけ出す。30 秒ごとの取り直しで描き直されても、もう一度は出さない（出たまま描き直すだけ）
//   - 端末の「動きを減らす」がオンなら、動かさずに最後の形を出す（消えるときもすぐ消す）
//   - 動いている間も中のボタン・カードはすぐ押せる（透けていても押せる。終わりを待たせない）
// 透明度と上下のずれは端末側（useNativeDriver）で動かし、JS が忙しくてもカクつかないようにする。
// 高さは端末側では動かせないので、外側の箱だけ JS で動かす（同じ箱に両方を混ぜると React Native がエラーにするため、箱を2つに分ける）。
import { tokens } from "@contracts/tokens";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent, type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";
import { leadDelay, planReveal } from "./reveal-timing";

// カードは棒グラフの棒より大きいので、motion.stagger（60）より少しだけ間をあける（順に出ているのが分かるくらい）
const CARD_STAGGER = 80;
// 画面を開いてから、この時間までに出たもの（すぐ読める端末の保存分・権限）は「最初の出方」の順番に入れる
const ENTRANCE_WINDOW = motion.duration.medium;

type Group = { startedAt: number };
const GroupContext = createContext<Group | null>(null);
// 中の部品が「自分のカードがいつ見え始めるか」を知るため（進捗バーを、カードが見えてから伸ばす）
const VisibleAtContext = createContext<number | null>(null);

// 画面を開いた時刻を覚える。中の Reveal は、この時刻からの順番で出てくる
export function RevealGroup({ children }: { children: ReactNode }) {
  const [group] = useState<Group>(() => ({ startedAt: Date.now() }));
  return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>;
}

// flow = ふつうに並んでいる（最初の出方の途中を含む）/ expanding・collapsing = 高さを動かしている / hidden = 出していない
type Phase = "flow" | "expanding" | "collapsing" | "hidden";

type Props = {
  index?: number; // 画面を開いたときに見えているものの中で、上から何番目か
  show?: boolean; // false にすると縮めてから消す（既定 true）
  gap?: number; // 並びの間隔（Screen の本文は tokens.layout.cardGap）。高さ 0 のときに間隔の分も詰めるのに使う
  children: ReactNode;
};

export function Reveal({ index = 0, show = true, gap = tokens.layout.cardGap, children }: Props) {
  const group = useContext(GroupContext);
  const reduced = useReducedMotion();

  // 最初の描画で、出方を1回だけ決める（あとから描き直されても変えない）
  const [initial] = useState(() => {
    const now = Date.now();
    const plan = planReveal({
      groupStartedAt: group?.startedAt ?? now,
      now,
      index,
      stagger: CARD_STAGGER,
      window: ENTRANCE_WINDOW,
    });
    return { plan, now };
  });
  const firstPhase: Phase = !show ? "hidden" : initial.plan.mode === "entrance" ? "flow" : "expanding";
  const [phase, setPhase] = useState<Phase>(firstPhase);
  const [entrance, setEntrance] = useState<{ delay: number } | null>(
    show && initial.plan.mode === "entrance" ? { delay: initial.plan.delay } : null,
  );
  const [visibleAt, setVisibleAt] = useState(
    initial.plan.mode === "entrance" ? initial.now + initial.plan.delay : initial.now,
  );
  const [height, setHeight] = useState(0);
  const enter = useRef(new Animated.Value(0)).current; // 透明度・上下のずれ（端末側で動かす）
  const size = useRef(new Animated.Value(0)).current; // 高さ（JS で動かす）

  // 消えていく間は、消える前の中身を描き続ける（呼ぶ側は show=false のとき中身を null にしてよい）
  const last = useRef(children);
  if (show) last.current = children;

  // show が変わったとき
  const prevShow = useRef(show);
  const everShown = useRef(show);
  useEffect(() => {
    if (prevShow.current === show) return;
    prevShow.current = show;
    const now = Date.now();
    if (show) {
      // 画面を開いてすぐ（権限が読めた直後など）なら最初の出方の順番に入れる。それより後なら高さを広げて入れる
      const plan = everShown.current
        ? ({ mode: "expand" } as const)
        : planReveal({
            groupStartedAt: group?.startedAt ?? now,
            now,
            index,
            stagger: CARD_STAGGER,
            window: ENTRANCE_WINDOW,
          });
      everShown.current = true;
      if (phase === "hidden") {
        enter.setValue(0);
        size.setValue(0);
      }
      if (plan.mode === "entrance") {
        setVisibleAt(now + plan.delay);
        setEntrance({ delay: plan.delay });
        setPhase("flow");
      } else {
        setVisibleAt(now);
        setPhase("expanding");
      }
    } else if (phase !== "hidden") {
      if (phase === "flow") size.setValue(1); // 並んでいる高さから縮める
      setEntrance(null);
      setPhase("collapsing");
    }
  }, [show, phase, group, index, enter, size]);

  // 最初の出方: 下から少し上がりながら、透明から見えるようにする
  useEffect(() => {
    if (!entrance) return;
    if (reduced) {
      enter.stopAnimation();
      enter.setValue(1);
      return;
    }
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: motion.duration.medium,
      delay: entrance.delay,
      easing: motion.easing.enter,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setEntrance(null);
    });
    return () => anim.stop();
  }, [entrance, reduced, enter]);

  // 後から出たもの: 高さが分かってから、0 から広げる（下のカードはその分だけなめらかに下がる）
  useEffect(() => {
    if (phase !== "expanding") return;
    if (reduced) {
      size.setValue(1);
      enter.setValue(1);
      setPhase("flow");
      return;
    }
    if (height === 0) return;
    const grow = Animated.timing(size, {
      toValue: 1,
      duration: motion.duration.medium,
      easing: motion.easing.enter,
      useNativeDriver: false,
    });
    const fade = Animated.timing(enter, {
      toValue: 1,
      duration: motion.duration.medium,
      easing: motion.easing.enter,
      useNativeDriver: true,
    });
    grow.start(({ finished }) => {
      if (finished) setPhase("flow");
    });
    fade.start();
    return () => {
      grow.stop();
      fade.stop();
    };
  }, [phase, height, reduced, size, enter]);

  // 消えるとき: 出るときより短く、縮めながら透明にする（Material 3: 出ていく動きは速く）
  useEffect(() => {
    if (phase !== "collapsing") return;
    if (reduced || height === 0) {
      setPhase("hidden");
      return;
    }
    const shrink = Animated.timing(size, {
      toValue: 0,
      duration: motion.duration.short,
      easing: motion.easing.exit,
      useNativeDriver: false,
    });
    const fade = Animated.timing(enter, {
      toValue: 0,
      duration: motion.duration.short,
      easing: motion.easing.exit,
      useNativeDriver: true,
    });
    shrink.start(({ finished }) => {
      if (finished) setPhase("hidden");
    });
    fade.start();
    return () => {
      shrink.stop();
      fade.stop();
    };
  }, [phase, height, reduced, size, enter]);

  const clipped = phase === "expanding" || phase === "collapsing";
  // 高さ・間隔は値で決まるので、ここだけ計算した style を使う（寸法は tokens のまま）
  const outer = useMemo(
    () =>
      clipped
        ? {
            height: size.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
            // 高さ 0 の間も並びの間隔（gap）は空いてしまうので、その分を下の余白で打ち消す
            marginBottom: size.interpolate({ inputRange: [0, 1], outputRange: [-gap, 0] }),
          }
        : null,
    [clipped, size, height, gap],
  );
  const inner = useMemo(() => {
    // 最初は下から上がる・後から出る帯は上から降りる（広がる向きと同じ）・消えるときはずらさない
    const from = phase === "expanding" ? -tokens.space[2] : phase === "collapsing" ? 0 : tokens.space[4];
    return {
      opacity: enter,
      transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
    };
  }, [phase, enter]);

  if (phase === "hidden") return null;

  const measure = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);
  return (
    <VisibleAtContext.Provider value={visibleAt}>
      <Animated.View style={[clipped && styles.clip, outer]} onLayout={clipped ? undefined : measure}>
        <Animated.View style={[clipped && styles.overlay, inner]} onLayout={clipped ? measure : undefined}>
          {show ? children : last.current}
        </Animated.View>
      </Animated.View>
    </VisibleAtContext.Provider>
  );
}

// 中の動き（進捗バーが伸びる・カードが光る）を、自分のカードが見え始めてから lead ミリ秒後に始めるための待ち時間。
// known が初めて true になった時点の値で固定する（あとで値が変わると useAnimatedNumber が動きをやり直してしまうため）。
// Reveal の外では 0（すぐ動かす）
export function useRevealDelay(known: boolean, lead: number): number {
  const visibleAt = useContext(VisibleAtContext);
  const frozen = useRef<number | null>(null);
  if (frozen.current == null && known) frozen.current = leadDelay(visibleAt, Date.now(), lead);
  return frozen.current ?? 0;
}

// 中身が入れ替わったとき（読み込み中 → 46 ％・案内の文）に、ぱっと切り替えずに短く透明から出す。
// 入れ替わりは呼ぶ側が key を変えて伝える（<FadeIn key={view.kind}>）
export function FadeIn({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.short,
      easing: motion.easing.standard,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced, opacity]);
  const fade = useMemo(() => ({ opacity }), [opacity]);
  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  // 高さを動かしている間は、中身を本来の高さで描いて（測って）、外の箱で切り取る
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
});
