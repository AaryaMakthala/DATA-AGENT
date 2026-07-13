import Link from "next/link";

const STEPS = [
  {
    title: "Upload",
    body: "Drag in a CSV. Nothing is analyzed yet — it's just stored server-side.",
  },
  {
    title: "Profile",
    body: "Python computes shape, missing values, duplicates, outliers, and correlations.",
  },
  {
    title: "Plan",
    body: "The profile (never the raw rows) goes to an LLM for a cleaning plan and insights.",
  },
  {
    title: "Clean & Visualize",
    body: "Python executes the plan, generates charts, and ranks candidate ML algorithms.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-12">
      <section className="flex flex-col gap-4 text-center sm:text-left">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Upload a CSV. Get a clean dataset, a report, charts, and algorithm picks.
        </h1>
        <p className="max-w-2xl text-base text-slate-600 sm:mx-0 mx-auto">
          Your data is profiled and cleaned entirely in Python. The LLM only ever sees a
          statistical summary — it never reads or modifies your raw rows.
        </p>
        <div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Get started
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <div key={step.title} className="rounded-lg border border-slate-200 bg-white p-5">
            <span className="text-xs font-semibold text-indigo-600">Step {index + 1}</span>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">{step.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{step.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
