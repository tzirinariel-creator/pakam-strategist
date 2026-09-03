import { chromium } from "playwright";
const BASE="https://pakam-strategist.vercel.app";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:1000},locale:"he-IL",timezoneId:"Asia/Jerusalem"});
const p=await ctx.newPage();
await p.goto(`${BASE}/he/login`,{waitUntil:"networkidle"});
await p.getByRole("button",{name:/התחברות עם דוא/}).click();
await p.locator('input[type=email]').fill("test@pakamon.dev");
await p.locator('input[type=password]').fill("test123456");
await p.locator('button[type=submit]').click();
await p.waitForURL(/dashboard/,{timeout:45000});

// --- מילואים: אילו שנים אפשר בכלל לבחור? ---
await p.goto(`${BASE}/he/miluim`,{waitUntil:"networkidle"});
await p.waitForTimeout(5000);
const years = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll("select").forEach(s=>{
    out.push({name:s.name||s.id||s.getAttribute("aria-label")||"?",
              opts:[...s.options].map(o=>o.textContent.trim())});
  });
  return out;
});
console.log("=== בוררי המילואים ===");
console.log(JSON.stringify(years,null,1));

// --- כמה שנים אחורה אפשר לרשום מילואים? ---
console.log("\n=== האם יש בורר שנה בכלל (radio/button) ===");
console.log(await p.evaluate(()=>{
  const box=[...document.querySelectorAll("*")].find(e=>e.textContent?.trim()==="הוסיפו סמסטר");
  let n=box; for(let i=0;i<6&&n;i++) n=n.parentElement;
  return n? n.innerText.replace(/\n+/g," | ").slice(0,600):"—";
}));
await b.close();
