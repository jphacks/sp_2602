// 見た目の部品の振り分け: 子ども用の見た目の中（src/kids/KidsUI.tsx の KidsUIProvider）なら新しい部品（src/kids/components）、
// そうでなければ今の部品（このフォルダ）で描く。props の型は今の部品と同じ（画面のコードは変えない）。
// 画面は今までどおり `import { Button } from "@/components";`（index.ts がここを出す）。
// 日程の部品は schedule/kids-switch.tsx、QR・連携の部品は pair/kids-switch.tsx で同じように振り分ける（schedule/index.ts・pair/index.ts が出す）。
// 画面が部品のファイルを直接読むもの（TabIcon.tsx・child/*.tsx）は、そのファイルの中で同じように振り分けている。
// 決まり:
//   - import の輪を作らない。ここは index.ts から読まれるので、"@/components"（index.ts）を読む部品をここで読まない
//     （schedule/・pair/ の今の部品は中で "@/components" を読むので、それぞれのフォルダの kids-switch.tsx に分けてある）。
//     輪があると、読み込みの途中で部品が空のまま使われることがある。tests/kids/import-cycles.test.ts で確かめる
//   - 新しい部品は描くときに読む（<Kids.Button /> を関数の中に書く）。ファイルを読み込む時に参照しない
//   - useKidsUI() は毎回、同じ順番で呼ぶ（hooks の決まり）。hooks（useTabBarOptions）は両方を呼んでから選ぶ
//   - 保護者の画面だけで使う部品（PeriodManager・ParentChildGate・QrScanner）は振り分けない（いつも今の部品。
//     PeriodManager は中で ./PeriodEditor などの今の部品を直接読むので、保護者の日程の画面は今の見た目のまま）
import type { ComponentProps } from "react";
import * as Kids from "@/kids/components";
import { useKidsUI } from "@/kids/KidsUI";
import { AppText as ClassicAppText } from "./AppText";
import { Banner as ClassicBanner } from "./Banner";
import { BarChart as ClassicBarChart, Legend as ClassicLegend } from "./BarChart";
import { Button as ClassicButton } from "./Button";
import { Card as ClassicCard } from "./Card";
import { Chip as ClassicChip } from "./Chip";
import { DateField as ClassicDateField } from "./DateField";
import { Dialog as ClassicDialog } from "./Dialog";
import { ErrorBanner as ClassicErrorBanner } from "./ErrorBanner";
import { Gauge as ClassicGauge } from "./Gauge";
import { Icon as ClassicIcon } from "./Icon";
import { IconBadge as ClassicIconBadge } from "./IconBadge";
import { ListItem as ClassicListItem } from "./ListItem";
import { LogoutListItem as ClassicLogoutListItem } from "./LogoutListItem";
import { MessageView as ClassicMessageView } from "./MessageView";
import { ProgressBar as ClassicProgressBar } from "./ProgressBar";
import { Screen as ClassicScreen } from "./Screen";
import { StateView as ClassicStateView } from "./StateView";
import { TextField as ClassicTextField } from "./TextField";
import { ThemeDialog as ClassicThemeDialog } from "./ThemeDialog";

// アイコンの名前の型の読み替え。アプリの Icon（./Icon）には、新しい部品の Icon にまだない名前がある
// （language: 保護者の「制限する Web サイト」。D-111。保護者の画面は今の部品で描くので、新しい部品には渡らない）。
// 名前のほかは同じ props なので、型だけ新しい部品の props として渡す（新しい部品は、知らない名前を question の形で描く）。
// src/kids は写したもの（直さない）なので、ここで読み替える。新しい部品の元にその形ができたら、写し直せば読み替えは要らなくなる
export type KidsProps<C> = C extends (props: infer P) => unknown ? P : never;

// ── 共通の部品（index.ts） ──

export function AppText(p: ComponentProps<typeof ClassicAppText>) {
  return useKidsUI() ? <Kids.AppText {...p} /> : <ClassicAppText {...p} />;
}
export function Banner(p: ComponentProps<typeof ClassicBanner>) {
  return useKidsUI() ? <Kids.Banner {...(p as KidsProps<typeof Kids.Banner>)} /> : <ClassicBanner {...p} />;
}
export function BarChart(p: ComponentProps<typeof ClassicBarChart>) {
  return useKidsUI() ? <Kids.BarChart {...p} /> : <ClassicBarChart {...p} />;
}
export function Legend(p: ComponentProps<typeof ClassicLegend>) {
  return useKidsUI() ? <Kids.Legend {...p} /> : <ClassicLegend {...p} />;
}
export function Button(p: ComponentProps<typeof ClassicButton>) {
  return useKidsUI() ? <Kids.Button {...(p as KidsProps<typeof Kids.Button>)} /> : <ClassicButton {...p} />;
}
export function Card(p: ComponentProps<typeof ClassicCard>) {
  return useKidsUI() ? <Kids.Card {...p} /> : <ClassicCard {...p} />;
}
export function Chip(p: ComponentProps<typeof ClassicChip>) {
  return useKidsUI() ? <Kids.Chip {...(p as KidsProps<typeof Kids.Chip>)} /> : <ClassicChip {...p} />;
}
export function DateField(p: ComponentProps<typeof ClassicDateField>) {
  return useKidsUI() ? <Kids.DateField {...p} /> : <ClassicDateField {...p} />;
}
export function Dialog(p: ComponentProps<typeof ClassicDialog>) {
  return useKidsUI() ? <Kids.Dialog {...(p as KidsProps<typeof Kids.Dialog>)} /> : <ClassicDialog {...p} />;
}
export function ErrorBanner(p: ComponentProps<typeof ClassicErrorBanner>) {
  return useKidsUI() ? <Kids.ErrorBanner {...p} /> : <ClassicErrorBanner {...p} />;
}
export function Gauge(p: ComponentProps<typeof ClassicGauge>) {
  return useKidsUI() ? <Kids.Gauge {...p} /> : <ClassicGauge {...p} />;
}
export function Icon(p: ComponentProps<typeof ClassicIcon>) {
  return useKidsUI() ? <Kids.Icon {...(p as KidsProps<typeof Kids.Icon>)} /> : <ClassicIcon {...p} />;
}
export function IconBadge(p: ComponentProps<typeof ClassicIconBadge>) {
  return useKidsUI() ? <Kids.IconBadge {...(p as KidsProps<typeof Kids.IconBadge>)} /> : <ClassicIconBadge {...p} />;
}
export function ListItem(p: ComponentProps<typeof ClassicListItem>) {
  return useKidsUI() ? <Kids.ListItem {...(p as KidsProps<typeof Kids.ListItem>)} /> : <ClassicListItem {...p} />;
}
export function LogoutListItem() {
  return useKidsUI() ? <Kids.LogoutListItem /> : <ClassicLogoutListItem />;
}
export function MessageView(p: ComponentProps<typeof ClassicMessageView>) {
  return useKidsUI() ? (
    <Kids.MessageView {...(p as KidsProps<typeof Kids.MessageView>)} />
  ) : (
    <ClassicMessageView {...p} />
  );
}
export function ProgressBar(p: ComponentProps<typeof ClassicProgressBar>) {
  return useKidsUI() ? <Kids.ProgressBar {...p} /> : <ClassicProgressBar {...p} />;
}
export function Screen(p: ComponentProps<typeof ClassicScreen>) {
  return useKidsUI() ? <Kids.Screen {...p} /> : <ClassicScreen {...p} />;
}
export function StateView(p: ComponentProps<typeof ClassicStateView>) {
  return useKidsUI() ? <Kids.StateView {...p} /> : <ClassicStateView {...p} />;
}
export function TextField(p: ComponentProps<typeof ClassicTextField>) {
  return useKidsUI() ? <Kids.TextField {...(p as KidsProps<typeof Kids.TextField>)} /> : <ClassicTextField {...p} />;
}
export function ThemeDialog(p: ComponentProps<typeof ClassicThemeDialog>) {
  return useKidsUI() ? <Kids.ThemeDialog {...p} /> : <ClassicThemeDialog {...p} />;
}

// 配色の変更（赤・緑・青）は子ども用の見た目だけのもの（保護者の今の見た目には配色も同じ部品もない）。
// 子ども用の見た目の外では何も出さない（今は子07 設定だけが使い、子07 はいつも子ども用の見た目の中）
export function ColorSchemeDialog(p: ComponentProps<typeof Kids.ColorSchemeDialog>) {
  return useKidsUI() ? <Kids.ColorSchemeDialog {...p} /> : null;
}
