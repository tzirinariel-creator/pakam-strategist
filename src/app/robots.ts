import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://pakam-strategist.vercel.app";

/**
 * Crawler policy (launch-gate 14.7): the public story — landing, auth, legal —
 * is indexable; the app itself (protected routes redirect to login anyway) and
 * the API are explicitly off-limits so crawlers don't waste the redirect loop.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/he/dashboard",
          "/he/planner",
          "/he/calendar",
          "/he/record",
          "/he/graduation",
          "/he/regulations",
          "/he/exam-planner",
          "/he/exam",
          "/he/mentor",
          "/he/miluim",
          "/he/cohort",
          "/he/lineage",
          "/he/mentors",
          "/he/catalog",
          "/he/guide",
          "/he/settings",
          "/he/admin",
          "/en/dashboard",
          "/en/planner",
          "/en/calendar",
          "/en/record",
          "/en/graduation",
          "/en/regulations",
          "/en/exam-planner",
          "/en/exam",
          "/en/mentor",
          "/en/miluim",
          "/en/cohort",
          "/en/lineage",
          "/en/mentors",
          "/en/catalog",
          "/en/guide",
          "/en/settings",
          "/en/admin",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
