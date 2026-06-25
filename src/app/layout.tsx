import type { Metadata } from "next";
import { Inter, Heebo, JetBrains_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

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
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "Pakamon" }],
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pakamon | פכמון",
    description:
      "תכנון אקדמי חכם לתואר פילוסופיה, כלכלה ומדע המדינה — אוניברסיטת תל אביב",
    images: ["/og-image.svg"],
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
    <html lang={locale} dir={dir} suppressHydrationWarning className="light">
      <head>
        {/* Inline script to prevent theme flash on page load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem("pakam-ui")||"{}");var t=s&&s.state&&s.state.theme;var c=(t==="dark")?"dark":(t==="light")?"light":window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";document.documentElement.className=document.documentElement.className.replace(/\\b(dark|light)\\b/g,"")+" "+c}catch(e){document.documentElement.classList.add("light")}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${heebo.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
