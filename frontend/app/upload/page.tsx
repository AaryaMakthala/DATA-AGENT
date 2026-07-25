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

// ---------------------------------------------------------------------------
// Reveal — identical to Home & Features (IntersectionObserver + .reveal class)
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
// Analyzing panel — spinning ring + a processing timeline of the real stages
// ---------------------------------------------------------------------------
function AnalyzingPanel({ fileName }: { fileName?: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Advance the timeline, holding on the final step until the API resolves.
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

  // Trigger reveal immediately on mount
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Small RAF so the transition actually fires
    requestAnimationFrame(() => {
      requestAnimationFrame(() => node.classList.add("is-visible"));
    });
  }, []);

  const isLastStep = stepIdx === ANALYZING_STEPS.length - 1;

  return (
    <div
      ref={ref}
      className="reveal flex flex-col items-center gap-7 py-6 sm:py-10"
      role="status"
      aria-live="polite"
    >
      {/* Spinning donut ring with a pulsing AI core */}
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-ink bg-cream-card"
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
        {/* Inner pulsing mustard core */}
        <span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-mustard animate-pulse-soft">
          <span className="h-2 w-2 rounded-full bg-ink" />
        </span>
      </div>

      <div className="text-center">
        <h2 className="display-heading text-2xl sm:text-3xl">Analyzing your data</h2>
        {fileName && (
          <p className="mt-2 truncate px-4 text-sm text-muted" title={fileName}>
            {fileName}
          </p>
        )}
      </div>

      {/* Processing timeline — each stage checks off as it completes */}
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
                  "text-sm transition-colors duration-300",
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
  };

  // The upload itself has finished the moment progress hits 100; the analyze
  // call is what keeps us on "uploading" for a beat longer.
  const isUploadComplete = stage === "uploading" && uploadProgress === 100;

  return (
    <div className="relative min-h-screen bg-cream">
      {/* Same fixed grid background as Home & Features */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        {/* ---- First screen: nav + hero + upload card, no scrolling ----
            .upload-screen is a 100dvh flex column; the body centers the hero
            and card in whatever height is left after the nav. All vertical
            gaps are vh-clamped in design-tokens.css, so this one layout fits
            768px laptops and 1080p desktops without breakpoint forks. */}
        <div className="upload-screen">
          <SiteNav />

          <div className="upload-screen-body">
            {/* ---- Hero ---- */}
            <Reveal>
              <section className="text-center">
                <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
                  AI Powered · Data Driven · Insights Focused
                </span>
                <h1 className="display-heading mx-auto mt-[clamp(0.75rem,2vh,1.5rem)] max-w-2xl text-[clamp(2.1rem,5.2vh,3.5rem)]">
                  Upload Your{" "}
                  <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">
                    Dataset
                  </span>
                </h1>
              </section>
            </Reveal>

            {/* ---- Upload card ---- */}
            <Reveal delay={80}>
              <section>
                <div className="card-elevated mx-auto max-w-2xl p-[clamp(0.7rem,1.6vh,1.15rem)]">
                  {stage === "analyzing" ? (
                    <AnalyzingPanel fileName={selectedFile?.name} />
                  ) : (
                    /* Premium upload surface — solid ink border + hard shadow
                       (not a dashed rectangle), sitting inside the card. */
                    <div
                      onClick={() => !isBusy && inputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!isBusy) setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsDragging(false);
                        handleFile(event.dataTransfer.files?.[0]);
                      }}
                      className={[
                        "upload-surface group",
                        isDragging ? "is-dragging" : "",
                        isBusy ? "is-busy" : "",
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

                      {/* ---- Upload / success icon ---- */}
                      <span className="relative inline-flex shrink-0">
                        {/* Halo breathes on its own element so the badge keeps
                            its transform free for the hover lift. */}
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
                          {isUploadComplete ? (
                            <CheckIcon size={34} />
                          ) : (
                            <CloudUploadIcon size={34} />
                          )}
                        </span>
                      </span>

                      {/* ---- Heading + description ---- */}
                      <div key={isUploadComplete ? "copy-done" : "copy-idle"} className="animate-state-fade">
                        <h2 className="display-heading text-[clamp(1.4rem,3.4vh,2.15rem)]">
                          {isUploadComplete ? "CSV uploaded successfully" : "Upload your dataset"}
                        </h2>
                        <p className="mx-auto mt-[clamp(0.35rem,1vh,0.7rem)] max-w-[500px] text-[clamp(0.8rem,1.6vh,0.95rem)] leading-snug text-muted">
                          {isUploadComplete
                            ? "Ready for AI analysis — hang tight while we get started."
                            : "Our AI analyzes, cleans, and visualizes your data, then recommends the best model."}
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

                      {/* ---- Selected file card ---- */}
                      {selectedFile && !error && (
                        <div className="w-full max-w-sm rounded-[14px] border-2 border-ink bg-cream-card p-2.5 text-left shadow-[var(--shadow-hard-sm)] animate-state-fade">
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
                          <p className="mt-1.5 text-xs text-muted">
                            {isUploadComplete
                              ? "Handing off to the analysis engine…"
                              : `${formatBytes(
                                  Math.round((selectedFile?.size ?? 0) * (uploadProgress / 100))
                                )} of ${formatBytes(selectedFile?.size ?? 0)}`}
                          </p>
                        </div>
                      )}

                      {/* ---- Constraints ---- */}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="pill-label pill-label-ghost">
                          <FileIcon size={12} />
                          .CSV only
                        </span>
                        <span className="pill-label pill-label-ghost">Max 50 MB</span>
                      </div>
                    </div>
                  )}

                  {/* ---- Error card ---- */}
                  {stage === "error" && error && (
                    <div
                      role="alert"
                      className="mt-3 flex flex-col items-start gap-3 rounded-[14px] border-2 border-ink bg-cream-sunken p-4 animate-state-fade sm:flex-row sm:items-center"
                    >
                      <span className="icon-badge h-11 w-11 shrink-0 bg-mustard text-ink">
                        <WarningIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-base font-bold text-ink">Upload failed</div>
                        <p className="mt-0.5 text-sm text-muted">{error}</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm shrink-0"
                        onClick={resetToIdle}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </Reveal>
          </div>

          {/* Scroll affordance — the first screen is intentionally self-contained,
              so this is the only cue that supporting content follows. Hidden on
              short viewports where it would compete for the fold. */}
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
                    <div className="text-sm font-bold text-ink">{item.title}</div>
                    <p className="mt-1 text-xs text-muted">{item.body}</p>
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
            <h2 className="display-heading mt-3 text-3xl font-bold">
              From upload to{" "}
              <span className="italic text-mustard">insights</span> in four
              steps.
            </h2>

            <div className="relative mt-12">
              {/* Dashed connector line — same as Home's How It Works */}
              <div className="absolute left-0 right-0 top-7 hidden h-0.5 border-t-2 border-dashed border-line lg:block" />

              <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, i) => (
                  <Reveal key={step.num} delay={i * 80} className="group relative">
                    {/* icon-badge — same hover lift/color as Home */}
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
                      {/* Mustard numbered badge with border */}
                      <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink bg-mustard font-mono text-[9px] font-bold text-ink">
                        {step.num}
                      </span>
                    </div>
                    <div className="mt-4 font-display text-sm font-bold text-ink">
                      {step.title}
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted mx-auto max-w-[10rem]">
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
                <div className="text-sm font-bold text-ink">
                  Your data is secure and private.
                </div>
                <p className="mt-1 text-xs text-muted">
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
