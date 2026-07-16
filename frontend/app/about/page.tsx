import Link from "next/link";

import { SiteNav, ArrowIcon } from "@/components/SiteNav";

const VALUES = [
  {
    title: "Our Mission",
    body: "Empower everyone to unlock the value of their data.",
    icon: <path d="M12 21s-7-4.35-9.5-8.5C1 9.5 2.5 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.5 0 5 3.5 3.5 6.5C19 16.65 12 21 12 21z" />,
  },
  {
    title: "Built for Everyone",
    body: "Designed for analysts, students, businesses, and everyone in between.",
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M18 14.2c2 .9 3 2.6 3 5.8" />
      </>
    ),
  },
  {
    title: "Trusted & Secure",
    body: "Your data is private, secure, and stays in your control.",
    icon: (
      <>
        <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SiteNav active="About" />

        <section className="py-14">
          <span className="pill-label">About Data Agent</span>
          <h1 className="display-heading mt-6 text-5xl sm:text-6xl">
            Built for Everyone.
            <br />
            Designed for <span className="italic underline decoration-mustard decoration-[6px] underline-offset-[6px]">Impact.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted">
            Data Agent is your personal data analyst and cleaner. Our mission is to make data analysis simple, fast, and accessible for everyone.
          </p>

          <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {VALUES.map((value) => (
              <div key={value.title} className="flex flex-col items-center text-center">
                <span className="flex h-12 w-12 items-center justify-center text-ink">
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {value.icon}
                  </svg>
                </span>
                <div className="mt-5 font-display text-lg font-bold text-ink">{value.title}</div>
                <p className="mt-2 max-w-xs text-sm text-muted">{value.body}</p>
              </div>
            ))}
          </div>

          {/* Contact CTA panel */}
          <div className="mt-16 flex flex-col items-center justify-between gap-6 rounded-[20px] border border-line bg-cream-sunken px-8 py-7 sm:flex-row">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-card text-ink">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </span>
              <div>
                <div className="font-display text-lg font-bold text-ink">Have questions or feedback?</div>
                <p className="mt-1 text-sm text-muted">We&apos;d love to hear from you.</p>
              </div>
            </div>
            <Link href="/upload" className="btn btn-ghost">
              Contact Us <ArrowIcon />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
