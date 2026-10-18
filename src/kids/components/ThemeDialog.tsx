// tmp/animations/rnweb/whiteboard/components/ThemeDialog.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子06 テーマカラー変更ポップアップ（ホワイトボード）。props と動きはアプリの ThemeDialog（src/components/ThemeDialog.tsx）と同じ:
// 選択肢は theme-store の THEME_OPTIONS（今は「白色」「黒色」の2つ）。押すとすぐ setTheme。OK で閉じる（選び直しは閉じずにできる）。
// 形（Figma 子06・kids-design-round2.md 3 章）:
//   - 1行ずつ手で4辺を引いた枠（高さ 56・角 8）。左に色見本の丸（そのモードの地の色＋ ink 1 の線）、真ん中に名前（16）
//   - 選んでいる行は線を太く（2.3 → 3.2 を 200ms で）＋右にチェックを黒マーカーで引く（200ms）
//   - OK は文字だけのボタン（Dialog のボタンが1つのとき）
// Figma は選択肢が3つ（白色（ホワイトボード）・黒色（黒板）・ベージュ（ノート））だが、アプリの選択肢（theme-store.ts）は2つなので、
// 文言と数はアプリのまま（theme-store を勝手に変えない。README・報告に書いた）。
// 今のテーマが選択肢にない名前のときは、いちばん上（白色）を選んでいる形にする。
// 確認ページでは作り物の theme-store（stubs/lib/theme-store.ts）が Figma と同じ3つ（whiteboard・chalkboard・notebook）を返すので3行出る。
//   <ThemeDialog visible={open} onClose={() => setOpen(false)} />
import { tokens } from "@contracts/tokens";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { THEME_OPTIONS } from "@/kids/lib/theme-store";
import { useReducedMotion } from "@/lib/motion";
import { makeStyles, useColors, useTheme } from "@/lib/theme";
import { themeSwatch } from "../theme/tool";
import { seedOf, useSize, useTool } from "../tools";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export function ThemeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { name, setTheme } = useTheme();
  // 今のテーマが選択肢にない名前のときは、白色の仲間（いちばん上の選択肢）を選んでいる形にする
  const options: readonly { name: string; label: string }[] = THEME_OPTIONS;
  const current = options.some((o) => o.name === name) ? (name as string) : (options[0]?.name ?? "light");
  return (
    <Dialog
      visible={visible}
      title="テーマカラーの変更"
      centered
      onClose={onClose}
      actions={<Button variant="pill" label="OK" onPress={onClose} />}
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {THEME_OPTIONS.map((o) => (
          <ThemeOption
            key={o.name}
            name={o.name as string}
            label={o.label}
            selected={o.name === current}
            onPress={() => setTheme(o.name)}
          />
        ))}
      </View>
    </Dialog>
  );
}

function ThemeOption({
  name,
  label,
  selected,
  onPress,
}: {
  name: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
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
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.option, { borderRadius: values.frame.radius }, pressed && styles.pressed]}
      onLayout={onLayout}
    >
      <View style={[styles.swatch, { backgroundColor: themeSwatch[name] ?? c.bg, borderColor: c.text }]} />
      <View style={styles.text}>
        <AppText variant="body">{label}</AppText>
      </View>
      {/* チェックは選んでいるときだけ。選んだ瞬間に 200ms で引く（開いたときから選んでいる行も、開いたときに引く） */}
      <View style={styles.check}>
        {selected && <Check size={tokens.size.icon} start delay={0} duration={values.timing.select} />}
      </View>
      {w > 0 && <FrameLine w={w} h={h} seed={seedOf(name, 23)} emphasis={v} kind="field" />}
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
    // 色見本はテーマで変わらない、それぞれのモードの地の色（Figma 子06 は直径 28 の丸に ink 1 の線）
    swatch: { width: 28, height: 28, borderRadius: tokens.radius.pill, borderWidth: 1 },
    text: { flex: 1 },
    check: { width: tokens.size.icon, height: tokens.size.icon },
  }),
);
