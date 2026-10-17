// MOCK の手元のサーバ（src/server/dev.ts）だけで使う、store の中身をファイルに残す仕組み。
// なぜ: store はメモリの上だけなので、サーバを立て直す（tsx watch がファイルの変更で立ち直る・止めて立て直す）と、
//   ログイン・QR の紐づけ・計画・日程・利用記録が全部消えた。本物の Google でログインした2台は合言葉が無効になってログイン画面に戻り、
//   もう一度ログインしても別の人として作られるので、カメラで QR を読む紐づけを人の手でやり直す必要があった。
// 決まり:
//   - MOCK=1 の dev.ts だけが使う（本番・Vercel・テストでは使わない。server.ts と app.ts はこのファイルを読まない）
//   - 起動時にファイルがあれば読み込む（見本は入れない）。なければ今の store（見本つき）から始める
//   - 応答を返すたびに、少し待ってからまとめて書き出す（同じ瞬間の呼び出しが続いても1回だけ書く）
//   - 読めない・形が違うファイルは、名前を変えて残し（.broken-<時刻>）、空（見本つき）から始める
//   - 中身には合言葉が入るので、置き場所は Git に入らない /state/（.gitignore 済み）
// 消したいとき（見本だけに戻したいとき）は、サーバを止めてからファイルを消す。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getStore, restoreStore } from "./store";

// 既定の置き場所（リポジトリの直下から起動したとき）。MOCK_STORE_FILE で変えられる
export const DEFAULT_MOCK_STORE_FILE = "state/mock-store.json";
// 応答のあと、書き出すまで待つ時間
export const SAVE_DELAY_MS = 200;

export type MockPersistence = {
  file: string;
  restored: boolean; // 前の起動のファイルを読み込んだか
  scheduleSave: () => void; // 応答を返すたびに呼ぶ（少し待ってから書き出す）
  saveNow: () => void; // すぐ書き出す（テスト・止める前）
};

export function enableMockPersistence(file: string, opts: { log?: (msg: string) => void } = {}): MockPersistence {
  const log = opts.log ?? ((msg: string) => console.log(msg));
  const path = resolve(file);
  let restored = false;
  if (existsSync(path)) {
    try {
      restoreStore(JSON.parse(readFileSync(path, "utf8")));
      restored = true;
      log(`前の起動のデータを読み込みました: ${path}`);
    } catch (e) {
      const broken = `${path}.broken-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        renameSync(path, broken);
      } catch {
        // 名前を変えられなくても、次の書き出しで上書きされるだけ
      }
      log(`前の起動のデータを読めなかったので、見本から始めます（${broken} に残しました）: ${String(e)}`);
    }
  }

  const saveNow = () => {
    const text = JSON.stringify(getStore().dump());
    mkdirSync(dirname(path), { recursive: true });
    // 書き出しの途中で止まっても前のファイルが壊れないよう、別の名前で書いてから入れ替える
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, text, "utf8");
    try {
      renameSync(tmp, path);
    } catch {
      // Windows でほかのプログラムがファイルを開いていると入れ替えられないことがある。そのときは直接書く
      writeFileSync(path, text, "utf8");
    }
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        saveNow();
      } catch (e) {
        // 書けなくてもサーバは止めない（メモリの上のデータで動き続ける）
        log(`データをファイルに書き出せませんでした: ${String(e)}`);
      }
    }, SAVE_DELAY_MS);
  };

  // 起動した時点の中身（見本・読み込んだもの）も書いておく
  saveNow();
  return { file: path, restored, scheduleSave, saveNow };
}
