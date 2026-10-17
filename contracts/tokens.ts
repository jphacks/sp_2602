// デザイン契約（React Native 用のテーマ）。キックオフ後30〜60分で lead（またはデザイン担当）が決めて凍結する。
// 画面で使える色・余白・角丸・文字の大きさはここで定義したものだけ。画面は StyleSheet.create の中で tokens.color.primary のように名前で使う。
// 色コードや 13 のような数字の直書きは npm run lint が弾く（docs/rules/stack.md「見た目」）。
export const tokens = {
  color: {
    white: "#ffffff",
    black: "#000000",
    bg: "#fafaf7",
    surface: "#ffffff",
    text: "#1d1d1b",
    muted: "#6b6b66",
    line: "#e4e4de",
    primary: "#2f5d50",
    primaryFg: "#ffffff",
    danger: "#b3261e",
  },
  // 余白は 4px 刻み。space[4] = 16
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },
  radius: { card: 12, button: 10, pill: 999 },
  font: { sm: 14, base: 16, lg: 20, xl: 28 },
  // 押せる部品の高さの下限（Android の推奨 48dp に近い 44 を基準にする）
  size: { touch: 44 },
} as const;

export type Tokens = typeof tokens;
