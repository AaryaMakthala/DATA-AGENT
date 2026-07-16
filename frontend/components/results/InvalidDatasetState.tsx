import Link from "next/link";

export function InvalidDatasetState({
  message,
  filename,
}: {
  message: string;
  filename: string;
}) {
  return (
    <div
      className="mb-16 mt-6 rounded-[16px] border px-6 py-12 text-center"
      style={{ borderColor: "#e6cfc8", backgroundColor: "#f8eeeb" }}
      role="alert"
    >
      <span
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "#c05a44" }}
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
      <h1 className="display-heading mt-6 text-3xl sm:text-4xl">
        This dataset can&apos;t be analyzed
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-sm text-muted">{message}</p>
      <p className="mt-2 text-xs text-muted">File: {filename}</p>
      <Link href="/upload" className="btn btn-yellow mt-8 inline-flex">
        Try a different file
      </Link>
    </div>
  );
}
