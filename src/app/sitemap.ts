import type { MetadataRoute } from "next";

const STATIC_PATHS = [
  "",
  "/signals/active",
  "/signals/resolved",
  "/signals/by-asset",
  "/signals/by-creator-cluster",
  "/calls",
  "/compare",
  "/dashboard",
  "/pricing",
  "/methodology",
  "/feedback",
  "/settings/billing",
  "/settings/team",
  "/settings/alerts",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://cryptotuberranked.com";
  const lastModified = new Date();

  return STATIC_PATHS.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : path.startsWith("/settings") ? 0.4 : 0.8,
  }));
}
