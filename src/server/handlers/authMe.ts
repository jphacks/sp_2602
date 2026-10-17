// C1: 今の合言葉の持ち主（役割を含む）を返す。アプリの起動時に、どの画面に進むかを決めるのに使う。
import { handle } from "../route.js";

export default handle("authMe", async (_req, { caller }) => caller as NonNullable<typeof caller>);
