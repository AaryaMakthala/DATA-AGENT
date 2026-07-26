"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SiteNav, SiteFooter, ArrowIcon } from "@/components/SiteNav";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const STEPS = [
  {
    num: "01",
    title: "Upload dataset",
    body: "Securely upload CSV or Excel files directly into our encrypted environment.",
    badges: ["CSV", "Excel", "Validation"],
    icon: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>
    ),
  },
  {
    num: "02",
    title: "Dataset profiling",
    body: "Automatically understand columns, types, distributions, and quality issues.",
    badges: ["Pandas", "Profiling engine"],
    icon: (
      <>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </>
    ),
  },
  {
    num: "03",
    title: "AI analysis",
    body: "An LLM builds a tailored cleaning and analysis strategy from your dataset's metadata.",
    badges: ["Gemini", "Groq", "LLM router"],
    icon: (
      <>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
  },
  {
    num: "04",
    title: "Smart cleaning",
    body: "Python executes transformations safely to handle missing values and outliers.",
    badges: ["Missing values", "Outliers", "Duplicates"],
    icon: (
      <>
        <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72Z" />
        <path d="m14 7 3 3" />
        <path d="M5 6v4" />
        <path d="M19 14v4" />
        <path d="M10 2v2" />
        <path d="M7 8H3" />
        <path d="M21 16h-4" />
        <path d="M11 3H9" />
      </>
    ),
  },
  {
    num: "05",
    title: "Visualization",
    body: "Generate interactive charts and extract actionable insights automatically.",
    badges: ["Charts", "Trends", "Patterns"],
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </>
    ),
  },
  {
    num: "06",
    title: "ML recommendations",
    body: "Suggest and outline suitable machine learning algorithms based on your data.",
    badges: ["Classification", "Regression", "Clustering"],
    icon: (
      <>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
      </>
    ),
  },
];

const PIPELINE_STAGES = [
  "Raw dataset",
  "Profiler",
  "AI brain",
  "Cleaning engine",
  "Visualization",
  "Insights",
];

const TECH_STACK = [
  {
    category: "Frontend",
    tools: ["Next.js", "TypeScript", "Tailwind CSS"],
  },
  {
    category: "Backend",
    tools: ["FastAPI", "Python", "WebSockets"],
  },
  {
    category: "AI engine",
    tools: ["LangGraph", "LLM routing", "Gemini", "Groq"],
  },
  {
    category: "Data layer",
    tools: ["Pandas", "NumPy", "Automated pipelines"],
  },
];

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={2.4}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function BoltIcon({ size = 32 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={2}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Reveal — matches the scroll-in behavior used across the site
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
// Page
// ---------------------------------------------------------------------------
export default function HowItWorks() {
  return (
    <div className="relative min-h-screen bg-cream">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="How It Works" />

        {/* ---- Hero ---- */}
        <Reveal>
          <section className="pt-16 pb-14 text-center md:pt-20 md:pb-20">
            <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
              <span className="h-2 w-2 rounded-full bg-ink" />
              How It Works
            </span>
            <h1 className="headline mx-auto mt-5 max-w-3xl text-[clamp(2.2rem,5.4vh,3.75rem)] uppercase">
              From raw data to{" "}
              <span className="relative inline-block whitespace-nowrap">
                intelligent insights
                <svg
                  viewBox="0 0 420 18"
                  className="pointer-events-none absolute -bottom-1.5 left-0 h-[0.35em] w-full"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 12 C 110 4, 310 4, 418 12"
                    fill="none"
                    stroke="var(--color-mustard)"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="font-body mx-auto mt-5 max-w-xl text-[0.95rem] leading-relaxed text-muted">
              Data Agent automatically cleans, analyzes, and visualizes your dataset, recommending
              machine learning approaches with zero manual coding required.
            </p>
          </section>
        </Reveal>

        {/* ---- Pipeline strip ---- */}
        <Reveal delay={60}>
          <section className="hidden pb-14 md:block">
            <div className="card">
              <div className="relative flex items-center justify-between">
                <div className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 border-t-2 border-dashed border-line" />
                {PIPELINE_STAGES.map((stage) => (
                  <div key={stage} className="relative z-10 flex flex-col items-center gap-2.5">
                    <span className="icon-chip">
                      <span className="h-2 w-2 rounded-full bg-mustard" />
                    </span>
                    <span className="label-mono text-center text-[9px] leading-tight">{stage}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---- Steps ---- */}
        <section className="pb-20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <Reveal key={step.num} delay={(i % 2) * 60}>
                <div className="card h-full">
                  <div className="flex items-center gap-4">
                    <span className="icon-badge relative shrink-0">
                      <svg
                        width="22"
                        height="22"
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
                    </span>
                    <div>
                      <span className="label-mono text-mustard">Step {step.num}</span>
                      <h3 className="headline text-lg">{step.title}</h3>
                    </div>
                  </div>

                  <p className="font-body mt-4 text-sm leading-relaxed text-muted">{step.body}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {step.badges.map((badge) => (
                      <span key={badge} className="pill-label pill-label-ghost">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---- Under the hood ---- */}
        <Reveal>
          <section className="pb-20">
            <div
              className="rounded-[var(--radius-card)] border-2 p-8 md:p-12"
              style={{
                backgroundColor: "var(--color-ink)",
                borderColor: "var(--color-mustard)",
                boxShadow: "var(--shadow-hard-yellow)",
              }}
            >
              <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
                Under The Hood
              </span>
              <h2 className="headline mt-5 text-3xl text-cream md:text-4xl">
                Powered by modern AI architecture
              </h2>

              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {TECH_STACK.map((stack) => (
                  <div
                    key={stack.category}
                    className="rounded-2xl border p-5"
                    style={{ borderColor: "rgba(245, 241, 234, 0.18)", backgroundColor: "rgba(245, 241, 234, 0.04)" }}
                  >
                    <h4 className="label-mono text-mustard">{stack.category}</h4>
                    <ul className="mt-4 space-y-2.5">
                      {stack.tools.map((tool) => (
                        <li key={tool} className="flex items-center gap-2 text-sm text-cream/85">
                          <span className="text-mustard">
                            <CheckIcon size={13} />
                          </span>
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---- CTA ---- */}
        <Reveal>
          <section className="pb-20 text-center">
            <span className="icon-badge upload-badge mx-auto bg-mustard text-ink" style={{ transform: "rotate(-4deg)" }}>
              <BoltIcon size={28} />
            </span>
            <h2 className="headline mx-auto mt-6 max-w-xl text-3xl sm:text-4xl">
              Ready to transform your data?
            </h2>
            <p className="font-body mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
              Upload your dataset and let AI discover insights, clean your data, and recommend
              models automatically.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/upload" className="btn btn-yellow btn-lg">
                Upload Dataset
                <ArrowIcon />
              </Link>
            </div>
          </section>
        </Reveal>
      </div>

      <SiteFooter />
    </div>
  );
}