// @vitest-environment jsdom
// =========================================================================
// #7/#37 — the UI half of the pre-enrolment fix. The pure summarizer already
// refuses to SUGGEST service from before the degree (lib/__tests__/form-3010),
// and this locks what the student actually sees: pre-degree semesters are
// listed as "not imported" with NO apply button, and an unknown degree-start
// year produces an explicit warning instead of a silent full import.
// The component talks to /api/ai/scan-3010 over fetch and takes everything else
// as props — no tRPC, no router.
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/advisor-toast", () => ({ advisorError: vi.fn() }));
vi.mock("@/lib/upload", () => ({
  // The real one uses FileReader; the payload is irrelevant here (fetch is mocked).
  fileToBase64: async () => ({ b64: "x".repeat(200), mime: "image/png" }),
  SCANNER_ACCEPT: "image/*",
}));

import { Form3010Uploader } from "@/components/settings/form-3010-uploader";
import type { Form3010Summary } from "@/lib/form-3010";

const onApply = vi.fn();

function summary(over: Partial<Form3010Summary> = {}): Form3010Summary {
  return {
    suggestions: [
      { academicYear: 2025, semester: "FALL", labelHe: "תשפ״ו", days: 25, periodCount: 1 },
    ],
    preDegree: [
      { academicYear: 2023, semester: "SPRING", labelHe: "תשפ״ד", days: 10, periodCount: 1 },
      { academicYear: 2024, semester: "FALL", labelHe: "תשפ״ה", days: 30, periodCount: 1 },
    ],
    unmapped: [],
    totalDays: 65,
    startYear: 2025,
    ...over,
  };
}

async function upload(props: Partial<React.ComponentProps<typeof Form3010Uploader>> = {}) {
  render(
    <Form3010Uploader isHe existing={[]} pending={false} startYear={2025} onApply={onApply} {...props} />,
  );
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["x"], "3010.png", { type: "image/png" })] } });
}

beforeEach(() => {
  cleanup();
  onApply.mockClear();
});

describe("Form3010Uploader — pre-enrolment service (#7/#37)", () => {
  it("lists pre-degree semesters as NOT imported, and offers apply only for degree semesters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ summary: summary() }) })),
    );

    await upload();

    // The degree semester is offered...
    await waitFor(() => expect(screen.getByText("תשפ״ו · סמסטר א׳")).toBeInTheDocument());
    // ...and it is the ONLY thing that can be applied.
    expect(screen.getAllByRole("button", { name: "החילו לסמסטר" })).toHaveLength(1);

    // The pre-degree ones are shown, counted, and explicitly excluded. (Every
    // number is isolated in its own <bdi> by <Bidi>, so these strings live
    // across several text nodes — assert on the rendered text as a whole.)
    const text = () => document.body.textContent ?? "";
    expect(text()).toContain("2 סמסטרים בטופס קדמו לתחילת התואר — לא ייובאו");
    expect(text()).toContain("תשפ״ד · סמסטר ב׳ — 10 ימים");
    expect(text()).toContain("תשפ״ה · סמסטר א׳ — 30 ימים");
  });

  it("sends the caller's degree-start year to the scanner (onboarding has no profile row yet)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
      ok: true,
      json: async () => ({ summary: summary() }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await upload({ startYear: 2024 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body) as { startYear: number | null };
    expect(body.startYear).toBe(2024);
  });

  it("an unknown degree-start year warns instead of pretending the list was filtered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ summary: summary({ startYear: null, preDegree: [] }) }),
      })),
    );

    await upload({ startYear: null });

    await waitFor(() =>
      expect(screen.getByText(/אנחנו לא יודעים מתי התחלתם את התואר/)).toBeInTheDocument(),
    );
  });
});
