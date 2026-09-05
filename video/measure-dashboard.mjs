// מדידת זמני השרת של שאילתות מסך הבית — כדי לדעת מי מחזיק את הבאטץ'.
import { openApp, login } from "./tour-lib.mjs";

const PROCS = [
  "plan.getUserPlan",
  "plan.getCredits",
  "plan.getGraduationScore",
  "regulation.checkCompliance",
  "user.getProfile",
  "schedule.getGoogleStatus",
  "studyTask.list",
];

const { b, p } = await openApp();
await login(p, process.env.NEXT_PUBLIC_TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD);

const timeOne = async (path) =>
  p.evaluate(async (path) => {
    const t0 = performance.now();
    const r = await fetch(`/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: null, meta: { values: ["undefined"] } } }))}`);
    const txt = await r.text();
    return { ms: Math.round(performance.now() - t0), status: r.status, bytes: txt.length };
  }, path);

// ריצה ראשונה = חימום; שנייה = המספר האמיתי
console.log("═══ סבב חימום ═══");
for (const path of PROCS) { const r = await timeOne(path); console.log(`${path.padEnd(28)} ${r.ms}ms ${r.status} ${r.bytes}B`); }

console.log("\n═══ סבב מדידה (חם) ═══");
for (const path of PROCS) { const r = await timeOne(path); console.log(`${path.padEnd(28)} ${r.ms}ms ${r.status} ${r.bytes}B`); }

console.log("\n═══ הבאטץ' כפי שהאפליקציה שולחת אותו ═══");
const batch = await p.evaluate(async (procs) => {
  const input = {};
  procs.forEach((_, i) => (input[i] = { json: null, meta: { values: ["undefined"] } }));
  const t0 = performance.now();
  const r = await fetch(`/api/trpc/${procs.join(",")}?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`);
  const txt = await r.text();
  return { ms: Math.round(performance.now() - t0), status: r.status, bytes: txt.length };
}, PROCS.slice(0, 6));
console.log(`באטץ' של 6: ${batch.ms}ms ${batch.status} ${batch.bytes}B`);

await b.close();
