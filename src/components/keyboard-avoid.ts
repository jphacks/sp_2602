// 画面の本文をキーボードの高さだけ縮める（KeyboardAvoidingView）のを、いつ効かせるかの決まり（Screen.tsx で使う）。
// Android 15 以降（edge-to-edge）では、ほかのアプリでキーボードを出したまま Slope に戻ると、戻った瞬間に
// 「キーボードが出た」の合図（keyboardDidShow）が Slope にも届く（実機 SC-53C・Android 16 で確認。直後に hide も届くが
// 届かないことがある）。そのまま縮めると、入力欄のない子01 ホームの中身がずれたままになる。
// そこで「Slope の入力欄にフォーカスがあるときに出たキーボード」だけを避ける。hide と、アプリが裏へ回ったときは必ずやめる。
// React Native に頼らない純粋な関数にして、テストできるようにしている。

export type KeyboardAvoidEvent =
  | { kind: "show"; focusedInput: boolean } // keyboardDidShow。focusedInput = Slope の入力欄にフォーカスがあるか
  | { kind: "hide" } // keyboardDidHide
  | { kind: "appState"; active: boolean }; // アプリが前面（active）か、それ以外（background・inactive）か

export function nextKeyboardAvoid(current: boolean, event: KeyboardAvoidEvent): boolean {
  switch (event.kind) {
    case "show":
      return event.focusedInput;
    case "hide":
      return false;
    case "appState":
      // 前面に戻っただけでは効かせない（本物のキーボードなら、このあと show が届く）
      return event.active ? current : false;
  }
}
