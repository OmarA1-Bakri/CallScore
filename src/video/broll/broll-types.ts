export interface BrollClip {
  url: string;
  thumbnailUrl: string;
  provider: "pexels" | "unsplash" | "archive";
  width: number;
  height: number;
  durationSeconds: number;
  license: string;
}
