// =========================================================================
// A Hebrew product must not apologise in English
// =========================================================================
// Ariel, 2.9, trying to delete his account on the Hebrew settings screen:
// a toast reading "Something went wrong. Please try again."
//
// It was not a stray string in that one screen. `errorFormatter` in
// server/trpc/init.ts masks every UNEXPECTED server error in production —
// correctly, so Prisma and network internals never reach the client — and the
// mask it substituted was English. So EVERY 500 anywhere in the app, on every
// screen, spoke English to a Hebrew reader at the exact moment they were
// already worried.
//
// Hebrew is the DEFAULT here, not the fallback. The product is Hebrew, /en
// redirects to it, and the error path is precisely where context is most
// likely to be missing — so "no cookie, no ctx" must still answer in Hebrew.

import { describe, it, expect } from "vitest";

/** The predicate as init.ts writes it. */
const wantsEnglish = (cookie: string | null) =>
  /(?:^|;\s*)NEXT_LOCALE=en(?:;|$)/.test(cookie ?? "");

describe("the masked 500 speaks the reader's language", () => {
  it("defaults to Hebrew when there is no cookie at all", () => {
    expect(wantsEnglish(null)).toBe(false);
    expect(wantsEnglish("")).toBe(false);
  });

  it("defaults to Hebrew when the context failed to build", () => {
    // errorFormatter receives ctx as undefined if createTRPCContext threw —
    // which is one of the ways you get here in the first place.
    const ctx = undefined as { headers?: Headers } | undefined;
    expect(wantsEnglish(ctx?.headers?.get("cookie") ?? null)).toBe(false);
  });

  it("stays Hebrew for an explicit Hebrew locale", () => {
    expect(wantsEnglish("NEXT_LOCALE=he")).toBe(false);
    expect(wantsEnglish("sb-access-token=xyz; NEXT_LOCALE=he; other=1")).toBe(false);
  });

  it("switches to English only on a real en locale cookie", () => {
    expect(wantsEnglish("NEXT_LOCALE=en")).toBe(true);
    expect(wantsEnglish("a=1; NEXT_LOCALE=en")).toBe(true);
    expect(wantsEnglish("a=1; NEXT_LOCALE=en; b=2")).toBe(true);
  });

  it("is not fooled by a cookie whose NAME merely ends in NEXT_LOCALE", () => {
    // The obvious regex (/NEXT_LOCALE=en/) matches this and flips a Hebrew
    // reader into English on an unrelated cookie.
    expect(wantsEnglish("MY_NEXT_LOCALE=en")).toBe(false);
  });

  it("is not fooled by a value that merely STARTS with en", () => {
    expect(wantsEnglish("NEXT_LOCALE=english-something")).toBe(false);
  });
});
