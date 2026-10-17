// 生きているかの確認。mock は MOCK=1 で動いているか（画面の開発用の表示に使える）。
import { isMock } from "../env";
import { handle } from "../route";

export default handle("health", async () => ({ ok: true as const, mock: isMock() }));
