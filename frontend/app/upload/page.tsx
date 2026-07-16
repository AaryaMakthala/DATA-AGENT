"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { SiteNav } from "@/components/SiteNav";
import { analyzeCsv, ApiError, uploadCsv } from "@/lib/api";

type Stage = "idle" | "uploading" | "analyzing" | "error";

const HIGHLIGHTS = [
  {
    title: "Secure & Private",
    body: "Your data is encrypted and never shared.",
    icon: (
      <>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    title: "Fast & Accurate",
    body: "Get quick, reliable analysis and results.",
    icon: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  },
  {
    title: "Actionable Insights",
    body: "Turn your data into clear decisions.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.6" fill="currentColor" />
      </>
    ),
  },
];

const STEPS = [
  {
    num: "1",
    title: "Upload CSV",
    body: "Upload your dataset in .csv format.",
    icon: (
      <>
        <path d="M12 15V4" />
        <polyline points="8 8 12 4 16 8" />
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
  {
    num: "2",
    title: "We Analyze",
    body: "Our AI analyzes your data and finds the best model.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </>
    ),
  },
  {
    num: "3",
    title: "Get Results",
    body: "Explore insights, graphs, and download results.",
    icon: (
      <>
        <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z" />
        <polyline points="14 3 14 7 18 7" />
      </>
    ),
  },
  {
    num: "4",
    title: "Download",
    body: "Download the updated CSV file with insights.",
    icon: (
      <>
        <path d="M12 4v11" />
        <polyline points="8 11 12 15 16 11" />
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
];

export default function UploadPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBusy = stage === "uploading" || stage === "analyzing";

  const validate = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".csv")) return "Only .csv files are accepted.";
    if (file.size === 0) return "The selected file is empty.";
    if (file.size > 50 * 1024 * 1024) return "File is too large (50MB limit).";
    return null;
  };

  const runUploadAndAnalyze = async (file: File) => {
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      setStage("error");
      return;
    }

    setSelectedFile(file);
    setError(null);
    setStage("uploading");
    setUploadProgress(0);

    try {
      const uploaded = await uploadCsv(file, (percent) => setUploadProgress(percent));
      setStage("analyzing");
      await analyzeCsv(uploaded.file_id);
      router.push(`/results?file_id=${uploaded.file_id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setError(message);
      setStage("error");
      setUploadProgress(null);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file || isBusy) return;
    void runUploadAndAnalyze(file);
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav />

        {/* Hero */}
        <section className="pt-12 text-center">
          <span className="pill-label">AI Powered · Data Driven · Insights Focused</span>
          <h1 className="display-heading mx-auto mt-6 max-w-2xl text-5xl sm:text-6xl">
            Upload Your{" "}
            <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">Dataset</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-muted">
            Upload your .csv file and let us analyze it to deliver meaningful insights.
          </p>
        </section>

        {/* Dropzone card */}
        <section className="mt-10">
          <div className="card-elevated mx-auto max-w-2xl p-8">
            <div
              role="button"
              tabIndex={0}
              onClick={() => !isBusy && inputRef.current?.click()}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !isBusy) inputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleFile(event.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition-colors ${
                isDragging ? "border-mustard bg-cream-sunken" : "border-line bg-cream-card hover:bg-cream-sunken"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mustard text-ink">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V7" />
                  <polyline points="8 11 12 7 16 11" />
                  <path d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 9.3 4 4 0 0 1 18 19H6.5z" />
                </svg>
              </span>
              <div className="font-display text-lg font-bold text-ink">Drag &amp; drop your file here</div>
              <div className="label-mono text-[10px]">or</div>
              <button
                type="button"
                className="btn btn-yellow"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isBusy) inputRef.current?.click();
                }}
                disabled={isBusy}
              >
                {stage === "uploading"
                  ? `Uploading… ${uploadProgress ?? 0}%`
                  : stage === "analyzing"
                    ? "Analyzing…"
                    : "Upload File"}
              </button>
              <p className="text-xs text-muted">Supports .csv files only</p>
              <span className="inline-flex items-center gap-2 rounded-pill bg-cream-sunken px-3 py-1.5 text-[11px] text-muted">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z" />
                  <polyline points="14 3 14 7 18 7" />
                </svg>
                Max file size: 50MB
              </span>
            </div>

            {uploadProgress !== null && stage === "uploading" && (
              <div className="mt-5 h-2 w-full overflow-hidden rounded-pill bg-cream-sunken">
                <div className="h-full rounded-pill bg-mustard transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}

            {selectedFile && !error && (
              <p className="mt-4 text-center text-sm text-muted">
                Selected: <span className="text-ink">{selectedFile.name}</span>
              </p>
            )}

            {stage === "error" && error && (
              <p className="mt-4 text-center text-sm" style={{ color: "var(--color-ink)" }}>
                {error}
              </p>
            )}
          </div>
        </section>

        {/* Highlights */}
        <section className="mt-8">
          <div className="card grid grid-cols-1 gap-6 sm:grid-cols-3">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-sunken text-ink">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {item.icon}
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-bold text-ink">{item.title}</div>
                  <p className="mt-1 text-xs text-muted">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-14 text-center">
          <h2 className="display-heading text-2xl font-bold">How It Works</h2>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center">
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-cream-sunken text-ink">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {step.icon}
                  </svg>
                  <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-mustard font-mono text-[10px] font-bold text-ink">
                    {step.num}
                  </span>
                </span>
                <div className="mt-4 text-sm font-bold text-ink">{step.title}</div>
                <p className="mt-1 max-w-[10rem] text-xs text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy panel */}
        <section className="mb-16 mt-14">
          <div className="card flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-sunken text-ink">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="1.5" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-bold text-ink">Your data is secure and private.</div>
              <p className="mt-1 text-xs text-muted">We never share your data with anyone.</p>
            </div>
          </div>
        </section>

        <div className="pb-6 text-center">
          <Link href="/" className="label-mono transition-colors hover:text-ink">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
