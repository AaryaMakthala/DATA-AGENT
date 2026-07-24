"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { SiteNav, ArrowIcon, SparkleIcon, SiteFooter } from "@/components/SiteNav";

// ---------------------------------------------------------------------------
// Shared scroll-reveal wrapper — identical to the one on Home (app/page.tsx).
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
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature data
// ---------------------------------------------------------------------------
const FEATURES = [
  {
    num: "01",
    title: "AI-Powered Data Cleaning",
    body: "Automatically detect missing values, duplicates, outliers, and inconsistencies in seconds. Say goodbye to manual data scrubbing.",
    tags: ["Missing Values", "Duplicate Detection", "Outlier Handling", "Data Validation"],
    Visual: CleaningVisual,
  },
  {
    num: "02",
    title: "Intelligent Data Quality Analysis",
    body: "Understand your dataset's health before processing. Get a comprehensive overview of schema, distributions, and potential errors.",
    tags: ["Pandas Profiling", "Schema Detection", "Validation Engine"],
    Visual: QualityVisual,
  },
  {
    num: "03",
    title: "AI-Powered Analysis",
    body: "Discover hidden trends and patterns using cutting-edge LLM reasoning. Ask questions in plain English and get deep analytical insights.",
    tags: ["Gemini", "Groq", "LangGraph", "AI Agents"],
    Visual: ChatVisual,
  },
  {
    num: "04",
    title: "Automated Visualization",
    body: "Generate meaningful, presentation-ready charts automatically. We pick the right visualization type for your specific data distributions.",
    tags: ["Matplotlib", "Plotly", "Automated Charts"],
    Visual: ChartVisual,
  },
  {
    num: "05",
    title: "Machine Learning Recommendations",
    body: "Not sure which model to use? Data Agent recommends and outlines suitable machine learning algorithms based on your dataset's unique characteristics.",
    tags: ["ML Pipeline", "Model Selection", "Scoring"],
    Visual: MLVisual,
  },
  {
    num: "06",
    title: "Secure Data Processing",
    body: "Enterprise-grade security built-in. Your datasets stay private, processed in isolated environments, and are never shared with third parties.",
    tags: ["Local Processing", "Privacy First", "Secure Pipeline"],
    Visual: SecurityVisual,
  },
];

const ARCHITECTURE = [
  {
    layer: "Frontend",
    tech: "Next.js + TypeScript",
    desc: "Lightning-fast, highly responsive user interface built on modern web standards.",
  },
  {
    layer: "Backend",
    tech: "FastAPI + Python",
    desc: "High-performance API layer capable of handling massive dataset streams.",
  },
  {
    layer: "AI Layer",
    tech: "LangGraph + LLM Routing",
    desc: "Intelligent agent orchestration routing queries to the most capable models.",
  },
  {
    layer: "Data Engine",
    tech: "Pandas + ML Pipeline",
    desc: "Robust numerical processing and scalable machine learning transformations.",
  },
];

// ---------------------------------------------------------------------------
// Feature visual panels — use only shared animation utility classes.
// ---------------------------------------------------------------------------

/** 01 · Data Cleaning — pulsing row cells + floating "Cleaned ✓" badge */
function CleaningVisual() {
  return (
    <div className="card h-full flex flex-col justify-center gap-4">
      <span className="label-mono text-[9px]">Dataset.csv</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-2 w-full">
          <div className="h-6 w-1/4 rounded-md bg-cream-sunken" />
          <div
            className="h-6 w-1/4 rounded-md bg-mustard animate-pulse-soft"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
          <div className="h-6 w-1/2 rounded-md bg-cream-sunken" />
        </div>
      ))}
      <div
        className="self-end pill-label text-[9px] animate-float"
        style={{ animationDelay: "0.2s" }}
      >
        Cleaned ✓
      </div>
    </div>
  );
}

/** 02 · Quality Analysis — progress line + donut ring + mini stats */
function QualityVisual() {
  return (
    <div className="card h-full flex flex-col gap-4 justify-center">
      {/* Score row */}
      <div className="flex items-center justify-between">
        <div>
          <span className="label-mono text-[9px]">Completeness Score</span>
          <div className="label-mono text-[8px] text-muted">Across all columns</div>
        </div>
        <span className="font-display text-2xl font-bold text-mustard animate-pulse-soft">
          98.5%
        </span>
      </div>

      {/* Animated quality line */}
      <svg viewBox="0 0 120 30" className="h-8 w-full" aria-hidden="true">
        <polyline
          points="0,26 20,20 40,22 60,12 80,14 100,6 120,8"
          fill="none"
          stroke="var(--color-mustard)"
          strokeWidth="2"
          className="line-draw"
        />
      </svg>

      {/* Data type breakdown bar */}
      <div>
        <span className="label-mono text-[9px]">Data Types</span>
        <div className="mt-1 flex gap-0.5 h-2 w-full rounded-full overflow-hidden">
          <div className="bg-mustard" style={{ width: "50%" }} />
          <div className="bg-ink" style={{ width: "33%" }} />
          <div className="bg-cream-sunken" style={{ width: "17%" }} />
        </div>
        <div className="label-mono text-[8px] mt-1">Num · Cat · Text</div>
      </div>

      {/* Anomalies chip */}
      <div className="flex items-center gap-2">
        <span className="label-mono text-[9px]">Anomalies Detected</span>
        <span className="table-chip">3</span>
      </div>
    </div>
  );
}

/** 03 · AI Analysis — static chat bubbles (Home-style cards, no Framer Motion) */
function ChatVisual() {
  return (
    <div className="card h-full flex flex-col gap-4 justify-center">
      {/* User message */}
      <div
        className="self-end rounded-2xl rounded-tr-sm border-2 border-ink bg-mustard px-4 py-2 text-sm font-medium text-ink max-w-[80%]"
        style={{ boxShadow: "var(--shadow-hard-sm)" }}
      >
        What&apos;s driving the revenue drop in Q3?
      </div>

      {/* AI reply */}
      <div
        className="self-start card rounded-2xl rounded-tl-sm max-w-[90%]"
        style={{ padding: "0.75rem 1rem" }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <SparkleIcon className="w-3 h-3 text-mustard" />
          <span className="label-mono text-[8px] text-mustard">AI Analysis</span>
        </div>
        <p className="text-xs text-ink leading-relaxed">
          Q3 revenue drop strongly correlates with a 42% decrease in European
          user retention during August.
        </p>
      </div>

      {/* Typing indicator */}
      <div className="flex items-center gap-1 pl-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-mustard animate-pulse-soft"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 04 · Automated Visualization — bar-grow bars, matching Home's missing-values chart */
function ChartVisual() {
  const BARS = [40, 75, 45, 90, 60, 85];
  return (
    <div className="card h-full flex flex-col gap-3">
      <span className="label-mono text-[9px]">Monthly Revenue</span>
      <div className="flex flex-1 items-end gap-2">
        {BARS.map((h, i) => (
          <div
            key={i}
            className="bar-grow flex-1 rounded-t-sm"
            style={{
              height: `${h}%`,
              backgroundColor:
                i % 3 === 0 ? "var(--color-mustard)" : "var(--color-ink)",
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {["J", "F", "M", "A", "M", "J"].map((m, i) => (
          <span key={`${m}-${i}`} className="label-mono text-[8px]">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 05 · ML Recommendations — icon-badge style cards with scores */
function MLVisual() {
  const MODELS = [
    { name: "Random Forest", score: "92%", top: true },
    { name: "Log Reg", score: "87%", top: false },
    { name: "XGBoost", score: "85%", top: false },
  ];
  return (
    <div className="card h-full flex flex-col items-center justify-center gap-6">
      <div className="pill-label text-[9px]">Target: Customer Churn</div>
      <div className="flex gap-4">
        {MODELS.map((m) => (
          <div key={m.name} className="flex flex-col items-center gap-2 group">
            <div
              className={`icon-badge h-16 w-16 rounded-xl ${
                m.top ? "bg-mustard border-ink" : "bg-cream-card border-line opacity-60"
              }`}
              style={{ borderRadius: "12px" }}
            >
              <span className="font-display text-base font-bold text-ink">
                {m.score}
              </span>
            </div>
            <span className="label-mono text-[8px]">{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 06 · Security — spin ring + lock icon, matching Home's donut chart pattern */
function SecurityVisual() {
  return (
    <div className="card h-full flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center h-24 w-24">
        {/* Outer spinning ring — same class as Home's donut */}
        <svg
          viewBox="0 0 36 36"
          className="absolute inset-0 h-24 w-24 animate-spin-slow"
          style={{ animationDuration: "12s" }}
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="var(--color-cream-sunken)"
            strokeWidth="4"
          />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="var(--color-mustard)"
            strokeWidth="4"
            strokeDasharray="60 88"
            transform="rotate(-90 18 18)"
          />
        </svg>
        {/* Pulsing inner circle */}
        <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-ink animate-pulse-soft">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-mustard)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      </div>
      <span className="label-mono text-[9px] text-center">
        End-to-End Encrypted · Zero Data Sharing
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero visual — orbiting nodes rebuilt with shared animation classes
// ---------------------------------------------------------------------------
function HeroOrbit() {
  return (
    <div className="relative mx-auto hidden aspect-square w-full max-w-[420px] md:block">
      {/* Center AI core — spin-slow matches Home */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex h-28 w-28 items-center justify-center rounded-3xl bg-ink animate-spin-slow shadow-[var(--shadow-float)]"
           style={{ animationDuration: "40s" }}>
        <SparkleIcon className="text-mustard h-12 w-12" />
      </div>

      {/* Three concentric orbit rings */}
      {[160, 210, 260].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line"
          style={{ width: r * 2, height: r * 2 }}
        >
          {/* Orbiting mustard dot — animate-float gives subtle bobbing */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-mustard border-2 border-ink animate-float"
            style={{
              boxShadow: "var(--shadow-hard-sm)",
              animationDelay: `${i * 0.6}s`,
              animationDuration: "4.5s",
            }}
          />
        </div>
      ))}

      {/* Floating stat chips — identical to Home's hero chips */}
      <div
        className="absolute top-6 -left-6 z-20 rounded-2xl border-2 border-ink bg-cream-card px-3 py-2 shadow-[var(--shadow-hard)] animate-float"
        style={{ animationDelay: "0s" }}
      >
        <span className="label-mono text-[8px]">Missing Values</span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink" />
          <span className="font-display text-sm font-bold text-ink">230</span>
        </div>
      </div>

      <div
        className="absolute bottom-10 -right-4 z-20 rounded-2xl border-2 border-ink bg-cream-card px-3 py-2 shadow-[var(--shadow-hard)] animate-float"
        style={{ animationDelay: "0.9s" }}
      >
        <span className="label-mono text-[8px]">Accuracy</span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mustard" />
          <span className="font-display text-sm font-bold text-ink">98.5%</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Features() {
  return (
    <div className="relative min-h-screen bg-cream text-ink">
      {/* Same fixed grid background as Home */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="Features" />

        {/* ---- HERO ---- */}
        <section className="grid grid-cols-1 items-center gap-10 pb-8 pt-10 lg:grid-cols-[1fr_1fr] lg:pb-12 lg:pt-16">
          <div>
            {/* Eyebrow pill — shared .pill-label */}
            <div className="mb-5 flex flex-wrap items-center gap-3 animate-fade-in-up">
              <span className="pill-label" style={{ transform: "rotate(-2deg)" }}>
                <SparkleIcon className="h-3 w-3" />
                Powerful AI Data Engine
              </span>
            </div>

            <h1
              className="display-heading text-5xl sm:text-6xl lg:text-7xl animate-fade-in-up"
              style={{ animationDelay: "80ms" }}
            >
              Turn Messy Data
              <br />
              Into{" "}
              <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[6px]">
                Intelligent
              </span>{" "}
              Decisions.
            </h1>

            <p
              className="mt-5 max-w-md text-base text-muted animate-fade-in-up"
              style={{ animationDelay: "180ms" }}
            >
              Data Agent automatically cleans datasets, discovers patterns,
              generates visual insights, and recommends machine learning
              approaches using advanced AI.
            </p>

            <div
              className="mt-8 flex flex-wrap items-center gap-4 animate-fade-in-up"
              style={{ animationDelay: "280ms" }}
            >
              <Link href="/upload" className="btn btn-black">
                Analyze Your Data <ArrowIcon />
              </Link>
              <Link href="#workflow" className="btn btn-ghost">
                Explore Workflow <ArrowIcon />
              </Link>
            </div>
          </div>

          <Reveal delay={150}>
            <HeroOrbit />
          </Reveal>
        </section>
      </div>

      {/* ---- Scrolling ticker band — identical to Home ---- */}
      <section className="mt-10 overflow-hidden border-y-2 border-ink bg-ink py-3 lg:mt-14">
        <div className="flex animate-marquee">
          {[0, 1].map((set) => (
            <div
              key={set}
              className="flex w-full shrink-0 items-center justify-around gap-10"
              aria-hidden={set === 1 ? true : undefined}
            >
              {["Clean", "Analyze", "Visualize", "Recommend", "Export", "Secure"].map(
                (item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="flex shrink-0 items-center gap-2.5 label-mono leading-none text-white/80"
                  >
                    {item}
                    <svg
                      width="7"
                      height="7"
                      viewBox="0 0 24 24"
                      fill="var(--color-mustard)"
                      aria-hidden="true"
                    >
                      <path d="M12 0c.6 6.3 5.7 11.4 12 12-6.3.6-11.4 5.7-12 12-.6-6.3-5.7-11.4-12-12C6.3 11.4 11.4 6.3 12 0z" />
                    </svg>
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-6">

        {/* ---- FEATURE SHOWCASE — alternating, Reveal-driven ---- */}
        <section id="workflow" className="flex flex-col gap-24 py-20">
          <Reveal>
            <span className="label-mono">What We Do</span>
            <h2 className="display-heading mt-3 text-4xl sm:text-5xl">
              Every feature you need,{" "}
              <span className="italic text-mustard">built-in</span>.
            </h2>
          </Reveal>

          {FEATURES.map((feature, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <Reveal key={feature.num} delay={idx * 60}>
                <div
                  className={`flex flex-col items-center gap-10 lg:gap-16 lg:flex-row${
                    isEven ? "" : "-reverse"
                  }`}
                  // lg:flex-row-reverse needs a real class; use inline style for direction
                  style={
                    !isEven
                      ? { flexDirection: undefined }
                      : undefined
                  }
                >
                  {/* We drive reverse via a wrapper class trick below */}
                  <FeatureRow feature={feature} reverse={!isEven} />
                </div>
              </Reveal>
            );
          })}
        </section>
      </div>

      {/* ---- ARCHITECTURE (dark panel) — matches Home's closing CTA dark section ---- */}
      <section className="relative overflow-hidden bg-ink py-20">
        {/* Same subtle grid on dark bg */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(247,241,229,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(247,241,229,0.06) 1px,transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="mx-auto w-full max-w-6xl px-6 relative z-10">
          <Reveal>
            <span className="label-mono text-white/50">Under The Hood</span>
            <h2 className="display-heading mt-3 text-4xl sm:text-5xl text-white">
              Built with{" "}
              <span className="italic text-mustard">modern</span> AI
              architecture.
            </h2>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ARCHITECTURE.map((item, idx) => (
              <Reveal key={item.layer} delay={idx * 80}>
                {/* Card-like surface — on ink bg use border + soft bg */}
                <div className="flex h-full flex-col rounded-[16px] border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:border-mustard/40 hover:bg-white/10">
                  <span className="label-mono text-mustard">{item.layer}</span>
                  <div className="mt-2 font-display text-xl font-bold text-white">
                    {item.tech}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/55">
                    {item.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- COMPARISON ---- */}
      <div className="mx-auto w-full max-w-6xl px-6">
        <section className="py-20">
          <Reveal>
            <span className="label-mono">Why Data Agent?</span>
            <h2 className="display-heading mt-3 text-4xl sm:text-5xl">
              The smarter way to{" "}
              <span className="italic text-mustard">work with data</span>.
            </h2>
          </Reveal>

          <Reveal delay={120} className="mt-12">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Traditional */}
              <div className="card">
                <h3 className="display-heading text-xl text-muted mb-6 pb-4 border-b border-line">
                  Traditional Data Analysis
                </h3>
                <ul className="space-y-4">
                  {[
                    "Manual data cleaning using scripts",
                    "Time consuming and error-prone",
                    "Requires deep technical expertise",
                    "Static, rigid PDF reports",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-line bg-cream-sunken text-xs text-muted font-bold mt-0.5">
                        ✕
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Data Agent */}
              <div className="relative overflow-hidden rounded-[16px] bg-ink px-6 py-6 text-white">
                {/* Decorative float orb */}
                <div
                  className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full border-2 border-mustard/40 animate-float"
                  style={{ animationDelay: "0.3s" }}
                />
                <h3 className="font-display text-xl font-bold text-white mb-6 pb-4 border-b border-white/10">
                  Data Agent AI
                </h3>
                <ul className="space-y-4">
                  {[
                    "Automated, AI-powered cleaning",
                    "Instant processing & insights",
                    "Zero coding required",
                    "Interactive visualizations & ML",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-white">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mustard text-ink text-xs font-bold mt-0.5">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>
      </div>

      {/* ---- FINAL CTA — same dark panel treatment as Home's closing CTA ---- */}
      <section className="mx-auto w-full max-w-6xl overflow-hidden px-6 pb-16 pt-4">
        <Reveal>
          <div className="relative overflow-hidden rounded-[20px] bg-ink px-8 py-16 text-center text-white">
            {/* Decorative orbs — identical to Home */}
            <div
              className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full border-2 border-mustard/40 animate-float"
              style={{ animationDelay: "0.2s" }}
            />
            <div
              className="pointer-events-none absolute -bottom-10 -right-6 h-32 w-32 rotate-12 rounded-2xl border-2 border-white/10 animate-float"
              style={{ animationDelay: "0.8s" }}
            />

            <span className="label-mono text-white/60">Ready When You Are</span>
            <h2 className="display-heading mt-4 text-4xl sm:text-6xl text-white">
              Unlock the story{" "}
              <span className="italic text-mustard">inside</span> your data.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              Upload a CSV or Excel file and get a clean, analyzed, visualized
              dataset back — in seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              {/* Yellow button on dark bg — same as Home's CTA panel */}
              <Link href="/upload" className="btn btn-yellow btn-shadow-white">
                Start Analysis <ArrowIcon />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeatureRow — extracted to avoid messy inline conditional flex-direction.
// ---------------------------------------------------------------------------
function FeatureRow({
  feature,
  reverse,
}: {
  feature: (typeof FEATURES)[number];
  reverse: boolean;
}) {
  return (
    <div
      className="flex w-full flex-col items-center gap-10 lg:gap-16"
      style={{ flexDirection: reverse ? "row-reverse" : "row" }}
    >
      {/* Text side */}
      <div className="flex w-full flex-1 flex-col gap-4 lg:w-auto">
        {/* Big faded number — design language from Home's "How It Works" */}
        <div
          className="font-mono text-6xl font-bold leading-none tracking-tighter"
          style={{ color: "var(--color-line)" }}
        >
          {feature.num}
        </div>
        <h2 className="display-heading text-3xl sm:text-4xl">{feature.title}</h2>
        <p className="text-base text-muted leading-relaxed max-w-md">{feature.body}</p>

        {/* Tags — use table-chip style for consistency */}
        <div className="flex flex-wrap gap-2 mt-2">
          {feature.tags.map((tag) => (
            <span key={tag} className="table-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Visual side */}
      <div className="relative w-full flex-1 lg:w-auto" style={{ minHeight: 280 }}>
        {/* Soft mustard glow behind card */}
        <div className="absolute inset-0 -z-10 scale-75 rounded-full bg-mustard/15 blur-3xl" />
        <div style={{ height: 280 }}>
          <feature.Visual />
        </div>
      </div>
    </div>
  );
}