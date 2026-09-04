import { openApp, login, shot, BASE } from "./tour-lib.mjs";
const { b, p, errors } = await openApp();
await login(p); await p.waitForTimeout(5000);
const click=async(re)=>{const e=p.getByRole("button",{name:re}).first(); if(await e.count()){await e.click().catch(()=>{});await p.waitForTimeout(3500);return true}return false};
await click(/^פכ״מ/); await click(/בואו נתחיל/); await click(/מתחילים את התואר עכשיו/);
for (const re of [/^שנה א׳$/,/^סמסטר א׳$/,/^לשון זכר$/,/^כלכלה$/]) { const e=p.getByRole("button",{name:re}).first(); if(await e.count()){await e.click().catch(()=>{});await p.waitForTimeout(700)} }
await click(/^הבא$/);
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => {
  const txt = document.body.innerText;
  const hours = [...txt.matchAll(/([\d.]+)\s*שעות[\/ ]?(שבוע|לימוד)/g)].map(m=>m[0]);
  // ההתראה על החפיפה — בדיוק כפי שהיא ברשת התווים
  const warn = [...document.querySelectorAll("*")].filter(e=>e.children.length===0 && /חופף/.test(e.textContent||""))
     .map(e=>({ text:e.textContent.trim(), codes:[...e.textContent.trim()].slice(-14).map(c=>c.charCodeAt(0).toString(16)).join(" ") }));
  // מספרי הסיכום
  const nums = [...document.querySelectorAll("*")].filter(e=>e.children.length===0 && /^[\d.]+$/.test(e.textContent.trim()))
     .map(e=>({v:e.textContent.trim(), next:(e.parentElement?.innerText||"").replace(/\n/g," ").slice(0,40)}));
  return { hoursMentions:[...new Set(hours)], overlapWarning:warn, numbers:nums.slice(0,10) };
}), null, 1));
console.log(await shot(p,"probe-wiz4"));
await b.close();
