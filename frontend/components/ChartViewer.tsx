import Image from "next/image";

import { resolveAssetUrl } from "@/lib/api";

interface ChartViewerProps {
  charts: string[];
}

function chartTitle(path: string): string {
  const filename = path.split("/").pop() ?? path;
  const withoutExt = filename.replace(/\.png$/, "");
  const parts = withoutExt.split("_");
  // Drop the leading file_id segment (a 32-char hex uuid) so titles read cleanly.
  const meaningful = parts[0]?.length === 32 ? parts.slice(1) : parts;
  return meaningful.join(" ");
}

export default function ChartViewer({ charts }: ChartViewerProps) {
  // Defensive: render each chart URL at most once, regardless of whether the
  // API response ever contains a duplicate. Cheap and harmless when the
  // list is already unique (the normal case).
  const uniqueCharts = Array.from(new Set(charts));

  if (uniqueCharts.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-slate-900">Charts</h2>
        <p className="mt-2 text-sm text-slate-500">No charts were generated for this dataset.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Charts</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {uniqueCharts.map((chart) => (
          <figure key={chart} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="relative aspect-[4/3] w-full">
              <Image
                src={resolveAssetUrl(chart)}
                alt={chartTitle(chart)}
                fill
                unoptimized
                className="object-contain p-2"
              />
            </div>
            <figcaption className="border-t border-slate-100 px-3 py-2 text-xs capitalize text-slate-600">
              {chartTitle(chart)}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
