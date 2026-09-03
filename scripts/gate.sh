#!/usr/bin/env bash
# =========================================
# שער האיכות — בדיוק מה שה-CI מריץ, ובקריאה של קודי יציאה
# =========================================
# 3.9 — ה-CI נפל פעמיים על main בגלל אותה טעות שלי, לא בגלל הקוד:
# הרצתי `npm run lint | tail -2` וקראתי את השורה
#   "0 errors and 2 warnings potentially fixable with the --fix option"
# כאילו היא מספר השגיאות. היא לא. היא סופרת רק שגיאות **שניתנות לתיקון
# אוטומטי**, ו-`rules-of-hooks` ו-`Cannot access refs during render` אינן
# כאלה. השורה האמיתית היא `✖ N problems (X errors, Y warnings)`, ו-tail -2
# חתך אותה. פעמיים דחפתי קוד שנפל ב-CI ואמרתי "0 שגיאות".
#
# הכלי לא שיקר — אני קראתי את השורה הלא נכונה. לכן השער הזה לא קורא שורות
# בכלל: הוא בודק **קודי יציאה**, ומדפיס את שורת ה-✖ במלואה.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() {
  local name="$1"; shift
  printf '\n── %s\n' "$name"
  if "$@"; then
    printf '   ✅ %s\n' "$name"
  else
    printf '   ❌ %s — קוד יציאה %d\n' "$name" "$?"
    fail=1
  fi
}

step "lint (eslint . — כמו ב-CI)"  npm run lint
step "tsc"                          npx tsc --noEmit
step "בדיקות"                       npx vitest run --testTimeout=60000

printf '\n────────────────────────────\n'
if [ "$fail" -eq 0 ]; then
  printf '  ✅ השער עבר. אפשר לדחוף.\n'
else
  printf '  ❌ השער נכשל. אין דחיפה.\n'
fi
exit "$fail"
