// tmp/animations/rnweb/whiteboard/components/ThemeDialog.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子06 テーマカラー変更ポップアップ（ホワイトボード）。props と動きはアプリの ThemeDialog（src/components/ThemeDialog.tsx）と同じ:
// 選択肢は theme-store の THEME_OPTIONS（今は「白色」「黒色」の2つ）。押すとすぐ setTheme。OK で閉じる（選び直しは閉じずにできる）。
// 形（Figma 子06・kids-design-round2.md 3 章）は、配色の変更（ColorSchemeDialog）と共通の ChoiceDialog:
//   - 1行ずつ手で4辺を引いた枠（高さ 56・角 8）。左に色見本の丸（そのモードの地の色＋ ink 1 の線）、真ん中に名前（16）
//   - 選んでいる行は線を太く（2.3 → 3.2 を 200ms で）＋右にチェックを黒マーカーで引く（200ms）
//   - OK は文字だけのボタン（Dialog のボタンが1つのとき）
// Figma は選択肢が3つ（白色（ホワイトボード）・黒色（黒板）・ベージュ（ノート））だが、アプリの選択肢（theme-store.ts）は2つなので、
// 文言と数はアプリのまま（theme-store を勝手に変えない。README・報告に書いた）。
// 今のテーマが選択肢にない名前のときは、いちばん上（白色）を選んでいる形にする。
// 確認ページでは作り物の theme-store（stubs/lib/theme-store.ts）が Figma と同じ3つ（whiteboard・chalkboard・notebook）を返すので3行出る。
//   <ThemeDialog visible={open} onClose={() => setOpen(false)} />
import type { ThemeName } from "@contracts/tokens";
import { THEME_OPTIONS } from "@/kids/lib/theme-store";
import { useTheme } from "@/lib/theme";
import { themeSwatch } from "../theme/tool";
import { ChoiceDialog } from "./ChoiceDialog";

export function ThemeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { name, setTheme } = useTheme();
  // 色見本はテーマで変わらない、それぞれのモードの地の色
  const options = THEME_OPTIONS.map((o) => ({
    key: o.name as string,
    label: o.label,
    swatch: themeSwatch[o.name as string],
  }));
  // 今のテーマが選択肢にない名前のときは、白色の仲間（いちばん上の選択肢）を選んでいる形にする
  const current = options.some((o) => o.key === name) ? (name as string) : (options[0]?.key ?? "light");
  return (
    <ChoiceDialog
      visible={visible}
      title="テーマカラーの変更"
      options={options}
      selected={current}
      onSelect={(key) => setTheme(key as ThemeName)}
      onClose={onClose}
    />
  );
}
