/**
 * #45 — "add to home screen", done properly.
 *
 * We are not shipping to an app store; the home-screen install IS the app. The
 * install path is not the same everywhere, and getting it wrong means either
 * showing an install button that cannot work (iOS Safari has no
 * `beforeinstallprompt`) or nagging someone who has already installed. This
 * module holds that decision as PURE logic so it can be tested without a
 * browser — the component only wires it to the real events.
 */

export type InstallPlatform =
  /** Already running from the home screen / an installed window — say nothing. */
  | "installed"
  /** iOS Safari: no install API exists. The honest answer is instructions. */
  | "ios-safari"
  /** iOS inside a non-Safari browser: Add-to-Home-Screen is Safari-only there. */
  | "ios-other"
  /** A real `beforeinstallprompt` was captured — we can offer a true button. */
  | "prompt-capable"
  /**
   * Android, but no prompt event. Chrome only fires `beforeinstallprompt` when
   * the app meets its install criteria (which today includes a service worker —
   * we have none), so this is the COMMON Android case, not an edge one. The
   * browser menu still offers "Install app", so instructions are the right
   * answer here rather than silence.
   */
  | "android-manual"
  /** Anything else (e.g. desktop Firefox) — no reliable install path. */
  | "unsupported";

export interface InstallEnv {
  userAgent: string;
  /** `display-mode: standalone` (or `navigator.standalone` on iOS). */
  isStandalone: boolean;
  /** True once a `beforeinstallprompt` event has actually been captured. */
  hasPromptEvent: boolean;
}

/** iPadOS 13+ reports a desktop Safari UA; the touch-point count gives it away. */
export function isIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Real Safari only — Chrome/Firefox/Edge on iOS all carry "Safari" in their UA. */
export function isIOSSafari(userAgent: string, maxTouchPoints = 0): boolean {
  if (!isIOS(userAgent, maxTouchPoints)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(userAgent);
}

export function detectInstallPlatform(
  env: InstallEnv,
  maxTouchPoints = 0,
): InstallPlatform {
  if (env.isStandalone) return "installed";
  if (isIOS(env.userAgent, maxTouchPoints)) {
    return isIOSSafari(env.userAgent, maxTouchPoints) ? "ios-safari" : "ios-other";
  }
  // A captured prompt event is proof, not a guess — never show an install
  // BUTTON on the strength of a user-agent string alone.
  if (env.hasPromptEvent) return "prompt-capable";
  if (/Android/i.test(env.userAgent)) return "android-manual";
  return "unsupported";
}

/** Whether there is anything worth showing the user at all. */
export function shouldOfferInstall(platform: InstallPlatform): boolean {
  return (
    platform === "ios-safari" ||
    platform === "prompt-capable" ||
    platform === "android-manual"
  );
}
