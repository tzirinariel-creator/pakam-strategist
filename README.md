# Pakamon (פכמון) — Degree Planner for TAU PPE

[![CI](https://github.com/tzirinariel-creator/pakam-strategist/actions/workflows/ci.yml/badge.svg)](https://github.com/tzirinariel-creator/pakam-strategist/actions/workflows/ci.yml)

A full-stack web app that helps students in Tel Aviv University's **PPE program** (Philosophy, Economics & Political Science) plan their entire degree: course planning across semesters, automatic credit tracking by discipline, a regulation-compliance engine, a final-grade calculator, and an AI mentor (Google Gemini — shared free key or the student's own), grade-sheet and Form-3010 scanners, and anonymous cohort wisdom.

**Live:** https://pakam-strategist.vercel.app — log in with **Try Demo** (no signup) to explore with seeded data.

Built in Hebrew (RTL) and English, fully internationalized.

> Built largely with **Claude Code** as a hands-on exercise in shipping a real, deployed product end-to-end — schema, API, UI, and AI integration.
>
> **How it was built:** the full engineering story — architecture decisions, the AI-safety design, and the AI-native process — is in [docs/CASE_STUDY.md](docs/CASE_STUDY.md).

---

## Why it exists

Planning a PPE degree is genuinely hard: **150 credits over 3 years**, minimum-credit requirements across five disciplines, mandatory seminars and a referat, a final-grade formula (78% courses / 18% seminar papers / 4% referat), and ~25 regulation rules that interact. Students juggle this across the university course catalog, spreadsheets, and WhatsApp groups. Pakamon puts it in one place and checks the rules for you.

## Features

- **Semester planner** — drag-and-drop courses across the 3-year, 6-semester grid; live credit totals, prerequisite and schedule-conflict detection, and workload scoring per semester.
- **Course catalog** — 117 real PPE courses with prerequisites, weekly hours, and exam dates; filterable and sortable by discipline and type.
- **Regulation engine** — 25 rules from the PPE academic regulations (per-discipline credit minimums, seminar/referat requirements, year-transition GPA, max attempts, failure rate…) evaluated automatically with a compliance score and per-rule explanations.
- **Grade calculator** — live final-grade projection with the official weighted formula, plus a reverse "what grade do I need?" mode given a target.
- **AI mentor ("the Philosopher King")** — a Gemini-powered academic advisor with full context of the student's plan, grades, and regulations. Runs on a rate-limited shared key out of the box; a student can bring their own key, which is validated, **encrypted at rest (AES-256-GCM)**, and never leaves the server. Rule-based answers come straight from the student's data (marked "from your data"), AI answers are marked as such.
- **Grade-sheet scanner** — upload the official transcript PDF/photo; Gemini vision extracts courses/grades, everything is declared before it's applied (overwrites flagged, nothing silent).
- **Form 3010 scanner + miluim** — reserve-duty days per semester with per-degree exemption quotas, fed manually or from the official form.
- **Exam planner** — a study "skyline" spread across the exam period (steady/light/crammer styles), draggable by day, exportable to the agenda.
- **Cohort wisdom** — anonymous, k-anonymous (N≥5 grades, N≥3 ratings) course reviews and grade distributions imported from consenting students' records, with an admin moderation queue.
- **Weekly timetable & exam calendar** — auto-built from selected courses, with exam countdowns and `.ics` / Google Calendar export.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React 19) |
| Language | **TypeScript** (strict) |
| API | **tRPC v11** — type-safe end-to-end, no codegen |
| Data | **Prisma 7** + **PostgreSQL** (Supabase) |
| Auth | **Supabase Auth** (email/password + Google OAuth) |
| AI | **Google Gemini** (vision + chat, shared free key or BYOK) |
| State / data | **Zustand** + **TanStack Query** |
| UI | **Tailwind CSS v4**, **Radix UI** / shadcn, **lucide-react** |
| i18n | **next-intl** (Hebrew RTL + English) |
| Validation | **Zod** |

## Architecture notes

The parts worth a look:

- **`src/lib/regulations/`** — a small rule engine. Each regulation is a pure function `(RuleContext) → RuleResult`; the engine aggregates them into a compliance summary. Discipline-credit rules are generated dynamically from the program definition, so adding a discipline doesn't mean editing the engine.
- **`src/lib/programs/`** — the degree is data, not code. A `ProgramDefinition` describes credit requirements, disciplines, and structure (`tau-ppe-2025.ts`), which drives the planner, the credit calculator, and the rule engine. A second program (Law) is already defined alongside PPE.
- **`src/lib/ai/`** — server-only Gemini integration. `crypto.ts` encrypts a user's own key with AES-256-GCM; the mentor prompt and context builder assemble the student's plan, grades, and regulations into the advisor's context; an answer router serves data questions from rules before ever touching the LLM.
- **`src/lib/scraper/`** — fetches and parses TAU's "Yedion" course pages (cheerio), diffs against the DB, and classifies changes as auto-applyable vs. needs-review.
- **Type-safe boundary** — tRPC routers in `src/server/routers/` are consumed directly by the client with full inference; Zod validates every input.
- **Security** — strict CSP and security headers (`next.config.ts`), per-route rate limiting, encrypted secrets, and ownership checks on every protected procedure.

## Local development

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local   # then fill in Supabase, DB, and ENCRYPTION_KEY

# 3. Database
npx prisma migrate deploy
npx prisma db seed           # loads the 117-course PPE fixture

# 4. Run
npm run dev                  # http://localhost:3000
```

Required env vars are documented in [`.env.example`](.env.example). Generate the encryption key with `openssl rand -hex 32`. A shared `GEMINI_API_KEY` (free tier, rate-limited) powers AI features out of the box; users can supply their own key in Settings. Keep `GEMINI_MODEL` on a **current** free model — Google retires old Flash models (see docs/נוהל-תקלה.md §3).

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate`) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |

## Project structure

```
src/
  app/[locale]/        # App Router pages (auth / public / protected groups)
  server/routers/      # tRPC routers (plan, course, regulation, ai, schedule…)
  lib/
    regulations/       # rule engine + rule definitions
    programs/          # program definitions (the degree as data)
    ai/                # Claude client, crypto, mentor prompt, context builder
    scraper/           # Yedion course-catalog sync
    *-calculator.ts    # grade / credit / workload / conflict logic (pure, unit-tested)
  components/          # feature components + shadcn UI primitives
  messages/            # he.json / en.json (next-intl)
prisma/                # schema, migrations, seed, fixtures
```

## Testing

Core business logic is unit-tested with **Vitest** (`npm test`) — the parts where a wrong answer actually matters:

- `crypto` — encryption round-trip + auth-tag tamper detection
- `conflict-detector` — schedule-overlap boundaries (adjacent slots must *not* conflict)
- `grade-calculator` — the weighted graduation formula
- `rule-engine` — aggregation invariants + behavioral checks on the regulation engine

These are deliberately on the pure domain logic rather than the UI: it's where AI-generated code is most likely to be subtly wrong, so it's where verification pays off most.

## Known limitations & roadmap

Being honest about what this is and isn't:

- **Test coverage is logic-first.** Pure calculators and the rule engine are covered; component/E2E tests (Playwright) for the onboarding and planner flows are a roadmap item.
- **Single program (for now).** The architecture treats a degree as a `ProgramDefinition`, and a second program (Law) is defined — but the catalog and regulations are PPE-complete. Generalizing the catalog to other programs is next.
- **Shared key is rate-limited.** The out-of-the-box AI runs on a free shared Gemini key with per-user rate limits; heavy users bring their own key in Settings.
- **The Yedion scraper is best-effort.** It parses an external university HTML source that can change shape; it diffs and flags risky changes for review rather than auto-applying everything.
- **Auth is application-layer.** Authorization is enforced in tRPC procedures with explicit ownership checks (not Postgres RLS) — a deliberate trade-off given the Prisma data layer.

### Roadmap
- Component + E2E tests (Playwright) for onboarding and the planner
- Strict nonce-based Content-Security-Policy (drop `'unsafe-inline'` from `script-src`)
- Generalize the course catalog beyond PPE
- Optimistic UI for drag-and-drop planning

## Built with Claude Code

This was built largely with Claude Code as an exercise in *shipping* with an AI agent — not generating snippets. The work that mattered was the review: defining the data model, deciding what logic belongs server-side, catching where the agent was wrong (e.g. a regulation rule count, an "RTL arrow" that was actually correct), and writing tests so the AI's output is verified, not trusted.
