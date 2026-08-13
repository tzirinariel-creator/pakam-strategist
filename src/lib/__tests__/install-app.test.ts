// #45 — the "add to home screen" decision, tested without a browser.
// The two failure modes we must never ship: showing an install BUTTON where no
// install API exists (iOS), and offering to install to somebody who is already
// running the installed app.

import { describe, it, expect } from "vitest";
import {
  detectInstallPlatform,
  shouldOfferInstall,
  isIOS,
  isIOSSafari,
} from "@/lib/install-app";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const DESKTOP_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("isIOS / isIOSSafari", () => {
  it("detects iPhone Safari", () => {
    expect(isIOS(IPHONE_SAFARI)).toBe(true);
    expect(isIOSSafari(IPHONE_SAFARI)).toBe(true);
  });

  it("does NOT treat Chrome-on-iOS as Safari (it cannot add to home screen)", () => {
    expect(isIOS(IPHONE_CHROME)).toBe(true);
    expect(isIOSSafari(IPHONE_CHROME)).toBe(false);
  });

  it("treats an iPad reporting a desktop UA as iOS via touch points", () => {
    // iPadOS 13+ ships the Macintosh UA string; only maxTouchPoints separates
    // it from a real Mac. Without this an iPad user is told nothing at all.
    expect(isIOS(MAC_SAFARI, 5)).toBe(true);
    expect(isIOS(MAC_SAFARI, 0)).toBe(false);
    expect(isIOSSafari(MAC_SAFARI, 5)).toBe(true);
  });
});

describe("detectInstallPlatform", () => {
  it("says nothing to someone already in the installed app", () => {
    const p = detectInstallPlatform({
      userAgent: ANDROID_CHROME,
      isStandalone: true,
      hasPromptEvent: true,
    });
    expect(p).toBe("installed");
    expect(shouldOfferInstall(p)).toBe(false);
  });

  it("gives iOS Safari instructions, never a button", () => {
    const p = detectInstallPlatform({
      userAgent: IPHONE_SAFARI,
      isStandalone: false,
      hasPromptEvent: false,
    });
    expect(p).toBe("ios-safari");
    expect(shouldOfferInstall(p)).toBe(true);
  });

  it("offers nothing on iOS outside Safari — Add to Home Screen is Safari-only", () => {
    const p = detectInstallPlatform({
      userAgent: IPHONE_CHROME,
      isStandalone: false,
      hasPromptEvent: false,
    });
    expect(p).toBe("ios-other");
    expect(shouldOfferInstall(p)).toBe(false);
  });

  it("waits for a REAL beforeinstallprompt before offering an install BUTTON", () => {
    const withoutEvent = detectInstallPlatform({
      userAgent: ANDROID_CHROME,
      isStandalone: false,
      hasPromptEvent: false,
    });
    // No captured event = no button. Guessing from the UA is how you ship a
    // button that does nothing when you click it. But Android without the
    // event is the COMMON case (Chrome wants a service worker, we have none),
    // so it still gets instructions rather than silence.
    expect(withoutEvent).toBe("android-manual");
    expect(shouldOfferInstall(withoutEvent)).toBe(true);

    const withEvent = detectInstallPlatform({
      userAgent: ANDROID_CHROME,
      isStandalone: false,
      hasPromptEvent: true,
    });
    expect(withEvent).toBe("prompt-capable");
    expect(shouldOfferInstall(withEvent)).toBe(true);
  });

  it("an installed Android user is never asked again", () => {
    const p = detectInstallPlatform({
      userAgent: ANDROID_CHROME,
      isStandalone: true,
      hasPromptEvent: false,
    });
    expect(p).toBe("installed");
    expect(shouldOfferInstall(p)).toBe(false);
  });

  it("offers nothing where there is no install path (desktop Firefox)", () => {
    const p = detectInstallPlatform({
      userAgent: DESKTOP_FIREFOX,
      isStandalone: false,
      hasPromptEvent: false,
    });
    expect(p).toBe("unsupported");
    expect(shouldOfferInstall(p)).toBe(false);
  });
});
