import axios, { AxiosProgressEvent, isAxiosError } from "axios";

import type { AnalyzeResponse, ResultsResponse, UploadResponse } from "@/types/analysis";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const client = axios.create({ baseURL: BASE_URL });

/** Human-readable message extraction shared by every API call below. */
export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (isAxiosError(error)) {
    if (error.response) {
      const detail = (error.response.data as { detail?: string } | undefined)?.detail;
      return new ApiError(detail || fallback, error.response.status);
    }
    if (error.request) {
      return new ApiError("Could not reach the backend server. Is it running?");
    }
  }
  return new ApiError(fallback);
}

export async function uploadCsv(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await client.post<UploadResponse>("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
    return response.data;
  } catch (error) {
    throw toApiError(error, "Failed to upload the file.");
  }
}

export async function analyzeCsv(fileId: string): Promise<AnalyzeResponse> {
  try {
    const response = await client.post<AnalyzeResponse>(`/analyze/${fileId}`);
    return response.data;
  } catch (error) {
    throw toApiError(error, "Failed to analyze the file.");
  }
}

export async function getResults(
  fileId: string,
  signal?: AbortSignal
): Promise<ResultsResponse> {
  try {
    const response = await client.get<ResultsResponse>(`/results/${fileId}`, {
      signal,
    });
    return response.data;
  } catch (error) {
    // Let callers treat intentional aborts as non-errors.
    if (isAxiosError(error) && error.code === "ERR_CANCELED") {
      throw error;
    }
    throw toApiError(error, "Failed to load analysis results.");
  }
}

/**
 * Resolve a backend-relative path (e.g. "/charts/x.png") to an absolute URL.
 * Rejects dangerous URL schemes. Absolute http(s) URLs are accepted only when
 * they match the configured API origin.
 */
export function resolveAssetUrl(path: string): string {
  const trimmed = path.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return `${BASE_URL}/`;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const base = new URL(BASE_URL);
      if (url.origin === base.origin) return url.toString();
    } catch {
      // invalid absolute URL
    }
    return `${BASE_URL}/`;
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${BASE_URL}${normalized}`;
}

/**
 * Build the download URL for the cleaned CSV.
 *
 * NOTE: the backend currently exposes exactly ONE download route --
 * `GET /download/{file_id}`, which returns the cleaned CSV (see
 * backend/app/api/routes.py's `download_cleaned_csv`). There is no
 * `/download/<kind>/<file_id>` routing for analysis_report / json_results /
 * charts_zip / cleaning_log yet -- those download-center buttons render as
 * "Unavailable" in results/page.tsx until real generator functions +
 * routes exist for them on the backend. Don't add a multi-kind
 * `downloadPath()` helper here until that backend work lands; a URL-building
 * function for routes that don't exist is worse than no function -- it
 * looks wired up but 404s.
 */
export function cleanedCsvDownloadUrl(fileId: string): string {
  return resolveAssetUrl(`/download/${fileId}`);
}