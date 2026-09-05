// =========================================
// Yedion HTTP Fetcher
// Handles GET (syllabus) + POST (search, exams)
// with rate limiting, retries, and session caching
//
// Proxy support: when SCRAPINGBEE_API_KEY is set,
// GET requests are routed through ScrapingBee to
// bypass TAU's cloud IP blocking.
// =========================================

import { env } from "@/lib/env";

const BASE_URL = "https://ims.tau.ac.il/tal";
const USER_AGENT = "PakamSync/1.0 (+https://pakam-strategist.vercel.app)";
const MAX_RETRIES = 3; // up to 2 retries (3 attempts) on network errors and 5xx/429
const TIMEOUT_MS = 15_000; // 15s per request (TAU can be slow from EU)

// =========================================
// Proxy configuration — ScrapingBee
// =========================================

// =========================================================================
// 6.9 — הסנכרון נכשל 401 על כל קורס, והסיבה היא תו אחד
// =========================================================================
// המפתח הזה נשמר בפרודקשן **עם תו שורה חדשה בסוף**, והוא נכנס לכתובת
// כפרמטר שאילתה. `URLSearchParams` מקודד אותו כ-`%0A`, ScrapingBee מקבל
// מפתח שאינו קיים, ומחזיר 401. מדדתי את שניהם מול ScrapingBee עם המפתח
// האמיתי של פרודקשן:
//
//     גולמי (URL מכיל %0A)  → HTTP 401 UNAUTHORIZED
//     חתוך                   → HTTP 200 OK
//
// זה בדיוק "Syllabus fetch failed: 401 UNAUTHORIZED" שהופיע במסך הסנכרון
// על כל שלושת הקורסים שנבדקו. אותה משפחת באגים כמו GOOGLE_REDIRECT_URI
// (lib/env.ts) — ערך שמגיע מבחוץ הוא קלט, ומחתכים אותו.
const SCRAPINGBEE_API_KEY = env("SCRAPINGBEE_API_KEY");

// When using proxy, ScrapingBee handles rate limiting on their end,
// so we can use a shorter delay. Direct requests keep the polite 1.5s.
const REQUEST_DELAY_MS = SCRAPINGBEE_API_KEY ? 500 : 1500;

/**
 * Wraps a target URL with ScrapingBee proxy if API key is configured.
 * Falls back to direct URL when no API key (e.g., local sync).
 *
 * Credit costs (free tier: 1000/month):
 * - regular proxy: 1 credit/request → ~1000 requests/month
 * - premium_proxy=true: 10 credits/request → ~100 requests/month
 *
 * We start with regular proxies to maximize budget.
 * If TAU blocks them too, set SCRAPINGBEE_PREMIUM=true in env.
 */
function buildProxiedUrl(targetUrl: string): string {
  if (!SCRAPINGBEE_API_KEY) return targetUrl;
  const usePremium = env("SCRAPINGBEE_PREMIUM") === "true";
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_API_KEY,
    url: targetUrl,
    render_js: "false",
  });
  if (usePremium) params.set("premium_proxy", "true");
  return `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
}

/**
 * Cached session state for POST-based pages (ASP.NET form state).
 * Reused across requests in the same sync run to avoid redundant GETs.
 */
interface FormSession {
  cookies: string;
  hiddenFields: Record<string, string>;
  fetchedAt: number;
}

let cachedSearchSession: FormSession | null = null;
let cachedExamSession: FormSession | null = null;
let lastRequestAt = 0;

// =========================================
// Rate limiter
// =========================================

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < REQUEST_DELAY_MS) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

// =========================================
// Retry wrapper
// =========================================

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await rateLimit();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
      });

      clearTimeout(timeout);

      // Retry transient server-side failures (5xx) and rate limiting (429).
      if (attempt < retries && (response.status >= 500 || response.status === 429)) {
        const backoff = REQUEST_DELAY_MS * Math.pow(2, attempt - 1);
        // Honor a numeric-only Retry-After header, clamped to 30s. Ignore HTTP-date form.
        const retryAfterRaw = response.headers.get("retry-after");
        let clampedRetryAfter = 0;
        if (retryAfterRaw) {
          const retryAfterSec = Number(retryAfterRaw);
          if (Number.isFinite(retryAfterSec)) {
            clampedRetryAfter = Math.min(retryAfterSec * 1000, 30_000);
          }
        }
        await new Promise((r) =>
          setTimeout(r, Math.max(backoff, clampedRetryAfter || 0))
        );
        continue;
      }

      return response;
    } catch (err) {
      if (attempt === retries) throw err;

      // Exponential backoff on network errors: REQUEST_DELAY_MS, ×2, ×4
      const backoff = REQUEST_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[fetcher] Attempt ${attempt}/${retries} failed for ${url}, retrying in ${backoff}ms...`
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  // TypeScript: should never reach here
  throw new Error("Exhausted retries");
}

// =========================================
// Public API
// =========================================

/**
 * Fetch a syllabus page via GET.
 * This is the most reliable endpoint — always available.
 *
 * @param courseCode10 - Full 10-digit code (8-digit course + 2-digit group), e.g. "0651100701"
 * @param year - Academic year, e.g. 2025 for תשפ"ו
 * @returns Raw HTML string
 */
export async function fetchSyllabus(
  courseCode10: string,
  year: number
): Promise<string> {
  const targetUrl = `${BASE_URL}/syllabus/Syllabus_L.aspx?lang=HE&course=${courseCode10}&year=${year}`;
  const fetchUrl = buildProxiedUrl(targetUrl);

  const response = await fetchWithRetry(fetchUrl, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "Accept-Language": "he",
    },
  });

  if (!response.ok) {
    throw new Error(`Syllabus fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Obtain a form session (cookies + hidden fields) from a given ASP.NET form page.
 * Used for POST-based pages that need __VIEWSTATE etc.
 */
async function getFormSession(formPagePath: string): Promise<FormSession> {
  const url = `${BASE_URL}/${formPagePath}`;

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "Accept-Language": "he",
    },
  });

  if (!response.ok) {
    throw new Error(`Form session GET failed: ${response.status}`);
  }

  // Extract cookies from response (with fallback for runtimes without getSetCookie)
  const setCookieHeaders =
    response.headers.getSetCookie?.() ??
    response.headers.get("set-cookie")?.split(",") ??
    [];
  const cookies = setCookieHeaders
    .map((c) => c.split(";")[0]) // Take "name=value" part only
    .join("; ");

  // Extract hidden fields from HTML using cheerio (more robust than regex)
  const html = await response.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  const hiddenFields: Record<string, string> = {};

  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value");
    if (name && value !== undefined) hiddenFields[name] = value;
  });

  return {
    cookies,
    hiddenFields,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch search result for a course (POST) — used to get credits (נ"ז).
 *
 * @param courseCode8 - 8-digit course code (without group), e.g. "06511007"
 * @param year - Academic year, e.g. 2025
 * @returns Raw HTML string of the search results
 */
export async function fetchSearchResult(
  courseCode8: string,
  year: number
): Promise<string> {
  // Refresh session if needed (cache for 10 minutes)
  const SESSION_TTL = 10 * 60 * 1000;
  if (
    !cachedSearchSession ||
    Date.now() - cachedSearchSession.fetchedAt > SESSION_TTL
  ) {
    cachedSearchSession = await getFormSession("kr/Search_P.aspx");
  }

  const formData = new URLSearchParams({
    ...cachedSearchSession.hiddenFields,
    txtKurs: courseCode8,
    lstYear: String(year),
    // Leave department/faculty fields empty — searching by course code only
    txtShemKurs: "",
    txtShemMore: "",
  });

  const response = await fetchWithRetry(
    `${BASE_URL}/kr/Search_L.aspx`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "Accept-Language": "he",
        Cookie: cachedSearchSession.cookies,
        Referer: `${BASE_URL}/kr/Search_P.aspx`,
      },
      body: formData.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Search POST failed: ${response.status}`);
  }

  return response.text();
}

/**
 * Search courses by department code prefix (POST).
 * Returns raw HTML with all courses matching the department code.
 *
 * @param deptCode - 4-digit department code prefix, e.g. "0651" (Philosophy)
 * @param year - Academic year, e.g. 2025
 * @returns Raw HTML string of search results
 */
export async function fetchDepartmentCourses(
  deptCode: string,
  year: number
): Promise<string> {
  const SESSION_TTL = 10 * 60 * 1000;
  if (
    !cachedSearchSession ||
    Date.now() - cachedSearchSession.fetchedAt > SESSION_TTL
  ) {
    cachedSearchSession = await getFormSession("kr/Search_P.aspx");
  }

  const formData = new URLSearchParams({
    ...cachedSearchSession.hiddenFields,
    txtKurs: deptCode,
    lstYear: String(year),
    txtShemKurs: "",
    txtShemMore: "",
  });

  const response = await fetchWithRetry(
    `${BASE_URL}/kr/Search_L.aspx`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "Accept-Language": "he",
        Cookie: cachedSearchSession.cookies,
        Referer: `${BASE_URL}/kr/Search_P.aspx`,
      },
      body: formData.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Department search POST failed: ${response.status}`);
  }

  return response.text();
}

/**
 * Fetch exam dates for a course (POST).
 *
 * @param courseCode - Course code (format TBD — will be refined during implementation)
 * @param year - Academic year, e.g. 2025
 * @param semester - 1=Fall, 2=Spring, 3=Summer
 * @returns Raw HTML string of the exam page
 */
export async function fetchExamDates(
  courseCode: string,
  year: number,
  semester: number
): Promise<string> {
  const SESSION_TTL = 10 * 60 * 1000;
  if (
    !cachedExamSession ||
    Date.now() - cachedExamSession.fetchedAt > SESSION_TTL
  ) {
    cachedExamSession = await getFormSession("kr/Bhina_P.aspx");
  }

  const formData = new URLSearchParams({
    ...cachedExamSession.hiddenFields,
    txtKurs: courseCode,
    lstYear: String(year),
    lstSemester: String(semester),
  });

  const response = await fetchWithRetry(
    `${BASE_URL}/kr/Bhina_L.aspx`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "Accept-Language": "he",
        Cookie: cachedExamSession.cookies,
        Referer: `${BASE_URL}/kr/Bhina_L.aspx`,
      },
      body: formData.toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Exam POST failed: ${response.status}`);
  }

  return response.text();
}

/**
 * Build the Yedion syllabus URL for a course (for storing in Course.yedionUrl).
 */
export function buildYedionUrl(courseCode10: string, year: number): string {
  return `${BASE_URL}/syllabus/Syllabus_L.aspx?lang=HE&course=${courseCode10}&year=${year}`;
}

/**
 * Clear cached sessions (useful for testing or forced refresh).
 */
export function clearSessionCache(): void {
  cachedSearchSession = null;
  cachedExamSession = null;
}
