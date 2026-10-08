// 全画面共通の枠（lead の所有）。スマホ優先: スマホ幅で設計し、PC では中央に寄せて広げる。
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { FlowProvider } from "@/lib/flow";
import "./globals.css";

export const metadata: Metadata = { title: "（プロダクト名）" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        <FlowProvider>
          <main className="mx-auto w-full max-w-md px-4 py-6 md:max-w-3xl md:px-8 md:py-10">{children}</main>
        </FlowProvider>
      </body>
    </html>
  );
}
