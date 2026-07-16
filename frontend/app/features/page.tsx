import Link from "next/link";

import { SiteNav, ArrowIcon, SparkleIcon } from "@/components/SiteNav";

const FEATURES = [
  {
    title: "AI-Powered Cleaning",
    body: "Advanced algorithms detect and fix data issues instantly.",
    icon: <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z" />,
  },
  {
    title: "Data Quality Check",
    body: "Get a complete overview of your data quality.",
    icon: (
      <>
        <path d="M9 12l2 2 4-4" />
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
      </>
    ),
  },
  {
    title: "Smart Analysis",
    body: "Find trends, patterns, and hidden insights.",
    icon: (
      <>
        <circle cx="7" cy="8" r="2.5" />
        <circle cx="17" cy="7" r="2.5" />
        <circle cx="14" cy="16" r="2.5" />
        <line x1="9" y1="9.5" x2="12.5" y2="14.5" />
        <line x1="15.5" y1="9" x2="14.5" y2="13.5" />
      </>
    ),
  },
  {
    title: "Interactive Visualizations",
    body: "Beautiful charts and tables to understand your data.",
    icon: (
      <>
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="6" />
        <line x1="18" y1="20" x2="18" y2="10" />
      </>
    ),
  },
  {
    title: "Multiple Export Options",
    body: "Export cleaned data and reports in multiple formats.",
    icon: (
      <>
        <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z" />
        <polyline points="14 3 14 7 18 7" />
      </>
    ),
  },
  {
    title: "Privacy First",
    body: "Your data is secure and never shared with third parties.",
    icon: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
];

export default function Features() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="Features" />

        <section className="py-14">
          <div className="relative">
            <SparkleIcon className="absolute right-2 top-0 hidden text-ink sm:block" />
            <span className="pill-label">Features</span>
            <h1 className="display-heading mt-6 text-5xl sm:text-6xl">
              Everything You Need
              <br />
              for <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[6px]">Smarter</span> Data.
            </h1>
            <p className="mt-5 text-base text-muted">
              Powerful tools to clean, analyze, visualize, and export your data effortlessly.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card">
                <span className="flex h-10 w-10 items-center justify-center text-ink">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {feature.icon}
                  </svg>
                </span>
                <div className="mt-5 font-display text-lg font-bold text-ink">{feature.title}</div>
                <p className="mt-2 text-sm text-muted">{feature.body}</p>
              </div>
            ))}
          </div>

          {/* Bottom CTA panel */}
          <div className="mt-10 flex flex-col items-center justify-between gap-6 rounded-[20px] border border-line bg-cream-sunken px-8 py-7 sm:flex-row">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center text-ink">
                <SparkleIcon />
              </span>
              <p className="text-sm text-ink">
                Explore all features and see how Data Agent can transform your data workflow.
              </p>
            </div>
            <Link href="/upload" className="btn btn-ghost">
              Upload Your Data <ArrowIcon />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
