import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const ComposioFileObjectSchema = z.object({
  name: z.string().min(1),
  mimetype: z.string().min(1),
  s3key: z.string().min(1),
});
export type ComposioFileObject = z.infer<typeof ComposioFileObjectSchema>;

export const ComposioFileBridgeResultSchema = z.object({
  ok: z.boolean(),
  sourcePath: z.string().min(1),
  fileObject: ComposioFileObjectSchema,
  requestFileId: z.string().min(1),
  storageBackend: z.string().min(1),
  uploadedAt: z.string().min(1),
});
export type ComposioFileBridgeResult = z.infer<typeof ComposioFileBridgeResultSchema>;

interface PresignedUploadResponse {
  readonly id?: string;
  readonly key?: string;
  readonly newPresignedUrl?: string;
  readonly new_presigned_url?: string;
  readonly metadata?: { readonly storage_backend?: string };
}

function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "").replace(/\/api\/v1$/, "").replace(/\/api\/v3$/, "");
}

async function hashMd5Hex(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("md5").update(buffer).digest("hex");
}

export function isComposioFileReference(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("composio://")) return true;
  if (!trimmed.startsWith("{")) return false;
  try {
    return ComposioFileObjectSchema.safeParse(JSON.parse(trimmed)).success;
  } catch {
    return false;
  }
}

export async function uploadLocalFileToComposio(input: {
  readonly filePath: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly toolSlug: string;
  readonly toolkitSlug: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<ComposioFileBridgeResult> {
  const fetcher = input.fetchImpl ?? fetch;
  const apiKey = input.apiKey ?? process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for Composio file bridge");
  const fileBuffer = await fs.readFile(input.filePath);
  const stat = await fs.stat(input.filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error(`Invalid upload file: ${input.filePath}`);
  const name = path.basename(input.filePath);
  const mimetype = mimeForFile(input.filePath);
  const md5 = await hashMd5Hex(input.filePath);
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? process.env.COMPOSIO_API_BASE_URL ?? "https://backend.composio.dev");
  const request = await fetcher(`${baseUrl}/api/v3/files/upload/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ filename: name, md5, mimetype, tool_slug: input.toolSlug, toolkit_slug: input.toolkitSlug }),
  });
  const requestText = await request.text();
  let requestBody: PresignedUploadResponse;
  try { requestBody = JSON.parse(requestText) as PresignedUploadResponse; } catch { throw new Error(`Composio file request returned non-JSON status ${request.status}`); }
  if (!request.ok) throw new Error(`Composio file request failed ${request.status}`);
  const uploadUrl = requestBody.newPresignedUrl ?? requestBody.new_presigned_url;
  if (!requestBody.key || !requestBody.id || !uploadUrl) throw new Error("Composio file request did not return id, key, and upload URL");
  const uploadHeaders: Record<string, string> = { "Content-Type": mimetype };
  if (requestBody.metadata?.storage_backend === "azure_blob_storage") uploadHeaders["x-ms-blob-type"] = "BlockBlob";
  const upload = await fetcher(uploadUrl, { method: "PUT", headers: uploadHeaders, body: fileBuffer });
  if (!upload.ok) throw new Error(`Composio file upload failed ${upload.status}`);
  return ComposioFileBridgeResultSchema.parse({
    ok: true,
    sourcePath: input.filePath,
    fileObject: { name, mimetype, s3key: requestBody.key },
    requestFileId: requestBody.id,
    storageBackend: requestBody.metadata?.storage_backend ?? "unknown",
    uploadedAt: new Date().toISOString(),
  });
}

export async function localVideoPathToComposioReference(filePath: string, options: { readonly apiKey?: string; readonly baseUrl?: string; readonly fetchImpl?: typeof fetch } = {}): Promise<{ readonly bridgedVideoPath: string; readonly bridgeResult: ComposioFileBridgeResult | null }> {
  if (isComposioFileReference(filePath)) return { bridgedVideoPath: filePath, bridgeResult: null };
  const result = await uploadLocalFileToComposio({
    filePath,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    fetchImpl: options.fetchImpl,
    toolSlug: process.env.VIDEO_COMPOSIO_UPLOAD_TOOL ?? "YOUTUBE_UPLOAD_VIDEO",
    toolkitSlug: process.env.COMPOSIO_YOUTUBE_TOOLKIT ?? "youtube",
  });
  return { bridgedVideoPath: JSON.stringify(result.fileObject), bridgeResult: result };
}
