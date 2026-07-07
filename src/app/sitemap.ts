import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const LAST_MODIFIED = new Date(process.env.BUILD_TIMESTAMP ?? "2026-07-07T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    "",
    "/pricing",
    "/methodology",
    "/feedback",
    "/about",
    "/transparency",
    "/backtest",
    "/alerts",
    "/webhooks",
    "/terms",
    "/privacy",
  ].map(
    (path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : path === "/methodology" ? 0.9 : 0.8,
    }),
  );

  return staticPages;
}
