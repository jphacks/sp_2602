// tmp/animations/rnweb/whiteboard/components/ErrorBanner.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// API の失敗を出す帯（ホワイトボード）。props と動きはアプリの ErrorBanner（src/components/ErrorBanner.tsx）と同じ。
// 見た目は Banner（手描きの枠・ink・アイコンで伝える。赤は使わない）。「もう一度ためす」は帯の中の右下の文字だけのボタン（14 の太字）。
//   <ErrorBanner error={error} onRetry={load} />
import type { ApiError } from "@contracts/errors";
import { Banner } from "./Banner";
import { Button } from "./Button";

type Props = { error: ApiError | null; onRetry?: () => void; retryLabel?: string };

export function ErrorBanner({ error, onRetry, retryLabel = "もう一度ためす" }: Props) {
  if (!error) return null;
  return (
    <Banner
      tone="danger"
      icon={error.code === "network" || error.code === "timeout" ? "cloud_off" : "error"}
      message={error.message}
      hint={error.hint}
      action={onRetry ? <Button variant="text" label={retryLabel} onPress={onRetry} /> : undefined}
    />
  );
}
