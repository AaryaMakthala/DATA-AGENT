"use client";

import { useState } from "react";

/** Real-mode chart PNG with a graceful unavailable fallback. */
export function ChartImage({ title, url }: { title: string; url: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className="flex h-48 w-full flex-col items-center justify-center text-center"
        role="img"
        aria-label={`${title}: chart unavailable`}
      >
        <p className="text-xs text-muted">Chart unavailable</p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      className="w-full rounded-[10px] border border-line"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
