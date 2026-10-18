// ログインした人（Session。合言葉を含む）を端末に置く・読む（session.tsx が使う）。
// 合言葉は平文で置かない（セキュリティ検査 PII-05 / AND-05 / IPA-13: 前は AsyncStorage = databases/RKStorage に平文で置いていた）。
// Session 全体を JSON にして、Android Keystore の鍵で封をした形（{"v":1,"sealed":"sb1:…"}）で置く（封は Kotlin の SecretBox）。
//   - 封ができない（Kotlin がない・Keystore が使えない）ときは置かない。そのときはアプリを閉じるとログインし直しになる
//   - 開けない（鍵が作り直された・書き換えられた）・形が違うときは、置いた値を消して「ない」とする（ログインし直し）
//   - 古い版が平文で置いた Session は、読んだときに封をし直して上書きする（封ができなければ消す）。平文のまま残さない
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
    const session = plain == null ? null : parseSession(plain);
    if (!session) await storage.removeItem(storageKeys.session);
    return session;
  }

  // 古い版が平文で置いた Session: 封をし直して上書きする（封ができなければ消える）。この起動の間は使う
  const legacy = Session.safeParse(raw);
  if (legacy.success) {
    await saveSession(storage, box, legacy.data);
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
