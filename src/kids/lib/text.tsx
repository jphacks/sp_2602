// 子ども用の部品が使う Text・TextInput（react-native のものと同じ props・同じ使い方）。
// 違うのは描く直前に、スタイルを Android・読み込んだ書体に合わせて直すことだけ:
//   1. 「書体の名前＋太さ」を、読み込んだ書体のファイルの名前に直す（理由は src/kids/fonts.ts）
//   2. Android では letterSpacing を外す（字の間を測るときと描くときで幅が合わず、最後の字が切れる。理由は src/kids/fonts.ts）
//   3. 開発中の Android では、行の高さが小さくて字の上下が切れそうなスタイルを console.warn で知らせる（logcat の ReactNativeJS に出る）
// 写した部品（scripts/sync-kids-ui.mjs）は、react-native の Text・TextInput の代わりにここを読むように書き換えてある。
// 書体を読み込めなかったとき（kidsFontsReady が false）は書体の名前を直さない（端末の既定の書体で、太さだけは効く形で描く）。
import type { ComponentProps, ReactNode } from "react";
import {
  Platform,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextStyle,
} from "react-native";
import {
  androidTextPatch,
  fontOverride,
  INK_OVERFLOW_TOLERANCE,
  inkOverflow,
  KIDS_FONT_FACES,
  type KidsFontFace,
} from "../fonts";

let ready = false;

// 書体を読み終えたか（src/kids/font-files.ts の useKidsFonts が知らせる）
export function setKidsFontsReady(value: boolean): void {
  ready = value;
}

export function kidsFontsReady(): boolean {
  return ready;
}

const ANDROID = Platform.OS === "android";

// 上に重ねる書体のスタイル（読み込んだ名前ごとに1つだけ作る）
const faces = StyleSheet.create(
  Object.fromEntries(
    Object.keys(KIDS_FONT_FACES).map((face) => [face, { fontFamily: face, fontWeight: "normal" }]),
  ) as Record<KidsFontFace, TextStyle>,
);
const androidPatch = StyleSheet.create({ noLetterSpacing: { letterSpacing: 0 } });

// 字が切れそうなスタイルを一度だけ知らせる（書体・大きさ・行の高さの組ごと）
const warned = new Set<string>();
function warnIfInkOverflows(face: KidsFontFace, flat: TextStyle, children: ReactNode) {
  const fontSize = flat.fontSize ?? 14;
  const lineHeight = flat.lineHeight;
  const text = typeof children === "string" || typeof children === "number" ? String(children) : undefined;
  const o = inkOverflow(face, fontSize, lineHeight, text);
  if (o.top <= INK_OVERFLOW_TOLERANCE && o.bottom <= INK_OVERFLOW_TOLERANCE) return;
  const key = `${face}/${fontSize}/${lineHeight}/${o.top}/${o.bottom}`;
  if (warned.has(key)) return;
  warned.add(key);
  const sample = text != null ? `「${text.slice(0, 20)}」` : "";
  console.warn(
    `子ども用の文字が Android で切れるかもしれない: ${face} ${fontSize}/${lineHeight}${sample}` +
      `（字の形が上に ${o.top}・下に ${o.bottom} dp はみ出す。lineHeight を大きくする。決まりは src/kids/fonts.ts）`,
  );
}

function adapt<S>(style: S, children?: ReactNode): S | [S, ...TextStyle[]] {
  if (!ready && !ANDROID) return style;
  const flat = StyleSheet.flatten(style as TextProps["style"]) as TextStyle | undefined;
  const extra: TextStyle[] = [];
  const o = ready ? fontOverride(flat) : null;
  if (o) extra.push(faces[o.fontFamily]);
  if (ANDROID && androidTextPatch(flat)) extra.push(androidPatch.noLetterSpacing);
  if (__DEV__ && ANDROID && o && flat) warnIfInkOverflows(o.fontFamily, flat, children);
  return extra.length > 0 ? [style, ...extra] : style;
}

function KidsText({ style, ...rest }: ComponentProps<typeof RNText>) {
  return <RNText {...rest} style={adapt(style, rest.children)} />;
}

function KidsTextInput({ style, ...rest }: ComponentProps<typeof RNTextInput>) {
  return <RNTextInput {...rest} style={adapt(style)} />;
}

// 型と静的な値（TextInput.State など）は react-native のものと同じに見せる（写した部品のコードを変えずに済むように）
export const Text = KidsText as unknown as typeof RNText;
export const TextInput = Object.assign(KidsTextInput, { State: RNTextInput.State }) as unknown as typeof RNTextInput;
