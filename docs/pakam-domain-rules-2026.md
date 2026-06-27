# Pakam (פכ"מ) — Authoritative Degree Rules (תשפ"ו / 2025-26)

> Source: official TAU PPE regulations + a deep research pass (Ariel, 2026-06-27).
> **Tag everything that's policy as "נכון לתשפ"ו"** — the miluim outline + English thresholds
> change yearly. Stable rules (bidding mechanism, grade weighting, 75/80 gate, legal miluim
> floor) do not. Items marked ⚠️NEEDS-VERIFY must not be hard-coded until confirmed.

## 1. Degree structure (started תשפ"ו)
- **150 credits total**, of which **60 in one focus discipline** (philosophy / economics / political science) — the "תחום מיקוד". The civil-service commission only recognizes a discipline if 60 credits were completed in it (e.g. only 60 econ credits → can work as a state economist).
- Requirement breakdown (credits):
  - Mandatory (incl. the PPE seminar): **103** — of which **29 PPE-dedicated**, **18 philosophy**, **27 economics**, **15 political science**, **14 law division**.
  - Seminars: **12**.
  - Electives: **35**.
- **Cross-disciplinary flexibility:** a course tied to one department may count toward another discipline's quota with academic-advisor approval (e.g. a political-theory course can count toward philosophy). → credit-by-discipline counting is NOT rigid; honor `canCountAs`.
- **Seminars:** 3 of the seminars submit a *seminar paper* (עבודה סמינריונית), 1 submits a *referat* — drives grade weighting (§3).
- **Practice/"משלב עשייה" electives:** up to **8 credits**, but each such course grants **at most 4 credits** regardless of actual hours.
- **Attendance is mandatory in all PPE courses** (conflicts with the miluim attendance waiver — §5).

## 2. Year 1→2 transition gate (BLOCKING) — stable
- Requires **overall average ≥ 75** in year-1 courses **AND average ≥ 80 in the PPE-dedicated courses**.
- The app must compute **both averages separately** and warn. Failing the gate blocks continuation.

## 3. Final-grade weighting (NOT a simple average) — stable
- **78%** average of courses (mandatory + elective).
- **18%** the three seminars with a seminar paper (incl. the PPE seminar).
- **4%** the seminar with a referat.

## 4. Failures / improvement / prior learning
- **Failures:** may retake a failed mandatory course once (teaching-committee approval); a **second failure in the same course = cannot continue in PPE**.
- **Grade improvement:** only in the following year, same field + category; the **last grade counts**; can't improve an exam grade with a paper; **max 2 courses per degree**.
- **Prior-learning recognition:** only if the grade is **≥ 80** and committee-approved; not guaranteed.

## 5. English / Amirant (אמירנט) — policy, נכון לתשפ"ו
Official scale 50–150:
| Level | Score | Meaning |
|---|---|---|
| טרום בסיסי | ≤ 84 | auto-rejection |
| בסיסי | 85–99 | level courses |
| מתקדמים א' | 100–119 | minimum to start studies |
| מתקדמים ב' | 120–133 | one level course |
| **פטור** | **134+** | zero level courses |
- **Humanities deadline:** must reach **exemption (פטור)** by the **end of the 2nd semester**, else studies stop. (Faculty-specific to humanities, where PPE sits.)
- **פטור ≠ zero English courses (double-verified):** since תשפ"ב every BA student must take **2 academic English content courses** (all coursework in English, each ≥ 2 credits) — separate from level courses; **cannot finish the degree without them.**
- **Passing grade in an English course in humanities = 70** (vs 60 elsewhere).
- Forward-looking: from **Dec 2026** the English section splits from the psychometric into a separate computerized exam ("אמירנט", testing listening/writing/speaking); score valid ≥ 7 years.

## 6. Miluim — TWO SEPARATE LAYERS (keep separate in code)
### Layer A — legal floor (MAL"G 2012, applies to everyone, always)
- Unlimited absence during service with no rights harmed (attendance for exam eligibility, submissions, grade-boost).
- Assignment deferral ≥ days served; emergency service → defer 10 days or days-served (higher).
- Exams: an extra date for every missed one (within 45 days of the last exam / next semester / next year, student's choice) — **BUT still max 2 exam dates per course.**
- **Course-deferral right:** ≥ 10 cumulative days in a semester (semester course) or 20/year (annual) + missed classes → may defer + retake free, if not yet examined.
- **Degree extension:** 150 cumulative miluim days over the degree → 2 free extra semesters.
- **Social credits:** 2 credits once per degree for ≥ 14 miluim days in a year, or 30 hours community volunteering/year.

### Layer B — TAU תשפ"ו outline (4 groups on top of the floor)
Per-semester assignment, re-done each semester, auto-assigned (army updates TAU biweekly). "ייעוד קדמי" combatants get a better group even with fewer days (apply in "חרבות ברזל"). **300+ group:** combatants with ≥ 300 days since 7.10.23 get **Group C adjustments in both semesters** with support through degree end.
Group benefits (planning-relevant):
- **A:** student-rights law; **2-credit exemption** for 10 cumulative days; recordings.
- **B:** **6-credit exemption** from elective/general (BA, **max 10/degree**); no attendance (except practical/workshop/interactive); recordings; assignment-deferral flexibility; home-assignment grade as a shield; late registration; free cancellation; prereq-enforcement flexibility. Exams: **2 of 3 dates, higher counts (auto)**; **convert 2 courses to binary** (pass/fail).
- **C:** all of B, plus **8-credit exemption**, **+10% bidding points**, **+25% exam time**, **convert 3 courses to binary**; tuition-drag waiver if course duties done in תשפ"ו + last paper/exam by 31.12.26.
- **G:** **3-credit exemption** (new students or not previously assigned), recordings, no attendance, 2-of-3 dates, **convert 6 credits to binary**.
- **Tuition benefit (separate from groups):** 42 cumulative miluim days in תשפ"ו → 1 free drag semester; 84 → 2.

> **BUG to fix:** the code multiplies a per-year exemption rate by `currentYear` → over-grants.
> Real rule: the exemption is per-year per the group (e.g. B=6), **cumulative but capped at 10 ש"ז total for the whole degree** (4 for MA).

### Binary (pass/fail) — two critical warnings
- Binary **not allowed** for: a course needing a numeric grade for the transition gate (the 75/80 → needs numbers), seminar courses, or courses essential for MA/PhD admission.
- **Honors (rector/dean) only if binary-converted courses ≤ 25% of the year's course hours.** Over-using binary loses honors → the app must warn.

### Money (not planning): scholarships (200+ days → 100% tuition; new students 45–199 days → ₪1,000–2,500). ולת"ם service-deferral committee (apply ≤ 30 days before, orders ≥ 6 days, up to 2 approvals/year; attach order + enrollment + justification + ideally timetable & exam schedule).

## 7. Bidding (the registration "auction") — the core of planning, stable
- Each student gets virtual points to distribute across desired courses; **highest bidder wins** (NOT first-come).
- **Rounds (מקצים):** registration runs in several rounds; each round the student gets all their points back. A 3rd round (where it exists) is for changes/cancellations/leftovers.
- **Lecture + tutorial are a pair:** points go to the *combination* (lecture+tutorial together), and only to the preferred option — all others get 0.
- **⚠️ The last request always wins:** registering for a course that overlaps (even slightly) in time with an already-accepted course **cancels the earlier one.** ← a smart timetable must catch this conflict.
- **Point transfer:** prefer "by choice" so the student controls where points go if rejected.
- **Transition conditions NOT checked at registration** — verified after; non-compliant registrations cancelled retroactively.
- Feature idea: historical bidding statistics per course = gold for "will I get this slot".

## 8. Hard truth vs yearly vs needs-input
- **Hard (stable):** bidding mechanism, legal miluim rights, PPE grade weighting, 75/80 gate.
- **Yearly (tag "נכון לתשפ"ו", link to live source):** the miluim adjustments outline + English thresholds (separate outline per תשפ"ד/ה/ו).
- **⚠️NEEDS-VERIFY (don't guess):** (a) whether "כלים שלובים" (integrated-tools) is a separate PPE requirement or folded into electives / N/A; (b) the exact named mandatory-course list + per-course prerequisites — these live in the full Yedion (which we have parsed: catalog has isMandatory + prerequisites + yearOffered, so this is mostly recoverable).

## 9b. VERIFIED ANSWERS (2026-06-27, research + own web check)
- ✅ **Degree structure תשפ"ו confirmed** on the official page: 150 = **103 mandatory** (29 PPE-core, 18 phil, 27 econ, 15 polsci, 14 law) + **12 seminars** + **35 electives**. (Implemented.) ⚠️ The structure **changes almost every year** (תשע"ה core 35 / תשפ"ב core 25 / תשפ"ו core 29) — NEVER use an old Yedion's course list as truth; pin every student to their start year.
- ✅ **כלים שלובים confirmed:** a separate university-wide requirement (≈3 courses / up to 6 credits), **NOT counted in the 150** and **NOT weighted in the final grade** (TAU humanities regs). The app does not model it — correctly absent from the 150 + GPA. (Miluim/social can credit one 2-credit כלים-שלובים course.)
- ✅ **Per-semester miluim group → YES, model it.** The group is reassigned each semester from that semester's service days; exemptions are cumulative with **caps (10 ש"ז + 5 binary courses per degree)**, so one-group-per-degree gives wrong current eligibility AND wrong "remaining cap". Build: per-semester "miluim days" → derived group, + a cumulative counter of credits/binary already used. (NOT yet built.)
- ✅ **Economics prerequisite chain** (codes verified): math-for-PPE 0651-1007 (+ statistics-for-PPE) are the root → מיקרו א' 1011-2103 → מיקרו ב' 1011-2109 → מיקרו ג' 1011-2104; מאקרו א' 1011-2102 (needs math+micro א'+ב') → מאקרו ב' 1011-2105; אקונומטריקה 1011-2106 (needs statistics+math+micro א'). (Use to backfill the thin prereq data — only 10/117 courses currently have prerequisites.)
- ✅ **RESOLVED — the 93 vs 103 gap is STRUCTURAL, not missing courses** (read the full program tables from the owner's Drive doc, tcid=5904 תשפ"ו). Every *named* mandatory course is already in the fixture with correct credits and `isMandatory:true` — they sum to exactly 93. The missing 10 ש"ז are two requirements the flat-`isMandatory` sum under-counts:
  - **Law −8 ש"ז (the real gap):** the חטיבה במשפטים is 14 ש"ז = **1411-9107** חקיקה ורגולציה (4, fixed) + **1411-9240** משפט וכלכלה (2, fixed) + **8 ש"ז "pick any two 4-credit courses" from the LAW_FOUNDATION basket** (10 options, codes 1411-9101/9102/9103/9104/9109/9111/9221/9223/9224/9225 — already in the fixture as `courseType:LAW_FOUNDATION, isMandatory:false`). Fix = encode a *group requirement* "8 ש"ז from the LAW_FOUNDATION basket counts toward mandatory", NOT flag individual basket courses mandatory.
  - **PPE-dedicated −2 ש"ז:** a future course the university hasn't published yet (doc: *"עתיד להתווסף קורס ייעודי נוסף של 2-4 ש"ס"*). Encode a 2-credit PPE_CORE placeholder requirement; revisit when TAU publishes the code.
  - (Also: fixture `discipline` buckets don't reconcile 1:1 to the official 29/18/27/15/14 — optional relabel for clean per-discipline totals.)
- 🔴 **CRITICAL CORRECTNESS — PPE students are EXEMPT from course prerequisites** (Yedion note 19, quoted: *"תלמידי פכ"ם אינם מחוייבים בדרישות הקדם"*). → Prerequisites must be **advisory / UX ordering hints only, NEVER hard registration gates** for this program. If the rule engine blocks a course on missing prereqs, that is a BUG for PPE. The fixture's econ chain (math/stats→micro→macro→econometrics) is sensible *soft* ordering, not binding. (Exception kept: the one real phil edge — PPE students DO need 0618-1032 מבוא לפילוסופיה חדשה but are NOT required to take prep 0618-2201.)
- ✅ **All seminars** require **a passing grade in ALL mandatory courses** before registering (doc: *"דרישת קדם לכל הסמינרים: ציון עובר בכל קורסי החובה"*). This is a real gate (distinct from the per-course prereq exemption).
- ✅ Behavioral-econ **1221-4325** + seminar **0651-3007** are **electives** in תשפ"ו (doc) — fixture already non-mandatory, correct.

## 9. The connecting principle (past → present → future)
- **Past** = courses already done + grades (→ average, transition gate, final-grade weighting) + accumulated miluim days (→ auto-determine the outline group + drag/extension eligibility).
- **Present** = which miluim group this semester → which adjustments are open (binary, credit exemptions, bidding bonus, 2/3 dates) + the 25% honors-cap warning.
- **Future** = remaining of 150 credits by discipline + the 2 English courses + the exemption deadline + a smart bidding strategy that handles time overlaps and "last request wins".
