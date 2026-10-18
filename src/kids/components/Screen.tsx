// tmp/animations/rnweb/whiteboard/components/Screen.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 画面の枠（ホワイトボード）。props と動きはアプリの Screen（src/components/Screen.tsx）と同じ
// （上のバー 64・左右 24 の本文・下に固定する footer・キーボードを避ける決まり）。
// 形（Figma 34:2138）:
//   - 地はほうろうの白板（bg）
//   - 題名は見出しの書体 Yusei Magic 22（x=16）。戻るボタンは手描きの arrow_back
//   - 題名が「Slope」のときはアプリ名の形: Londrina Solid 30 の「Slope」＋ Yusei Magic 16 の muted の「（子）」（Figma 子01・子08・子13〜子19）。
//     「（子）」「（親）」は、今の画面の場所（/child・/pair/child・/login → 子、/parent・/pair/parent → 親）か、ログインしている人の役割で決める。
//     役割がまだ決まっていない入口（入01 起動中・入02 役割選び）は「Slope」だけ
import { tokens } from "@contracts/tokens";
import { usePathname } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { AppState, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nextKeyboardAvoid } from "@/components/keyboard-avoid";
import { Text, TextInput } from "@/kids/lib/text";
import { useSession } from "@/lib/session";
import { makeStyles, useColors } from "@/lib/theme";
import { makeToolStyles, useTool } from "../tools";
import { AppText } from "./AppText";
import { ButtonContext } from "./Button";
import { Icon } from "./Icon";

// キーボードを避けるのを効かせるか（決まりは keyboard-avoid.ts。アプリと同じ）
function useKeyboardAvoid(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setEnabled((cur) =>
        nextKeyboardAvoid(cur, { kind: "show", focusedInput: TextInput.State.currentlyFocusedInput() != null }),
      ),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setEnabled((cur) => nextKeyboardAvoid(cur, { kind: "hide" })),
    );
    const app = AppState.addEventListener("change", (s) =>
      setEnabled((cur) => nextKeyboardAvoid(cur, { kind: "appState", active: s === "active" })),
    );
    return () => {
      show.remove();
      hide.remove();
      app.remove();
    };
  }, []);
  return enabled;
}

type Props = {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  bottomInset?: boolean;
  children?: ReactNode;
};

// アプリ名の横の「（子）」「（親）」
function useWho(): string | null {
  const path = usePathname() ?? "";
  const { state } = useSession();
  if (/^\/(child|pair\/child|login)(\/|$)/.test(path)) return "（子）";
  if (/^\/(parent|pair\/parent)(\/|$)/.test(path)) return "（親）";
  if (state.status === "signedIn") {
    if (state.session.role === "child") return "（子）";
    if (state.session.role === "parent") return "（親）";
  }
  return null;
}

export function Screen({ title, onBack, right, footer, scroll = true, bottomInset = true, children }: Props) {
  const avoidKeyboard = useKeyboardAvoid();
  const colorStyles = useColorStyles();
  const c = useColors();
  const who = useWho();
  const brandText = useBrandStyles();
  const { Backdrop, TitleGrain } = useTool();
  const brand = title === "Slope";
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.root, colorStyles.root]} edges={bottomInset ? ["top", "bottom"] : ["top"]}>
      {/* 道具によっては画面の地に模様（ノートの罫線・黒板の粒）。ホワイトボードはなし */}
      {Backdrop && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Backdrop />
        </View>
      )}
      <View style={[styles.appBar, brand && styles.appBarBrand]}>
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="戻る"
            hitSlop={tokens.space[3]}
            style={styles.back}
          >
            <Icon name="arrow_back" color={c.text} />
          </Pressable>
        )}
        <View style={styles.title}>
          {brand ? (
            // 読み上げは「Slope（子）」をひとまとまりに
            <View
              style={styles.brandRow}
              accessibilityRole="header"
              accessible
              accessibilityLabel={`Slope${who ?? ""}`}
            >
              <Text style={[brandText.brand, { color: c.text }]}>Slope</Text>
              {who && <Text style={[brandText.who, { color: c.muted }]}>{who}</Text>}
            </View>
          ) : (
            <AppText variant="headline" numberOfLines={1} accessibilityRole="header">
              {title}
            </AppText>
          )}
        </View>
        {right}
        {/* 道具によっては、上のバーの字の上に粒（黒板＝チョークの字のかすれ）。押す操作は通す */}
        {TitleGrain && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <TitleGrain />
          </View>
        )}
      </View>
      {/* Android 15 以降は、Slope の入力欄にフォーカスがあるときだけ、キーボードの高さだけ下を空けて本文を縮める（アプリと同じ） */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding" enabled={avoidKeyboard}>
        <View style={styles.fill}>{body}</View>
        {footer && (
          <ButtonContext.Provider value={{ center: true }}>
            <View style={styles.footer}>{footer}</View>
          </ButtonContext.Provider>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  appBar: {
    height: tokens.size.appBar,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.space[4],
    gap: tokens.space[4],
  },
  // Figma 子01: 「Slope」は上から 14、（子）は文字の下の線にそろえる
  appBarBrand: { alignItems: "flex-start", paddingTop: 14 },
  back: { minWidth: tokens.size.icon, minHeight: tokens.size.touch, justifyContent: "center" },
  title: { flex: 1 },
  brandRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  // flexGrow: 中身が少ないときも本文が画面の下まで広がる（空・読み込み中の StateView を真ん中に置けるように。Figma 子10-B・入01）
  content: {
    flexGrow: 1,
    paddingHorizontal: tokens.layout.gutter,
    paddingTop: tokens.layout.contentTop,
    paddingBottom: tokens.layout.bottomGap,
    gap: tokens.layout.cardGap,
  },
  // Figma 子03・子05: 下に縦に並ぶボタンの間は 8（アプリの 16 より詰める）
  footer: {
    paddingHorizontal: tokens.layout.gutter,
    paddingBottom: tokens.layout.bottomGap,
    gap: tokens.space[2],
  },
});

// 色だけはテーマで変わるので分けて持つ
const useColorStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { backgroundColor: c.bg },
  }),
);

// アプリ名「Slope」（大きな数字の書体）と「（子）」（見出しの書体）。書体は今の道具のもの
const useBrandStyles = makeToolStyles(({ fonts }) =>
  StyleSheet.create({
    brand: { fontFamily: fonts.number, fontWeight: "900", fontSize: 30, lineHeight: 35, letterSpacing: 0.3 },
    who: { fontFamily: fonts.heading, fontWeight: fonts.headingWeight ?? "400", fontSize: 16, lineHeight: 23 },
  }),
);
