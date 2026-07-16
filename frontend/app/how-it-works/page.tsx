import Link from "next/link";

import { SiteNav, ArrowIcon, ArrowRight } from "@/components/SiteNav";

const STEPS = [
  {
    num: "01",
    title: "Upload Your Data",
    body: "Upload CSV or Excel files securely.",
    icon: (
      <>
        <path d="M12 15V4" />
        <polyline points="8 8 12 4 16 8" />
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
  {
    num: "02",
    title: "Scan & Detect",
    body: "We scan your data and detect missing values, duplicates, and errors.",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </>
    ),
  },
  {
    num: "03",
    title: "Clean Your Data",
    body: "We handle missing values, duplicates, and inconsistencies.",
    icon: <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z" />,
  },
  {
    num: "04",
    title: "Analyze Data",
    body: "We analyze patterns, trends, and extract meaningful insights.",
    icon: (
      <>
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="6" />
        <line x1="18" y1="20" x2="18" y2="10" />
      </>
    ),
  },
  {
    num: "05",
    title: "Visualize Insights",
    body: "Interactive charts and tables help you understand your data easily.",
    icon: (
      <>
        <path d="M12 3a9 9 0 1 0 9 9h-9z" />
        <path d="M12 3v9h9" />
      </>
    ),
  },
  {
    num: "06",
    title: "Export Results",
    body: "Download cleaned data and insights in one click.",
    icon: (
      <>
        <path d="M12 4v11" />
        <polyline points="8 11 12 15 16 11" />
        <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="How It Works" />

        <section className="py-14">
          <span className="pill-label">Our Process</span>
          <h1 className="display-heading mt-6 text-5xl sm:text-6xl">
            Simple Steps,
            <br />
            Powerful Results.
          </h1>
          <p className="mt-5 text-base text-muted">
            From raw data to clear insights in 6 easy steps.
          </p>

          <div className="mt-10 flex flex-col gap-4">
            {STEPS.map((step) => (
              <div key={step.num} className="card flex items-center gap-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mustard font-mono text-xs font-bold text-ink">
                  {step.num}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center text-ink">
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
                </span>
                <div className="flex-1">
                  <div className="font-display text-lg font-bold text-ink">{step.title}</div>
                  <p className="mt-1 text-sm text-muted">{step.body}</p>
                </div>
                <span className="shrink-0 text-muted">
                  <ArrowRight />
                </span>
              </div>
            ))}
          </div>

          {/* Bottom CTA panel */}
          <div className="mt-10 flex flex-col items-center justify-between gap-6 rounded-[20px] bg-ink px-8 py-7 text-white sm:flex-row">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 15V4" />
                  <polyline points="8 8 12 4 16 8" />
                  <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                </svg>
              </span>
              <div>
                <div className="font-display text-lg font-bold text-white">Ready to analyze your data?</div>
                <p className="mt-1 text-sm text-white/60">Upload your file and let Data Agent do the rest.</p>
              </div>
            </div>
            <Link href="/upload" className="btn btn-yellow">
              Upload Data <ArrowIcon />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
