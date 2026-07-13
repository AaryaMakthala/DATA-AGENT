import { resolveAssetUrl } from "@/lib/api";

interface DownloadButtonsProps {
  cleanedFile: string | null;
  charts: string[];
}

export default function DownloadButtons({ cleanedFile, charts }: DownloadButtonsProps) {
  if (!cleanedFile && charts.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Downloads</h2>
      <div className="flex flex-wrap gap-3">
        {cleanedFile && (
          <a
            href={resolveAssetUrl(cleanedFile)}
            download
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Download cleaned CSV
          </a>
        )}
        {charts.map((chart) => (
          <a
            key={chart}
            href={resolveAssetUrl(chart)}
            download
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {chart.split("/").pop()}
          </a>
        ))}
      </div>
    </section>
  );
}
