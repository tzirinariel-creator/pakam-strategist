import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/router";
import { createTRPCContext } from "@/server/trpc/init";

// Vercel Hobby plan: max 60s. Needed for sync batches.
export const maxDuration = 60;
// Frankfurt region — closest Vercel region to TAU servers in Israel
export const preferredRegion = "fra1";
// Every response here is per-user and cookie-derived — never a static segment.
export const dynamic = "force-dynamic";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    // One query — courseKnowledge.getForCourses — is sent by POST from the
    // client, because its input is every course code in the catalog and the
    // GET URL had already reached 5,747 characters. Without this the adapter
    // rejects a POST for a query outright.
    //
    // Safe in this direction: it permits a READ over POST, never a write over
    // GET. And every response here is already `private, no-store`, so nothing
    // was relying on these being cacheable GETs.
    allowMethodOverride: true,
    createContext: () => createTRPCContext({ headers: req.headers }),
    // SEC — same bug class as the ICS calendar route, one layer up. Next's
    // default for a route handler is `cache-control: public, max-age=0,
    // must-revalidate` with `vary: trpc-accept` (measured on prod). Because
    // httpBatchLink sends every query as a GET, a student's whole academic
    // record — plan.getCredits, plan.getUserPlan, user.getProfile — went out
    // marked `public` with NO `Vary: Cookie`, i.e. with no signal to a shared
    // cache that the body is per-user. Vercel's CDN does not store Function
    // responses without explicit directives, so this was not exploitable on
    // our own edge — but the path from a TAU student to Vercel runs through
    // campus proxies we do not control. Say `private, no-store` explicitly.
    responseMeta: () => ({
      headers: { "cache-control": "private, no-store" },
    }),
    // Always log server-side (SEC1): in production the client now gets a masked
    // 500 message (see errorFormatter), so the real error must land in the
    // function logs or it is gone. Path + code + message only — no user data.
    onError: ({ path, error }) => {
      if (
        process.env.NODE_ENV === "development" ||
        error.code === "INTERNAL_SERVER_ERROR"
      ) {
        console.error(
          `tRPC ${error.code} on ${path ?? "<no-path>"}: ${error.message}`
        );
      }
    },
  });

export { handler as GET, handler as POST };
