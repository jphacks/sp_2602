"use client";
// 画面 home（front-a の担当）。このフォルダ内なら部品ファイルを自由に増やしてよい（例: ./ItemForm.tsx）。
// 例として、ストリームで途中経過を表示しながら判定し、終わったら result へ進む。
import type { ApiError } from "@contracts/errors";
import { demoInput } from "@contracts/fixtures";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorOf, stream } from "@/lib/api";
import { useFlow } from "@/lib/flow";

export default function HomePage() {
  const router = useRouter();
  const { setAnalyzeResult } = useFlow();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setProgress([]);
    try {
      // TODO(front-a, S2): 入力欄の値を渡す（今はデモ用の固定入力）
      const result = await stream("analyzeStream", demoInput, (chunk) => setProgress((p) => [...p, chunk.text]));
      setAnalyzeResult(result);
      router.push("/result");
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">入力</h1>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="min-h-11 rounded-button bg-primary px-6 text-primary-fg disabled:opacity-60 md:self-start"
      >
        {busy ? "判定しています…" : "判定する"}
      </button>
      {progress.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-muted" aria-live="polite">
          {progress.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 追記だけで並び替えない
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {error && (
        <div className="rounded-card border border-danger p-4" role="alert">
          <p className="text-danger">{error.message}</p>
          <p className="text-sm text-muted">{error.hint}</p>
        </div>
      )}
    </section>
  );
}
