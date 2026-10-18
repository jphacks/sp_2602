// ログイン（Figma 子08 ログイン画面 108:6969・子09 ログイン失敗ポップアップ 108:6983。保護者も子どもも同じ画面）。
// データ: Google の ID トークン（src/lib/google.ts）→ useSession().signIn() が authGoogle でサーバに確かめてもらう。
//   本物の Google ログインは googleSignInEnabled（EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID がある）のときだけ。
//   ないときは MOCK のログイン（保護者・子ども・はじめての人）のボタンだけを出す（本物のときは出さない）。
// 行き先: ログインできたら入口（/）へ戻り、役割で振り分ける（役割なし → /pair の役割選び）。
// 下部タブは出さない（Q12。Figma ではログイン画面にも選択なしのタブがあるが、行き先がすべてログイン後の画面のため）。

import { tokens } from "@contracts/tokens";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Dialog, Screen } from "@/components";
import { googleOutcome, type LoginFailure, loginNotice, serverFailure } from "@/components/pair";
import { withKidsUI } from "@/kids/KidsUI";
import { googleSignInEnabled, type MockLoginChoice, mockLoginChoices, signInWithGoogle } from "@/lib/google";
import { useSession } from "@/lib/session";

function Login() {
  const { state, signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [mockChoices, setMockChoices] = useState<MockLoginChoice[]>([]);

  useEffect(() => {
    if (!googleSignInEnabled) void mockLoginChoices().then(setMockChoices);
  }, []);

  if (state.status === "signedIn") return <Redirect href="/" />;

  // ログインの期限が切れて戻ってきたとき（この画面でまだ何も押していない間だけ）
  const notice = loginNotice(state.status === "signedOut" ? state.error : null, attempted);

  // ボタンを押してから、サーバの確認が終わるまでは押せない（二重に送らない）
  const run = async (getToken: () => Promise<string | null>) => {
    setBusy(true);
    setAttempted(true);
    try {
      const idToken = await getToken();
      if (!idToken) return;
      const error = await signIn(idToken);
      if (error) setFailure(serverFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run(async () => {
      const outcome = googleOutcome(await signInWithGoogle());
      if (outcome.kind === "failure") setFailure(outcome.failure);
      return outcome.kind === "token" ? outcome.idToken : null;
    });

  const close = () => setFailure(null);

  return (
    <Screen
      title="Slope"
      scroll={false}
      footer={
        googleSignInEnabled ? (
          <Button label="Google でログイン" icon="login" onPress={google} loading={busy} />
        ) : (
          // MOCK のときだけ（Google の登録が済むまでの開発用）
          <View style={styles.mock}>
            <AppText variant="caption" tone="muted" center>
              開発用のログイン（Google の登録が済むまでの仮のもの）
            </AppText>
            {mockChoices.map((c) => (
              <Button
                key={c.idToken}
                variant="outline"
                label={c.label}
                onPress={() => run(async () => c.idToken)}
                disabled={busy}
              />
            ))}
          </View>
        )
      }
    >
      <Banner icon="info" message="ログインして、テストに向けた計画を始めよう" />
      {notice && <Banner tone="warning" message={notice.message} hint={notice.hint} />}
      <Dialog
        visible={failure != null}
        icon="error"
        iconTone="danger"
        title="ログインできませんでした"
        body="通信を確かめて、もう一度ためしてください。"
        centered
        onClose={close}
        actions={<Button variant="pill" label="OK" onPress={close} />}
      >
        {failure?.detail ? (
          <AppText variant="caption" tone="muted" center>
            {failure.detail}
          </AppText>
        ) : null}
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mock: { gap: tokens.layout.listGap },
});

// 親子どちらにも出る入口の画面。Figma の子ども用のデザイン（入01・入02・子08・子09・共01〜共03 など）があるので、今は子ども用の見た目（src/kids）で描く。
export default withKidsUI(Login);
