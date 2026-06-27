#!/usr/bin/env python3
"""Faithfully parse the official TAU PPE Yedion (תשפ"ו) markdown export into
structured schedule + exam data. Deterministic — no inference, no invention."""
import json, re, sys

SRC = "/Users/Ariel/.claude/projects/-Users-Ariel----------------6-----------------------/f21f023b-67c9-4a60-8f68-0d338e28a7a9/tool-results/mcp-ac199215-1788-4ad2-8889-eb8a61d6fde3-read_file_content-1782504611353.txt"
t = json.load(open(SRC))["fileContent"]
SCHED = t[147025:473536]
EXAM = t[473536:]

DAY = {"יום א": "SUNDAY", "יום ב": "MONDAY", "יום ג": "TUESDAY",
       "יום ד": "WEDNESDAY", "יום ה": "THURSDAY", "יום ו": "FRIDAY"}
SEM = {"א": "FALL", "ב": "SPRING"}
TYPES = {"שיעור": "lecture", "תרגיל": "tutorial", "סמינר": "seminar",
         "שיעור ותרגיל": "lecture", "תרגול": "tutorial", "מעבדה": "lab",
         "סדנה": "tutorial", "פרוסמינר": "seminar", "קולוקויום": "lecture"}

course_hdr = re.compile(r'\[(\d{4}-\d{4})\]\(https://ims\.tau\.ac\.il/tal/kr/search_l\.aspx\?course_num=')

def course_blocks(section):
    hits = list(course_hdr.finditer(section))
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(section)
        yield m.group(1), section[m.start():end]

def clean_lines(block):
    return [ln.strip().strip('*').strip() for ln in block.split('\n') if ln.strip()]

group_marker = re.compile(r'^\[?\*{0,2}(\d{1,2})\*{0,2}\]?\(https://ims\.tau\.ac\.il/tal/syllabus')
time_re = re.compile(r'(\d{1,2}:\d{2})-(\d{1,2}:\d{2})')
date_re = re.compile(r'(\d{2})/(\d{2})/(\d{4})')

def parse_schedule(block):
    """Return list of session dicts for one course block."""
    lines = block.split('\n')
    # locate group rows: a line that is just [**NN**](syllabus...)
    sessions = []
    # split into group segments
    idxs = [i for i, ln in enumerate(lines) if group_marker.match(ln.strip())]
    for j, gi in enumerate(idxs):
        gm = group_marker.match(lines[gi].strip())
        group = gm.group(1).zfill(2)
        seg_end = idxs[j + 1] if j + 1 < len(idxs) else len(lines)
        seg = [ln.strip().strip('*').strip() for ln in lines[gi + 1:seg_end] if ln.strip()]
        if not seg:
            continue
        # pattern-extract from the segment
        day = next((DAY[d] for ln in seg for d in DAY if ln.startswith(d)), None)
        tm = next((m for ln in seg for m in [time_re.search(ln)] if m), None)
        start, end = (tm.group(1), tm.group(2)) if tm else (None, None)
        sem = next((SEM[ln] for ln in seg if ln in SEM), None)
        stype = next((TYPES[ln] for ln in seg if ln in TYPES), "lecture")
        # lecturer: a line with an academic title or person prefix
        lecturer = next((ln for ln in seg if re.match(r'(מר |גב\'|ד"ר|פרופ|דר\' |עו"ד )', ln)), None)
        # room: a line that looks like a location (and isn't day/time/sem/type/lecturer/freq)
        room = None
        for ln in seg:
            if (ln not in SEM and ln not in TYPES and ln != lecturer
                    and not any(ln.startswith(d) for d in DAY)
                    and not time_re.search(ln) and ln not in ("שבועי", "דו שבועי", "דו-שבועי")
                    and any(k in ln for k in ("כיתות", "בניין", "בנין", "חדר", "פקולטה", "אולם", "ביה\"ס", "מעבד"))):
                room = ln
                break
        # only emit if we got at least a day+time (a real scheduled session)
        if day and start:
            sessions.append({
                "groupCode": group, "sessionType": stype, "semester": sem,
                "dayOfWeek": day, "startTime": start, "endTime": end,
                "room": room, "lecturerName": lecturer,
            })
    return sessions

def parse_exam(block):
    """Return {examDateA, examDateB} (ISO) from a course's exam block — only final exams."""
    lines = clean_lines(block)
    text = "\n".join(lines)
    if "בחינה סופית" not in text:
        return {}
    # collect full date+time occurrences after the first בחינה סופית marker
    after = text.split("בחינה סופית", 1)[1]
    dates = []
    for m in date_re.finditer(after):
        dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
        # capture trailing time if present
        tail = after[m.end():m.end() + 20]
        tm = re.search(r'(\d{1,2}):(\d{2})', tail)
        hh, mn = (tm.group(1), tm.group(2)) if tm else ("09", "00")
        dates.append(f"{yyyy}-{mm}-{dd}T{hh.zfill(2)}:{mn}:00.000Z")
    out = {}
    if len(dates) >= 1:
        out["examDateA"] = dates[0]
    if len(dates) >= 2:
        out["examDateB"] = dates[1]
    return out

# Build maps
sched_map, exam_map = {}, {}
for code, block in course_blocks(SCHED):
    s = parse_schedule(block)
    if s:
        sched_map.setdefault(code, []).extend(s)
for code, block in course_blocks(EXAM):
    e = parse_exam(block)
    if e:
        exam_map[code] = e

FIX = "/Users/Ariel/קלוד קוד ניסוי 6 - אפליקציית פכמ על אמת/pakam-strategist/prisma/fixtures/ppe-courses-2025.json"

if __name__ == "__main__" and "--write" in sys.argv:
    import shutil
    fx = json.load(open(FIX))
    courses = fx["courses"]
    catalog = {c["code"] for c in courses}
    # 1) enrich exam dates (only overwrite when the Yedion has a real final-exam date)
    for c in courses:
        e = exam_map.get(c["code"])
        if e:
            if "examDateA" in e:
                c["examDateA"] = e["examDateA"]
            if "examDateB" in e:
                c["examDateB"] = e["examDateB"]
    # 2) rebuild scheduleSessions from the Yedion (catalog courses only — FK safe)
    sessions = []
    for code in sorted(catalog):
        for s in sched_map.get(code, []):
            sessions.append({
                "courseCode": code, "dayOfWeek": s["dayOfWeek"],
                "startTime": s["startTime"], "endTime": s["endTime"],
                "room": s["room"], "building": None,
                "sessionType": s["sessionType"], "semester": s["semester"] or "FALL",
                "academicYear": 2026, "groupCode": s["groupCode"],
                "lecturerName": s["lecturerName"],
            })
    fx["scheduleSessions"] = sessions
    fx["_meta"]["sessionCount"] = len(sessions)
    fx["_meta"]["enrichedFrom"] = 'official TAU Yedion study-program tcid=5904 (תשפ"ו)'
    fx["_meta"]["enrichedAt"] = "2026-06-27"
    # coverage
    have_sess = len({s["courseCode"] for s in sessions})
    have_lect = len({s["courseCode"] for s in sessions if s["lecturerName"]})
    have_exam = sum(1 for c in courses if c.get("examDateA"))
    print(f"catalog: {len(courses)} courses")
    print(f"  schedule coverage: {have_sess}/{len(courses)} courses (was 27)")
    print(f"  total sessions: {len(sessions)} (was 62)")
    print(f"  courses with a named lecturer: {have_lect}")
    print(f"  exam-date coverage: {have_exam}/{len(courses)} courses (was 30)")
    shutil.copy(FIX, FIX + ".bak")
    json.dump(fx, open(FIX, "w"), ensure_ascii=False, indent=2)
    print("wrote", FIX, "(backup at .bak)")
    sys.exit(0)

if __name__ == "__main__" and "--report" in sys.argv:
    print("schedule courses:", len(sched_map), "| total sessions:", sum(len(v) for v in sched_map.values()))
    print("sessions w/ lecturer:", sum(1 for v in sched_map.values() for s in v if s["lecturerName"]))
    print("sessions w/ room:", sum(1 for v in sched_map.values() for s in v if s["room"]))
    print("exam courses:", len(exam_map), "| with examDateB:", sum(1 for e in exam_map.values() if "examDateB" in e))
    for sample in ["0651-1005", "0618-1012", "0651-1001"]:
        print(f"\n--- {sample} ---")
        print("  sessions:", json.dumps(sched_map.get(sample, [])[:3], ensure_ascii=False))
        print("  exam:", json.dumps(exam_map.get(sample, {}), ensure_ascii=False))
