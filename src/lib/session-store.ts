// ログインした人（Session。合言葉を含む）を端末に置く・読む（session.tsx が使う）。
// 合言葉は平文で置かない（セキュリティ検査 PII-05 / AND-05 / IPA-13: 前は AsyncStorage = databases/RKStorage に平文で置いていた）。
// Session 全体を JSON にして、Android Keystore の鍵で封をした形（{"v":1,"sealed":"sb1:…"}）で置く（封は Kotlin の SecretBox）。
//   - 封ができない（Kotlin がない・Keystore が使えない）ときは置かない。そのときはアプリを閉じるとログインし直しになる
//   - 封を開けられない（openSecret が null。Keystore の一時的な失敗・鍵が作り直された・書き換えられた）ときは、置いた値を消さずに
//     「ない」とする（その起動はログアウト状態。次の起動でもう一度開けてみる。次にログインすれば上書きされる）。
//     なぜ: 一時的な失敗で消すと、子どもの端末が開き直しのたびにログイン状態を失うため。Kotlin の SecretBox・EngineStore の
//     「開けないときは消さない」（M-6）とそろえる。平文に戻す道は作らない
//   - 開けたのに中身が Session の形でない・置いた形そのものが違う（壊れている）ときは、置いた値を消して「ない」とする（ログインし直し）
//   - 古い版が平文で置いた Session は、読んだときに封をし直して上書きする（封ができなければ消す）。平文のまま残さない
//     （書き込みそのものが失敗したときだけは残り、次に読んだときにもう一度やり直す）
// Node のテストで expo を読まずに確かめられるよう、封の道具（SecretBox）は呼ぶ側が渡す（tests/lib/session-store.test.ts）。
import { Session } from "@contracts/schemas";
import { z } from "zod";
import { type KeyValueStorage, storageKeys } from "./storage";

export type SecretBox = {
  sealSecret(plain: string): string | null;
  openSecret(sealed: string): string | null;
};

const SealedSession = z.object({ v: z.literal(1), sealed: z.string().min(1) });

// 置く。置けたら true（封ができなかったときは前の値も消して false）
export async function saveSession(storage: KeyValueStorage, box: SecretBox, session: Session): Promise<boolean> {
  const sealed = box.sealSecret(JSON.stringify(session));
  if (!sealed) {
    await storage.removeItem(storageKeys.session);
    return false;
  }
  await storage.setItem(storageKeys.session, JSON.stringify({ v: 1, sealed }));
  return true;
}

// 読む。ない・開けない・形が違うときは null
export async function loadSession(storage: KeyValueStorage, box: SecretBox): Promise<Session | null> {
  let raw: unknown;
  try {
    const text = await storage.getItem(storageKeys.session);
    if (text == null) return null;
    raw = JSON.parse(text);
  } catch {
    await storage.removeItem(storageKeys.session).catch(() => undefined);
    return null;
  }

  const sealed = SealedSession.safeParse(raw);
  if (sealed.success) {
    const plain = box.openSecret(sealed.data.sealed);
    // 開けない: 消さずに null（一時的な失敗かもしれないので、次の起動でもう一度試す。M-6）
    if (plain == null) return null;
    const session = parseSession(plain);
    if (!session) await storage.removeItem(storageKeys.session);
    return session;
  }

  // 古い版が平文で置いた Session: 封をし直して上書きする（封ができなければ消える）。この起動の間は使う。
  // 書き込みに失敗しても、読めた Session は返す（なぜ: 前はここで投げて loadSession ごと失敗し、ログアウト状態になっていた。
  //   平文はそのまま残るので、次に読んだときにもう一度封をし直す）
  const legacy = Session.safeParse(raw);
  if (legacy.success) {
    await saveSession(storage, box, legacy.data).catch(() => undefined);
    return legacy.data;
  }
  await storage.removeItem(storageKeys.session);
  return null;
}

function parseSession(plain: string): Session | null {
  try {
    const parsed = Session.safeParse(JSON.parse(plain));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
