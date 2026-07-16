import Link from "next/link";

/** Shared UI atoms used across pages (icons, nav). Keeps every page visually
 * consistent and pulling from the same source, per the design-token rules. */

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0c.6 6.3 5.7 11.4 12 12-6.3.6-11.4 5.7-12 12-.6-6.3-5.7-11.4-12-12C6.3 11.4 11.4 6.3 12 0z" />
    </svg>
  );
}

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "About", href: "/about" },
];

/** Top navigation bar, identical on every page. `active` picks which link
 * renders as the black pill. */
export function SiteNav({ active }: { active?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-line py-5">
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
          DA
        </span>
        <div className="leading-tight">
          <div className="font-display text-sm font-bold text-ink">DATA AGENT</div>
          <div className="label-mono text-[8px] leading-tight">
            Your Personal Data Analyst
            <br />
            and Data Cleaner
          </div>
        </div>
      </Link>

      <nav className="hidden items-center gap-2 md:flex">
        {NAV_LINKS.map((link) =>
          link.label === active ? (
            <Link key={link.label} href={link.href} className="nav-pill">
              {link.label}
            </Link>
          ) : (
            <Link
              key={link.label}
              href={link.href}
              className="label-mono px-3 py-2 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ),
        )}
      </nav>

      <Link href="/upload" className="btn btn-yellow">
        Upload Data <ArrowIcon />
      </Link>
    </header>
  );
}
