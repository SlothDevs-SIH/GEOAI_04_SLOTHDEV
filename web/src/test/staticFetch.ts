import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";

/** Serve web/public files to fetch() so page tests use the real demo data. */
export function mockStaticFetch() {
  const root = resolve(__dirname, "../../public");
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, "").replace(/^\.?\//, "");
    try {
      const body = readFileSync(resolve(root, url), "utf8");
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    } catch {
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
