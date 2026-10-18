// tmp/animations/rnweb/whiteboard/tools/index.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 道具の入口。components/ の部品は、ここの useTool() から「役目の部品」を取って描く（「ホワイトボードだから」という分岐を部品に書かない）。
// どの道具を使うかは、今のテーマの名前で決める（toolNameForTheme）: ホワイトボード＝marker・黒板＝chalk・ノート＝pencil。
// 道具の組（Tool）は tools/marker.tsx・chalk.tsx・pencil.tsx。値（色・太さ・書体・時間）は theme/tool.ts・chalk.ts・pencil.ts。
// 役目の一覧と props は下の型と README の「道具の役目」。道具を足す手順は README の「道具を足すとき」。
import { type ComponentType, createContext, type ReactNode, useContext } from "react";
import type { Animated, StyleProp, ViewProps, ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme";
import type { ToolName, ToolValues } from "../theme/tool";
import { chalkKit } from "./chalk";
import { markerKit } from "./marker";
import { pencilKit } from "./pencil";

export { seedOf, useSize } from "../marker/draw";
export { Measured } from "../marker/Measured";

type AnimNum = Animated.Value | Animated.AnimatedInterpolation<number>;

// 枠を使う場所（道具が地の塗り・粒・線の太さを変えるのに使う。マーカーは small 以外どれも同じ）
//   card＝カード / banner＝帯 / dialog＝ダイアログの本体 / row＝リストの行 / chip＝札 / field＝入力欄・選択肢
export type FrameKind = "card" | "banner" | "dialog" | "row" | "chip" | "field";

export type FrameProps = Omit<ViewProps, "style" | "children"> & {
  seed: number; // 揺れの種（同じ種なら、いつも同じ形）
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  kind?: FrameKind; // 既定 card
  size?: "normal" | "small"; // small = 行の中の小さい札（線を細く・角を小さく）
  tone?: "test"; // テストの枠（次のテストのカード・テスト一覧の印の付いた行）。黒板＝ピンクのチョークの枠。ホワイトボード・ノートは同じ形
};
export type FrameLineProps = { w: number; h: number; seed: number; emphasis?: AnimNum; kind?: FrameKind };
export type UsedBarProps = { length: AnimNum | number; thin?: boolean };
// fontSize: 印を付ける文字の大きさ（省くと h から見積もる）。大きな数字（ウィジェットの「13」）では、字の下から印までを文字の大きさに合わせて離す
export type TestMarkProps = {
  w: number;
  h: number;
  start: boolean;
  twice?: boolean;
  delay?: number;
  fontSize?: number;
};
export type RingProps = { progress: AnimNum; size: number };
export type BarColumnProps = { area: number; pathHeight?: number; length?: AnimNum | null; today?: boolean };
export type CheckProps = { size: number; start: boolean; ring?: boolean; delay?: number; duration?: number };
export type SpinnerProps = { size?: number; color?: string; accessibilityLabel?: string };
export type UnderlineProps = { width: number; active: boolean; kind: "tab" | "reached" };
export type NumberMarkProps = { w: number; h: number; start: boolean; delay?: number };
export type ButtonLineProps = { w: number; h: number; pressed?: boolean };
export type ButtonFillProps = { w: number; h: number; pressed?: boolean };
export type BadgeFillProps = { size: number };
export type WidgetFrameProps = { style?: StyleProp<ViewStyle>; children?: ReactNode };
// corner: 貼る角（道具が決める既定の角を変えたいときだけ）
export type TapeProps = { w: number; h: number; corner?: "topLeft" | "topRight" };

export type Tool = {
  values: ToolValues;
  // ── どの道具にもある役目 ──
  Frame: ComponentType<FrameProps>; // 枠の箱（カード・帯・ダイアログ・行・札）。地の塗り・粒も道具が決める
  FrameLine: ComponentType<FrameLineProps>; // 大きさの分かった箱に重ねる枠の線だけ（入力欄・テーマの選択肢）。emphasis（0〜1）で線を太く
  UsedBar: ComponentType<UsedBarProps>; // 使った割合のバー（長さは px）
  TestMark: ComponentType<TestMarkProps>; // テストの日付の印（twice で強い印）。測った文字の上に重ねる
  Ring: ComponentType<RingProps>; // 子02 の円（progress は 0〜100）
  BarColumn: ComponentType<BarColumnProps>; // 週の棒（下から引く）
  Check: ComponentType<CheckProps>; // 成功のチェックを引く（ring で丸つき）
  Spinner: ComponentType<SpinnerProps>; // くるくる
  Underline: ComponentType<UnderlineProps>; // 短い下線（tab＝選んでいるタブ / reached＝上限に達した帯の文の下）
  TabBackground: ComponentType; // 下のタブの地（ホワイトボード＝アルミのペン置き）
  // ── 道具によってはないもの（なければ描かない・ふつうの形で描く）──
  Backdrop?: ComponentType; // 画面の地の模様（ノートの罫線・黒板の粒）。Screen が本文の後ろに敷く（押す操作は通す）
  NumberMark?: ComponentType<NumberMarkProps>; // 使った割合の大きな数字の強調（ノート＝数字の後ろに緑の蛍光ペン）。測った数字の後ろに重ねる
  ButtonLine?: ComponentType<ButtonLineProps>; // 線だけの丸いボタンの線（ノート＝鉛筆の線）。ないときは ink の borderWidth（values.stroke.button）
  ButtonFill?: ComponentType<ButtonFillProps>; // 主ボタン（塗りの丸いボタン）の地の質感（ノート＝紙の粒のざらつき）。地の色の上・文字の下に absolute で描く
  Tape?: ComponentType<TapeProps>; // QR の白い紙を貼ったテープ（黒板・ノート。紙の角に1枚）。紙の箱の上に absolute で描く。ホワイトボードはなし
  BadgeFill?: ComponentType<BadgeFillProps>; // 大きいアイコンの丸の地（黒板＝一段明るい黒板＋粒）。丸の中に absolute で敷く。ないときは塗らない
  TitleGrain?: ComponentType; // 上のバーの「Slope」・題名の上に重ねる粒（黒板＝粒でチョークの字がかすれる）。上のバーに absolute で重ねる
  WidgetFrame?: ComponentType<WidgetFrameProps>; // ウィジェットの枠（黒板＝木の枠の小さい黒板）。ないときは呼ぶ側のふつうの枠
};

// 道具の一覧（chalk・pencil は、それぞれの担当が tools/chalk.tsx・pencil.tsx で作ったら入る。null の間は marker で描く）
const kits: Partial<Record<ToolName, Tool>> = {
  marker: markerKit,
  ...(chalkKit ? { chalk: chalkKit } : {}),
  ...(pencilKit ? { pencil: pencilKit } : {}),
};

// テーマの名前 → 道具。アプリの "light" と確認ページの "whiteboard" はホワイトボード（marker）。
// 黒板（"dark"・"chalkboard"）→ chalk、ノート（"notebook"）→ pencil（まだ作っていなければ marker）
export function toolNameForTheme(theme: string): ToolName {
  if (theme === "dark" || theme === "chalkboard") return kits.chalk ? "chalk" : "marker";
  if (theme === "notebook" || theme === "note") return kits.pencil ? "pencil" : "marker";
  return "marker";
}

export function toolByName(name: ToolName): Tool {
  return kits[name] ?? markerKit;
}

// 確認ページなどで道具を決め打ちするとき（<ToolProvider tool="marker">…）。ふつうはテーマから決まるので使わない
const Override = createContext<ToolName | null>(null);
export function ToolProvider({ tool, children }: { tool: ToolName; children: ReactNode }) {
  return <Override.Provider value={tool}>{children}</Override.Provider>;
}

// 今の道具
export function useTool(): Tool {
  const override = useContext(Override);
  const { name } = useTheme();
  return toolByName(override ?? toolNameForTheme(name as string));
}

// 道具の値（書体など）を使うスタイルを、道具ごとに1回だけ作る（makeStyles の道具版）
export function makeToolStyles<T>(factory: (v: ToolValues) => T): () => T {
  const cache = new Map<ToolName, T>();
  return function useToolStyles(): T {
    const { values } = useTool();
    let styles = cache.get(values.name);
    if (styles === undefined) {
      styles = factory(values);
      cache.set(values.name, styles);
    }
    return styles;
  };
}
