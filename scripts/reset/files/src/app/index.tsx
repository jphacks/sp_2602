// 入口（lead の担当）。最初の画面ができたら、<Redirect href="/<画面id>" /> にする（expo-router の Redirect）。
import { tokens } from "@contracts/tokens";
import { StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>
        画面はまだありません。contracts/screens.md に画面を足して npm run kit:stub を実行してください。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: tokens.space[4] },
  text: { fontSize: tokens.font.base, color: tokens.color.muted },
});
