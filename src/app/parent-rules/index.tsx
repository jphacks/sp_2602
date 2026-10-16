// 制限ルール（保護者）の空の画面（画面 id: parent-rules）。中身は front-b が作る。
import { tokens } from "@contracts/tokens";
import { StyleSheet, Text, View } from "react-native";

export default function Screen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>制限ルール（保護者）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space[6],
    backgroundColor: tokens.color.bg,
  },
  title: {
    fontSize: tokens.font.lg,
    color: tokens.color.text,
  },
});
