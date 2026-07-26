import Link from "next/link";

/** Shared UI atoms used across pages (icons, nav, footer). Keeps every page visually
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
 * renders as the black pill. Inactive links use `.nav-link`, which stays
 * invisible until hover, then reveals a real bordered/hard-shadow button
 * shape — matching the active pill's visual language instead of just
 * changing text color. */
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

      <nav className="hidden items-center gap-1.5 md:flex">
        {NAV_LINKS.map((link) =>
          link.label === active ? (
            <Link key={link.label} href={link.href} className="nav-pill">
              {link.label}
            </Link>
          ) : (
            <Link key={link.label} href={link.href} className="nav-link">
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

/* ---- Social / contact icon components (footer use only) ---- */

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

/** Portfolio footer — dark-themed, consistent with the site's ink background.
 *  Includes copyright and three icon+text links: LinkedIn, GitHub, Email. */
export function SiteFooter() {
  return (
    <footer
      style={{
        backgroundColor: "var(--color-ink)",
        borderTop: "2px solid var(--color-ink)",
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          padding: "2rem 1.5rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1.25rem",
        }}
      >
        {/* Copyright */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            margin: 0,
          }}
        >
          © 2026 Makthala Aarya. All rights reserved.
        </p>

        {/* Social links */}
        <nav
          aria-label="Social links"
          style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
        >
          {[
            {
              href: "https://www.linkedin.com/in/aaryamakthala",
              label: "LinkedIn",
              icon: <LinkedInIcon />,
              external: true,
            },
            {
              href: "https://github.com/AaryaMakthala",
              label: "GitHub",
              icon: <GitHubIcon />,
              external: true,
            },
            {
              href: "mailto:aaryamakthala@gmail.com",
              label: "Email",
              icon: <EmailIcon />,
              external: false,
            },
          ].map(({ href, label, icon, external }) => (
            <a
              key={label}
              href={href}
              aria-label={label}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.5rem 0.85rem",
                borderRadius: "9999px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.62rem",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                color: "rgba(255,255,255,0.55)",
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                transition: "color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.color = "var(--color-mustard)";
                el.style.borderColor = "rgba(244,197,66,0.4)";
                el.style.backgroundColor = "rgba(244,197,66,0.08)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.color = "rgba(255,255,255,0.55)";
                el.style.borderColor = "rgba(255,255,255,0.1)";
                el.style.backgroundColor = "transparent";
              }}
            >
              {icon}
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}