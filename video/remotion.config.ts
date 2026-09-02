import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 1080p מלא; הסרטון מעוצב ב-1920×1080 ומוקטן בעת ההטמעה.
Config.setChromiumOpenGlRenderer("angle");
