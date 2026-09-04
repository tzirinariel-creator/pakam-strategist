// נקודת כניסה אחת: node video/tour.mjs --persona y1|y2|y3 [--mobile]
import { runTour } from "./tour-runner.mjs";
import { ACTIONS } from "./tour-actions.mjs";
await runTour(ACTIONS);
