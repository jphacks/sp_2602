// Google ログイン（C1 の端末側）。本物と MOCK を切り替える。
//   本物: 環境変数 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID（Web のクライアント ID。docs/google-login-setup.md）があるとき。
//         @react-native-google-signin/google-signin で Google にログインし、ID トークンを受け取る（確かめるのはサーバ）
//   MOCK: 上の値がないとき。ログイン画面は mockLogins（保護者・子ども・はじめての人）のボタンを出す。サーバは MOCK=1 のときだけ受け付ける
// どちらも、受け取った idToken を session.tsx の signIn(idToken) に渡せばよい。
import { mockLogins } from "@contracts/fixtures";
import { appStorage, storageKeys } from "./storage";

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || "";

// 本物の Google ログインを使うか（false ならログイン画面は MOCK のボタンを出す）
export const googleSignInEnabled = WEB_CLIENT_ID !== "";

// Google ログインの結果
export type GoogleResult =
  | { status: "success"; idToken: string }
  | { status: "cancelled" } // 利用者がやめた（エラーを出さない）
  | { status: "error"; message: string }; // 失敗（子09 のログイン失敗のダイアログに出す）

let configured = false;

// 本物の Google ログイン。部品は使うときに読み込む（部品が入っていない開発用のアプリでも、MOCK のときに落ちないように）
export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!googleSignInEnabled) return { status: "error", message: "Google ログインの設定がありません" };
  try {
    const { GoogleSignin, isSuccessResponse } = await import("@react-native-google-signin/google-signin");
    if (!configured) {
      GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
      configured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return { status: "cancelled" };
    if (!res.data.idToken) return { status: "error", message: "Google から ID トークンを受け取れませんでした" };
    return { status: "success", idToken: res.data.idToken };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "SIGN_IN_CANCELLED" || code === "-5" || code === "12501") return { status: "cancelled" };
    return { status: "error", message: e instanceof Error ? e.message : "Google ログインに失敗しました" };
  }
}

// ログアウトのとき、端末の Google ログインも外す（次に別のアカウントを選べるように）。失敗しても気にしない
export async function signOutGoogle(): Promise<void> {
  if (!googleSignInEnabled) return;
  try {
    const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
    await GoogleSignin.signOut();
  } catch {
    // 何もしない（サーバ側の合言葉はもう捨てている）
  }
}

// MOCK のログイン画面に並べるボタン。「はじめての人」は端末ごとに別の人にする（2台で QR の紐づけを試すため）
export type MockLoginChoice = { label: string; idToken: string };

export async function mockLoginChoices(): Promise<MockLoginChoice[]> {
  const deviceId = await mockDeviceId();
  return mockLogins.map((m) =>
    m.idToken === "mock-google-new"
      ? { label: `${m.label}（この端末: ${deviceId.slice(-4)}）`, idToken: `mock-new-${deviceId}` }
      : { label: m.label, idToken: m.idToken },
  );
}

async function mockDeviceId(): Promise<string> {
  try {
    const saved = await appStorage.getItem(storageKeys.mockDeviceId);
    if (saved) return saved;
    const id = Math.random().toString(36).slice(2, 10);
    await appStorage.setItem(storageKeys.mockDeviceId, id);
    return id;
  } catch {
    return "device";
  }
}
