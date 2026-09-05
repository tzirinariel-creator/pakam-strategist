// @vitest-environment jsdom
// =========================================================================
// מילואימניק שנה ג׳ יכול לספר על שנה א׳ ועל שנה ב׳ — כבר בהרשמה
// =========================================================================
// אריאל, 5.9: *"אם אני סטודנט שנה ג׳ ועשיתי מילואים בשנה א׳ ובשנה ב׳ — אין
// לי אפשרות להכניס ידנית את התאריכים. תסדר את זה."*
//
// באשף ההרשמה שאלת המילואים היחידה הייתה "עשיתם מילואים **בסמסטר הזה**?".
// דלת ה-3010 הייתה שם, אבל מי שאין לו את הטופס ביד — ואצל שנה ג׳ מדובר
// בשירות מלפני שנתיים — לא יכול היה לספר כלום. הקבוצה נקבעת בכל סמסטר
// מחדש, אז סמסטר שלא הוזן הוא קבוצה שלא חושבה.
//
// הבדיקה עוברת בדיוק את המסלול שלו: סטודנט שמצהיר שנה ג׳, פותח את סעיף
// המילואים, ומזין סמסטר משנה א׳ שלו.

import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { OnboardingData } from "@/components/onboarding/onboarding-wizard";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/settings/form-3010-uploader", () => ({
  Form3010Uploader: () => null,
}));

const upsert = vi.fn();
vi.mock("@/lib/trpc/react", () => ({
  api: {
    useUtils: () => ({ user: { listMiluimSemesters: { invalidate: vi.fn() } } }),
    user: {
      listMiluimSemesters: {
        useQuery: () => ({
          // שורה אחת שכבר הוזנה — כדי לוודא שהרשימה מוצגת ולא רק הטופס.
          data: [
            { academicYear: 2024, semester: "FALL", daysServed: 30, isCombat: false },
          ],
        }),
      },
      upsertMiluimSemester: {
        useMutation: () => ({ mutate: upsert, isPending: false }),
      },
    },
  },
}));

import { StepProfile } from "@/components/onboarding/step-profile";

const baseData: OnboardingData = {
  program: null,
  // סטודנט שנה ג׳ — בדיוק המקרה של אריאל.
  year: 3,
  semester: "FALL",
  focusArea: null,
  miluimGroup: "NONE",
  amirantScore: null,
  englishLevel: null,
};

function Harness() {
  const [data, setData] = useState<OnboardingData>(baseData);
  return (
    <StepProfile
      data={data}
      onUpdate={(u) => setData((prev) => ({ ...prev, ...u }))}
    />
  );
}

/** סעיף המילואים מקופל — פותחים אותו כמו שסטודנט עושה. */
function openMiluim() {
  const toggles = screen.getAllByRole("button");
  const t = toggles.find((b) => /collapsedPrompt|מילואים/.test(b.textContent ?? ""));
  if (t) fireEvent.click(t);
}

beforeEach(() => {
  cleanup();
  upsert.mockClear();
  localStorage.clear();
});

describe("StepProfile — סמסטרי מילואים קודמים", () => {
  it("הטופס קיים באשף, עם בורר שנה ובורר סמסטר", () => {
    render(<Harness />);
    openMiluim();
    expect(screen.getByLabelText("שנת השירות")).toBeInTheDocument();
    expect(screen.getByLabelText("סמסטר השירות")).toBeInTheDocument();
    expect(screen.getByLabelText("ימי שירות בסמסטר")).toBeInTheDocument();
  });

  it("בורר השנה מציע את כל שנות התואר, לא רק את הנוכחית", () => {
    render(<Harness />);
    openMiluim();
    const sel = screen.getByLabelText("שנת השירות") as HTMLSelectElement;
    // שנה ג׳ בתשפ״ז ⇒ התואר החל בתשפ״ה. שלוש שנים, לא אחת.
    expect(sel.options.length).toBeGreaterThanOrEqual(3);
  });

  it("סמסטרים שכבר נרשמו מוצגים, כדי שלא יוזנו פעמיים", () => {
    render(<Harness />);
    openMiluim();
    expect(screen.getByText(/תשפ״ה · סמסטר א׳/)).toBeInTheDocument();
  });

  it("הזנה של סמסטר קודם נשמרת דרך אותה מוטציה של מסך המילואים", () => {
    render(<Harness />);
    openMiluim();
    const yearSel = screen.getByLabelText("שנת השירות") as HTMLSelectElement;
    const semSel = screen.getByLabelText("סמסטר השירות") as HTMLSelectElement;
    const days = screen.getByLabelText("ימי שירות בסמסטר");

    // שנה א׳ של סטודנט שנה ג׳ = תשפ״ה = 2024, סמסטר ב׳.
    fireEvent.change(yearSel, { target: { value: "2024" } });
    fireEvent.change(semSel, { target: { value: "SPRING" } });
    fireEvent.change(days, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /הוסיפו סמסטר/ }));

    expect(upsert).toHaveBeenCalledWith({
      academicYear: 2024,
      semester: "SPRING",
      daysServed: 45,
      isCombat: false,
    });
  });

  it("אפס ימים אינו נשמר — הטופס לא כותב שורה ריקה", () => {
    render(<Harness />);
    openMiluim();
    fireEvent.change(screen.getByLabelText("ימי שירות בסמסטר"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /הוסיפו סמסטר/ }));
    expect(upsert).not.toHaveBeenCalled();
  });
});
