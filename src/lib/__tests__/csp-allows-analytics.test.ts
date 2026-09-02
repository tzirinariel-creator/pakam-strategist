// =========================================================================
// The measurement was installed and silently blocked
// =========================================================================
// Found while sweeping the console for errors nobody had reported. Every page
// load in production logged:
//
//   Loading the script 'https://va.vercel-scripts.com/v1/script.js' violates
//   the following Content Security Policy directive: "script-src 'self'
//   'unsafe-inline' https://accounts.google.com"
//
// @vercel/analytics and @vercel/speed-insights are BOTH mounted in
// app/layout.tsx, and the CSP allowed neither. So the app had no idea how many
// people used it, which screens they opened, or whether it was slow for them —
// days before a launch, on the one product where "did it work" is the entire
// question. It also filled the console with violations, which is exactly the
// noise a real error hides in.
//
// A header is easy to tighten and easy to forget what it broke, so the two
// facts are pinned together here: the scripts are mounted, and the policy
// admits them.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("the CSP admits what the app actually loads", () => {
  it("mounts Vercel analytics and speed insights", () => {
    expect(layout).toMatch(/<Analytics\s*\/>/);
    expect(layout).toMatch(/<SpeedInsights\s*\/>/);
  });

  it("allows the host that serves both of them", () => {
    const scriptSrc = /script-src[^`,]*/.exec(config)?.[0] ?? "";
    expect(scriptSrc).toContain("va.vercel-scripts.com");
  });

  it("still allows Google sign-in", () => {
    // The other third-party script on the page. A regression here logs a
    // student out of the only social login the app offers.
    const scriptSrc = /script-src[^`,]*/.exec(config)?.[0] ?? "";
    expect(scriptSrc).toContain("accounts.google.com");
  });

  it("has not quietly opened the policy to everything", () => {
    // The lazy fix for a CSP violation is a wildcard. This is the guard against
    // "it works now" turning into "there is no policy".
    const scriptSrc = /script-src[^`,]*/.exec(config)?.[0] ?? "";
    expect(scriptSrc).not.toContain("*");
    expect(scriptSrc).not.toContain("'unsafe-hashes'");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("default-src 'self'");
  });
});
