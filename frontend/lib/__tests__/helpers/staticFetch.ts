import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Serve frontend/public files to fetch() so tests use the real demo data. */
export function mockStaticFetch() {
  const root = resolve(__dirname, "../../../public");
  const fn = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, "").replace(/^\.?\//, "").split("?")[0];
    try {
      const body = readFileSync(resolve(root, url));
      return new Response(body as never, { status: 200, headers: { "content-type": "application/json" } });
    } catch {
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}
