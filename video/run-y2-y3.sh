#!/bin/bash
# y2 כבר על החשבון (נזרעה דרך שנת תחילת התואר, בלי ה-AI שנחסם ב-429).
set -u
cd "$(dirname "$0")/.."
for W in 1440 390; do
  echo "──── y2 · ${W}px ────"
  node video/final-personas.mjs --persona y2 --width "$W" 2>&1 | tail -32
done
echo ""
echo "████████ מעבר לשנה ג׳ ████████"
node video/persona-seed-year.mjs --persona y3 2>&1 | tail -4
for W in 1440 390; do
  echo "──── y3 · ${W}px ────"
  node video/final-personas.mjs --persona y3 --width "$W" 2>&1 | tail -32
done
echo ""
echo "████████ כל הסיורים הסתיימו ████████"
