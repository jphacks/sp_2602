// tmp/animations/rnweb/whiteboard/components/StateView.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 画面の状態の出し分け（ホワイトボード）。props・状態・文言・configViewState はアプリの StateView（src/components/StateView.tsx）と同じ。
// 見た目だけホワイトボード: 読み込み中は黒マーカーのくるくる（MarkerSpinner）、帯は手描きの枠の Banner、大きいアイコンは線の丸の IconBadge。
//   <StateView state={configViewState(config)} onRetry={refresh}>…中身…</StateView>
import type { ApiError } from "@contracts/errors";
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { ConfigState } from "@/lib/config-cache";
import { useTool } from "../tools";
import { AppText } from "./AppText";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ErrorBanner } from "./ErrorBanner";
import { IconBadge } from "./IconBadge";

export type ViewState =
  | "loading"
  | "success"
  | "empty"
  | "unknown"
  | "stale"
  | "validation-error"
  | "permission-denied";

type Props = {
  state: ViewState;
  children?: ReactNode;
  message?: string;
  hint?: string;
  error?: ApiError | null;
  onRetry?: () => void;
  action?: { label: string; onPress: () => void };
};

const defaults: Record<ViewState, { message: string; hint: string }> = {
  loading: { message: "読み込んでいます…", hint: "" },
  success: { message: "", hint: "" },
  empty: { message: "まだ記録がありません", hint: "" },
  unknown: { message: "情報を取得できませんでした", hint: "通信できる場所で、もう一度ためしてください" },
  stale: { message: "最新でない可能性があります", hint: "通信できるようになると自動で更新します" },
  "validation-error": { message: "入力の内容を受け付けられませんでした", hint: "入力を見直してください" },
  "permission-denied": { message: "許可が必要です", hint: "設定画面で許可してください" },
};

export function StateView({ state, children, message, hint, error, onRetry, action }: Props) {
  const { Spinner } = useTool();
  const text = {
    message: message ?? error?.message ?? defaults[state].message,
    hint: hint ?? error?.hint ?? defaults[state].hint,
  };
  switch (state) {
    case "success":
      return <>{children}</>;
    case "loading":
      return (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Spinner accessibilityLabel={text.message} />
          {/* Figma 入01・子18-B: 待っている間の文は見出しの書体 */}
          <AppText variant="message" center>
            {text.message}
          </AppText>
        </View>
      );
    case "stale":
      return (
        <View style={styles.stack}>
          <Banner tone="warning" icon="cloud_off" message={text.message} hint={text.hint} />
          {children}
        </View>
      );
    case "validation-error":
      return (
        <View style={styles.stack}>
          <ErrorBanner error={error ?? { code: "bad_request", ...text }} />
          {children}
        </View>
      );
    case "empty":
    case "unknown":
    case "permission-denied": {
      const icon = state === "empty" ? "info" : state === "unknown" ? "cloud_off" : "lock";
      return (
        <View style={styles.center}>
          <IconBadge icon={icon} tone={state === "empty" ? "info" : "warning"} />
          <AppText variant="message" center>
            {text.message}
          </AppText>
          {text.hint ? (
            <AppText variant="small" tone="muted" center phrases>
              {text.hint}
            </AppText>
          ) : null}
          {state === "unknown" && onRetry && <Button variant="outline" label="もう一度ためす" onPress={onRetry} />}
          {action && <Button variant="outline" label={action.label} onPress={action.onPress} />}
        </View>
      );
    }
  }
}

// C7 の設定の状態を、画面の状態に直す（null = 読み込み中）。アプリと同じ
export function configViewState(config: ConfigState | null): ViewState {
  if (!config) return "loading";
  if (config.status === "unavailable") return "unknown";
  if (config.status === "stale") return "stale";
  return "success";
}

const styles = StyleSheet.create({
  // 空・読み込み中・取得できないは、残りの高さの真ん中に（Figma 子10-B・入01。Screen の本文が下まで広がる）
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space[4],
    paddingVertical: tokens.space[10],
  },
  stack: { gap: tokens.layout.cardGap },
});
