// tmp/animations/rnweb/whiteboard/components/ColorSchemeDialog.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子07 から開く「配色の変更」ポップアップ（子06 テーマカラーの変更と同じ形・同じ動き。共通の ChoiceDialog）。
// 選択肢は theme-store の COLOR_SCHEME_OPTIONS（赤・緑・青）。押すとすぐ setColorScheme（全画面の「使った時間」「テスト」の色・
// 選んでいるタブの下線が変わる）。OK で閉じる（選び直しは閉じずにできる）。
// 左の丸の色見本は、今のモード（ホワイトボード・黒板・ノート）でのその配色の「使った時間」の色（theme/schemes.ts の schemeSwatch）。
// 配色は子ども用の見た目だけのもの（保護者の今の見た目には同じ部品がない。アプリの src/components/kids-switch.tsx は子ども用の中でだけ出す）。
//   <ColorSchemeDialog visible={open} onClose={() => setOpen(false)} />

import { COLOR_SCHEME_OPTIONS, type ColorSchemeName } from "@/kids/lib/theme-store";
import { useColorScheme, useTheme } from "@/lib/theme";
import { schemeSwatch } from "../theme/schemes";
import type { KidsThemeName } from "../theme/themes";
import { ChoiceDialog } from "./ChoiceDialog";

// テーマの名前 → 子ども用のテーマの名前。アプリは light・dark・notebook、確認ページは whiteboard・chalkboard・notebook
// （tools/index.tsx の toolNameForTheme と同じ分け方）
function kidsThemeName(name: string): KidsThemeName {
  if (name === "dark" || name === "chalkboard") return "chalkboard";
  if (name === "notebook" || name === "note") return "notebook";
  return "whiteboard";
}

export function ColorSchemeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { name } = useTheme();
  const { scheme, setColorScheme } = useColorScheme();
  const theme = kidsThemeName(name as string);
  const options = COLOR_SCHEME_OPTIONS.map((o) => ({
    key: o.name,
    label: o.label,
    swatch: schemeSwatch(theme, o.name),
  }));
  return (
    <ChoiceDialog
      visible={visible}
      title="配色の変更"
      options={options}
      selected={scheme}
      onSelect={(key) => setColorScheme(key as ColorSchemeName)}
      onClose={onClose}
    />
  );
}
