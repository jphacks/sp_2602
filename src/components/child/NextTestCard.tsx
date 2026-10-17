// 「次のテスト」のカード（Figma 子01・子11 の NextTest。薄い青の地・紺の文字・左にカレンダー）。
// 「10月28日（水） 数学」「あと13日」／期間中は「テスト中」／0件は「予定なし」／取れないときは「--」。文言は child-view.ts の nextTestView。
//   <NextTestCard view={nextTestView(config, test)} />
import { tokens } from "@contracts/tokens";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText, Card, Icon } from "@/components";
import type { NextTestView } from "./child-view";

export function NextTestCard({ view }: { view: NextTestView }) {
  return (
    <Card tone="soft">
      <View style={styles.row}>
        <Icon name="event" size={tokens.size.iconLarge} color={tokens.color.onPrimarySoft} />
        <View style={styles.text}>
          <AppText variant="caption" tone="onPrimarySoft">
            次のテスト
          </AppText>
          {view.kind === "loading" ? (
            <ActivityIndicator color={tokens.color.onPrimarySoft} />
          ) : (
            <>
              <AppText variant="title" tone="onPrimarySoft">
                {view.headline}
              </AppText>
              <AppText tone="onPrimarySoft">{view.detail}</AppText>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[4] },
  text: { flex: 1, gap: tokens.space[1] },
});
