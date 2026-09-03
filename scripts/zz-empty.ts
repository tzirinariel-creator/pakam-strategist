import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs"; import path from "node:path";
for (const f of [".env.local",".env"]) { const pth=path.join(__dirname,"..",f); if(!fs.existsSync(pth))continue;
  for (const line of fs.readFileSync(pth,"utf-8").split("\n")) { const t=line.trim(); if(!t||t.startsWith("#"))continue;
    const i=t.indexOf("="); if(i>0&&!process.env[t.slice(0,i)])process.env[t.slice(0,i)]=t.slice(i+1);} break; }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL||process.env.DIRECT_URL }) });
async function main(){
  const mode = process.argv[2]; // "clear" | "restore"
  const u = await prisma.user.findFirstOrThrow({ where:{ email:"test@pakamon.dev" }, select:{id:true} });
  if (mode === "clear") {
    const n = await prisma.userCourse.updateMany({ where:{ userId:u.id, status:"PLANNED" }, data:{ status:"COMPLETED", grade:85 } });
    console.log("PLANNED → COMPLETED:", n.count);
  } else {
    const n = await prisma.userCourse.updateMany({ where:{ userId:u.id, plannedYear:3 }, data:{ status:"PLANNED", grade:null } });
    console.log("שוחזר לשנה ג׳ PLANNED:", n.count);
  }
}
main().finally(()=>prisma.$disconnect());
