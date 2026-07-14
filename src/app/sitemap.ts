import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://pakam-strategist.vercel.app";

/**
 * Sitemap for the PUBLIC story only (launch-gate 14.7): landing, auth doors,
 * and the legal/info pages. Protected app routes are auth-walled (and
 * disallowed in robots), so they don't belong here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const publicPaths = ["", "/login", "/signup", "/about", "/faq", "/privacy", "/terms", "/accessibility"];
  const locales = ["he", "en"];
  const now = new Date();
  return locales.flatMap((locale) =>
    publicPaths.map((path) => ({
      url: `${BASE}/${locale}${path}`,
      lastModified: now,
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.5,
    })),
  );
}
