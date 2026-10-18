// 型付きクライアント。画面はここ経由でだけサーバと通信する（パスを手書きしない。画面で fetch を書かない）。
//   const r = await call("planGet", { childId });
//   const r = await stream(<ストリームの API 名>, 入力, (chunk) => …);（今はストリームの API がない）
// 失敗は必ず ApiCallError で投げられる。画面は catch で setError(errorOf(e)) とし、message と hint を出せばよい。
// つなぎ先は環境変数 EXPO_PUBLIC_API_URL（.env に書く）。未設定なら Android エミュレータから見た手元の PC（http://10.0.2.2:3000）。
//   実機で試すときは、PC の LAN の IP（例 http://192.168.0.5:3000）を .env に書く（同じ Wi-Fi につなぐ）。
// 中断: 時間制限は { signal: timeoutSignal(ミリ秒) } → 「時間切れ」。signal を渡さない call() は DEFAULT_TIMEOUT_MS で時間切れになる。
//       自分で止めた（画面を離れた等）は AbortController.abort() → errorOf が null を返すので何も出ない。
// fetch は expo/fetch（少しずつ届く応答を読める。標準の fetch は React Native では読めない）を使う。
// 合言葉: ログイン（call("authGoogle", …)）で受け取った Session の token を setSessionToken() で覚えると、
//   以降の call() / stream() が Authorization: Bearer <token> を付ける。端末への保存とログイン状態は src/lib/session.tsx が持つ。
//   サーバが 401（合言葉が無効）を返したら setUnauthorizedHandler() で渡した関数を呼ぶ（session.tsx がログアウト扱いにする）。
//   関数にはサーバの返事（ApiError）を渡す。保護者が連携を外したときは reason: "family_unlink" が付いている（D-133）。
import {
  api,
  type Chunk,
  type JsonRoute,
  type Req,
  type Res,
  type RouteName,
  type StreamDef,
  type StreamRoute,
  streamLine,
} from "@contracts/api";
import { ApiError, errorText } from "@contracts/errors";
import { fetch } from "expo/fetch";

// .env.example の `EXPO_PUBLIC_API_URL=`（空）は "" として埋め込まれるので、?? ではなく || で「空も未設定」とみなす
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000").replace(/\/$/, "");

// API の完全な URL（JS の外から呼ぶもの用。Kotlin の監視が許可の状態を直接送る送り先。D-113・src/lib/session.tsx）
export function apiUrl(name: RouteName): string {
  return `${BASE_URL}${api[name].path}`;
}

// 時間切れで止めた signal を覚えておく（fetch が「時間切れ」か「自分で中断」かを区別できない実装でも見分けるため）
const timedOut = new WeakSet<AbortSignal>();

// 指定ミリ秒で中断する signal（AbortSignal.timeout は React Native にない場合があるので、自前で作る）
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    timedOut.add(controller.signal);
    controller.abort();
  }, ms);
  return controller.signal;
}

let sessionToken: string | null = null;
let onUnauthorized: ((error: ApiError) => void) | null = null;

// ログインしたら合言葉を覚える（ログアウト・合言葉が無効になったら null）
export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

// 今覚えている合言葉（ログアウト・401 のあとは null）。待っている間に Session が入れ替わった・消えたかを見るため
// （child-data.tsx の定期取得。session-core.ts はログアウト状態にするとき、まず null にする）
export function currentSessionToken(): string | null {
  return sessionToken;
}

// 合言葉を付けて送ったのに 401 が返ったときに呼ぶ関数（session.tsx が登録する。null で外す）。サーバの返事（ApiError）を渡す
export function setUnauthorizedHandler(fn: ((error: ApiError) => void) | null): void {
  onUnauthorized = fn;
}

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

export class ApiCallError extends Error {
  constructor(
    readonly error: ApiError,
    readonly status: number,
  ) {
    super(error.message);
  }
}

// 合言葉が無効と言われたか（401）。本文が読めない 401（間にある仕組みが返したもの等）も含める。
// session.tsx の起動時の確認で、これを「通信できない（offline で続ける）」と取り違えないため
export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiCallError && (e.status === 401 || e.error.code === "unauthorized");
}

// 自分の役割・自分の子どもの範囲で呼んだのに 403（forbidden）が返ったか。返ったら、サーバに「自分は誰か」を確かめ直す
// （session.tsx の refresh。child-data.tsx・parent-data.tsx が使う）。
// なぜ: 合言葉はまだ有効なのに、サーバ側の人の id・役割が変わることがある（#49 の DB 版のサーバでは、デモの人の合言葉は固定のまま
//   id が uuid になる）。前は起動し直すまで古い id のまま呼び続け、設定は「最新でない可能性」のまま、利用記録は送るたびに隔離されて溜まった
export function needsIdentityCheck(error: ApiError | null | undefined): boolean {
  return error?.code === "forbidden";
}

// どんな例外でも画面に出せる形にする。自分で中断した場合だけ null（エラー表示しない）
export function errorOf(e: unknown): ApiError | null {
  if (e instanceof ApiCallError) return e.error;
  if (isAbort(e)) return null;
  return { code: "internal", ...errorText.internal };
}

async function send(path: string, method: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // 送ったときの合言葉（401 が返ったとき、それがまだ今の合言葉かを確かめるため）
  const sentToken = sessionToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // 時間切れ（timeoutSignal）は timeout、自分で中断した（AbortError）はそのまま渡して errorOf() が null にする
    if (signal && timedOut.has(signal)) throw new ApiCallError({ code: "timeout", ...errorText.timeout }, 0);
    if (isAbort(e)) throw e;
    throw new ApiCallError({ code: "network", ...errorText.network }, 0);
  }
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    // 401 で「ログアウト扱い」にするのは、次の両方のときだけ。
    //   - サーバの返事の形（ApiError）で unauthorized（Vercel の保護ページなど、ほかの 401 でログアウトして端末のデータを消さない）
    //   - 送った合言葉がまだ今の合言葉（ログインし直したあとに、前の合言葉で送っていた呼び出しの 401 が遅れて届いても、
    //     新しくログインした人までログアウトさせない）。本文を読み終えたあとで比べる（読んでいる間にログインし直すこともあるため）
    const unauthorized = res.status === 401 && parsed.success && parsed.data.code === "unauthorized";
    if (unauthorized && sentToken && sentToken === sessionToken) onUnauthorized?.(parsed.data);
    throw new ApiCallError(parsed.success ? parsed.data : { code: "internal", ...errorText.internal }, res.status);
  }
  return res;
}

// signal を渡さなかった call() の時間制限。
// なぜ: 前は時間制限がなく、サーバが応答を返さないまま止まる（adb reverse の途切れ・PC のスリープなど）と、
//   その呼び出しが終わらなかった。usePolling は前の呼び出しが終わるまで次を飛ばすので、設定の取得（C7）・
//   利用記録の送信（C8）・家族の取得が二度と走らず、画面も送信待ちも止まったままになった。
//   時間切れにすれば、C7 は手元の組を stale で出し、C8 は送信待ちのまま後で送り直す（どちらも一時的な失敗として扱う）。
export const DEFAULT_TIMEOUT_MS = 20_000;

export async function call<K extends JsonRoute>(
  name: K,
  body?: Req<K>,
  opts: { signal?: AbortSignal } = {},
): Promise<Res<K>> {
  const r = api[name];
  const signal = opts.signal ?? timeoutSignal(DEFAULT_TIMEOUT_MS);
  const res = await send(r.path, r.method, body, signal);
  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    // 応答の途中で時間切れになった（本文を読み終える前に止めた）ときも「時間切れ」にする
    if (timedOut.has(signal)) throw new ApiCallError({ code: "timeout", ...errorText.timeout }, 0);
    throw e;
  }
  return r.res.parse(json) as Res<K>;
}

export async function stream<K extends StreamRoute>(
  name: K,
  body: Req<K>,
  onChunk: (chunk: Chunk<K>) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<Res<K>> {
  return streamRoute(api[name] as unknown as StreamDef, body, onChunk as (chunk: unknown) => void, opts) as Promise<
    Res<K>
  >;
}

// stream() の中身。契約の表にない StreamDef でも使える（テストで仕組みを確かめるため）
export async function streamRoute(
  r: StreamDef,
  body: unknown,
  onChunk: (chunk: unknown) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  const res = await send(r.path, r.method, body, opts.signal);
  if (!res.body) throw new ApiCallError({ code: "internal", ...errorText.internal }, res.status);

  const line = streamLine(r.chunk, r.res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder(); // 日本語が2つの塊にまたがっても欠けないよう、stream: true で少しずつ読む
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const msg = line.parse(JSON.parse(raw));
      if (msg.type === "chunk") onChunk(msg.data);
      else if (msg.type === "done") return msg.data;
      else throw new ApiCallError(msg.error, res.status);
    }
    if (done) break;
  }
  throw new ApiCallError({ code: "network", ...errorText.network }, 0); // done が来ないまま切れた
}
