// API の失敗を出す帯。errorOf(e) の結果（ApiError）の message（何が起きたか）と hint（次に何をするか）をそのまま出す。
// error が null なら何も出さない（自分で中断したときは errorOf が null を返すので、そのまま渡せばよい）。
//   const [error, setError] = useState<ApiError | null>(null);
//   try { … } catch (e) { setError(errorOf(e)); }
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
