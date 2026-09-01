import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isDemoEmail, DEMO_READONLY_MESSAGE } from "./demo";

/**
 * tRPC Context — available to all procedures
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const supabase = await createServerSupabase();
  // getUser() validates the JWT against the Supabase auth server, unlike getSession()
  // which only decodes the cookie — the documented-safe choice for server authorization.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    db: prisma,
    session: user ? { user } : null,
    supabase,
    userId: user?.id ?? null,
    headers: opts.headers,
    // PERF2 — request-scoped memo. The dashboard fires getUserPlan + getCredits
    // + getGraduationScore + checkCompliance in ONE batched HTTP request, and
    // each used to run its own identical `userCourse.findMany(include course)`
    // (plus two identical miluimSemester fetches). One context = one request,
    // so caching the promise here dedupes them without any staleness risk —
    // mutations are never batched with queries. Typed optional so router tests
    // can keep hand-building a loaders-less context (procedures fall back to
    // `createRequestLoaders(ctx.db)`).
    loaders: createRequestLoaders(prisma) as RequestLoaders | undefined,
  };
};

/**
 * See `loaders` above — one lazy promise per (user, dataset) per request.
 * Takes the db handle as a parameter so router tests (fake Prisma, hand-built
 * context without `loaders`) can fall back to `createRequestLoaders(ctx.db)`.
 */
export function createRequestLoaders(db: typeof prisma) {
  const userCourses = new Map<string, ReturnType<typeof queryUserCourses>>();
  const miluim = new Map<string, ReturnType<typeof queryMiluim>>();
  // Plain Promise, not Prisma's fluent PrismaPromise: `primeUser` stores an
  // already-resolved row, which has no fluent relation methods to offer.
  type MemoizedUser = Promise<Awaited<ReturnType<typeof queryUser>>>;
  const users = new Map<string, MemoizedUser>();

  function queryUserCourses(userId: string) {
    return db.userCourse.findMany({
      where: { userId },
      include: { course: true },
      orderBy: [{ plannedYear: "asc" }, { plannedSemester: "asc" }],
    });
  }
  function queryMiluim(userId: string) {
    return db.miluimSemester.findMany({ where: { userId } });
  }
  function queryUser(supabaseId: string) {
    return db.user.findUnique({ where: { supabaseId } });
  }

  return {
    /** All of the user's courses with Course included, plan-ordered. */
    userCoursesWithCourse(userId: string) {
      let p = userCourses.get(userId);
      if (!p) {
        p = queryUserCourses(userId);
        userCourses.set(userId, p);
      }
      return p;
    },
    /** The user's per-semester miluim rows. */
    miluimSemesters(userId: string) {
      let p = miluim.get(userId);
      if (!p) {
        p = queryMiluim(userId);
        miluim.set(userId, p);
      }
      return p;
    },
    /**
     * PERF3 — the Prisma User row for a verified Supabase identity.
     *
     * `createTRPCContext` runs ONCE per HTTP request, but `enforceAuth` is tRPC
     * middleware and therefore runs once per PROCEDURE. With httpBatchLink the
     * dashboard sends five procedures in one request, so the same
     * `SELECT … FROM users WHERE supabaseId = $1` ran five times — measured on
     * prod, that batch spent ~2.9s server-side. Memoizing the promise here
     * collapses it to one, exactly like the two loaders above: one context =
     * one request, and enforceAuth always runs BEFORE any handler, so nothing
     * can have written to the row between the memo and its use.
     */
    userBySupabaseId(supabaseId: string) {
      let p = users.get(supabaseId);
      if (!p) {
        p = queryUser(supabaseId);
        users.set(supabaseId, p);
      }
      return p;
    },
    /**
     * Seed the memo with a row we just created, so the remaining procedures in
     * a first-login batch see the new user instead of re-querying for it.
     */
    primeUser(supabaseId: string, user: Awaited<ReturnType<typeof queryUser>>) {
      users.set(supabaseId, Promise.resolve(user));
    },
  };
}

export type RequestLoaders = ReturnType<typeof createRequestLoaders>;

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * tRPC initialization
 */
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    // SEC1 — never leak internals to the client. tRPC already strips the stack
    // outside dev, but an UNEXPECTED exception (Prisma/network/library) surfaces
    // its raw message as-is. Mask 500s with a generic message in production;
    // deliberate TRPCErrors (FORBIDDEN demo guard, NOT_FOUND, BAD_REQUEST
    // validation) keep their intentional, user-facing messages.
    //
    // 2.9 — the mask was right and the LANGUAGE was wrong. This one string is
    // the fallback for every unexpected server error in the product, and it was
    // English. Ariel hit it on the Hebrew settings screen trying to delete his
    // account: "Something went wrong. Please try again." in the middle of an
    // otherwise Hebrew page. Every 500 anywhere in the app looked like that.
    //
    // Hebrew is the DEFAULT, not the fallback: the product is Hebrew, /en
    // redirects to it, and a context that failed to build (no ctx, no cookie)
    // must still answer in the language the user is actually reading.
    if (
      process.env.NODE_ENV === "production" &&
      error.code === "INTERNAL_SERVER_ERROR"
    ) {
      const isEn = /(?:^|;\s*)NEXT_LOCALE=en(?:;|$)/.test(
        ctx?.headers?.get("cookie") ?? "",
      );
      return {
        ...shape,
        message: isEn
          ? "Something went wrong on our side. Please try again."
          : "משהו השתבש אצלנו. נסו שוב.",
      };
    }
    return shape;
  },
});

/**
 * Reusable middleware and procedure helpers
 */
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Public procedure — no auth required
 */
export const publicProcedure = t.procedure;

/**
 * Auth middleware — ensures user is logged in AND exists in Prisma DB.
 * Auto-creates the Prisma User record if Supabase session is valid
 * but the DB record doesn't exist yet (prevents race condition on first login).
 *
 * Also enforces the SHARED demo account as strictly READ-ONLY: any `mutation`
 * (write) run while authenticated as the demo user is rejected, while every
 * `query` (read) passes through so the showcase stays fully browsable. The
 * demo identity is matched by email (see `isDemoEmail`), and the single check
 * here covers every protected/admin mutation across all routers — no
 * per-procedure duplication. Reads are never blocked.
 */
const enforceAuth = t.middleware(async ({ ctx, type, next, path }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please log in to access this resource" });
  }

  // Auto-ensure user exists in Prisma DB (prevents race condition after signup).
  // Resolve strictly by supabaseId — the session's verified identity. We never
  // adopt an existing row by email: signup is open, so an email already present
  // in Prisma belongs to a different (earlier) account, and rewriting its
  // supabaseId to a new session would hand that account's entire record to the
  // new authenticator (account takeover). A session whose supabaseId has no row
  // is a brand-new user and gets a fresh row below.
  // PERF3 — one User lookup per REQUEST, not per procedure. See
  // `createRequestLoaders.userBySupabaseId`. The `??` fallback keeps
  // loaders-less hand-built test contexts working unchanged.
  const loaders = ctx.loaders ?? createRequestLoaders(ctx.db);
  let user = await loaders.userBySupabaseId(ctx.session.user.id);

  if (!user) {
    // Populate displayName from verified session metadata. Email-confirm signups
    // carry `display_name` (set in the signUp options); OAuth providers carry
    // `full_name` / `name`. Fall back to null when none is present.
    const meta = ctx.session.user.user_metadata as
      | Record<string, unknown>
      | undefined;
    const displayName =
      ((meta?.display_name ?? meta?.full_name ?? meta?.name) as
        | string
        | undefined) ?? null;

    user = await ctx.db.user.create({
      data: {
        supabaseId: ctx.session.user.id,
        email: ctx.session.user.email ?? "",
        displayName,
      },
    });
    loaders.primeUser(ctx.session.user.id, user);
  }

  // Demo account is read-only: reject every write (mutation) for the shared
  // showcase login, but let reads (queries) through untouched. Match by the
  // demo user's verified email — never a hardcoded id.
  // EXCEPTION: user.resetDemoUser is how the demo is re-seeded to a clean state
  // on each demo-login; it only touches the demo user's OWN data and its handler
  // re-verifies the demo email, so it must be allowed to run (#audit-r3 — the
  // blanket block made the demo un-resettable, leaving stale state).
  if (type === "mutation" && isDemoEmail(user.email) && path !== "user.resetDemoUser") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: DEMO_READONLY_MESSAGE,
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      userId: ctx.session.user.id,
      user,
    },
  });
});

/**
 * Protected procedure — requires authentication
 */
export const protectedProcedure = t.procedure.use(enforceAuth);

/**
 * Admin middleware — checks that the user (already authenticated by enforceAuth)
 * has the "admin" role. Must be chained AFTER enforceAuth.
 */
const enforceAdmin = t.middleware(async ({ ctx, next }) => {
  // ctx.user is set by enforceAuth — cast to access role field
  const user = (ctx as Record<string, unknown>).user as
    | { role: string }
    | undefined;
  if (!user || user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx });
});

/**
 * Admin procedure — requires authentication + admin role.
 * Chains enforceAuth (login + DB user) → enforceAdmin (role check).
 */
export const adminProcedure = t.procedure.use(enforceAuth).use(enforceAdmin);
