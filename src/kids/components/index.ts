// tmp/animations/rnweb/whiteboard/components/index.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 共通の部品の入口（ホワイトボード）。アプリの src/components/index.ts と同じ名前を全部出す。
// 見た目を変えた部品はこのフォルダのもの、見た目を変えない部品（PopIn・Reveal など）はアプリの元の部品をそのまま出す。
// 画面は今までどおり `import { Screen, Card, Button } from "@/components";` で使う（画面のコードは1行も変えない）。

export { PopIn } from "@/components/PopIn";
export { FadeIn, Reveal, RevealGroup, useRevealDelay } from "@/components/Reveal";
export { AppText, type TextTone, type TextVariant } from "./AppText";
export { Banner } from "./Banner";
export { type Bar, BarChart, Legend } from "./BarChart";
export { Button } from "./Button";
export { Card } from "./Card";
export { Chip } from "./Chip";
// 配色の変更（子ども用の見た目だけ。アプリの src/components/index.ts も kids-switch.tsx を通して同じ名前を出す）
export { ColorSchemeDialog } from "./ColorSchemeDialog";
export { DateField } from "./DateField";
export { Dialog } from "./Dialog";
export { ErrorBanner } from "./ErrorBanner";
export { Gauge } from "./Gauge";
export { Icon, type IconName } from "./Icon";
export { IconBadge } from "./IconBadge";
export { ListItem } from "./ListItem";
export { LogoutListItem } from "./LogoutListItem";
export { MessageView } from "./MessageView";
export { ProgressBar } from "./ProgressBar";
export { Screen } from "./Screen";
export { configViewState, StateView, type ViewState } from "./StateView";
export { TabIcon, useTabBarOptions } from "./TabIcon";
export { TextField } from "./TextField";
export { ThemeDialog } from "./ThemeDialog";
