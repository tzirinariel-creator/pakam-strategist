import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/router";
import { createTRPCContext } from "@/server/trpc/init";

// Vercel Hobby plan: max 60s. Needed for sync batches.
export const maxDuration = 60;
// Frankfurt region — closest Vercel region to TAU servers in Israel
export const preferredRegion = "fra1";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
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
