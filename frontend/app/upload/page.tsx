"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ErrorMessage from "@/components/ErrorMessage";
import LoadingState from "@/components/LoadingState";
import UploadBox from "@/components/UploadBox";
import { analyzeCsv, ApiError, uploadCsv } from "@/lib/api";

type Stage = "idle" | "uploading" | "analyzing" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const runUploadAndAnalyze = async (file: File) => {
    setLastFile(file);
    setError(null);
    setStage("uploading");
    setUploadProgress(0);

    try {
      const uploaded = await uploadCsv(file, (percent) => setUploadProgress(percent));
      setStage("analyzing");
      await analyzeCsv(uploaded.file_id);
      router.push(`/dashboard?file_id=${uploaded.file_id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setError(message);
      setStage("error");
      setUploadProgress(null);
    }
  };

  const isBusy = stage === "uploading" || stage === "analyzing";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Upload a CSV</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your file is profiled and cleaned by Python. Only the resulting profile is shared with the LLM.
        </p>
      </div>

      <UploadBox
        onSubmit={runUploadAndAnalyze}
        uploadProgress={stage === "uploading" ? uploadProgress : null}
        disabled={isBusy}
      />

      {stage === "analyzing" && (
        <LoadingState message="Analyzing dataset — profiling, cleaning, and generating charts. This can take a moment." />
      )}

      {stage === "error" && error && (
        <ErrorMessage
          message={error}
          onRetry={lastFile ? () => runUploadAndAnalyze(lastFile) : undefined}
        />
      )}
    </div>
  );
}
