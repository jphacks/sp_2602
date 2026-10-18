// 入力の文字とエラーのログ（セキュリティ検査 F-3 / IN-06・F-4 / IN-12）。
// 前は packageName に NUL（\u0000）を入れると DB が断って 500 になり、そのときのログに SQL の params（利用者の入力・利用者 ID）が
// そのまま出て、入力の改行（\r\n）でログの行を偽装できた
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError } from "@/server/errors";
import { CHILD_ID, codeOf, fresh, PARENT, post } from "../verify/helpers";

const NOW = "2026-10-15T03:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

const save = (packageName: string) =>
  post(
    "/api/excluded-apps/save",
    { childId: CHILD_ID, expectedVersion: 1, apps: [{ packageName, label: "アプリ" }] },
    PARENT,
  );

describe("NUL・改行を含む入力は 400 で断る（F-3 / IN-06）", () => {
  it("packageName に NUL・改行・空白・ほかの記号があれば bad_request（DB まで行かない・ログも出ない）", async () => {
    await fresh(NOW);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const name of [
      "com.evil\u0000\r\nX-Injected: 1",
      "com.evil\r\nX-Injected: 1",
      "com evil",
      "com.evil/x",
      ".com",
      "com..x",
    ]) {
      const res = await save(name);
      expect(res.status, JSON.stringify(name)).toBe(400);
      expect(await codeOf(res)).toBe("bad_request");
    }
    expect(logged).not.toHaveBeenCalled();
  });

  it("どの項目でも NUL があれば bad_request（応答に入力の値を返さない）", async () => {
    await fresh(NOW);
    const res = await post(
      "/api/usage/get",
      { childId: `${CHILD_ID}\u0000`, from: "2026-10-12", to: "2026-10-18" },
      PARENT,
    );
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).not.toContain(CHILD_ID);
  });
});

describe("エラーのログには入力を出さない（F-4 / IN-12）", () => {
  it("describeError は種類とコードと場所だけ。message（SQL・params）は出さない", () => {
    const pg = Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: "22021" });
    const drizzle = new Error("Failed query: insert ... params: false,parent-uuid,com.evil\u0000\r\nX-Injected: 1", {
      cause: pg,
    });
    drizzle.name = "DrizzleQueryError";
    const line = describeError(drizzle);
    expect(line).toContain("DrizzleQueryError <- Error(22021)");
    expect(line).not.toContain("params");
    expect(line).not.toContain("X-Injected");
    expect(line).not.toContain("parent-uuid");
    for (const ch of ["\r", "\n", "\u0000"]) expect(line).not.toContain(ch);
  });

  it("message に「改行＋空白＋at 」があっても、場所の行として出さない（\\n・\\r\\n・\\r）。本当の場所の行は出す", () => {
    for (const br of ["\n", "\r\n", "\r"]) {
      const pg = Object.assign(new Error("bad"), { code: "22021" });
      const drizzle = new Error(
        `Failed query: insert ...${br}params: x${br}    at [INJECTED] child=tanaka@example.com secret-token-123`,
        { cause: pg },
      );
      const line = describeError(drizzle);
      expect(line, JSON.stringify(br)).not.toContain("INJECTED");
      expect(line).not.toContain("tanaka@example.com");
      expect(line).not.toContain("secret-token-123");
      expect(line).toContain("input-safety.test.ts"); // このテストの中で作ったエラーなので、場所の行にこのファイルが出る
      for (const ch of ["\r", "\n"]) expect(line).not.toContain(ch);
    }
  });

  it("stack を読んだ後で message を書きかえたエラーは、場所を出さない（stack の頭に元の message が残るため）", () => {
    const e = new Error("x\n    at [INJECTED] secret-token-123");
    expect(e.stack).toContain("INJECTED"); // stack の頭は最初に読んだときに決まる。先に読んでから書きかえる
    e.message = "changed";
    const line = describeError(e);
    expect(line).not.toContain("INJECTED");
    expect(line).toBe("Error");
  });

  it("文字列のコードがおかしな形なら出さない", () => {
    const e = Object.assign(new Error("x"), { code: "a\r\nX-Injected: 1" });
    expect(describeError(e)).not.toContain("X-Injected");
  });
});
