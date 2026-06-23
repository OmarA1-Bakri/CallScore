import type { QaReport } from "../schemas/video.schemas";
import type { VideoAutomationConfig } from "../config/publishing-config";

export interface PublishDecision {
  readonly shouldPublish: boolean;
  readonly reason: string;
}

export function decidePublish(config: VideoAutomationConfig, qa: QaReport): PublishDecision {
  if (!config.enabled) return { shouldPublish: false, reason: "video_automation_disabled" };
  if (!qa.ok) return { shouldPublish: false, reason: "qa_failed" };
  if (!config.autoPublish) return { shouldPublish: false, reason: "auto_publish_disabled" };
  return { shouldPublish: true, reason: `publish_${config.privacyStatus}_${config.publishMode}` };
}
