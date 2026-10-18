// 画面の状態の出し分け（MVP_SPEC 5.3）。どの画面も、データの状態をこれで出す（取れなかった値を 0 分・0% と表示しない）。
//   loading           : 読み込み中（1秒を超える待ちには何をしているかを文で出す）
//   success           : 取れた → children を出す
//   empty             : 正しく取れたが記録が0件（「まだ記録がありません」。0 分とは別）
//   unknown           : 取得不可（通信失敗でキャッシュもない・端末から取れない）→ 再試行
//   stale             : 古いキャッシュ → 「最新でない可能性があります」の帯をつけて children を出す
//   validation-error  : 入力が受け付けられなかった → エラーの帯をつけて children（入力欄）を出したまま
//   permission-denied : 権限がない（使用状況へのアクセス・カメラ）→ 許可の案内と、設定を開くボタン
//   <StateView state={configViewState(config)} onRetry={refresh}>…中身…</StateView>
import type { ApiError } from "@contracts/errors";
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { ConfigState } from "@/lib/config-cache";
import { useColors } from "@/lib/theme";
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
  message?: string; // 状態ごとの既定の文を上書きする
  hint?: string;
  error?: ApiError | null; // validation-error・unknown のときに出す（あれば message と hint をこちらから取る）
  onRetry?: () => void; // unknown・stale で「もう一度ためす」
  action?: { label: string; onPress: () => void }; // empty・permission-denied のボタン（「設定を開く」など）
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
  const c = useColors();
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
          <ActivityIndicator size="large" color={c.primary} />
          <AppText tone="muted" center>
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
          <AppText variant="title" center>
            {text.message}
          </AppText>
          {text.hint ? (
            <AppText tone="muted" center>
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

// C7 の設定の状態を、画面の状態に直す（null = 読み込み中）
export function configViewState(config: ConfigState | null): ViewState {
  if (!config) return "loading";
  if (config.status === "unavailable") return "unknown";
  if (config.status === "stale") return "stale";
  return "success";
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: tokens.space[4], paddingVertical: tokens.space[10] },
  stack: { gap: tokens.layout.cardGap },
});
