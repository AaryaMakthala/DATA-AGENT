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

const ANALYZING_STATUSES = [
  "Scanning columns…",
  "Detecting patterns…",
  "Running AI analysis…",
  "Generating visualizations…",
  "Finalizing insights…",
];

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
// Analyzing panel — spins ring + cycles status text, revealed via .reveal class
// ---------------------------------------------------------------------------
function AnalyzingPanel() {
  const [statusIdx, setStatusIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Cycle status text every 1.5 s
  useEffect(() => {
    const id = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % ANALYZING_STATUSES.length);
    }, 1500);
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

  return (
    <div
      ref={ref}
      className="reveal flex flex-col items-center gap-6 py-8"
    >
      {/* Spinning donut ring — same technique as Home's DashboardPreview */}
      <div className="relative flex h-16 w-16 items-center justify-center">
        <svg
          viewBox="0 0 36 36"
          className="absolute inset-0 h-16 w-16 animate-spin-slow"
          style={{ animationDuration: "1.4s" }}
          aria-hidden="true"
        >
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="var(--color-cream-sunken)"
            strokeWidth="5"
          />
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="var(--color-mustard)"
            strokeWidth="5"
            strokeDasharray="44 88"
            transform="rotate(-90 18 18)"
          />
        </svg>
        {/* Inner pulsing mustard dot */}
        <span className="relative z-10 h-3 w-3 rounded-full bg-mustard animate-pulse-soft" />
      </div>

      {/* Heading */}
      <div className="font-display text-lg font-bold text-ink">
        Analyzing your data
      </div>

      {/* Cycling status — fade via transition on key change */}
      <div
        key={statusIdx}
        className="label-mono text-[10px] animate-fade-in-up"
        style={{ animationDuration: "0.4s" }}
      >
        {ANALYZING_STATUSES[statusIdx]}
      </div>

      {/* Progress hint dots */}
      <div className="flex gap-2">
        {ANALYZING_STATUSES.map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
            style={{
              backgroundColor:
                i === statusIdx
                  ? "var(--color-mustard)"
                  : "var(--color-line)",
            }}
          />
        ))}
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

  return (
    <div className="relative min-h-screen bg-cream">
      {/* Same fixed grid background as Home & Features */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav />

        {/* ---- Hero ---- */}
        <Reveal>
          <section className="pt-12 text-center">
            <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
              AI Powered · Data Driven · Insights Focused
            </span>
            <h1 className="display-heading mx-auto mt-6 max-w-2xl text-5xl sm:text-6xl">
              Upload Your{" "}
              <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">
                Dataset
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-md text-base text-muted">
              Upload your .csv file and let us analyze it to deliver meaningful insights.
            </p>
          </section>
        </Reveal>

        {/* ---- Dropzone card ---- */}
        <Reveal delay={80}>
          <section className="mt-10">
            <div
              className="card-elevated mx-auto max-w-2xl p-8"
              style={
                stage === "uploading"
                  ? {
                      boxShadow:
                        "0 0 0 3px rgba(244,197,66,0.25), var(--shadow-float)",
                      transition: "box-shadow 0.4s ease",
                    }
                  : undefined
              }
            >
              {/* ---- Analyzing state — replaces dropzone content ---- */}
              {stage === "analyzing" ? (
                <AnalyzingPanel />
              ) : (
                /* ---- Normal / uploading / error dropzone ---- */
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !isBusy && inputRef.current?.click()}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !isBusy)
                      inputRef.current?.click();
                  }}
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
                    "flex flex-col items-center justify-center gap-4 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition-all duration-200",
                    isDragging
                      ? "border-mustard bg-cream-sunken"
                      : "border-line bg-cream-card hover:bg-cream-sunken",
                    isBusy ? "pointer-events-none opacity-60" : "cursor-pointer",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />

                  {/* Upload icon — icon-badge style */}
                  <span className="icon-badge bg-mustard text-ink h-16 w-16">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 16V7" />
                      <polyline points="8 11 12 7 16 11" />
                      <path d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 9.3 4 4 0 0 1 18 19H6.5z" />
                    </svg>
                  </span>

                  <div className="font-display text-lg font-bold text-ink">
                    Drag &amp; drop your file here
                  </div>
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
                      : "Upload File"}
                  </button>

                  <p className="text-xs text-muted">Supports .csv files only</p>

                  <span className="inline-flex items-center gap-2 rounded-pill bg-cream-sunken px-3 py-1.5 text-[11px] text-muted">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z" />
                      <polyline points="14 3 14 7 18 7" />
                    </svg>
                    Max file size: 50MB
                  </span>
                </div>
              )}

              {/* Upload progress bar */}
              {uploadProgress !== null && stage === "uploading" && (
                <div className="mt-5 h-2 w-full overflow-hidden rounded-pill bg-cream-sunken">
                  <div
                    className="h-full rounded-pill bg-mustard animate-pulse-soft transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}

              {/* Selected file name */}
              {selectedFile && !error && stage !== "analyzing" && (
                <p className="mt-4 text-center text-sm text-muted">
                  Selected: <span className="text-ink">{selectedFile.name}</span>
                </p>
              )}

              {/* Error panel — bordered card instead of plain text */}
              {stage === "error" && error && (
                <div className="mt-5 rounded-[14px] border-2 border-ink bg-cream-sunken p-4 text-center">
                  <div className="label-mono text-[9px] text-muted mb-1">Upload Error</div>
                  <p className="text-sm font-medium text-ink">{error}</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm mt-4"
                    onClick={() => {
                      setStage("idle");
                      setError(null);
                      setSelectedFile(null);
                    }}
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </section>
        </Reveal>

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
