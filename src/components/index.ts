// 共通の部品の入口。画面は `import { Screen, Card, Button } from "@/components";` のように使う。
// 見た目はすべて contracts/tokens.ts の名前だけで作ってある。色は今のテーマ（src/lib/theme.tsx）から引く。部品を足したらここにも1行足す。
// 見た目の部品は kids-switch.tsx を通して出す（子ども用の見た目の中なら新しい部品 src/kids/components、外なら今の部品）。
// 見た目を変えない部品（PopIn・Reveal）と計算（configViewState）は、今のものをそのまま出す。
export type { TextTone, TextVariant } from "./AppText";
export type { Bar } from "./BarChart";
export type { IconName } from "./Icon";
export {
  AppText,
  Banner,
  BarChart,
  Button,
  Card,
  Chip,
  DateField,
  Dialog,
  ErrorBanner,
  Gauge,
  Icon,
  IconBadge,
  Legend,
  ListItem,
  LogoutListItem,
  MessageView,
  ProgressBar,
  Screen,
  StateView,
  TextField,
  ThemeDialog,
} from "./kids-switch";
export { PopIn } from "./PopIn";
export { FadeIn, Reveal, RevealGroup, useRevealDelay } from "./Reveal";
export { configViewState, type ViewState } from "./StateView";
export { TabIcon, useTabBarOptions } from "./TabIcon";
