// 「今日の使用量」の割合が出せないときの案内（制限なし・上限未設定・権限なし・取得不可）。子01・子02・子11 で使う。
// 文言と押したときの動き（設定を開く／取り直す）は child-view.ts の usageView が決める。ここは描くだけ。
//   <UsageMessage message={view.message} onAction={(kind) => …} />
import { tokens } from "@contracts/tokens";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Button, Icon } from "@/components";
import { UsageMessage as KidsUsageMessage } from "@/kids/components/child/UsageMessage";
import { useKidsUI } from "@/kids/KidsUI";
import { useColors } from "@/lib/theme";
import type { UsageMessage as Message } from "./child-view";

type Props = {
  message: Message;
  onAction: (kind: NonNullable<Message["action"]>["kind"]) => void;
  center?: boolean; // 子02 のようにカードの外で中央に置くとき
};

function ClassicUsageMessage({ message, onAction, center = false }: Props) {
  const c = useColors();
  const color = message.tone === "warning" ? c.warning : c.primary;
  return (
    <View style={[styles.box, center && styles.center]} accessibilityLiveRegion="polite">
      <View style={[styles.row, center && styles.rowCenter]}>
        <Icon name={message.icon} color={color} />
        <View style={center ? styles.textCenter : styles.text}>
          <AppText variant="title" tone={message.tone === "warning" ? "warning" : "primary"} center={center}>
            {message.title}
          </AppText>
          <AppText tone="muted" center={center}>
            {message.body}
          </AppText>
        </View>
      </View>
      {message.action && (
        <Button
          variant="outline"
          label={message.action.label}
          onPress={() => message.action && onAction(message.action.kind)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: tokens.space[4] },
  center: { alignItems: "stretch", paddingVertical: tokens.space[6] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space[3] },
  rowCenter: { flexDirection: "column", alignItems: "center" },
  text: { flex: 1, gap: tokens.space[1] },
  textCenter: { gap: tokens.space[1] },
});

// ── 子ども用の見た目への振り分け（決まりは ../kids-switch.tsx。この部品は画面がファイルを直接読むので、ここで振り分ける） ──

export function UsageMessage(p: ComponentProps<typeof ClassicUsageMessage>) {
  return useKidsUI() ? <KidsUsageMessage {...p} /> : <ClassicUsageMessage {...p} />;
}
