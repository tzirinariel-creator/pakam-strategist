import { createTRPCRouter } from "./init";
import { userRouter } from "../routers/user";
import { courseRouter } from "../routers/course";
import { planRouter } from "../routers/plan";
import { regulationRouter } from "../routers/regulation";
import { scheduleRouter } from "../routers/schedule";
import { studyTaskRouter } from "../routers/study-task";
import { adminRouter } from "../routers/admin";
import { aiRouter } from "../routers/ai";

/**
 * Root tRPC router — all sub-routers are merged here
 */
export const appRouter = createTRPCRouter({
  user: userRouter,
  course: courseRouter,
  plan: planRouter,
  regulation: regulationRouter,
  schedule: scheduleRouter,
  studyTask: studyTaskRouter,
  admin: adminRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
