import { z } from "zod";
export const VideoStageSchema = z.enum(["plan", "audio", "captions", "render", "thumbnail", "qa", "publish", "analytics"]);
