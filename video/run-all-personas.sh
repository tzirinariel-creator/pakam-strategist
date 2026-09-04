#!/bin/bash
# שלב 11 — שלוש פרסונות × שני רוחבים, ברצף.
# ברצף ולא במקביל: שלושה דפדפנים בו-זמנית הם בדיוק מה שמיצה את בריכת
# החיבורים והפיל את פרודקשן בלילה 4→5.9.
set -u
cd "$(dirname "$0")/.."
for P in y1 y2 y3; do
  echo ""
  echo "████████ פרסונה $P ████████"
  if [ "$P" != "y1" ]; then
    npm run reset:test 2>&1 | tail -1
    node video/persona-seed.mjs --persona "$P" 2>&1 | tail -4
  fi
  for W in 1440 390; do
    echo "──── $P · ${W}px ────"
    node video/final-personas.mjs --persona "$P" --width "$W" 2>&1 | tail -30
  done
done
echo ""
echo "████████ כל הסיורים הסתיימו ████████"
