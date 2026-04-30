import globalCreatorSourcesJson from "../data/global-creator-sources.json";

export const GLOBAL_CREATOR_STATUSES = ["candidate", "approved", "rejected", "seeded"] as const;
export type GlobalCreatorStatus = (typeof GLOBAL_CREATOR_STATUSES)[number];

export const GLOBAL_CREATOR_CONTENT_TYPES = [
  "creator_calls",
  "creator_news",
  "creator_education",
  "company_exchange",
  "finance_crypto_adjacent",
  "macro_bitcoin",
] as const;
export type GlobalCreatorContentType = (typeof GLOBAL_CREATOR_CONTENT_TYPES)[number];

export interface GlobalCreatorCandidate {
  readonly name: string;
  readonly youtube_handle: string | null;
  readonly youtube_channel_id?: string | null;
  readonly country: string;
  readonly region: string;
  readonly primary_language: string;
  readonly subscriber_count?: string | null;
  readonly avg_views?: string | null;
  readonly source_rank?: number | null;
  readonly content_type: GlobalCreatorContentType;
  readonly crypto_relevance_score: number;
  readonly rankability_guess: "high" | "medium" | "low";
  readonly status: GlobalCreatorStatus;
  readonly rejection_reason?: string | null;
}

export interface GlobalCreatorSource {
  readonly source_name: string;
  readonly source_url: string;
  readonly snapshot_date: string;
  readonly source_type: "external_list" | "manual_research_seed" | "api_discovery";
  readonly candidates: readonly GlobalCreatorCandidate[];
}

export interface GlobalCreatorSourcesFile {
  readonly schema_version: number;
  readonly snapshot_date: string;
  readonly notes: string;
  readonly sources: readonly GlobalCreatorSource[];
}

export interface GlobalCreatorCandidateWithSource extends GlobalCreatorCandidate {
  readonly source_name: string;
  readonly source_url: string;
  readonly source_snapshot_date: string;
}

export interface GlobalCreatorSummary {
  readonly sourceCount: number;
  readonly candidateCount: number;
  readonly uniqueCandidateCount: number;
  readonly statusCounts: Record<GlobalCreatorStatus, number>;
  readonly regionCounts: Record<string, number>;
  readonly languageCounts: Record<string, number>;
  readonly contentTypeCounts: Record<GlobalCreatorContentType, number>;
}

const globalCreatorSources = globalCreatorSourcesJson as GlobalCreatorSourcesFile;

export function getGlobalCreatorSources(): GlobalCreatorSourcesFile {
  validateGlobalCreatorSources(globalCreatorSources);
  return globalCreatorSources;
}

export function getGlobalCreatorCandidates(): readonly GlobalCreatorCandidateWithSource[] {
  const file = getGlobalCreatorSources();
  return file.sources.flatMap((source) =>
    source.candidates.map((candidate) => ({
      ...candidate,
      source_name: source.source_name,
      source_url: source.source_url,
      source_snapshot_date: source.snapshot_date,
    })),
  );
}

export function normalizeCreatorHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("channel/")) return trimmed.toLowerCase();
  return trimmed.startsWith("@") ? trimmed.toLowerCase() : `@${trimmed}`.toLowerCase();
}

export function dedupeGlobalCreatorCandidates(
  candidates: readonly GlobalCreatorCandidateWithSource[],
): readonly GlobalCreatorCandidateWithSource[] {
  const byKey = new Map<string, GlobalCreatorCandidateWithSource>();
  for (const candidate of candidates) {
    const key =
      normalizeCreatorHandle(candidate.youtube_handle) ??
      candidate.youtube_channel_id?.trim().toLowerCase() ??
      candidate.name.trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    if (candidatePriority(candidate) > candidatePriority(existing)) {
      byKey.set(key, candidate);
    }
  }
  return Array.from(byKey.values());
}

export function summarizeGlobalCreatorCandidates(
  candidates: readonly GlobalCreatorCandidateWithSource[] = getGlobalCreatorCandidates(),
): GlobalCreatorSummary {
  const uniqueCandidates = dedupeGlobalCreatorCandidates(candidates);
  const statusCounts = initCountRecord(GLOBAL_CREATOR_STATUSES);
  const contentTypeCounts = initCountRecord(GLOBAL_CREATOR_CONTENT_TYPES);
  const regionCounts: Record<string, number> = {};
  const languageCounts: Record<string, number> = {};

  for (const candidate of uniqueCandidates) {
    statusCounts[candidate.status]++;
    contentTypeCounts[candidate.content_type]++;
    increment(regionCounts, candidate.region);
    increment(languageCounts, candidate.primary_language);
  }

  return {
    sourceCount: new Set(candidates.map((candidate) => candidate.source_name)).size,
    candidateCount: candidates.length,
    uniqueCandidateCount: uniqueCandidates.length,
    statusCounts,
    regionCounts,
    languageCounts,
    contentTypeCounts,
  };
}

export function validateGlobalCreatorSources(file: GlobalCreatorSourcesFile): void {
  if (file.schema_version !== 1) {
    throw new Error(`Unsupported global creator source schema_version: ${file.schema_version}`);
  }
  if (!Array.isArray(file.sources) || file.sources.length === 0) {
    throw new Error("Global creator sources file must contain at least one source");
  }

  for (const source of file.sources) {
    if (!source.source_name || !source.source_url || !source.snapshot_date) {
      throw new Error("Each global creator source requires source_name, source_url, and snapshot_date");
    }
    if (!Array.isArray(source.candidates)) {
      throw new Error(`Source ${source.source_name} must have a candidates array`);
    }
    for (const candidate of source.candidates) {
      validateCandidate(candidate, source.source_name);
    }
  }
}

function validateCandidate(candidate: GlobalCreatorCandidate, sourceName: string): void {
  if (!candidate.name.trim()) throw new Error(`Candidate in ${sourceName} is missing name`);
  if (!candidate.youtube_handle && !candidate.youtube_channel_id) {
    throw new Error(`Candidate ${candidate.name} requires youtube_handle or youtube_channel_id`);
  }
  if (!candidate.country || !candidate.region || !candidate.primary_language) {
    throw new Error(`Candidate ${candidate.name} requires country, region, and primary_language`);
  }
  if (!GLOBAL_CREATOR_STATUSES.includes(candidate.status)) {
    throw new Error(`Candidate ${candidate.name} has invalid status ${candidate.status}`);
  }
  if (!GLOBAL_CREATOR_CONTENT_TYPES.includes(candidate.content_type)) {
    throw new Error(`Candidate ${candidate.name} has invalid content_type ${candidate.content_type}`);
  }
  if (candidate.crypto_relevance_score < 0 || candidate.crypto_relevance_score > 1) {
    throw new Error(`Candidate ${candidate.name} crypto_relevance_score must be between 0 and 1`);
  }
}

function initCountRecord<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function candidatePriority(candidate: GlobalCreatorCandidateWithSource): number {
  const languageSpecificity = candidate.primary_language === "mixed" || candidate.primary_language === "unknown" ? 0 : 1;
  const countrySpecificity = candidate.country === "Unknown" ? 0 : 1;
  return statusPriority(candidate.status) * 100 + languageSpecificity * 10 + countrySpecificity;
}

function statusPriority(status: GlobalCreatorStatus): number {
  switch (status) {
    case "seeded":
      return 4;
    case "approved":
      return 3;
    case "candidate":
      return 2;
    case "rejected":
      return 1;
  }
}
