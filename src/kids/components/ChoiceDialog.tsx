// tmp/animations/rnweb/whiteboard/components/ChoiceDialog.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 「1つを選ぶ」ダイアログの共通の形（子06 テーマカラーの変更・子07 から開く「配色の変更」の2つが使う）。
// 中身の決め方（選択肢・色見本・選んだときにすること）は呼ぶ側（ThemeDialog・ColorSchemeDialog）、形と動きはここ:
//   - 1行ずつ手で4辺を引いた枠（高さ 56・角 8）。左に色見本の丸（直径 28＋ ink 1 の線）、真ん中に名前（16）
//   - 選んでいる行は線を太く（2.3 → 3.2 を 200ms で）＋右にチェックを引く（200ms）。動きを減らすなら、すぐ最後の形
//   - 押すとすぐ onSelect（閉じない。選び直しは閉じずにできる）。OK は文字だけのボタンで、押すと閉じる
// 行の枠の揺れの種は seedOf(key, 23)（ThemeDialog の行の key はテーマの名前のまま。前と同じ揺れで描くため）。
//   <ChoiceDialog visible title="配色の変更" onClose={…} selected="green" onSelect={…}
//     options={[{ key: "red", label: "赤", swatch: "#D42A45" }, …]} />
import { tokens } from "@contracts/tokens";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useReducedMotion } from "@/lib/motion";
import { makeStyles, useColors } from "@/lib/theme";
import { seedOf, useSize, useTool } from "../tools";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

// swatch がないときは、今のモードの地の色で丸を描く
export type Choice = { key: string; label: string; swatch?: string };

export function ChoiceDialog({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly Choice[];
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <Dialog
      visible={visible}
      title={title}
      centered
      onClose={onClose}
      actions={<Button variant="pill" label="OK" onPress={onClose} />}
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {options.map((o) => (
          <ChoiceOption key={o.key} choice={o} selected={o.key === selected} onPress={() => onSelect(o.key)} />
        ))}
      </View>
    </Dialog>
  );
}

function ChoiceOption({ choice, selected, onPress }: { choice: Choice; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  const c = useColors();
  const reduced = useReducedMotion();
  const { FrameLine, Check, values } = useTool();
  const [{ w, h }, onLayout] = useSize();
  const v = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(selected ? 1 : 0);
      return;
    }
    const a = Animated.timing(v, {
      toValue: selected ? 1 : 0,
      duration: values.timing.select,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [selected, reduced, v, values]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={choice.label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.option, { borderRadius: values.frame.radius }, pressed && styles.pressed]}
      onLayout={onLayout}
    >
      <View style={[styles.swatch, { backgroundColor: choice.swatch ?? c.bg, borderColor: c.text }]} />
      <View style={styles.text}>
        <AppText variant="body">{choice.label}</AppText>
      </View>
      {/* チェックは選んでいるときだけ。選んだ瞬間に 200ms で引く（開いたときから選んでいる行も、開いたときに引く） */}
      <View style={styles.check}>
        {selected && <Check size={tokens.size.icon} start delay={0} duration={values.timing.select} />}
      </View>
      {w > 0 && <FrameLine w={w} h={h} seed={seedOf(choice.key, 23)} emphasis={v} kind="field" />}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    list: { gap: tokens.space[3] },
    option: {
      minHeight: tokens.size.button,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[4],
      paddingHorizontal: tokens.space[4],
    },
    pressed: { backgroundColor: c.surfaceDim },
    // 色見本は直径 28 の丸に ink 1 の線（Figma 子06）。色は呼ぶ側が決める
    swatch: { width: 28, height: 28, borderRadius: tokens.radius.pill, borderWidth: 1 },
    text: { flex: 1 },
    check: { width: tokens.size.icon, height: tokens.size.icon },
  }),
);
