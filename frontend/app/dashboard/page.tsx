"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import AlgorithmRecommendation from "@/components/AlgorithmRecommendation";
import ChartViewer from "@/components/ChartViewer";
import CleaningReport from "@/components/CleaningReport";
import DatasetSummary from "@/components/DatasetSummary";
import DownloadButtons from "@/components/DownloadButtons";
import ErrorMessage from "@/components/ErrorMessage";
import LoadingState from "@/components/LoadingState";
import { ApiError, getResults } from "@/lib/api";
import type { ResultsResponse } from "@/types/analysis";

function DashboardContent() {
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file_id");

  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchResults = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getResults(id);
      setResults(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load analysis results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!fileId) {
      setLoading(false);
      setError("No file_id was provided. Upload a CSV first.");
      return;
    }
    void fetchResults(fileId);
  }, [fileId]);

  if (loading) {
    return <LoadingState message="Loading analysis results…" />;
  }

  if (error || !results || !fileId) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorMessage
          message={error ?? "Something went wrong loading these results."}
          onRetry={fileId ? () => fetchResults(fileId) : undefined}
        />
        <Link href="/upload" className="text-sm font-medium text-indigo-600 hover:underline">
          Back to upload
        </Link>
      </div>
    );
  }

  const { profile, report, cleaning_plan, cleaned_file, charts, recommendations } = results;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analysis Results</h1>
        <p className="mt-1 text-sm text-slate-500">File ID: {fileId}</p>
      </div>

      {profile && <DatasetSummary profile={profile} />}

      {(report || cleaning_plan) && <CleaningReport report={report} cleaningPlan={cleaning_plan} />}

      {charts && charts.length > 0 && <ChartViewer charts={charts} />}

      {recommendations && <AlgorithmRecommendation recommendations={recommendations} />}

      <DownloadButtons cleanedFile={cleaned_file} charts={charts ?? []} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading…" />}>
      <DashboardContent />
    </Suspense>
  );
}
