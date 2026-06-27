import type { Metadata } from "next";
import { Rubik, JetBrains_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
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
      </head>
      <body
        className="antialiased min-h-screen bg-background text-foreground"
      >
        {children}
      </body>
    </html>
  );
}
