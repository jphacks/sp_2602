// 子01 ホームの「見守りのための許可」のカード（C4。Figma にない。実機で案内を出すには OS の許可が要るので足した）。
// まだ許可していないもの（ほかのアプリの上に表示・通知・電池の最適化・ユーザー補助）を並べ、押すとその設定画面を開く。
// ユーザー補助は、保護者が制限する Web サイトを登録しているときだけ並ぶ（D-111。child-view.ts の permissionGuide）。
// 何を出すかは child-view.ts の permissionGuide が決める（全部許可済みなら items が空で、このカードは出ない）。
// 設定画面で許可して戻ってくると、child-data.tsx の refresh が権限を読み直して、その行が消える。
//   <PermissionGuideCard items={permissionGuide(permissions, native.available, config)} onOpen={(p) => native.openPermissionSettings(p)} />
import type { NativePermission } from "@contracts/native";
import { tokens } from "@contracts/tokens";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Card, ListItem } from "@/components";
import { PermissionGuideCard as KidsPermissionGuideCard } from "@/kids/components/child/PermissionGuideCard";
import { useKidsUI } from "@/kids/KidsUI";
import type { PermissionGuideItem } from "./child-view";

type Props = { items: readonly PermissionGuideItem[]; onOpen: (permission: NativePermission) => void };

function ClassicPermissionGuideCard({ items, onOpen }: Props) {
  if (items.length === 0) return null;
  return (
    <Card>
      <View style={styles.head}>
        <AppText variant="title">見守りのための許可</AppText>
        <AppText tone="muted">時間が終わったときに案内を出すために、次の設定をオンにしてください</AppText>
      </View>
      {items.map((item) => (
        <ListItem
          key={item.permission}
          icon="lock"
          title={item.title}
          subtitle={item.body}
          onPress={() => onOpen(item.permission)}
          accessibilityLabel={`${item.title}の設定を開く`}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: tokens.space[1] },
});

// ── 子ども用の見た目への振り分け（決まりは ../kids-switch.tsx。この部品は画面がファイルを直接読むので、ここで振り分ける） ──

export function PermissionGuideCard(p: ComponentProps<typeof ClassicPermissionGuideCard>) {
  return useKidsUI() ? <KidsPermissionGuideCard {...p} /> : <ClassicPermissionGuideCard {...p} />;
}
