// アプリ全体の枠（lead の担当）。画面間の受け渡し（useFlow）を包み、画面の切り替え（Stack）を置く。
import { tokens } from "@contracts/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { FlowProvider } from "@/lib/flow";

export default function RootLayout() {
  return (
    <FlowProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: tokens.color.surface },
          headerTintColor: tokens.color.text,
          contentStyle: { backgroundColor: tokens.color.bg },
        }}
      />
    </FlowProvider>
  );
}
