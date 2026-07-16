export function DownloadPanel({
  downloadHref,
  filename,
}: {
  downloadHref?: string;
  filename: string;
}) {
  return (
    <div className="mb-16 mt-10 flex flex-col items-start justify-between gap-4 rounded-[16px] border border-line bg-cream-card px-8 py-7 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-sunken text-ink"
          aria-hidden="true"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11" />
            <polyline points="8 11 12 15 16 11" />
            <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          </svg>
        </span>
        <div>
          <div className="text-sm font-bold text-ink">Download Updated CSV File</div>
          <p className="text-xs text-muted">
            Get your clean, processed, and updated dataset.
          </p>
        </div>
      </div>
      {downloadHref ? (
        <a
          href={downloadHref}
          download
          className="btn btn-yellow"
          aria-label={`Download cleaned dataset for ${filename}`}
        >
          Download CSV
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11" />
            <polyline points="8 11 12 15 16 11" />
            <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          </svg>
        </a>
      ) : (
        <button
          type="button"
          className="btn btn-yellow opacity-50 cursor-not-allowed"
          disabled
          aria-disabled="true"
          aria-label="Cleaned dataset unavailable"
        >
          Download CSV
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11" />
            <polyline points="8 11 12 15 16 11" />
            <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          </svg>
        </button>
      )}
    </div>
  );
}
