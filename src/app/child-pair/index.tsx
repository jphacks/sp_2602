// KIT-STUB: 契約と一緒に lead が置いた仮の画面。担当者が本物に置き換えるときはこの行ごと書き換える。
import { tokens } from "@contracts/tokens";
import { StyleSheet, Text, View } from "react-native";

export default function Screen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>「child-pair」は準備中です</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: tokens.space[4] },
  text: { fontSize: tokens.font.base, color: tokens.color.muted },
});
