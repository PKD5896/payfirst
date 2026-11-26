import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const request = (cookie?: string) =>
  new NextRequest("http://localhost/checkout", cookie ? { headers: { cookie } } : undefined);

describe("proxy", () => {
  it("assigns a new visitor ID on the first visit", () => {
    const setCookie = proxy(request()).headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^pf_vid=[0-9a-f-]{36};/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
  });

  it("makes the new ID visible to the page rendering the same request", () => {
    const res = proxy(request());
    const id = /pf_vid=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(res.headers.get("x-middleware-request-cookie")).toContain(`pf_vid=${id}`);
  });

  it("keeps an existing valid ID", () => {
    expect(proxy(request("pf_vid=returning-shopper-01")).headers.get("set-cookie")).toBeNull();
  });

  it("replaces a malformed ID", () => {
    expect(proxy(request("pf_vid=bad id!")).headers.get("set-cookie")).toMatch(/^pf_vid=[0-9a-f-]{36};/);
  });

  it("does not run on API routes or static files", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/checkout")).toBe(true);
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/api/orders")).toBe(false);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
  });
});
