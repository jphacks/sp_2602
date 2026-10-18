// tmp/animations/rnweb/whiteboard/marker/Measured.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 文字を測ってから印を描くための入れ物（確認ページ parts.tsx の Measured と同じ）。
// 印（下線・ちょん）は文字の上に重ねて、文字の幅と高さに合わせる。
//   <Measured mark={(w, h) => <MarkerUnderline w={w} h={h} start={open} />}><Text>10月28日（水）</Text></Measured>
import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { useSize } from "./draw";

export function Measured({
  children,
  mark,
  style,
}: {
  children: ReactNode;
  mark: (w: number, h: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [size, onLayout] = useSize();
  return (
    <View onLayout={onLayout} style={[{ alignSelf: "flex-start" }, style]}>
      {/* 印は文字の後ろに置く（蛍光ペンが文字の下に入るように。下線・ちょんは文字と重ならない） */}
      {mark(size.w, size.h)}
      {children}
    </View>
  );
}
