// 環境の読み取り。値はサーバの起動時ではなく、使うたびに読む（テストで差し替えられるように）。
//   MOCK=1                : "mock-" で始まる idToken のログインを受け付け、デモの3人（contracts/fixtures.ts）と見本のデータを用意する
//   GOOGLE_WEB_CLIENT_ID  : 本物の Google ログインで、ID トークンの宛先（aud）として確かめる Web のクライアント ID（docs/google-login-setup.md）
export const isMock = () => process.env.MOCK === "1";

// 空は未設定として扱う
export const googleWebClientId = (): string | null => process.env.GOOGLE_WEB_CLIENT_ID?.trim() || null;
