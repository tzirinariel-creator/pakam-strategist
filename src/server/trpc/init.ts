import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * tRPC initialization
 */
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
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
 */
const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please log in to access this resource" });
  }

  // Auto-ensure user exists in Prisma DB (prevents race condition after signup).
  // First try by supabaseId, then by email (handles re-created Supabase accounts).
  let user = await ctx.db.user.findUnique({
    where: { supabaseId: ctx.session.user.id },
  });

  if (!user && ctx.session.user.email) {
    // User might exist with same email but different supabaseId (e.g. re-created Supabase account)
    user = await ctx.db.user.findUnique({
      where: { email: ctx.session.user.email },
    });

    if (user) {
      // Update supabaseId to match the new session
      user = await ctx.db.user.update({
        where: { id: user.id },
        data: { supabaseId: ctx.session.user.id },
      });
    }
  }

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
