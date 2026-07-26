"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

import { SiteNav, ArrowIcon, SiteFooter } from "@/components/SiteNav";

const STEPS = [
  { title: "Upload", body: "We support CSV and Excel files" },
  { title: "Scan", body: "We scan and detect issues automatically" },
  { title: "Clean", body: "We clean missing, duplicates, and errors" },
  { title: "Analyze", body: "We find patterns and key insights" },
  { title: "Visualize", body: "We create easy to understand charts" },
  { title: "Export", body: "Download clean data and reports" },
];

const CHECKLIST = [
  "Automatic type + outlier detection",
  "One-click duplicate and null cleanup",
  "Plain-language summary of every fix",
];

const TICKER_ITEMS = ["Upload", "Scan", "Clean", "Analyze", "Visualize", "Export"];

const SAMPLE_ROWS = [
  { column: "customer_id", type: "Numeric", nulls: "0", status: "Clean" },
  { column: "signup_date", type: "Date", nulls: "0", status: "Clean" },
  { column: "region", type: "Categorical", nulls: "12", status: "Fixed" },
  { column: "revenue", type: "Numeric", nulls: "3", status: "Fixed" },
  { column: "email", type: "Text", nulls: "0", status: "Clean" },
];

function StepIcon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "Upload":
      return (
        <svg {...common}>
          <path d="M12 15V4" />
          <polyline points="8 8 12 4 16 8" />
          <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
        </svg>
      );
    case "Scan":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      );
    case "Clean":
      return (
        <svg {...common}>
          <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z" />
        </svg>
      );
    case "Analyze":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 9 9h-9z" />
          <path d="M12 3v9h9" />
        </svg>
      );
    case "Visualize":
      return (
        <svg {...common}>
          <line x1="6" y1="20" x2="6" y2="12" />
          <line x1="12" y1="20" x2="12" y2="6" />
          <line x1="18" y1="20" x2="18" y2="10" />
        </svg>
      );
    case "Export":
      return (
        <svg {...common}>
          <path d="M12 4v11" />
          <polyline points="8 11 12 15 16 11" />
          <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
        </svg>
      );
    default:
      return null;
  }
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Scroll-triggered fade + rise wrapper, reusable anywhere on the page. */
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
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Analysis Overview card — buttons use the same bordered/hard-shadow system as the rest of the site. */
function DashboardPreview() {
  return (
    <div className="rounded-[14px] border border-line bg-cream-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-display text-[16px] font-bold text-ink">Analysis Overview</span>
        <button type="button" className="btn btn-ghost btn-sm whitespace-nowrap">
          See Full Report <ArrowIcon />
        </button>
      </div>

      <div className="mb-4">
        <span className="label-mono text-[9px]">Data Quality Score</span>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex-1">
            <svg viewBox="0 0 120 40" className="h-10 w-full" aria-hidden="true">
              <polyline
                points="0,32 20,26 40,28 60,18 80,20 100,10 120,12"
                fill="none"
                stroke="var(--color-mustard)"
                strokeWidth="2"
                className="line-draw"
              />
            </svg>
          </div>
          <div className="ml-3 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-sm font-bold text-white animate-pulse-soft">
            92%
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <span className="label-mono text-[9px]">Column Types</span>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-center gap-2 text-[11px] text-ink">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-mustard)" }} />
              Numeric <span className="ml-auto text-muted">4</span>
            </li>
            <li className="flex items-center gap-2 text-[11px] text-ink">
              <span className="h-2 w-2 rounded-full bg-ink" />
              Categorical <span className="ml-auto text-muted">3</span>
            </li>
          </ul>
        </div>
        <div className="flex items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-16 w-16 animate-spin-slow" style={{ animationDuration: "22s" }} aria-hidden="true">
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-cream-sunken)" strokeWidth="6" />
            <circle
              cx="18" cy="18" r="14" fill="none" stroke="var(--color-mustard)" strokeWidth="6"
              strokeDasharray="55 88" transform="rotate(-90 18 18)"
            />
            <circle
              cx="18" cy="18" r="14" fill="none" stroke="var(--color-ink)" strokeWidth="6"
              strokeDasharray="30 88" strokeDashoffset="-55" transform="rotate(-90 18 18)"
            />
          </svg>
        </div>
      </div>

      <div>
        <span className="label-mono text-[9px]">Missing Values</span>
        <div className="mt-2 flex h-14 items-end gap-2">
          {[60, 90, 45, 70, 30, 80].map((h, i) => (
            <div
              key={i}
              className="bar-grow flex-1 rounded-t-sm"
              style={{
                height: `${h}%`,
                backgroundColor: i % 3 === 0 ? "var(--color-mustard)" : "var(--color-ink)",
                animationDelay: `${i * 90}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-screen bg-cream">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-grid-pattern-page" />

      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="Home" />

        {/* ---- Hero (kept short on purpose: the ticker band below must be
             visible without scrolling on a typical viewport) ---- */}
        <section className="grid grid-cols-1 items-center gap-8 pb-6 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:pb-7 lg:pt-14">
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-3 animate-fade-in-up">
              <span className="pill-label" style={{ transform: "rotate(-2deg)" }}>
                AI Powered <ArrowIcon />
              </span>
              <span className="pill-label pill-label-alt" style={{ transform: "rotate(1.5deg)" }}>
                Accurate · Fast · Reliable
              </span>
            </div>

            <h1 className="display-heading text-5xl sm:text-6xl animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              Chaos In.
              <br />
              <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[6px]">
                Clarity
              </span>{" "}
              Out.
            </h1>

            <p className="mt-5 max-w-md text-base text-muted animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              Upload your raw data. We clean it, analyze it, and deliver meaningful insights in seconds.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              <Link href="/upload" className="btn btn-yellow">
                Upload Data <ArrowIcon />
              </Link>
              <Link href="/results" className="btn btn-ghost">
                Explore Analysis <ArrowIcon />
              </Link>
            </div>
          </div>

          <Reveal delay={150} className="lg:mt-6">
            <div className="relative mx-auto w-full max-w-sm py-2">
              {/* Soft blurred grounding shadow — gives the illustration depth without
                  the colored spotlight glow that was removed earlier. */}
              <div className="absolute bottom-2 left-1/2 -z-10 h-16 w-3/4 -translate-x-1/2 rounded-full bg-ink/15 blur-2xl" />

              <div
                className="absolute top-2 -left-4 z-20 rounded-2xl border-2 border-ink bg-cream-card px-3 py-2 shadow-[var(--shadow-hard)] animate-float sm:-left-10"
                style={{ animationDelay: "0s" }}
              >
                <span className="label-mono text-[8px]">Missing Values</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-ink" />
                  <span className="font-display text-base font-bold text-ink">230</span>
                </div>
              </div>

              <div
                className="absolute top-1/2 -right-4 z-20 -translate-y-1/2 rounded-2xl border-2 border-ink bg-cream-card px-3 py-2 shadow-[var(--shadow-hard)] animate-float sm:-right-10"
                style={{ animationDelay: "0.6s" }}
              >
                <span className="label-mono text-[8px]">Data Quality</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-mustard" />
                  <span className="font-display text-base font-bold text-ink">92%</span>
                </div>
              </div>

              <div
                className="absolute -bottom-2 left-6 z-20 rounded-2xl border-2 border-ink bg-cream-card px-3 py-2 shadow-[var(--shadow-hard)] animate-float"
                style={{ animationDelay: "1.2s" }}
              >
                <span className="label-mono text-[8px]">Duplicates</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-ink" />
                  <span className="font-display text-base font-bold text-ink">12</span>
                </div>
              </div>

              <Image
                src="/robot-hero.png"
                alt="Illustration of a robot sorting index cards and data tags into neat stacks"
                width={1024}
                height={1024}
                className="relative z-10 w-full"
                priority
              />
            </div>
          </Reveal>
        </section>

      </div>

      {/*
        Scrolling ticker band — each "set" below is forced to span the full
        section width (w-full), so the loop never runs out of content and
        shows bare ink background, no matter how wide the viewport is.
        Two identical sets + translateX(-50%) = a seamless, gap-free loop.
      */}
      <section className="mt-12 overflow-hidden border-y-2 border-ink bg-ink py-3 lg:mt-16">
        <div className="flex animate-marquee">
          <div className="flex w-full shrink-0 items-center justify-around gap-10">
            {TICKER_ITEMS.map((item, i) => (
              <span key={i} className="flex shrink-0 items-center gap-2.5 label-mono leading-none text-white/80">
                {item}
                <svg width="7" height="7" viewBox="0 0 24 24" fill="var(--color-mustard)" aria-hidden="true">
                  <path d="M12 0c.6 6.3 5.7 11.4 12 12-6.3.6-11.4 5.7-12 12-.6-6.3-5.7-11.4-12-12C6.3 11.4 11.4 6.3 12 0z" />
                </svg>
              </span>
            ))}
          </div>
          <div className="flex w-full shrink-0 items-center justify-around gap-10" aria-hidden="true">
            {TICKER_ITEMS.map((item, i) => (
              <span key={i} className="flex shrink-0 items-center gap-2.5 label-mono leading-none text-white/80">
                {item}
                <svg width="7" height="7" viewBox="0 0 24 24" fill="var(--color-mustard)" aria-hidden="true">
                  <path d="M12 0c.6 6.3 5.7 11.4 12 12-6.3.6-11.4 5.7-12 12-.6-6.3-5.7-11.4-12-12C6.3 11.4 11.4 6.3 12 0z" />
                </svg>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-6">
        {/* ---- How it works: timeline ---- */}
        <section className="py-14">
          <Reveal>
            <span className="label-mono">How It Works</span>
            <h2 className="display-heading mt-3 text-4xl sm:text-5xl">
              Six steps to <span className="italic text-mustard">meaningful</span> data.
            </h2>
          </Reveal>

          <div className="relative mt-12">
            <div className="absolute left-0 right-0 top-7 hidden h-0.5 border-t-2 border-dashed border-line lg:block" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 90} className="group relative">
                  <div className="icon-badge relative z-10 text-ink">
                    <StepIcon name={step.title} />
                  </div>
                  <div className="mt-4 font-display text-base font-bold text-ink">{step.title}</div>
                  <p className="mt-1 text-[12px] leading-snug text-muted">{step.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Analysis preview split section ---- */}
        <section className="grid grid-cols-1 items-center gap-10 py-14 lg:grid-cols-2">
          <Reveal>
            <span className="label-mono">See It In Action</span>
            <h2 className="display-heading mt-3 text-4xl sm:text-5xl">
              Know your data{" "}
              <span className="italic underline decoration-mustard decoration-[5px] underline-offset-[5px]">
                before
              </span>{" "}
              you use it.
            </h2>
            <p className="mt-5 max-w-md text-base text-muted">
              Every upload gets a full quality report — no spreadsheets, no guesswork.
            </p>
            <ul className="mt-6 space-y-3">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-mustard text-ink">
                    <CheckIcon />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/upload" className="btn btn-black mt-8">
              Try It Now <ArrowIcon />
            </Link>
          </Reveal>

          <Reveal delay={150} className="relative mx-auto w-full max-w-sm">
            <div
              className="absolute -right-4 -top-4 h-10 w-10 rotate-12 rounded-lg border-2 border-ink bg-blue-accent animate-float"
              style={{ animationDelay: "0.3s" }}
            />
            <div className="card-elevated p-3 transition-transform duration-500 hover:-translate-y-1">
              <DashboardPreview />
            </div>
          </Reveal>
        </section>

        {/* ---- Sample cleaned data table — same border + hard shadow system as the buttons ---- */}
        <section className="py-14">
          <Reveal>
            <span className="label-mono">Sample Output</span>
            <h2 className="display-heading mt-3 text-4xl sm:text-5xl">
              A preview of your <span className="italic text-mustard">cleaned</span> data.
            </h2>
          </Reveal>

          <Reveal delay={120} className="mt-10">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Nulls Fixed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.map((row) => (
                    <tr key={row.column}>
                      <td className="font-medium">{row.column}</td>
                      <td className="text-muted">{row.type}</td>
                      <td className="text-muted">{row.nulls}</td>
                      <td>
                        <span className={`table-chip ${row.status === "Clean" ? "table-chip-ok" : ""}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>
      </div>

      {/* ---- Closing CTA panel ---- */}
      <section className="mx-auto w-full max-w-6xl overflow-hidden px-6 pb-16 pt-4">
        <Reveal>
          <div className="relative overflow-hidden rounded-[20px] bg-ink px-8 py-16 text-center text-white">
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
              Turn the mess into a <span className="italic text-mustard">story</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-white/60">
              Drop in a CSV or Excel file and get a clean, analyzed, visualized dataset back — in seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/upload" className="btn btn-yellow btn-shadow-white">
                Upload Data <ArrowIcon />
              </Link>
              <Link href="/results" className="btn btn-ghost" style={{ backgroundColor: "transparent", color: "#fff" }}>
                Explore Analysis <ArrowIcon />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}