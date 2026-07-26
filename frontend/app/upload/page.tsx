"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SiteNav, SiteFooter } from "@/components/SiteNav";
import { analyzeCsv, ApiError, uploadCsv } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Stage = "idle" | "uploading" | "analyzing" | "error";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const HIGHLIGHTS = [
  {
    title: "Secure & private",
    body: "Your data is encrypted in transit and never shared.",
    icon: (
      <>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    title: "Fast & accurate",
    body: "Reliable results, ready in under a minute.",
    icon: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  },
  {
    title: "Actionable insights",
    body: "Clear recommendations, not just raw numbers.",
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
    body: "Drop in your dataset in .csv format.",
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
    title: "We analyze",
    body: "Our AI scans and finds the best-fit model.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </>
    ),
  },
  {
    num: "3",
    title: "Get results",
    body: "Explore insights and visualizations.",
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
    body: "Take your enriched CSV with you.",
    icon: (
      <>
        <path d="M12 4v11" />
        <polyline points="8 11 12 15 16 11" />
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
];

const ANALYZING_STEPS = [
  "Scanning columns",
  "Detecting patterns",
  "Running AI analysis",
  "Generating visualizations",
  "Finalizing insights",
];

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CloudUploadIcon({ size = 40 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <path d="M12 16.5V7.5" />
      <polyline points="8.2 11.3 12 7.5 15.8 11.3" />
      <path d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 9.3 4 4 0 0 1 18 19H6.5z" />
    </svg>
  );
}

function CheckIcon({ size = 40, strokeWidth = 2.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={strokeWidth}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FileIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z" />
      <polyline points="14 3 14 7 18 7" />
    </svg>
  );
}

function WarningIcon({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={2}>
      <path d="M12 4.5 2.8 20h18.4L12 4.5z" />
      <line x1="12" y1="10" x2="12" y2="14.2" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={2.4}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SparkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={1.6}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analyzing state — fills the panel while a file is processed
// ---------------------------------------------------------------------------
function AnalyzingState({ fileName }: { fileName?: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStepIdx((prev) => Math.min(prev + 1, ANALYZING_STEPS.length - 1));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const isLastStep = stepIdx === ANALYZING_STEPS.length - 1;

  return (
    <div className="flex flex-col items-center gap-7 py-2" role="status" aria-live="polite">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-ink bg-cream"
          style={{ boxShadow: "var(--shadow-hard-sm)" }}
        />
        <svg
          viewBox="0 0 36 36"
          className="absolute inset-0 h-24 w-24 animate-spin-slow"
          style={{ animationDuration: "1.6s" }}
          aria-hidden="true"
        >
          <circle cx="18" cy="18" r="13" fill="none" stroke="var(--color-cream-sunken)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="13"
            fill="none"
            stroke="var(--color-mustard)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="26 56"
            transform="rotate(-90 18 18)"
          />
        </svg>
        <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-mustard animate-pulse-soft">
          <span className="h-2 w-2 rounded-full bg-ink" />
        </span>
      </div>

      <div className="text-center">
        <h2 className="headline text-2xl sm:text-3xl">Analyzing your data</h2>
        {fileName && (
          <p className="font-mono mt-2 truncate px-4 text-xs tracking-wide text-muted" title={fileName}>
            {fileName}
          </p>
        )}
      </div>

      <ol className="mx-auto w-full max-w-sm space-y-3 text-left">
        {ANALYZING_STEPS.map((step, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink transition-colors duration-300",
                  done || active ? "bg-mustard text-ink" : "bg-cream-sunken text-muted",
                ].join(" ")}
                aria-hidden="true"
              >
                {done ? (
                  <CheckIcon size={12} strokeWidth={3} />
                ) : active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-ink animate-pulse-soft" />
                ) : (
                  <span className="font-mono text-[9px] font-bold">{i + 1}</span>
                )}
              </span>
              <span
                className={[
                  "font-body text-sm transition-colors duration-300",
                  active ? "font-bold text-ink" : done ? "text-ink" : "text-muted",
                ].join(" ")}
              >
                {step}
                {active && "…"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="label-mono text-[10px]">
        {isLastStep ? "Almost done" : "Est. under a minute"} · {elapsed}s elapsed
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state — replaces the dropzone in the SAME panel, never stacks on it
// ---------------------------------------------------------------------------
function ErrorState({
  message,
  fileName,
  onRetry,
}: {
  message: string;
  fileName?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <span className="icon-badge icon-badge-danger h-16 w-16">
        <WarningIcon size={28} />
      </span>
      <div>
        <h2 className="headline text-2xl sm:text-3xl">Upload failed</h2>
        {fileName && (
          <p className="font-mono mt-2 text-xs tracking-wide text-muted">{fileName}</p>
        )}
        <p className="font-body mx-auto mt-3 max-w-sm text-sm leading-snug text-muted">
          {message}
        </p>
      </div>
      <button type="button" className="btn btn-black" onClick={onRetry}>
        <CloudUploadIcon size={16} />
        Try a different file
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
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
    if (file.size > MAX_FILE_BYTES) return "File is too large (50MB limit).";
    return null;
  };

  const runUploadAndAnalyze = async (file: File) => {
    const validationError = validate(file);
    if (validationError) {
      setSelectedFile(file);
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
      const message =
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setError(message);
      setStage("error");
      setUploadProgress(null);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file || isBusy) return;
    void runUploadAndAnalyze(file);
  };

  const resetToIdle = () => {
    setStage("idle");
    setError(null);
    setSelectedFile(null);
    setUploadProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isUploadComplete = stage === "uploading" && uploadProgress === 100;
  const isIdleOrUploading = stage === "idle" || stage === "uploading";

  return (
    <div className="relative min-h-screen bg-cream">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="upload-screen">
          <SiteNav />

          <div className="upload-screen-body">
            {/* ---- Hero ---- */}
            <Reveal>
              <section className="text-center">
                <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
                  <SparkIcon size={12} />
                  AI Powered · Data Driven
                </span>
                <h1 className="headline mx-auto mt-[clamp(0.75rem,2vh,1.5rem)] max-w-2xl text-[clamp(2.3rem,5.6vh,3.75rem)] uppercase">
                  Upload your{" "}
                  <span className="relative inline-block whitespace-nowrap text-ink">
                    dataset
                    <svg
                      viewBox="0 0 220 18"
                      className="pointer-events-none absolute -bottom-1.5 left-0 h-[0.4em] w-full"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 12 C 55 4, 165 4, 218 12"
                        fill="none"
                        stroke="var(--color-mustard)"
                        strokeWidth="7"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </h1>
                <p className="font-body mx-auto mt-4 max-w-md text-[0.95rem] text-muted">
                  Drop in a CSV and we&apos;ll clean, analyze, and model it for you.
                </p>
              </section>
            </Reveal>

            {/* ---- Upload panel — single box, content swaps by stage ---- */}
            <Reveal delay={80}>
              <section className="mx-auto w-full max-w-2xl">
                <div
                  onClick={() => isIdleOrUploading && !isBusy && inputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (isIdleOrUploading && !isBusy) setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    if (isIdleOrUploading) handleFile(event.dataTransfer.files?.[0]);
                  }}
                  className={[
                    "upload-panel group",
                    isIdleOrUploading && !isBusy ? "is-interactive" : "",
                    isDragging ? "is-dragging" : "",
                    stage === "error" ? "is-error" : "",
                  ].join(" ")}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    aria-label="Choose a CSV file to upload"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />

                  {stage === "analyzing" && <AnalyzingState fileName={selectedFile?.name} />}

                  {stage === "error" && error && (
                    <ErrorState message={error} fileName={selectedFile?.name} onRetry={resetToIdle} />
                  )}

                  {isIdleOrUploading && (
                    <div className="relative flex flex-col items-center gap-5 text-center">
                      {/* ---- Icon ---- */}
                      <span className="relative inline-flex shrink-0">
                        {!isBusy && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full bg-mustard animate-halo"
                          />
                        )}
                        <span
                          key={isUploadComplete ? "done" : "idle"}
                          className="icon-badge upload-badge relative bg-mustard text-ink animate-badge-pop"
                        >
                          {isUploadComplete ? <CheckIcon size={34} /> : <CloudUploadIcon size={34} />}
                        </span>
                      </span>

                      {/* ---- Heading + description ---- */}
                      <div key={isUploadComplete ? "copy-done" : "copy-idle"} className="animate-state-fade">
                        <h2 className="headline text-[clamp(1.45rem,3.6vh,2.25rem)]">
                          {isUploadComplete ? "CSV uploaded successfully" : "Upload your dataset"}
                        </h2>
                        <p className="font-body mx-auto mt-2 max-w-[420px] text-[clamp(0.8rem,1.6vh,0.95rem)] leading-snug text-muted">
                          {isUploadComplete
                            ? "Ready for AI analysis — hang tight while we get started."
                            : "Analyzed, cleaned, and visualized, with the best model recommended for you."}
                        </p>
                      </div>

                      {/* ---- Primary action ---- */}
                      <button
                        type="button"
                        className="btn btn-yellow btn-lg"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isBusy) inputRef.current?.click();
                        }}
                        disabled={isBusy}
                      >
                        {stage === "uploading" ? (
                          `Uploading… ${uploadProgress ?? 0}%`
                        ) : (
                          <>
                            <CloudUploadIcon size={16} />
                            Choose CSV file
                          </>
                        )}
                      </button>

                      {!isBusy && (
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className="h-px w-8 bg-line" />
                          <span className="label-mono text-[10px]">or drag &amp; drop</span>
                          <span aria-hidden="true" className="h-px w-8 bg-line" />
                        </div>
                      )}

                      {/* ---- Selected file meta ---- */}
                      {selectedFile && (
                        <div
                          className="w-full max-w-sm rounded-[14px] border-2 border-ink bg-cream p-2.5 text-left animate-state-fade"
                          style={{ boxShadow: "var(--shadow-hard-sm)" }}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="icon-chip">
                              <FileIcon />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className="block truncate text-sm font-bold text-ink"
                                title={selectedFile.name}
                              >
                                {selectedFile.name}
                              </span>
                              <span className="label-mono text-[10px]">
                                {formatBytes(selectedFile.size)}
                              </span>
                            </span>
                            <span className="table-chip table-chip-ok hidden shrink-0 sm:inline-flex">
                              <CheckIcon size={10} strokeWidth={3} />
                              {isUploadComplete ? "Done" : "Ready"}
                            </span>
                            {!isBusy && (
                              <button
                                type="button"
                                aria-label={`Remove ${selectedFile.name}`}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-cream-card text-ink transition-colors hover:bg-mustard"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  resetToIdle();
                                }}
                              >
                                <CloseIcon />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ---- Upload progress ---- */}
                      {uploadProgress !== null && stage === "uploading" && (
                        <div className="w-full max-w-sm text-left">
                          <div className="flex items-baseline justify-between">
                            <span className="label-mono text-[10px]">
                              {isUploadComplete ? "Upload complete" : "Uploading"}
                            </span>
                            <span className="font-mono text-sm font-bold text-ink">
                              {uploadProgress}%
                            </span>
                          </div>
                          <div
                            role="progressbar"
                            aria-valuenow={uploadProgress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Upload progress"
                            className="mt-1.5 h-3 w-full overflow-hidden rounded-pill border-2 border-ink bg-cream-sunken"
                          >
                            <div
                              className="h-full progress-stripes transition-[width] duration-300 ease-out"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <p className="font-body mt-1.5 text-xs text-muted">
                            {isUploadComplete
                              ? "Handing off to the analysis engine…"
                              : `${formatBytes(
                                  Math.round((selectedFile?.size ?? 0) * (uploadProgress / 100))
                                )} of ${formatBytes(selectedFile?.size ?? 0)}`}
                          </p>
                        </div>
                      )}

                      {/* ---- Constraints ---- */}
                      {!selectedFile && (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <span className="pill-label pill-label-ghost">
                            <FileIcon size={12} />
                            .CSV only
                          </span>
                          <span className="pill-label pill-label-ghost">Max 50 MB</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </Reveal>
          </div>

          <div className="hidden shrink-0 justify-center pb-3 lg:flex">
            <span className="label-mono text-[9px] animate-float">↓ More below</span>
          </div>
        </div>

        {/* ---- Highlights ---- */}
        <Reveal delay={120}>
          <section className="mt-8">
            <div className="card grid grid-cols-1 gap-6 sm:grid-cols-3">
              {HIGHLIGHTS.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="icon-badge shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {item.icon}
                    </svg>
                  </span>
                  <div>
                    <div className="font-body text-sm font-bold text-ink">{item.title}</div>
                    <p className="font-body mt-1 text-xs text-muted">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ---- How it works ---- */}
        <Reveal delay={160}>
          <section className="mt-14 text-center">
            <span className="label-mono">How It Works</span>
            <h2 className="headline mt-3 text-3xl">
              From upload to{" "}
              <span className="italic text-mustard" style={{ WebkitTextStroke: "0.5px var(--color-ink)" }}>
                insights
              </span>{" "}
              in four steps.
            </h2>

            <div className="relative mt-12">
              <div className="absolute left-0 right-0 top-7 hidden h-0.5 border-t-2 border-dashed border-line lg:block" />

              <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, i) => (
                  <Reveal key={step.num} delay={i * 80} className="group relative">
                    <div className="icon-badge relative z-10 text-ink mx-auto">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {step.icon}
                      </svg>
                      <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink bg-mustard font-mono text-[9px] font-bold text-ink">
                        {step.num}
                      </span>
                    </div>
                    <div className="mt-4 font-body text-sm font-bold text-ink">
                      {step.title}
                    </div>
                    <p className="font-body mt-1 text-xs leading-snug text-muted mx-auto max-w-[10rem]">
                      {step.body}
                    </p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---- Privacy panel ---- */}
        <Reveal delay={80}>
          <section className="mb-16 mt-14">
            <div className="card flex items-center gap-4">
              <span className="icon-badge shrink-0">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="11" width="14" height="9" rx="1.5" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <div>
                <div className="font-body text-sm font-bold text-ink">
                  Your data is secure and private.
                </div>
                <p className="font-body mt-1 text-xs text-muted">
                  We never share your data with anyone.
                </p>
              </div>
            </div>
          </section>
        </Reveal>

        <div className="pb-6 text-center">
          <Link href="/" className="label-mono transition-colors hover:text-ink">
            ← Back to Home
          </Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}