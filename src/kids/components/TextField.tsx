// tmp/animations/rnweb/whiteboard/components/TextField.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 入力欄（ホワイトボード）。props はアプリの TextField（src/components/TextField.tsx）と同じ。useFieldStyles も同じ名前で出す。
// 形（Figma 子03・子03-B・kids-design-rules.md 3 章）:
//   - 今の道具の枠の線（useTool().FrameLine。ホワイトボードは手で4辺を引いた線・角 8）。高さ 64・左右 16。上に小さいラベル（12・muted）、下に値（16）。右のアイコンは ink
//   - 選んでいる欄（入力中）とエラーの欄は線を太く（ホワイトボードは 2.3 → 3.2）。太くなるのは values.timing.field（200ms）で
//   - エラーの文は欄のすぐ下に、warning のアイコン 14 ＋ BIZ UDPゴシック Bold 12（ink。赤は使わない）。高さを広げて 200ms で入る
//   - 入力した値は消さない（validation-error）
//   <TextField label="テストの名前" value={name} onChangeText={setName} trailingIcon="title" />
import { tokens } from "@contracts/tokens";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, type TextInputProps, View } from "react-native";
import { keepTailTogether } from "@/components/text-wrap";
import { Text, TextInput } from "@/kids/lib/text";
import { useReducedMotion } from "@/lib/motion";
import { makeStyles, useColors } from "@/lib/theme";
import { fonts } from "../theme/tool";
import { seedOf, useSize, useTool } from "../tools";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  error?: string | null;
  trailingIcon?: IconName;
};

export function TextField({ label, error, trailingIcon, ...input }: Props) {
  const styles = useStyles();
  const font = inputFont;
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <FieldBox seed={seedOf(label, 13)} strong={focused || !!error}>
        <View style={styles.text}>
          <AppText variant="caption" tone="muted">
            {label}
          </AppText>
          <TextInput
            {...input}
            accessibilityLabel={input.accessibilityLabel ?? label}
            placeholderTextColor={c.muted}
            cursorColor={c.primary}
            selectionColor={c.track}
            selectionHandleColor={c.primary}
            onFocus={(e) => {
              setFocused(true);
              input.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              input.onBlur?.(e);
            }}
            style={[styles.input, font.input]}
          />
        </View>
        {trailingIcon && <Icon name={trailingIcon} color={c.text} />}
      </FieldBox>
      <FieldError error={error} />
    </View>
  );
}

// 入力欄の枠（DateField も使う）。strong で線を太くする（200ms）
export function FieldBox({ seed, strong, children }: { seed: number; strong: boolean; children: ReactNode }) {
  const styles = useFieldStyles();
  const reduced = useReducedMotion();
  const { FrameLine, values } = useTool();
  const [{ w, h }, onLayout] = useSize();
  const v = useRef(new Animated.Value(strong ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(strong ? 1 : 0);
      return;
    }
    const a = Animated.timing(v, {
      toValue: strong ? 1 : 0,
      duration: values.timing.field,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [strong, reduced, v, values]);
  return (
    <View style={[styles.field, { borderRadius: values.frame.radius }]} onLayout={onLayout}>
      {children}
      {w > 0 && <FrameLine w={w} h={h} seed={seed} emphasis={v} kind="field" />}
    </View>
  );
}

// 欄の下のエラーの文。出るときは高さを 0 から広げる（200ms。下の欄がなめらかに下がる）
export function FieldError({ error }: { error?: string | null }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const { values } = useTool();
  const text = errorText;
  const [shown, setShown] = useState(error ?? null);
  const [h, setH] = useState(0);
  const v = useRef(new Animated.Value(error ? 1 : 0)).current;
  const first = useRef(true);
  const openedWithError = useRef(!!error).current;
  if (error && error !== shown) setShown(error);
  useEffect(() => {
    // 開いたときから出ているエラーは動かさない（最初の形）
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) {
      v.setValue(error ? 1 : 0);
      if (!error) setShown(null);
      return;
    }
    const a = Animated.timing(v, {
      toValue: error ? 1 : 0,
      duration: values.timing.field,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    a.start(({ finished }) => {
      if (finished && !error) setShown(null);
    });
    return () => a.stop();
  }, [error, reduced, v]);
  if (!shown) return null;
  return (
    <Animated.View
      style={{
        height: h ? v.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) : openedWithError ? undefined : 0,
        opacity: v,
        overflow: "hidden",
      }}
    >
      {/* 中身は自分の高さのまま描いて（測って）、外の箱で切り取る */}
      <View
        onLayout={(e) => setH(e.nativeEvent.layout.height)}
        style={errorStyles.row}
        accessibilityLiveRegion="polite"
      >
        <View style={errorStyles.icon}>
          <Icon name="warning" size={14} color={c.text} />
        </View>
        <Text style={[errorStyles.text, text.error, { color: c.text }]}>{keepTailTogether(shown)}</Text>
      </View>
    </Animated.View>
  );
}

// DateField などの「押すと選ぶ」入力欄でも同じ見た目にするため外に出す（アプリと同じ名前）。
// ホワイトボードでは線を手描きの枠（FieldBox）で引くので、ここは並びと余白だけ
export const useFieldStyles = makeStyles((_c) =>
  StyleSheet.create({
    field: {
      minHeight: tokens.size.field,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      paddingHorizontal: tokens.space[4],
    },
    fieldError: {},
  }),
);

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    wrap: { gap: tokens.space[1] },
    text: { flex: 1, justifyContent: "center", gap: 3 },
    // Android の TextInput は既定で左右に余白があり、ラベルと値の左端がずれるので 0 にする。
    // ブラウザの確認では、選んだときの青い枠を出さない（線を太くして伝える）
    input: {
      fontSize: tokens.font.base,
      lineHeight: 20,
      color: c.text,
      paddingVertical: tokens.space[0],
      paddingHorizontal: tokens.space[0],
      outlineStyle: "none",
    } as never,
  }),
);

const errorStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 4, paddingTop: 2, paddingLeft: 4 },
  icon: { paddingTop: 1 },
  text: { flex: 1, fontWeight: "700", fontSize: tokens.font.xs, lineHeight: 17 },
});

// 書体は本文の書体（太さはそれぞれのスタイルが決める）
const inputFont = StyleSheet.create({ input: { fontFamily: fonts.body.fontFamily } });
const errorText = StyleSheet.create({ error: { fontFamily: fonts.body.fontFamily } });
