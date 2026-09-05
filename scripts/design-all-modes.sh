#!/bin/bash
# ביקורת העיצוב בחמשת המצבים שהמסוף ביקש — מול פרודקשן, לא מול שרת מקומי.
# C2 בלוח: "1440 בהיר · 1440 כהה · 375 בהיר · 375 כהה · ניתוח דפוסים"
set -u
cd "$(dirname "$0")/.."
B="https://pakam-strategist.vercel.app"
run () { echo ""; echo "──── $1 ────"; node scripts/verify-design.mjs --base "$B" $2 --json "docs/עיצוב-$3.json" 2>&1 | tail -9; }
run "1440 בהיר" ""                  "1440-בהיר"
run "1440 כהה"  "--dark"            "1440-כהה"
run "375 בהיר"  "--mobile"          "375-בהיר"
run "375 כהה"   "--mobile --dark"   "375-כהה"
echo ""
echo "████ כל ארבעת המצבים הסתיימו ████"
