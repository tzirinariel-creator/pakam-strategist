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
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#5B5BD6",
    dir: "rtl",
    lang: "he",
    orientation: "portrait",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
