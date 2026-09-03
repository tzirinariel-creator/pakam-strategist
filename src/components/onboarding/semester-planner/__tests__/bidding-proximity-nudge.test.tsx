/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BiddingProximityNudge } from "../bidding-proximity-nudge";

vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// Without this each render stacks in the same document and a "find the one
// link" assertion sees several.
afterEach(cleanup);

describe("BiddingProximityNudge", () => {
  it("counts down to a round that has not opened yet", () => {
    // Round 1 of תשפ״ז opens 7.9.2026.
    render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    expect(screen.getByText(/הבידינג נפתח בעוד/)).toBeTruthy();
  });

  // 3.9 — הבדיקה הזאת קיבעה `href="/bidding"`, וזה היה הפגם השני של אותו
  // כרטיס. אריאל עבר את הזרימה כמשתמש וכתב: *"כשבאמצע התכנון עברתי לאיזה
  // לחצן ששמת של תכנון בידינג ואז חזרתי — זה מחק לי את מה שהיה כבר לפני על
  // בסיס הסילבוס"*, ואחר כך *"ובכללי אין סיבה לאיזה לחצן צדדי"*.
  //
  // הכרטיס יושב בתוך לוח שהבחירה שלו חיה ב-React state עד "סיימתי". קישור
  // שיוצא מהמסך הוא מחיקה בקליק אחד. והעצה עצמה — "תכננו את שני הסמסטרים" —
  // היא בדיוק מה שהלוח יודע לעשות בעצמו.
  //
  // אז הבדיקה מקבעת עכשיו את ההבטחה ולא את היעד: הכרטיס **לא מנווט**, והוא
  // מבצע את ההמלצה במקום.
  it("לא מנווט לשום מקום — יציאה מהלוח מוחקת את הבחירה", () => {
    render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("מבצע את ההמלצה בתוך הלוח: מעבר לסמסטר השני", () => {
    const onSwitchToOther = vi.fn();
    render(
      <BiddingProximityNudge
        now={new Date("2026-08-21T09:00:00+03:00")}
        otherSemesterLabel="סמסטר ב׳"
        onSwitchToOther={onSwitchToOther}
      />,
    );
    const button = screen.getByRole("button", { name: /סמסטר ב׳/ });
    fireEvent.click(button);
    expect(onSwitchToOther).toHaveBeenCalledTimes(1);
    // ועדיין לא ניווט.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("בלי callback אין כפתור — לא מציעים פעולה שאין לה מימוש", () => {
    render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says nothing once bidding is over", () => {
    // A student planning in March does not need a countdown to September, and
    // a stale countdown is worse than no countdown.
    const { container } = render(<BiddingProximityNudge now={new Date("2027-03-01T09:00:00+03:00")} />);
    expect(container.textContent).toBe("");
  });

  it("never mentions points", () => {
    // TAU does not publish the quota and this app never guesses one. Guarding
    // the copy directly, because this is the one place it would be tempting.
    const { container } = render(<BiddingProximityNudge now={new Date("2026-08-21T09:00:00+03:00")} />);
    expect(container.textContent).not.toMatch(/נקוד|points/);
  });
});
