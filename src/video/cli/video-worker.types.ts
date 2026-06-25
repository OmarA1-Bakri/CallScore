import { z } from "zod";
export const VideoStageSchema = z.enum(["plan", "audio", "captions", "broll", "render", "thumbnail", "qa", "publish", "analytics"]);
