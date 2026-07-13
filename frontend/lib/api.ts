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

export async function getResults(fileId: string): Promise<ResultsResponse> {
  try {
    const response = await client.get<ResultsResponse>(`/results/${fileId}`);
    return response.data;
  } catch (error) {
    throw toApiError(error, "Failed to load analysis results.");
  }
}

/** Resolve a backend-relative path (e.g. "/charts/x.png") to an absolute URL. */
export function resolveAssetUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${BASE_URL}${path}`;
}
