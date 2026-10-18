// 子ども用の見た目の書体を読み込む（src/app/_layout.tsx が一番はじめに呼ぶ）。書体と名前の決まりは src/kids/fonts.ts。
// 読み込む名前は「ファイルごとに1つ」（太さごとに別の名前）。expo-font の太さの組（fontDefinitions）は使わない:
//   端末に入っている dev client の expo-font が太さの組に対応していなくても、名前で分ければどの版でも同じに描けるため。
// 読み込めなかったとき（ファイルが壊れている・端末の都合）は、書体の名前を直さずに描く（端末の既定の書体。画面は出す）。
import { useFonts } from "expo-font";
import { useEffect } from "react";
import type { KidsFontFace } from "./fonts";
import { setKidsFontsReady } from "./lib/text";

const files: Record<KidsFontFace, number> = {
  "BIZUDPGothic-Regular": require("../../assets/fonts/BIZUDPGothic-Regular.ttf"),
  "BIZUDPGothic-Bold": require("../../assets/fonts/BIZUDPGothic-Bold.ttf"),
  "LondrinaSolid-Black": require("../../assets/fonts/LondrinaSolid-Black.ttf"),
};

// true = 読み終えた（か、読めなかった）ので描いてよい
export function useKidsFonts(): boolean {
  const [loaded, error] = useFonts(files);
  useEffect(() => {
    if (error) console.warn("子ども用の書体を読み込めなかった（端末の既定の書体で描く）", error);
  }, [error]);
  // 描く前に知らせる（最初の Text が描かれる前に名前の直しを効かせる）
  setKidsFontsReady(loaded && !error);
  return loaded || error != null;
}
