// Consent-based mentoring — the SECURITY contract through the real router:
// a plan is viewable ONLY via a live ACTIVE link, only by the mentor, and the
// query NEVER selects grades. Role confusion and stale links are denied.

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { mentorRouter } from "@/server/routers/mentor";

const MENTOR = { id: "11111111-1111-4111-8111-111111111111", supabaseId: "sb-mentor", email: "mentor@example.com", firstName: "רון", lastName: "כהן", displayName: null };
const MENTEE = { id: "22222222-2222-4222-8222-222222222222", supabaseId: "sb-mentee", email: "mentee@example.com", firstName: "דנה", lastName: "לוי", displayName: null };

type Link = { id: string; menteeUserId: string; mentorUserId: string; status: string; createdAt: Date; respondedAt: Date | null; endedAt: Date | null };

function makeDb(opts: { as: typeof MENTOR | typeof MENTEE; links?: Link[]; capture?: { select?: unknown } }) {
  const links = opts.links ?? [];
  const usersBySb: Record<string, unknown> = { [MENTOR.supabaseId]: MENTOR, [MENTEE.supabaseId]: MENTEE };
  const usersById: Record<string, unknown> = { [MENTOR.id]: MENTOR, [MENTEE.id]: MENTEE };
  return {
    user: {
      // enforceAuth loads ctx.user by supabaseId; also used by getMenteePlan (by id).
      findUnique: async ({ where }: { where: { supabaseId?: string; id?: string } }) =>
        (where.supabaseId ? usersBySb[where.supabaseId] : where.id ? usersById[where.id] : null) ?? null,
      findFirst: async ({ where }: { where: { email?: { equals?: string } } }) => {
        const e = where.email?.equals?.toLowerCase();
        return Object.values(usersById).find((u) => (u as { email: string }).email.toLowerCase() === e) ?? null;
      },
    },
    mentorLink: {
      findUnique: async ({ where }: { where: { id?: string; menteeUserId_mentorUserId?: { menteeUserId: string; mentorUserId: string } } }) => {
        if (where.menteeUserId_mentorUserId) {
          const k = where.menteeUserId_mentorUserId;
          return links.find((l) => l.menteeUserId === k.menteeUserId && l.mentorUserId === k.mentorUserId) ?? null;
        }
        return links.find((l) => l.id === where.id) ?? null;
      },
      findMany: async () => links,
      update: async ({ where, data }: { where: { id: string }; data: Partial<Link> }) => {
        const l = links.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      },
      create: async ({ data }: { data: Partial<Link> }) => {
        const l = { id: "link-new", createdAt: new Date(), respondedAt: null, endedAt: null, status: "PENDING", ...data } as Link;
        links.push(l);
        return l;
      },
    },
    userCourse: {
      findMany: async ({ select }: { select?: unknown }) => {
        if (opts.capture) opts.capture.select = select;
        return [];
      },
    },
  };
}

function caller(db: unknown, as: typeof MENTOR | typeof MENTEE) {
  return createCallerFactory(mentorRouter)({
    db: db as never,
    userId: as.supabaseId,
    session: { user: { id: as.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

const activeLink: Link = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", menteeUserId: MENTEE.id, mentorUserId: MENTOR.id, status: "ACTIVE", createdAt: new Date("2026-07-01"), respondedAt: new Date("2026-07-02"), endedAt: null };

describe("mentor router — plan access is gated on a live ACTIVE link", () => {
  it("mentor CAN read the plan when the link is ACTIVE, and grades are NEVER selected", async () => {
    const capture: { select?: unknown } = {};
    const db = makeDb({ as: MENTOR, links: [{ ...activeLink }], capture });
    const res = await caller(db, MENTOR).getMenteePlan({ menteeUserId: MENTEE.id });
    expect(res.menteeName).toBe("דנה לוי");
    // The privacy core: the course select must not include grade fields.
    const courseSelect = (capture.select as { course?: { select?: Record<string, unknown> } })?.course?.select ?? {};
    expect(courseSelect).not.toHaveProperty("grade");
    const topSelect = capture.select as Record<string, unknown>;
    expect(topSelect).not.toHaveProperty("grade");
    expect(topSelect).not.toHaveProperty("submissionGrade");
  });

  it("DENIES when there is no link at all", async () => {
    const db = makeDb({ as: MENTOR, links: [] });
    await expect(caller(db, MENTOR).getMenteePlan({ menteeUserId: MENTEE.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("DENIES a PENDING link (invite not yet accepted)", async () => {
    const db = makeDb({ as: MENTOR, links: [{ ...activeLink, status: "PENDING" }] });
    await expect(caller(db, MENTOR).getMenteePlan({ menteeUserId: MENTEE.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("DENIES an ENDED link (access revoked)", async () => {
    const db = makeDb({ as: MENTOR, links: [{ ...activeLink, status: "ENDED" }] });
    await expect(caller(db, MENTOR).getMenteePlan({ menteeUserId: MENTEE.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("DENIES role confusion — the MENTEE cannot pull the mentor's plan via the same active row", async () => {
    // Same ACTIVE link, but the mentee asks to view the mentor: no row matches
    // (menteeUserId/mentorUserId reversed) → forbidden.
    const db = makeDb({ as: MENTEE, links: [{ ...activeLink }] });
    await expect(caller(db, MENTEE).getMenteePlan({ menteeUserId: MENTOR.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("mentor router — invite / respond / end guards", () => {
  it("invite rejects self-invitation", async () => {
    const db = makeDb({ as: MENTEE, links: [] });
    await expect(caller(db, MENTEE).invite({ mentorEmail: MENTEE.email })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("invite rejects an unknown email", async () => {
    const db = makeDb({ as: MENTEE, links: [] });
    await expect(caller(db, MENTEE).invite({ mentorEmail: "nobody@example.com" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("invite creates a PENDING link for a real mentor", async () => {
    const db = makeDb({ as: MENTEE, links: [] });
    const r = await caller(db, MENTEE).invite({ mentorEmail: MENTOR.email });
    expect(r.status).toBe("PENDING");
    expect(r.mentorName).toBe("רון כהן");
  });

  it("respond: only the invited mentor may accept — the mentee cannot", async () => {
    const db = makeDb({ as: MENTEE, links: [{ ...activeLink, status: "PENDING" }] });
    await expect(caller(db, MENTEE).respond({ linkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", accept: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("respond: the mentor accepts → ACTIVE", async () => {
    const links = [{ ...activeLink, status: "PENDING", respondedAt: null } as Link];
    const db = makeDb({ as: MENTOR, links });
    const r = await caller(db, MENTOR).respond({ linkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", accept: true });
    expect(r.status).toBe("ACTIVE");
    expect(links[0]!.status).toBe("ACTIVE");
  });

  it("endLink: a stranger to the link is denied", async () => {
    const STRANGER = { ...MENTOR, id: "33333333-3333-4333-8333-333333333333", supabaseId: "sb-x", email: "x@example.com" };
    const db = makeDb({ as: MENTEE, links: [{ ...activeLink }] });
    // Caller identity is the stranger — patch the user lookup.
    (db.user as { findUnique: unknown }).findUnique = async ({ where }: { where: { supabaseId?: string } }) =>
      where.supabaseId === STRANGER.supabaseId ? STRANGER : null;
    await expect(caller(db, STRANGER).endLink({ linkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("endLink: the mentee can end an active link (revokes access)", async () => {
    const links = [{ ...activeLink } as Link];
    const db = makeDb({ as: MENTEE, links });
    const r = await caller(db, MENTEE).endLink({ linkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    expect(r.success).toBe(true);
    expect(links[0]!.status).toBe("ENDED");
  });
});
