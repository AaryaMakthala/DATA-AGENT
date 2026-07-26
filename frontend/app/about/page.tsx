"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { SiteNav, SiteFooter, ArrowIcon } from "@/components/SiteNav";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const STATS = [
  { label: "10x", desc: "Faster analysis" },
  { label: "AI", desc: "Assisted cleaning" },
  { label: "Auto", desc: "Generated insights" },
  { label: "ML", desc: "Recommendations" },
];

const PRINCIPLES = [
  {
    num: "01",
    title: "AI first",
    body: "Modern AI systems and LLM reasoning automate complex data workflows end to end.",
    badge: "LLM powered",
    icon: (
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    ),
  },
  {
    num: "02",
    title: "Built for everyone",
    body: "Helping students, analysts, researchers, and businesses make better decisions.",
    badge: "Human centric",
    icon: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M18 21v-2a4 4 0 0 0-4-4h-4a4 4 0 0 0-4 4v2" />
      </>
    ),
  },
  {
    num: "03",
    title: "Privacy focused",
    body: "Your data remains secure and is processed with strong privacy principles.",
    badge: "Local-first ready",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
];

const PIPELINE = [
  { step: "1", title: "Dataset upload", desc: "Secure ingestion of CSV, Excel, or JSON data." },
  { step: "2", title: "Data profiler", desc: "Automatic detection of types, anomalies, and structure." },
  { step: "3", title: "AI reasoning layer", desc: "LLM determines the optimal cleaning and analysis strategy." },
  { step: "4", title: "Cleaning engine & viz generator", desc: "Executes Python code to clean and plot the data." },
  { step: "5", title: "ML recommendation system", desc: "Suggests predictive models based on the cleaned dataset." },
];

const TECH_STACK = ["Next.js + TypeScript", "FastAPI + Python", "LangGraph + LLM router", "Pandas + ML pipeline"];

const BEFORE = ["Manual, tedious cleaning", "Complex, fragmented tools", "Time-consuming analysis", "Requires deep technical expertise"];
const AFTER = ["AI-powered automated workflow", "Instant automatic cleaning", "Generated actionable insights", "Guided ML recommendations"];

const TRUST = [
  { title: "Privacy first", desc: "We don't train our public models on your proprietary datasets." },
  { title: "Secure processing", desc: "Data is processed in isolated, ephemeral environments." },
  { title: "Reliable AI pipeline", desc: "Traceable reasoning logs so you understand every decision the AI makes." },
];

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

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={2.4}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CrossIcon({ size = 14 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size} strokeWidth={2.4}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DatasetIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function BoltIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ChartIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
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
export default function About() {
  return (
    <div className="relative min-h-screen bg-cream">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="About" />

        {/* ---- Hero ---- */}
        <Reveal>
          <section className="pt-16 pb-14 text-center md:pt-20">
            <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
              About Data Agent
            </span>
            <h1 className="headline mx-auto mt-5 max-w-3xl text-[clamp(2.2rem,5.4vh,3.75rem)] uppercase">
              Making data analysis{" "}
              <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[8px]">
                accessible with AI
              </span>
            </h1>
            <p className="font-body mx-auto mt-5 max-w-xl text-[0.95rem] leading-relaxed text-muted">
              Data Agent is an AI-powered data analyst that transforms raw datasets into clean
              data, meaningful insights, visualizations, and machine learning recommendations.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/upload" className="btn btn-yellow btn-lg">
                Try Data Agent
                <ArrowIcon />
              </Link>
              <a href="#principles" className="btn btn-ghost btn-lg">
                Explore Features
              </a>
            </div>
          </section>
        </Reveal>

        {/* ---- Hero visual: AI ecosystem strip ---- */}
        <Reveal delay={60}>
          <section className="pb-16">
            <div className="card">
              <div className="relative flex flex-col items-center justify-between gap-8 sm:flex-row">
                <div className="absolute left-8 right-8 top-1/2 hidden h-0.5 -translate-y-1/2 border-t-2 border-dashed border-line sm:block" />

                <div className="relative z-10 flex flex-col items-center gap-2.5">
                  <span className="icon-badge">
                    <DatasetIcon size={22} />
                  </span>
                  <span className="label-mono">Raw dataset</span>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-2.5">
                  <span className="icon-badge upload-badge bg-mustard text-ink">
                    <BoltIcon size={30} />
                  </span>
                  <span className="label-mono text-ink">AI processing core</span>
                  <span className="font-mono text-[9px] font-medium uppercase tracking-wide text-muted">
                    Cleaning engine
                  </span>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-2.5">
                  <span className="icon-badge bg-mustard text-ink">
                    <ChartIcon size={22} />
                  </span>
                  <span className="label-mono">Insights</span>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---- Mission ---- */}
        <Reveal>
          <section className="grid grid-cols-1 gap-10 py-14 md:grid-cols-2 md:gap-16">
            <div>
              <span className="label-mono text-mustard">Our Mission</span>
              <blockquote className="headline mt-5 text-2xl leading-snug sm:text-3xl">
                &ldquo;Data analysis should not be limited to experts. Everyone should be able to
                understand, clean, and use their data with the power of artificial
                intelligence.&rdquo;
              </blockquote>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {STATS.map((stat) => (
                <div key={stat.label} className="card">
                  <div className="headline text-3xl">{stat.label}</div>
                  <div className="font-body mt-1 text-sm text-muted">{stat.desc}</div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* ---- Principles ---- */}
        <section id="principles" className="py-14">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.num} delay={i * 60}>
                <div className="card h-full">
                  <div className="flex items-start justify-between">
                    <span className="icon-badge">
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
                        {p.icon}
                      </svg>
                    </span>
                    <span className="font-mono text-2xl font-bold" style={{ color: "var(--color-line)" }}>
                      {p.num}
                    </span>
                  </div>
                  <h3 className="headline mt-6 text-xl">{p.title}</h3>
                  <p className="font-body mt-2.5 text-sm leading-relaxed text-muted">{p.body}</p>
                  <span className="pill-label pill-label-ghost mt-5 inline-flex">{p.badge}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---- Architecture (dark) ---- */}
        <Reveal>
          <section className="py-14">
            <div
              className="rounded-[var(--radius-card)] border-2 p-8 md:p-12"
              style={{
                backgroundColor: "var(--color-ink)",
                borderColor: "var(--color-mustard)",
                boxShadow: "var(--shadow-hard-yellow)",
              }}
            >
              <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div>
                  <span className="pill-label" style={{ transform: "rotate(-1deg)" }}>
                    Under The Hood
                  </span>
                  <h2 className="headline mt-5 text-3xl text-cream">
                    Powered by modern AI architecture
                  </h2>
                  <p className="font-body mt-4 text-sm leading-relaxed text-cream/70">
                    A high-performance pipeline designed to reason, process, and analyze your
                    data securely at scale.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {TECH_STACK.map((tech) => (
                      <span
                        key={tech}
                        className="rounded-full border px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-wide"
                        style={{ borderColor: "rgba(245, 241, 234, 0.18)", color: "var(--color-cream)" }}
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {PIPELINE.map((item) => (
                    <div
                      key={item.step}
                      className="flex items-start gap-4 rounded-2xl border p-4"
                      style={{ borderColor: "rgba(245, 241, 234, 0.1)", backgroundColor: "rgba(245, 241, 234, 0.03)" }}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold"
                        style={{ borderColor: "var(--color-mustard)", color: "var(--color-mustard)" }}
                      >
                        {item.step}
                      </span>
                      <div>
                        <h4 className="font-body text-sm font-bold text-cream">{item.title}</h4>
                        <p className="font-body mt-1 text-xs leading-relaxed text-cream/60">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---- Why it exists + Trust ---- */}
        <section className="grid grid-cols-1 gap-14 py-14 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div>
              <h2 className="headline text-3xl">Why Data Agent exists</h2>
              <p className="font-body mt-4 text-[0.95rem] leading-relaxed text-muted">
                Most people have valuable data but struggle with cleaning, understanding, and
                analyzing it. Data Agent bridges the gap between raw information and actionable
                intelligence.
              </p>

              <div className="mt-8 flex flex-col gap-5">
                <div className="card-danger p-6">
                  <h4 className="label-mono" style={{ color: "var(--color-danger)" }}>
                    Before Data Agent
                  </h4>
                  <ul className="mt-4 space-y-2.5">
                    {BEFORE.map((item) => (
                      <li key={item} className="font-body flex items-center gap-3 text-sm text-ink/80">
                        <span style={{ color: "var(--color-danger)" }}>
                          <CrossIcon size={13} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card card-accent p-6">
                  <h4 className="label-mono text-ink">With Data Agent</h4>
                  <ul className="mt-4 space-y-2.5">
                    {AFTER.map((item) => (
                      <li key={item} className="font-body flex items-center gap-3 text-sm font-medium text-ink">
                        <span className="text-mustard">
                          <CheckIcon size={13} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="flex flex-col justify-center">
              <h2 className="headline text-3xl">Built with transparency</h2>
              <p className="font-body mt-4 text-[0.95rem] leading-relaxed text-muted">
                Data Agent focuses on responsible AI usage, predictable workflows, and
                user-controlled data.
              </p>

              <div className="mt-8 space-y-6">
                {TRUST.map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mustard" />
                    <div>
                      <h4 className="font-body text-sm font-bold text-ink">{item.title}</h4>
                      <p className="font-body mt-1 text-sm text-muted">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---- Final CTA ---- */}
        <Reveal>
          <section className="pb-20 pt-4">
            <div
              className="rounded-[var(--radius-card)] border-2 px-6 py-16 text-center sm:px-16"
              style={{
                backgroundColor: "var(--color-ink)",
                borderColor: "var(--color-mustard)",
                boxShadow: "var(--shadow-hard-yellow)",
              }}
            >
              <h2 className="headline mx-auto max-w-xl text-3xl text-cream sm:text-4xl">
                Ready to discover what your data can reveal?
              </h2>
              <p className="font-body mx-auto mt-4 max-w-md text-sm leading-relaxed text-cream/70">
                Upload your dataset today and let our AI transform raw numbers into strategic
                insights.
              </p>
              <div className="mt-8 flex justify-center">
                <Link href="/upload" className="btn btn-yellow btn-lg btn-shadow-white">
                  Start Analysis
                  <ArrowIcon />
                </Link>
              </div>
            </div>
          </section>
        </Reveal>
      </div>

      <SiteFooter />
    </div>
  );
}