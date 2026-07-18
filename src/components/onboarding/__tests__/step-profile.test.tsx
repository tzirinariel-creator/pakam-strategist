// @vitest-environment jsdom
// =========================================================================
// Locks the AMIRANT-score input's validation contract in StepProfile
// (#38 QA-2). The 50–150 English placement score is the one field that used to
// be able to abort the WHOLE onboarding save: a typo (999, 10, 1340) would
// reach updateProfile and fail the entire step with a generic error. The fix
// splits the handling in two:
//   • onCHANGE stores exactly what was typed, parsed to a NUMBER (empty → null,
//     NaN → null) — so "134" can be typed digit by digit without a partial "1"
//     being yanked to the floor mid-typing.
//   • onBLUR normalizes into 50–150 via Math.min(150, Math.max(50, n)). The
//     clamp is VISIBLE (the student sees the corrected number) and, crucially,
//     an out-of-range value is corrected IN VIEW instead of propagating
//     downstream to fail the save.
//
// The input is a bare controlled `type="number"` with no aria-label/name, so we
// target it by its unique placeholder ("למשל: 134") and mount it inside a tiny
// stateful harness — the parent owns `data`, so the blur clamp round-trips back
// into the input's value exactly as it does in the real wizard.
// =========================================================================
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { OnboardingData } from "@/components/onboarding/onboarding-wizard";

// next-intl: Hebrew locale (isHe === true drives the score section's copy /
// placeholder). Translations echo their key verbatim.
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (k: string) => k,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Heavy child pulled in at module load; its branch (served === true) never
// renders here (miluimGroup starts "NONE"), but the import must resolve — stub
// it to a null component so nothing in its own dependency tree runs.
vi.mock("@/components/settings/form-3010-uploader", () => ({
  Form3010Uploader: () => null,
}));

// tRPC: the miluim sub-section calls useUtils / a query / a mutation at the top
// of the component. None of them are exercised by the score field, but the
// calls must not throw.
vi.mock("@/lib/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    user: {
      listMiluimSemesters: { useQuery: () => ({ data: [] }) },
      upsertMiluimSemester: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

import { StepProfile } from "@/components/onboarding/step-profile";

// A minimally-populated OnboardingData. year 1 + semester FALL matches the
// component's derivedSemester for year ≤ 1, so its sync-effect is a no-op (no
// stray state churn around the assertions).
const baseData: OnboardingData = {
  program: null,
  year: 1,
  semester: "FALL",
  focusArea: null,
  miluimGroup: "NONE",
  amirantScore: null,
  englishLevel: null,
};

// The real wizard owns `data` and feeds it back down, so a controlled input
// only shows a new value once the parent re-renders. Mirror that here so the
// onBlur clamp is observable in input.value exactly as the student sees it.
function Harness({ initialScore = null }: { initialScore?: number | null }) {
  const [data, setData] = useState<OnboardingData>({
    ...baseData,
    amirantScore: initialScore,
  });
  return (
    <StepProfile
      data={data}
      onUpdate={(updates) => setData((prev) => ({ ...prev, ...updates }))}
    />
  );
}

const scoreInput = () =>
  screen.getByPlaceholderText("למשל: 134") as HTMLInputElement;

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("StepProfile — AMIRANT score validation (#38 QA-2)", () => {
  it("typing 999 then blurring clamps IN VIEW to 150", () => {
    render(<Harness />);
    const input = scoreInput();

    // onChange keeps what was typed, parsed to a number → still "999" in view
    // (NOT yanked mid-typing). If parse returned null, value would go blank.
    fireEvent.change(input, { target: { value: "999" } });
    expect(input.value).toBe("999");

    // onBlur → Math.min(150, Math.max(50, 999)) = 150, corrected in view so it
    // never reaches the save as an out-of-range 999.
    fireEvent.blur(input);
    expect(input.value).toBe("150");
  });

  it("typing 10 then blurring clamps IN VIEW to 50 (low end)", () => {
    render(<Harness />);
    const input = scoreInput();

    fireEvent.change(input, { target: { value: "10" } });
    expect(input.value).toBe("10");

    // Math.min(150, Math.max(50, 10)) = 50.
    fireEvent.blur(input);
    expect(input.value).toBe("50");
  });

  it("a valid in-range 120 stays 120 through blur (clamp is a no-op)", () => {
    render(<Harness />);
    const input = scoreInput();

    fireEvent.change(input, { target: { value: "120" } });
    expect(input.value).toBe("120");

    // Math.min(150, Math.max(50, 120)) = 120 — unchanged.
    fireEvent.blur(input);
    expect(input.value).toBe("120");
  });

  it("clearing the field yields an empty value (null), and blur leaves it empty", () => {
    render(<Harness initialScore={120} />);
    const input = scoreInput();
    // Seeded value round-trips from data.amirantScore.
    expect(input.value).toBe("120");

    // onChange with "" → onUpdate({ amirantScore: null }) → value ?? "" is "".
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    // onBlur on an empty field returns early — it must NOT clamp "" up to 50.
    fireEvent.blur(input);
    expect(input.value).toBe("");
  });
});
