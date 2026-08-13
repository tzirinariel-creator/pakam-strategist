import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes פכמון installable ("add to home screen") with a real
 * icon and a standalone (no browser-chrome) window. Zero-cost, per the App-Store
 * research report: a PWA is the value-for-effort winner over a native wrapper.
 * Next serves this at /manifest.webmanifest and links it automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "פכמון — תכנון התואר",
    short_name: "פכמון",
    description:
      "תכנון אקדמי חכם לתואר פילוסופיה, כלכלה ומדע המדינה — אוניברסיטת תל אביב",
    // A stable identity so an update is recognised as the SAME installed app
    // rather than a second one appearing on the home screen.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // #45 — was "#ffffff". Android paints the launch splash with this, and the
    // app's real light canvas is #FCFCFD, so a pure-white splash handed off to
    // a slightly-grey app with a visible step. Matched to the canvas.
    background_color: "#FCFCFD",
    theme_color: "#5B5BD6",
    dir: "rtl",
    lang: "he",
    // #45 — `orientation: "portrait"` was a hard lock. The weekly timetable is
    // the flagship for bidding week and it is a SIX-column grid; landscape is
    // the one phone orientation where that grid fits without falling back to
    // the agenda list. Locking portrait forbade the best mobile view of the
    // most important screen. Unspecified = follow the device.
    categories: ["education", "productivity"],
    icons: [
      // Chrome's install criteria look for 192 and 512 `any` icons.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // #45 — the maskable slot used to point at the SAME file as `any`. That
      // file has transparent rounded corners and artwork running to the edge,
      // but a maskable icon is full-bleed and every Android launcher crops it
      // to its own shape — so the cap was being sliced and the corners were
      // whatever the launcher put behind them. This one is full-bleed with the
      // artwork inside the safe zone.
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
