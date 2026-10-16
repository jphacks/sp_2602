"use client";
// 画面 result（front-b の担当）。このフォルダ内なら部品ファイルを自由に増やしてよい。
import Link from "next/link";
import { useFlow } from "@/lib/flow";

export default function ResultPage() {
  const { analyzeResult, ready } = useFlow();

  if (!ready) return null; // リロード直後、保存した結果を復元するまで待つ

  if (!analyzeResult) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-muted">まだ結果がありません。</p>
        <Link href="/home" className="text-primary underline">
          入力に戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">結果</h1>
      <p>{analyzeResult.summary}</p>
      <ul className="flex flex-col gap-3 md:grid md:grid-cols-2">
        {analyzeResult.verdicts.map((v) => (
          <li key={v.itemId} className="rounded-card border border-line bg-surface p-4">
            <span className="font-bold">{v.label}</span>
            <p className="text-sm text-muted">{v.reason}</p>
          </li>
        ))}
      </ul>
      <Link href="/home" className="min-h-11 text-primary underline">
        もう一度
      </Link>
    </section>
  );
}
