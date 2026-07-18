// aiRouter through the REAL tRPC caller against a fake Prisma. Locks two things
// the assistant's safety rests on: (1) a BYOK key is only ever persisted
// ENCRYPTED (never the plaintext), for either provider, and junk is refused;
// (2) one user can never read or delete ANOTHER user's chat session.
//
// @/lib/crypto and @/lib/ai/provider run for REAL here (they're already
// unit-tested) — only Prisma is faked. The prod DB is never touched, so any
// valid 64-hex ENCRYPTION_KEY works; the real AES-256-GCM crypto reads it at
// call time, so setting it at module scope (before any encrypt/decrypt call) is
// enough. Use the machine's key if one is present, otherwise a deterministic
// test key.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "1a".repeat(32);

import { describe, it, expect } from "vitest";
import { createCallerFactory } from "@/server/trpc/init";
import { aiRouter } from "@/server/routers/ai";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

// A real Gemini free-tier key ("AIza…") and a real Claude key ("sk-ant-…"),
// both shaped to pass the provider's format check (see @/lib/ai/provider).
const GEMINI_KEY = "AIzaSyTEST0123456789abcdefghij0123456789";
const CLAUDE_KEY = "sk-ant-api03-abcdefghij0123456789ABCDEFG";

const USER = { id: "user-1", supabaseId: "sb-1", email: "t@example.com" };
const OTHER_USER_ID = "someone-else";
// Valid v4 UUIDs — the session-id input is `z.string().uuid()`.
const FOREIGN_SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWN_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface FakeSession {
  id: string;
  userId: string;
  title: string | null;
  persona: string | null;
  messages: unknown[];
  context: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function makeSession(id: string, userId: string): FakeSession {
  return {
    id,
    userId,
    title: "שיחה",
    persona: "king",
    messages: [{ role: "user", content: "היי" }],
    context: null,
    createdAt: new Date("2026-07-01T10:00:00"),
    updatedAt: new Date("2026-07-02T10:00:00"),
  };
}

function makeDb(opts: { encryptedClaudeKey?: string | null; sessions?: FakeSession[] } = {}) {
  // The row enforceAuth loads (by supabaseId) and hands to the router as ctx.user.
  const userRow = {
    id: USER.id,
    supabaseId: USER.supabaseId,
    email: USER.email,
    encryptedClaudeKey: opts.encryptedClaudeKey ?? null,
  };
  const userUpdates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const sessionDeletes: Array<unknown> = [];
  const sessions: FakeSession[] = opts.sessions ?? [];

  return {
    userRow,
    userUpdates,
    sessionDeletes,
    sessions,
    user: {
      // enforceAuth resolves the caller strictly by supabaseId — the fixture is
      // that verified user, so ignore the arg and return it.
      findUnique: async () => userRow,
      update: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
        userUpdates.push({ where, data });
        Object.assign(userRow, data);
        return userRow;
      },
    },
    chatSession: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        sessions.find((s) => s.id === where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        sessionDeletes.push(where);
        const i = sessions.findIndex((s) => s.id === where.id);
        const removed = i >= 0 ? sessions.splice(i, 1)[0] : null;
        return removed;
      },
    },
  };
}

function makeCaller(db: ReturnType<typeof makeDb>) {
  const createCaller = createCallerFactory(aiRouter);
  return createCaller({
    db: db as never,
    userId: USER.supabaseId,
    session: { user: { id: USER.supabaseId } } as never,
    supabase: {} as never,
    headers: new Headers(),
    loaders: undefined,
  });
}

describe("aiRouter.saveApiKey — BYOK stored ENCRYPTED, never plaintext", () => {
  it("stores a Gemini key encrypted (not the plaintext) and reports provider + mask", async () => {
    const db = makeDb();
    const res = await makeCaller(db).saveApiKey({ apiKey: GEMINI_KEY });

    expect(res.success).toBe(true);
    expect(res.provider).toBe("gemini");

    // Exactly one row-write, and the value written is the ENCRYPTED key.
    expect(db.userUpdates).toHaveLength(1);
    const written = db.userUpdates[0]!.data.encryptedClaudeKey as string;
    expect(written).not.toBe(GEMINI_KEY); // not the plaintext
    expect(written).not.toContain(GEMINI_KEY); // plaintext not embedded anywhere
    expect(isEncrypted(written)).toBe(true); // looks like our AES-GCM output
    expect(decrypt(written)).toBe(GEMINI_KEY); // …and round-trips back to the key

    // Masked value hides the body but keeps a recognizable prefix + last 4.
    expect(res.masked).not.toBe(GEMINI_KEY);
    expect(res.masked).toContain("•");
    expect(res.masked.startsWith("AIza")).toBe(true);
    expect(res.masked.endsWith(GEMINI_KEY.slice(-4))).toBe(true);
  });

  it("also accepts a Claude key (sk-ant…) and encrypts it, provider=anthropic", async () => {
    const db = makeDb();
    const res = await makeCaller(db).saveApiKey({ apiKey: CLAUDE_KEY });

    expect(res.provider).toBe("anthropic");
    expect(db.userUpdates).toHaveLength(1);
    const written = db.userUpdates[0]!.data.encryptedClaudeKey as string;
    expect(written).not.toBe(CLAUDE_KEY);
    expect(decrypt(written)).toBe(CLAUDE_KEY);
  });

  it("trims surrounding whitespace before validating and encrypting", async () => {
    const db = makeDb();
    const res = await makeCaller(db).saveApiKey({ apiKey: `  ${GEMINI_KEY}\n` });

    expect(res.success).toBe(true);
    // The stored ciphertext decrypts to the TRIMMED key, not the padded input.
    expect(decrypt(db.userUpdates[0]!.data.encryptedClaudeKey as string)).toBe(GEMINI_KEY);
  });

  it("rejects a junk key with BAD_REQUEST and writes nothing", async () => {
    const db = makeDb();
    await expect(
      makeCaller(db).saveApiKey({ apiKey: "not-a-real-key" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.userUpdates).toHaveLength(0); // no row touched on invalid input
  });
});

describe("aiRouter chat sessions — cross-user isolation", () => {
  it("getChatSession throws NOT_FOUND for a session owned by another user", async () => {
    const foreign = makeSession(FOREIGN_SESSION, OTHER_USER_ID);
    const db = makeDb({ sessions: [foreign] });
    await expect(
      makeCaller(db).getChatSession({ sessionId: FOREIGN_SESSION }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteChatSession throws NOT_FOUND for a foreign session and performs NO delete", async () => {
    const foreign = makeSession(FOREIGN_SESSION, OTHER_USER_ID);
    const db = makeDb({ sessions: [foreign] });
    await expect(
      makeCaller(db).deleteChatSession({ sessionId: FOREIGN_SESSION }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(db.sessionDeletes).toHaveLength(0); // db.chatSession.delete never called
    expect(db.sessions).toContain(foreign); // the foreign row is untouched
  });

  it("the owner CAN read and delete their own session (guard isn't blanket-deny)", async () => {
    const own = makeSession(OWN_SESSION, USER.id);
    const db = makeDb({ sessions: [own] });
    const caller = makeCaller(db);

    const got = await caller.getChatSession({ sessionId: OWN_SESSION });
    expect(got.id).toBe(OWN_SESSION);
    expect(got.persona).toBe("king");

    const del = await caller.deleteChatSession({ sessionId: OWN_SESSION });
    expect(del.success).toBe(true);
    expect(db.sessionDeletes).toHaveLength(1);
    expect(db.sessions).toHaveLength(0);
  });
});

describe("aiRouter.hasApiKey — self-heals a corrupt stored key", () => {
  it("clears an undecryptable key and returns hasKey:false", async () => {
    // A genuinely corrupt ciphertext: a real encryption with its last hex nibble
    // flipped, so GCM auth verification fails and decrypt() throws.
    const good = encrypt(GEMINI_KEY);
    const last = good.at(-1)!;
    const corrupt = good.slice(0, -1) + (last === "0" ? "1" : "0");

    const db = makeDb({ encryptedClaudeKey: corrupt });
    const res = await makeCaller(db).hasApiKey();

    expect(res.hasKey).toBe(false);
    expect(res.masked).toBeNull();
    expect(res.provider).toBeNull();

    // Self-heal: the corrupt value was cleared (set to null) in the DB.
    expect(db.userUpdates).toHaveLength(1);
    expect(db.userUpdates[0]!.data.encryptedClaudeKey).toBeNull();
    expect(db.userRow.encryptedClaudeKey).toBeNull();
  });

  it("reports a valid stored key without any self-heal write", async () => {
    const db = makeDb({ encryptedClaudeKey: encrypt(GEMINI_KEY) });
    const res = await makeCaller(db).hasApiKey();

    expect(res.hasKey).toBe(true);
    expect(res.provider).toBe("gemini");
    expect(res.masked).toContain("•");
    expect(db.userUpdates).toHaveLength(0); // a valid key is left alone
  });
});
