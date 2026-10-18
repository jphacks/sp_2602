// tmp/animations/rnweb/whiteboard/components/Icon.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// アイコン（ホワイトボード）。props と名前はアプリの Icon（src/components/Icon.tsx）と同じ。
// 形は Material ではなく、Figma の共通のアイコン部品 icon/*（手描きの Doodle の形）。theme/icons.json（theme/make-icons.mjs で作る）。
// アプリの名前（usage・register など）は Figma の名前（pie・calendar_add など）に読み替えてある。Figma にしかない形（phone・bell など）も使える。
// 右下に札（＋・鉛筆）があるアイコンは、札の丸をくり抜く（地を塗らないので、ペン置きのグラデーションの上でもボードの上でも同じに見える）。
//   <Icon name="event" />  <Icon name="home" color={c.muted} size={20} />
import { tokens } from "@contracts/tokens";
import { useId, useMemo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useColors } from "@/lib/theme";
import iconData from "../theme/icons.json";

const icons = iconData as Record<string, string>;

// アプリの Icon と同じ名前（src/components/Icon.tsx の paths のキー）
type AppIconName =
  | "home"
  | "usage"
  | "register"
  | "event"
  | "list"
  | "settings"
  | "plan"
  | "review"
  | "insights"
  | "edit"
  | "add"
  | "arrow_back"
  | "chevron_right"
  | "check"
  | "check_circle"
  | "error"
  | "info"
  | "block"
  | "clock"
  | "logout"
  | "apps"
  | "sync"
  | "cloud_off"
  | "camera"
  | "group"
  | "palette"
  | "lock"
  | "warning"
  | "login"
  | "qr_code"
  | "title"
  | "delete";
// Figma の共通のアイコン部品にだけある名前（ウィジェットの端末の側・ほかの担当の部品で使える）
type FigmaIconName =
  | "pie"
  | "calendar"
  | "calendar_add"
  | "edit_calendar"
  | "trend_down"
  | "pencil"
  | "user_add"
  | "close"
  | "question"
  | "shield"
  | "link"
  | "unlink"
  | "phone"
  | "bell"
  | "text_fields";
export type IconName = AppIconName | FigmaIconName;

const INK = /#1F2A24/g;

type Props = { name: IconName; size?: number; color?: string };

export function Icon({ name, size = tokens.size.icon, color }: Props) {
  const c = useColors();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = color ?? c.text;
  // 色と mask の id を差し替えた SVG（同じ名前・色なら作り直さない）
  const xml = useMemo(
    () => (icons[name] ?? icons.question ?? "").replace(INK, fill).replaceAll("__MASK__", `m${id}`),
    [name, fill, id],
  );
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
