// ログイン（Figma 子08 ログイン画面 108:6969・子09 ログイン失敗ポップアップ 108:6983。親子共通）。
// 仮の画面: ログインそのものは動く（入口の振り分けを試せるように）。見た目は次の担当が Figma に合わせて作る。
// この画面で作るもの:
//   - Banner（icon/info）でアプリの説明、下に「Google でログイン」の主ボタン（Figma: Button/GoogleLogin y=576）
//   - EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID がないときは MOCK のログイン（保護者・子ども・はじめての人）のボタンを出す（google.ts の mockLoginChoices）
//   - 失敗したら子09 のダイアログ（icon/error・何が起きたか・次に何をするか・OK）。キャンセルはエラーにしない
//   - ログイン中はボタンを押せない（二重に送らない）
//   - Figma ではログイン画面にも下部タブがあるが、ログイン前はタブを出さない（タブの行き先がすべてログイン後の画面のため）
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Banner, Button, Dialog, Screen } from "@/components";
import { googleSignInEnabled, type MockLoginChoice, mockLoginChoices, signInWithGoogle } from "@/lib/google";
import { useSession } from "@/lib/session";

export default function Login() {
  const { state, signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; hint: string } | null>(null);
  const [mockChoices, setMockChoices] = useState<MockLoginChoice[]>([]);

  useEffect(() => {
    if (!googleSignInEnabled) void mockLoginChoices().then(setMockChoices);
  }, []);

  if (state.status === "signedIn") return <Redirect href="/" />;

  const run = async (getToken: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const idToken = await getToken();
      if (!idToken) return;
      const error = await signIn(idToken);
      if (error) setFailure({ message: error.message, hint: error.hint });
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run(async () => {
      const r = await signInWithGoogle();
      if (r.status === "success") return r.idToken;
      if (r.status === "error") setFailure({ message: r.message, hint: "もう一度ためしてください" });
      return null;
    });

  return (
    <Screen
      title="Slope"
      footer={
        googleSignInEnabled ? (
          <Button label="Google でログイン" onPress={google} loading={busy} />
        ) : (
          mockChoices.map((c) => (
            <Button
              key={c.idToken}
              variant="outline"
              label={c.label}
              onPress={() => run(async () => c.idToken)}
              disabled={busy}
            />
          ))
        )
      }
    >
      <Banner
        icon="info"
        message="保護者も子どもも、Google アカウントでログインします。"
        hint={googleSignInEnabled ? undefined : "開発用のログイン（Google の登録が済むまでの仮のもの）"}
      />
      <Dialog
        visible={failure != null}
        icon="error"
        iconTone="danger"
        title="ログインできませんでした"
        body={failure ? `${failure.message}\n${failure.hint}` : undefined}
        onClose={() => setFailure(null)}
        actions={<Button variant="text" label="OK" onPress={() => setFailure(null)} />}
      />
    </Screen>
  );
}
