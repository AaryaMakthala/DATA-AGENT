import Link from "next/link";

import { SiteNav, ArrowIcon, SparkleIcon } from "@/components/SiteNav";

const STATS = [
  { label: "Total Rows", value: "5,210", accent: false },
  { label: "Missing Values", value: "230", accent: false },
  { label: "Duplicates", value: "12", accent: false },
  { label: "Outliers", value: "8", accent: false },
  { label: "Data Quality", value: "92%", accent: true },
];

const STEPS = [
  { title: "Upload", body: "We support CSV and Excel files" },
  { title: "Scan", body: "We scan and detect issues automatically" },
  { title: "Clean", body: "We clean missing, duplicates, and errors" },
  { title: "Analyze", body: "We find patterns and key insights" },
  { title: "Visualize", body: "We create easy to understand charts" },
  { title: "Export", body: "Download clean data and reports" },
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

/** Miniature analysis dashboard shown inside the tablet mockup on the right. */
function DashboardPreview() {
  return (
    <div className="rounded-[14px] border border-line bg-cream-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-display text-[15px] font-bold text-ink">Analysis Overview</span>
        <span className="inline-flex items-center gap-1 rounded-pill border border-line px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-muted">
          See Full Report
        </span>
      </div>

      {/* Data quality score */}
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
              />
            </svg>
          </div>
          <div className="ml-3 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
            92%
          </div>
        </div>
      </div>

      {/* Column types + donut */}
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
          <svg viewBox="0 0 36 36" className="h-16 w-16" aria-hidden="true">
            <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-cream-sunken)" strokeWidth="6" />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="var(--color-mustard)"
              strokeWidth="6"
              strokeDasharray="55 88"
              strokeDashoffset="0"
              transform="rotate(-90 18 18)"
            />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="6"
              strokeDasharray="30 88"
              strokeDashoffset="-55"
              transform="rotate(-90 18 18)"
            />
          </svg>
        </div>
      </div>

      {/* Missing values mini bars */}
      <div>
        <span className="label-mono text-[9px]">Missing Values</span>
        <div className="mt-2 flex h-14 items-end gap-2">
          {[60, 90, 45, 70, 30, 80].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${h}%`,
                backgroundColor: i % 3 === 0 ? "var(--color-mustard)" : "var(--color-ink)",
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
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="Home" />

        {/* ---- Hero ---- */}
        <section className="grid grid-cols-1 items-center gap-10 py-14 lg:grid-cols-2">
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="pill-label">
                AI Powered <ArrowIcon />
              </span>
              <span className="pill-label" style={{ backgroundColor: "var(--color-blue-accent)", color: "var(--color-ink)" }}>
                Accurate · Fast · Reliable
              </span>
            </div>

            <h1 className="display-heading text-6xl sm:text-7xl">
              Data
              <br />
              Made
              <br />
              <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[6px]">
                Meaningful.
              </span>
            </h1>

            <p className="mt-6 max-w-md text-base text-muted">
              Upload your raw data. We clean it, analyze it, and deliver meaningful insights in seconds.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/upload" className="btn btn-yellow">
                Upload Data <ArrowIcon />
              </Link>
              <Link href="/results" className="btn btn-ghost">
                Explore Analysis <ArrowIcon />
              </Link>
            </div>
          </div>

          {/* Tablet mockup */}
          <div className="relative">
            <SparkleIcon className="absolute -top-4 right-2 text-ink" />
            <div className="card-elevated p-3">
              <DashboardPreview />
            </div>
            <div className="absolute -bottom-4 -right-2 flex h-12 w-12 items-center justify-center rounded-full bg-mustard">
              <SparkleIcon className="text-ink" />
            </div>
          </div>
        </section>

        {/* ---- Quick overview stats ---- */}
        <section className="py-6">
          <span className="label-mono">Quick Overview</span>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {STATS.map((stat) => (
              <div key={stat.label} className="card">
                <div className="label-mono text-[9px]">{stat.label}</div>
                <div className="mt-3 font-display text-3xl font-bold text-ink">{stat.value}</div>
                {stat.accent && (
                  <div className="mt-2 h-1 w-full rounded-full bg-mustard" />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Bottom black steps panel (full-width, rounded) ---- */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-8">
        <div className="rounded-[20px] bg-ink px-8 py-8 text-white">
          <span className="label-mono mb-6 block text-white/60">Quick It Overview</span>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
            {STEPS.map((step) => (
              <div key={step.title}>
                <div className="mb-3 text-mustard">
                  <StepIcon name={step.title} />
                </div>
                <div className="font-display text-base font-bold text-white">{step.title}</div>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
