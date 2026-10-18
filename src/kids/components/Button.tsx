// tmp/animations/rnweb/whiteboard/components/Button.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ボタン（ホワイトボード）。props はアプリの Button（src/components/Button.tsx）と同じ。押せる高さは必ず 44 以上。
// 形（Figma 34:2138・kids-design-rules.md 3 章）。丸いボタンは手描きの枠にしない（まっすぐな線のまま）:
//   primary（主ボタン）＝ 黒（ink）の地にボードの白の文字の丸いボタン。高さ 56・全幅・BIZ UDPゴシック Bold 16
//   outline（副ボタン）＝ 地なし、ink の 1px の線の丸いボタン。高さ 56・全幅
//   soft（「詳しく見る ›」）＝ 地なし、ink の線の小さい丸いボタン（見た目の高さ 40。押せる高さは 44）。文字 14 の太字
//   text（ダイアログの OK・「ログアウト」）＝ 文字だけ。ink の太字 16（帯の中では 14）。下に線は引かない
//   pill（ダイアログの丸いボタン）＝ 線だけの丸いボタン（見た目の高さ 40）。ダイアログのボタンが1つのとき（OK）は、Figma のとおり
//          文字だけのボタンにする（子04・子06・子09）。2つのとき（キャンセル・削除する）は横に同じ幅で並べる（子20・子07-B）
//   danger（赤い文字）は、ホワイトボードでは使わない（赤はテストの色。ink のまま。palette.danger も ink）
// 読み込み中（loading）は黒マーカーのくるくる（押せない。二重に送らない）
import { tokens } from "@contracts/tokens";
import { createContext, useContext, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { keepTailTogether } from "@/components/text-wrap";
import { Text } from "@/kids/lib/text";
import { makeStyles, useColors } from "@/lib/theme";
import { fonts } from "../theme/tool";
import { useTool } from "../tools";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "outline" | "soft" | "text" | "pill";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName; // 文字の左のアイコン
  trailingIcon?: IconName; // 文字の右のアイコン（「詳しく見る ›」）
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
};

// 置かれた場所からの合図（Dialog・Banner が渡す）。アプリの画面のコードを変えずに、Figma の形に合わせるため
//   compact: 帯の中（文字だけのボタンを 14 に。押せる高さ 44 は保ったまま、上下の見た目の余白を詰める）
//   center : 画面の下（Screen の footer。文字だけのボタンを真ん中に。Figma 入02 の「ログアウト」）
//   single : ダイアログのボタンが1つ（pill を文字だけに）
//   fill   : ダイアログのボタンが2つ以上（pill を同じ幅で横に並べる）
export const ButtonContext = createContext<{ compact?: boolean; single?: boolean; fill?: boolean; center?: boolean }>(
  {},
);

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  trailingIcon,
  disabled,
  loading,
  danger: _danger,
}: Props) {
  const styles = useStyles();
  const text = labelStyles;
  const c = useColors();
  const { Spinner, ButtonLine, ButtonFill, values } = useTool();
  const [face, setFace] = useState({ w: 0, h: 0 });
  const place = useContext(ButtonContext);
  const off = disabled || loading;
  // ダイアログの1つだけの pill は文字だけ（Figma の OK）
  const look: Variant = variant === "pill" && place.single ? "text" : variant;
  const color = look === "primary" ? c.onPrimary : c.text;
  // ダイアログの丸いボタン（キャンセル・削除する）は 16 の太字（Figma 子20・子07-B）。カードの中の pill・soft は 14
  const small = look === "soft" || (look === "pill" && !place.fill);
  const iconSize = look === "soft" ? 16 : tokens.size.iconSmall;
  const textStyle = [
    text.label,
    small && text.labelSmall,
    look === "text" && place.compact && text.labelSmall,
    { color },
  ];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      // 見た目の箱（40 の丸いボタン）より押せる場所（44）を大きくする
      style={({ pressed }) => [
        styles.hit,
        styles[`hit_${look}`],
        look === "pill" && place.fill && styles.hitFill,
        look === "text" && (place.single || place.center) && styles.hitCenter,
        look === "text" && place.center && styles.hitFooter,
        look === "text" && place.compact && styles.hitCompact,
        off && styles.off,
        pressed && styles.pressed,
      ]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.face,
            styles[look],
            look === "pill" && place.fill && styles.faceFill,
            look !== "primary" && look !== "text" && { borderWidth: ButtonLine ? 0 : values.stroke.button },
            pressed && (look === "primary" ? styles.pressedPrimary : styles.pressedLine),
          ]}
          onLayout={
            ButtonLine || ButtonFill
              ? (e) => setFace({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
              : undefined
          }
        >
          {/* 主ボタンの地の質感（ノートの紙の粒など）。ないときは地の色だけ */}
          {ButtonFill && look === "primary" && face.w > 0 && <ButtonFill w={face.w} h={face.h} pressed={pressed} />}
          {/* 道具の線（ノートの鉛筆の線など）。ないときは上の borderWidth の ink の線 */}
          {ButtonLine && look !== "primary" && look !== "text" && face.w > 0 && (
            <ButtonLine w={face.w} h={face.h} pressed={pressed} />
          )}
          {loading ? (
            <Spinner size={22} color={color} accessibilityLabel={`${label}、処理中`} />
          ) : (
            <View style={[styles.row, look === "soft" && trailingIcon && styles.rowTight]}>
              {icon && <Icon name={icon} size={iconSize} color={color} />}
              {/* 2行に折り返したときも中央にそろえる */}
              <Text style={textStyle}>{keepTailTogether(label)}</Text>
              {trailingIcon && <Icon name={trailingIcon} size={iconSize} color={color} />}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    // 押せる場所（透明）
    hit: { minHeight: tokens.size.touch, justifyContent: "center" },
    hit_primary: { alignSelf: "stretch" },
    hit_outline: { alignSelf: "stretch" },
    hit_soft: { alignSelf: "flex-end" },
    hit_text: { alignSelf: "flex-end" },
    hit_pill: { alignSelf: "center", minWidth: tokens.size.pillMinWidth },
    hitFill: { flex: 1, alignSelf: "auto" },
    // ダイアログで横に並べる丸いボタンは幅が決まっているので、左右の余白を詰める（「削除する」がアイコンつきでも1行に入るように）
    faceFill: { paddingHorizontal: tokens.space[3] },
    hitCenter: { alignSelf: "center" },
    hitCompact: { marginTop: -10, marginRight: -12 },
    // 画面の下の文字だけのボタン（入02「ログアウト」）: Figma より 5 下に出るので、下を 5 空ける
    hitFooter: { marginBottom: 5 },
    // 見た目の箱
    face: { alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.pill },
    primary: { minHeight: tokens.size.button, backgroundColor: c.primaryFill, paddingHorizontal: tokens.space[5] },
    outline: {
      minHeight: tokens.size.button,
      borderWidth: 1,
      borderColor: c.outline,
      paddingHorizontal: tokens.space[5],
    },
    soft: {
      minHeight: tokens.size.textButton,
      borderWidth: 1,
      borderColor: c.outline,
      paddingLeft: tokens.space[5],
      paddingRight: tokens.space[3],
    },
    text: { minHeight: tokens.size.touch, paddingHorizontal: tokens.space[3] },
    // Figma: 「もう一度ためす」幅 141・「設定を開く」113（左右 23）
    pill: { minHeight: tokens.size.textButton, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 23 },
    off: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
    pressedPrimary: { opacity: 0.9 },
    // 線のボタンは、押している間だけ少し地を付ける（押したことが分かるように）
    pressedLine: { backgroundColor: c.surfaceDim },
    row: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
    // 「詳しく見る ›」は文字と › を近づける（Figma 子01）
    rowTight: { gap: 3 },
  }),
);

// ボタンの文字（太字 16。小さいボタンは 14）
const labelStyles = StyleSheet.create({
  label: { ...fonts.bold, fontSize: tokens.font.base, lineHeight: 20, textAlign: "center" },
  labelSmall: { fontSize: tokens.font.sm, lineHeight: tokens.lineHeight.sm },
});
