// アプリが family_unlink（保護者が連携を外した 401）を信じてよいか（session.tsx が session-core に trustUnlink として渡す）。
// API の送り先（api.ts の apiUrl。EXPO_PUBLIC_API_URL）が https か、開発中（__DEV__）のときだけ信じる
// （偽の 401 で制限と Device Owner を止められないように。決め方は session-core.ts の canTrustUnlink）。
// session.tsx から切り出したのは、React を描かずに配線（apiUrl と __DEV__ から決めること）をテストで確かめるため
// （tests/lib/trust-unlink.test.ts）。native.ts を読まない（Node のテストで expo を読まないため）
import { apiUrl } from "./api";
import { canTrustUnlink } from "./session-core";

// 開発中のビルドか（React Native の __DEV__。Node のテストなど、ないときは false）
export function isDevBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

// 呼ぶたびに決める（session-core が 401 を受けたときに呼ぶ）
export function trustUnlinkForApp(): boolean {
  return canTrustUnlink(apiUrl("authMe"), isDevBuild());
}
