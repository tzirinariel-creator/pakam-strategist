/** @vitest-environment jsdom */
// The 22% of the degree score that nothing could write. See
// submission-grade-input.tsx for why this field did not exist until now.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SubmissionGradeInput } from "../submission-grade-input";

afterEach(cleanup);

const setup = (over: Partial<Parameters<typeof SubmissionGradeInput>[0]> = {}) => {
  const onSave = vi.fn();
  render(
    <SubmissionGradeInput
      userCourseId="uc-1"
      initialGrade={null}
      initialType={null}
      onSave={onSave}
      savedSignal={0}
      isHe
      courseName="סמינר בכלכלה פוליטית"
      {...over}
    />,
  );
  return { onSave };
};

describe("SubmissionGradeInput", () => {
  it("saves the paper grade with its kind", () => {
    const { onSave } = setup();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "92" } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith("uc-1", 92, "PAPER");
  });

  it("moves an entered mark between the 18% and the 4% when the kind changes", () => {
    // A paper is 18% of the degree score and a referat is 4%. Switching the
    // kind after typing has to persist on its own, or the two disagree until
    // the next blur — and the score is built from whichever won.
    const { onSave } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "רפרט" }));
    expect(onSave).toHaveBeenLastCalledWith("uc-1", 88, "REFERAT");
  });

  it("does not save a number outside 0–100", () => {
    // A grade over 100 is not a grade — the same rule the scanner applies.
    const { onSave } = setup();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "260" } });
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears a mark that was there, and stays quiet when there was none", () => {
    const { onSave: clearing } = setup({ initialGrade: 90 });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(clearing).toHaveBeenCalledWith("uc-1", null, "PAPER");

    cleanup();
    const { onSave: quiet } = setup({ initialGrade: null });
    const empty = screen.getByRole("textbox");
    fireEvent.change(empty, { target: { value: "" } });
    fireEvent.blur(empty);
    expect(quiet).not.toHaveBeenCalled();
  });

  it("opens on the kind already stored, not on the default", () => {
    setup({ initialType: "REFERAT", initialGrade: 80 });
    expect(screen.getByRole("button", { name: "רפרט" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "עבודה" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names the course in its accessible label", () => {
    // Several of these can sit on one screen; "ציון" alone would not say which.
    setup();
    expect(
      screen.getByLabelText("ציון העבודה — סמינר בכלכלה פוליטית"),
    ).toBeInTheDocument();
  });
});
