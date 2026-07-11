// =========================================
// Ops-only LLM smoke test — the live half of מבחן-המלך without a user account.
// =========================================
// Gated by SETUP_SECRET (same operational secret as setup-demo-users) so it
// exposes NOTHING publicly. Runs ONE question through the REAL prompt path
// (buildMentorSystemPrompt + streamGemini + the shared key) against a
// SYNTHETIC demo-shaped context — no real user data is ever read here.
// Exists because the live-quality eval must be runnable by the maintainer
// (or CI) without logging into anyone's account.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { encrypt } from "@/lib/crypto";
import { streamGemini } from "@/lib/ai/gemini-client";
import { buildMentorSystemPrompt, type MentorContext, type MentorPersona } from "@/lib/ai/mentor-prompt";
import { getProgramById } from "@/lib/programs/registry";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildExamPeriodBlock } from "@/lib/ai/exam-facts";

const inputSchema = z.object({
  question: z.string().min(2).max(500),
  persona: z.enum(["king", "referent"]).optional(),
});

/** The demo student, synthetic — mirrors the seeded demo account's numbers. */
function demoContext(): MentorContext {
  const mk = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0);
  // Two future exams with study tasks so the exam block + days-until anchors
  // are exercised exactly like production.
  const tasks = [
    { title: "לימוד: כלכלה פוליטית בינלאומית [auto] 2.5h", taskType: "study", courseCode: "1011-3010", startDate: mk(2026, 7, 12), endDate: mk(2026, 7, 12), completed: false, notes: null },
    { title: "מבחן: כלכלה פוליטית בינלאומית", taskType: "exam", courseCode: "1011-3010", startDate: mk(2026, 7, 21), endDate: mk(2026, 7, 21), completed: false, notes: "[moed A] [5h]" },
    { title: "מבחן: פילוסופיה של המוסר", taskType: "exam", courseCode: "0618-2033", startDate: mk(2026, 8, 6), endDate: mk(2026, 8, 6), completed: false, notes: "[moed A] [5h]" },
  ];
  return {
    firstName: null,
    gender: null,
    focusArea: "ECONOMICS",
    totalCredits: 107,
    earnedCredits: 77,
    courseAverage: 87.1,
    focusAreaCredits: 37,
    regulationIssues: [
      { ruleId: "PKM-001", messageHe: "חסרות 43 נקודות זכות מתוך 150" } as never,
    ],
    currentYear: 2,
    currentSemester: "SPRING",
    completedCourses: [
      { code: "1011-2103", nameHe: "מיקרו כלכלה א'", discipline: "ECONOMICS", credits: 5, grade: 92 },
      { code: "0618-1010", nameHe: "מבוא לפילוסופיה פוליטית", discipline: "PHILOSOPHY", credits: 4, grade: 88 },
    ],
    currentCourses: [
      { code: "1011-3010", nameHe: "כלכלה פוליטית בינלאומית", discipline: "ECONOMICS", credits: 5, grade: null },
      { code: "0618-2033", nameHe: "פילוסופיה של המוסר", discipline: "PHILOSOPHY", credits: 5, grade: null },
    ],
    availableNextSemester: [],
    currentSemesterCredits: 16,
    creditDetail: { planned: 30, mandatory: 60, elective: 12, seminar: 0, englishCourseCount: 1 },
    examPeriodBlock: buildExamPeriodBlock(tasks as never),
    // The REAL today anchor — the whole point of the date-bug regression.
    academicNowLine: (() => {
      const now = new Date();
      const weekday = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][now.getDay()];
      return `היום: יום ${weekday}, ${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()} · סמסטר ב׳ תשפ"ו`;
    })(),
  } as unknown as MentorContext;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-setup-secret");
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit("ops-ai-smoke", { maxRequests: 30, windowSeconds: 86_400 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const shared = process.env.GEMINI_SHARED_KEY;
  if (!shared) {
    return NextResponse.json({ error: "No shared key configured" }, { status: 412 });
  }

  try {
    const system = buildMentorSystemPrompt(
      demoContext(),
      getProgramById(null),
      (parsed.data.persona as MentorPersona) ?? "king",
    );
    const state: { truncated?: boolean } = {};
    let answer = "";
    for await (const chunk of streamGemini(
      encrypt(shared),
      system,
      [{ role: "user", content: parsed.data.question }],
      undefined,
      undefined,
      state,
    )) {
      answer += chunk;
      if (answer.length > 6000) break; // safety
    }
    return NextResponse.json({ answer, truncated: state.truncated ?? false });
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    return NextResponse.json({ error: `LLM call failed (${status})` }, { status: 502 });
  }
}
