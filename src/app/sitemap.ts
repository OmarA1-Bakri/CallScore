import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    "",
    "/pricing",
    "/methodology",
    "/feedback",
    "/about",
    "/terms",
    "/privacy",
  ].map(
    (path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.8,
    }),
  );

  return staticPages;
}
