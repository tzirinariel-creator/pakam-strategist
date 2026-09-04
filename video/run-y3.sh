#!/bin/bash
# שנה ג׳ עם היסטוריה אמיתית, ואז 14 הפעולות שהסיור לא יכול ללחוץ.
# הסדר לפי ערך: הפרסונה השלישית, הפעולות, ורק אז המובייל.
set -u
cd "$(dirname "$0")/.."
echo "████████ שנה ג׳ ████████"
node video/persona-seed-year.mjs --persona y3 2>&1 | tail -4
echo "──── הוספת היסטוריה ────"
node video/add-history.mjs --count 14 2>&1 | tail -20
echo "──── y3 · 1440px ────"
node video/final-personas.mjs --persona y3 --width 1440 2>&1 | tail -34
echo ""
echo "████████ שלב 3 — הפעולות שלא נבדקו ████████"
node video/stage3-actions.mjs 2>&1 | tail -30
echo ""
echo "──── y3 · 390px ────"
node video/final-personas.mjs --persona y3 --width 390 2>&1 | tail -34
echo ""
echo "████████ הכול הסתיים ████████"
