# Pakamon — Case Study

**A degree-planning app for Tel Aviv University's PPE program, live in production with real students. Built AI-natively: one developer directing AI agents, with the discipline of a real engineering team.**

Live: [pakam-strategist.vercel.app](https://pakam-strategist.vercel.app) (use "Try demo — no signup"). Hebrew-first, RTL, English mirror.

---

## The problem

PPE (Philosophy, Political Science, Economics — פכ"מ) is TAU's tri-disciplinary honors degree: **150 credits in 3 years across three departments**, each with its own rules. The information students need exists — scattered across an ASP.NET course catalog from the 2000s, a 40-page regulations PDF, ad-hoc spreadsheets, and a WhatsApp group where the same question gets asked three times a week. No tool connected them.

Pakamon connects them: 117 real courses (scraped and kept in sync), a regulations engine that audits a student's actual plan against every rule, a drag-and-drop degree planner, a reverse-planned exam-period scheduler, and an AI advisor grounded in the student's own data.

## Architecture

- **Stack:** Next.js (App Router) · React · tRPC · Prisma · Supabase (Postgres + Auth) · Tailwind v4 · next-intl · Vercel.
- **Type-safety end-to-end:** tRPC + Prisma + zod means a schema change breaks the build, not production.
- **Regulations as data, not code:** ~25 rules are pure functions over a typed context, each returning `{passed, severity, message, details}`. The engine distinguishes *blocking gates* (fail-a-course-twice, year-transition GPA bars) from *routine progress* — a fresh student is green, not buried in red. UI grouping is a display-only layer; the engine has never needed to change for a redesign.
- **Pure, unit-tested calculators:** credits, weighted final-grade (78/18/4 formula), miluim (reserve-duty) benefit tiers, exam reverse-planning — all pure functions with ~290 tests. The UI can never disagree with itself, because every surface reads the same computed breakdown.

## The AI advisor ("The Philosopher King") — grounding over vibes

The interesting engineering isn't calling an LLM; it's making one **safe to trust with someone's degree**:

1. **Hybrid routing.** A deterministic engine answers ~23 common intents instantly and for free from the student's own numbers. Only open-ended *reasoning* questions escalate to an LLM (free-tier Gemini, BYOK-friendly).
2. **Server-computed facts as the only truth.** The system prompt injects the student's real credits/GPA/gaps, computed server-side, with an explicit contract: *never recompute, never invent a number.*
3. **A hard safety rule, enforced structurally.** Course registration at TAU is a sealed-bid auction whose quotas are unpublished. Predicting "how many points a course costs" would be actively harmful — so the zero-prediction rule lives in a shared prompt block that *every* persona inherits, a server-side gate rejects any client-supplied hint pairing bidding vocabulary with multi-digit numbers, and tests assert the rule survives every persona verbatim.
4. **Restraint as a feature.** The advisor volunteers the student's single most pressing gap — but only when opened, only for critical/warning severity, once per day per issue, with a global opt-out. A mentor, not a Clippy.
5. **Personas without safety drift.** The prompt is factored into shared blocks (contract, facts, safety) + a swappable voice block. A second persona ("הרפרנט" — a blunt final-year peer) changes stance, not rules; a byte-identity test guarantees the default persona is unchanged.

## The AI-native process

This project is also an experiment in how one person ships production software by directing AI:

- **Research → decide → build → verify loops.** Big changes start with multi-agent research (parallel readers mapping real code, a synthesis agent producing a decision-complete spec), then human-reviewed execution.
- **Adversarial review as a habit.** Every major diff gets attacked by independent reviewer agents prompted to *refute* findings; only verified issues get fixed. This caught real bugs a normal pass missed (a divide-by-zero for an edge-case student profile; a case-sensitive string match that silently failed in English).
- **Tests as bug-finders, not ceremony.** New pure modules get tests immediately — and twice, writing the tests exposed live bugs in code that had already passed review.
- **The owner's taste as a spec.** The product owner (a PPE student) reviews as a user: "this smells like AI," "this number contradicts that one," "this fixed the symptom, not the seam." Those notes became house principles: every number traces to a server source or is called an estimate out loud; every fact lives once; an action without a named result didn't happen; one human voice; one urgent thing per screen.

## Honest data as product identity

The catalog shows historical grade averages and a computed difficulty label — clearly marked *"an estimate from past data, not an official university figure,"* with the source semester next to every number. The landing page's only statistics are ones the app can prove (117 courses, 3 disciplines, 150 credits). In ed-tech, not lying to students is a differentiator.

## Selected numbers

- ~290 unit tests · 0 lint errors · type-safe end-to-end
- 117 courses synced from the university catalog, with provenance per field
- ~25 regulation rules audited live against each student's plan
- Real students on production, Hebrew RTL + English, mobile-first

---

*Built by [Ariel Tzirin](https://github.com/tzirinariel-creator) — a first-year PPE student who got fed up with spreadsheets — directing Claude (Anthropic) as the engineering team.*
