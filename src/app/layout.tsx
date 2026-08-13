import type { Metadata, Viewport } from "next";
import { Rubik, JetBrains_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// One confident sans for everything — Hebrew (purpose-revised) + Latin, variable.
// Hierarchy comes from weight + size, the Linear/Vercel way. Heavy weights (700/800)
// carry display; 400/500/600 carry body and UI.
const sans = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Numeric / data display only (course codes, GPA, credits) — tabular figures.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://pakam-strategist.vercel.app"
  ),
  title: "Pakamon | פכמון",
  description:
    "תכנון אקדמי חכם לתואר פילוסופיה, כלכלה ומדע המדינה — אוניברסיטת תל אביב",
  openGraph: {
    title: "Pakamon | פכמון",
    description:
      "תכנון אקדמי חכם לתואר פילוסופיה, כלכלה ומדע המדינה — אוניברסיטת תל אביב",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pakamon" }],
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pakamon | פכמון",
    description:
      "תכנון אקדמי חכם לתואר פילוסופיה, כלכלה ומדע המדינה — אוניברסיטת תל אביב",
    images: ["/og-image.png"],
  },
  // PWA: iOS standalone launch ("add to home screen") with the app title.
  appleWebApp: {
    capable: true,
    title: "פכמון",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // #45 — was a single indigo value for both schemes. themeColor paints the
  // browser/OS chrome around the app, so a dark-mode user installing to the
  // home screen got an indigo bar sitting on top of a #0B0B0F app. Each scheme
  // now reports the surface the user is actually looking at.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0F" },
  ],
  // Extend the app under the iOS notch/home-bar so we can pad content back out
  // with the --safe-* insets — without this, env(safe-area-inset-*) is always 0
  // and the bottom nav sits under the home indicator (#20).
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`light ${sans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Inline script to prevent theme flash on page load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem("pakam-ui")||"{}");var t=s&&s.state&&s.state.theme;var c=(t==="dark")?"dark":(t==="light")?"light":window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";document.documentElement.className=document.documentElement.className.replace(/\\b(dark|light)\\b/g,"")+" "+c}catch(e){document.documentElement.classList.add("light")}})()`,
          }}
        />
        {/* Same trick for the ADVISOR PERSONA. The protected layout is dynamic
            SSR, so the server paints the default (the King) before any React
            runs — a student who chose the Referent would watch the King's name
            and face flash on every cold load. This stamps the device-local
            choice on <html> before first paint; globals.css then shows the
            right branch of <PersonaSwap> immediately. Keep the key in sync with
            PERSONA_KEY / PERSONA_ATTR in lib/persona.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.setAttribute("data-pk-persona",localStorage.getItem("pk-persona")==="referent"?"referent":"king")}catch(e){document.documentElement.setAttribute("data-pk-persona","king")}})()`,
          }}
        />
      </head>
      <body
        className="antialiased min-h-screen bg-background text-foreground"
      >
        {children}
        {/* PERF1 — real-user Core Web Vitals (p75 LCP/INP) in the Vercel
            dashboard. Free tier; no PII beyond standard web-vitals beacons. */}
        <SpeedInsights />
        {/* L4 (approved 11.7) — anonymous, cookieless page analytics. */}
        <Analytics />
      </body>
    </html>
  );
}
