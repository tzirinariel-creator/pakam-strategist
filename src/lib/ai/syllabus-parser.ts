// =========================================
// Syllabus Parser — AI-powered extraction
// =========================================
// Server-side only — never import in client code.
// Takes raw text content from a syllabus and uses
// Claude to extract structured data (topics, deadlines,
// grading breakdown, weekly schedule, summary).

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, MAX_TOKENS } from "./claude-client";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface Deadline {
  title: string;
  date: string;
  type: "exam" | "assignment" | "paper";
}

export interface GradingComponent {
  component: string;
  weight: number;
}

export interface WeeklyTopic {
  week: number;
  topic: string;
  readings?: string;
}

export interface ParsedSyllabus {
  topics: string[];
  deadlines: Deadline[];
  gradingBreakdown: GradingComponent[];
  summary: string;
  weeklySchedule?: WeeklyTopic[];
}

// -------------------------------------------------------------------
// Prompt
// -------------------------------------------------------------------

const SYLLABUS_PARSE_PROMPT = `You are an expert academic syllabus parser. Your task is to analyze the given syllabus text and extract structured information.

Return ONLY valid JSON with the following structure (no markdown code blocks, no explanations):

{
  "topics": ["topic1", "topic2", ...],
  "deadlines": [
    { "title": "Midterm Exam", "date": "2025-01-15", "type": "exam" },
    { "title": "Research Paper", "date": "2025-02-20", "type": "paper" },
    { "title": "Problem Set 1", "date": "2025-01-10", "type": "assignment" }
  ],
  "gradingBreakdown": [
    { "component": "Final Exam", "weight": 40 },
    { "component": "Midterm", "weight": 30 },
    { "component": "Assignments", "weight": 20 },
    { "component": "Participation", "weight": 10 }
  ],
  "summary": "A brief 2-3 sentence summary of the course content and objectives.",
  "weeklySchedule": [
    { "week": 1, "topic": "Introduction to the course", "readings": "Chapter 1" },
    { "week": 2, "topic": "Core concepts", "readings": "Chapter 2-3" }
  ]
}

Rules:
1. "topics" — Extract main course topics or themes. If a weekly schedule exists, derive topics from it.
2. "deadlines" — Extract any dates for exams, paper submissions, or assignment due dates. Use ISO date format (YYYY-MM-DD). Type must be one of: "exam", "assignment", "paper".
3. "gradingBreakdown" — Extract grading weights. Each weight is a number (percentage). They should ideally sum to 100.
4. "summary" — Write a concise 2-3 sentence summary of the course.
5. "weeklySchedule" — If the syllabus has a week-by-week schedule, extract it. The "readings" field is optional.
6. The syllabus may be in Hebrew or English. Parse regardless of language, but keep extracted text in the original language.
7. If certain data is not found, use empty arrays or omit optional fields.
8. IMPORTANT: Return ONLY the JSON object, nothing else.`;

// -------------------------------------------------------------------
// Parser
// -------------------------------------------------------------------

/**
 * Parse syllabus text content using Claude AI.
 *
 * Creates a temporary Anthropic client with the provided (decrypted) key,
 * sends the syllabus text with a structured extraction prompt, and returns
 * the parsed data.
 *
 * @param text - Raw syllabus text content
 * @param apiKey - Decrypted Claude API key
 * @returns Parsed syllabus data
 * @throws Error if AI response cannot be parsed or API call fails
 */
export async function parseSyllabusContent(
  text: string,
  apiKey: string
): Promise<ParsedSyllabus> {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: `${SYLLABUS_PARSE_PROMPT}\n\n--- SYLLABUS TEXT ---\n\n${text}`,
      },
    ],
  });

  // Extract text content from the response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response received from Claude");
  }

  const rawJson = textBlock.text.trim();

  // Try to parse the JSON response
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // Sometimes Claude wraps JSON in markdown code blocks — strip them
    const cleaned = rawJson
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(
        "Failed to parse AI response as JSON. The syllabus text may be too short or unclear."
      );
    }
  }

  // Validate and normalize the parsed data
  return normalizeParsedSyllabus(parsed);
}

// -------------------------------------------------------------------
// Validation / normalization
// -------------------------------------------------------------------

function normalizeParsedSyllabus(data: unknown): ParsedSyllabus {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid parsed syllabus: expected an object");
  }

  const obj = data as Record<string, unknown>;

  // topics
  const topics: string[] = Array.isArray(obj.topics)
    ? obj.topics.filter((t): t is string => typeof t === "string")
    : [];

  // deadlines
  const deadlines: Deadline[] = Array.isArray(obj.deadlines)
    ? obj.deadlines
        .filter(
          (d): d is Record<string, unknown> =>
            d !== null && typeof d === "object"
        )
        .map((d) => ({
          title: typeof d.title === "string" ? d.title : "Untitled",
          date: typeof d.date === "string" ? d.date : "",
          type: isDeadlineType(d.type) ? d.type : "assignment",
        }))
        .filter((d) => d.date !== "")
    : [];

  // gradingBreakdown
  const gradingBreakdown: GradingComponent[] = Array.isArray(
    obj.gradingBreakdown
  )
    ? obj.gradingBreakdown
        .filter(
          (g): g is Record<string, unknown> =>
            g !== null && typeof g === "object"
        )
        .map((g) => ({
          component:
            typeof g.component === "string" ? g.component : "Unknown",
          weight: typeof g.weight === "number" ? g.weight : 0,
        }))
    : [];

  // summary
  const summary =
    typeof obj.summary === "string" ? obj.summary : "No summary available.";

  // weeklySchedule (optional)
  const weeklySchedule: WeeklyTopic[] | undefined = Array.isArray(
    obj.weeklySchedule
  )
    ? obj.weeklySchedule
        .filter(
          (w): w is Record<string, unknown> =>
            w !== null && typeof w === "object"
        )
        .map((w) => ({
          week: typeof w.week === "number" ? w.week : 0,
          topic: typeof w.topic === "string" ? w.topic : "",
          readings:
            typeof w.readings === "string" ? w.readings : undefined,
        }))
        .filter((w) => w.topic !== "")
    : undefined;

  return {
    topics,
    deadlines,
    gradingBreakdown,
    summary,
    weeklySchedule:
      weeklySchedule && weeklySchedule.length > 0
        ? weeklySchedule
        : undefined,
  };
}

function isDeadlineType(
  value: unknown
): value is "exam" | "assignment" | "paper" {
  return value === "exam" || value === "assignment" || value === "paper";
}
