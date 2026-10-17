// 画面の枠。上のバー（高さ 64・題名・戻る）と、左右 24 の余白の本文、下に固定する主ボタンの場所（footer）を持つ。
// Figma: TopAppBar（戻るなしは題名 x=16、戻るありは x=56）、Content は上に 8 の余白、下端の主ボタンとの間に 24。
//   <Screen title="テスト日程の登録" footer={<Button label="登録する" onPress={save} />}>…</Screen>
//   <Screen title="アプリごとの利用時間" onBack={() => router.back()}>…</Screen>
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "./AppText";
import { Icon } from "./Icon";

type Props = {
  title: string;
  onBack?: () => void; // あれば左上に戻るボタンを出す
  right?: ReactNode; // 上のバーの右端（設定のアイコンなど）
  footer?: ReactNode; // 下に固定するもの（主ボタンなど）
  scroll?: boolean; // 本文をスクロールさせるか（既定 true）
  // タブのある画面では下の安全領域をタブが持つので false にする（既定 true = 下の安全領域も空ける）
  bottomInset?: boolean;
  children?: ReactNode;
};

export function Screen({ title, onBack, right, footer, scroll = true, bottomInset = true, children }: Props) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.root} edges={bottomInset ? ["top", "bottom"] : ["top"]}>
      <View style={styles.appBar}>
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="戻る"
            hitSlop={tokens.space[3]}
            style={styles.back}
          >
            <Icon name="arrow_back" />
          </Pressable>
        )}
        <View style={styles.title}>
          <AppText variant="headline" numberOfLines={1} accessibilityRole="header">
            {title}
          </AppText>
        </View>
        {right}
      </View>
      {/* Android 15 以降は画面が端まで広がるため、キーボードが出ても画面が縮まず、下の入力欄がキーボードに隠れる
          （実機 SC-53C・Android 16 で親02 の「最終目標」が隠れた）。キーボードの高さだけ下を空けて、本文を縮める */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <View style={styles.fill}>{body}</View>
        {footer && <View style={styles.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  fill: { flex: 1 },
  appBar: {
    height: tokens.size.appBar,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.space[4],
    gap: tokens.space[4],
  },
  back: { minWidth: tokens.size.icon, minHeight: tokens.size.touch, justifyContent: "center" },
  title: { flex: 1 },
  content: {
    paddingHorizontal: tokens.layout.gutter,
    paddingTop: tokens.layout.contentTop,
    paddingBottom: tokens.layout.bottomGap,
    gap: tokens.layout.cardGap,
  },
  footer: {
    paddingHorizontal: tokens.layout.gutter,
    paddingBottom: tokens.layout.bottomGap,
    gap: tokens.layout.cardGap,
  },
});
