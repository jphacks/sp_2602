// 子ども用の部品が読む画像（src/kids/assets/*.png。粒・かすれの質感）の型。
// Metro では画像の番号（Image の source にそのまま渡せる数）になる。確認ページ（esbuild）では文字（data URL）だが、アプリでは数だけ。
declare module "*.png" {
  const source: number;
  export default source;
}
