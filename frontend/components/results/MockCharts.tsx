/** Static SVG charts used only by the marketing mock Results preview. */

export function DonutChart() {
  const segments = [
    { color: "#2f6fd6", offset: 0, len: 45 },
    { color: "#5f9ae8", offset: 45, len: 32 },
    { color: "#a5c4e8", offset: 77, len: 23 },
  ];
  const c = 2 * Math.PI * 40;
  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <g transform="rotate(-90 60 60)">
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="60"
              cy="60"
              r="40"
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={`${(s.len / 100) * c} ${c}`}
              strokeDashoffset={`${-(s.offset / 100) * c}`}
            />
          ))}
        </g>
      </svg>
      <ul className="space-y-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2f6fd6" }} /> Low
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#5f9ae8" }} /> Medium
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#a5c4e8" }} /> High
        </li>
      </ul>
    </div>
  );
}

export function FeatureImportanceChart() {
  const bars = [92, 74, 58, 44, 33];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((v, i) => (
        <g key={i}>
          <text x="0" y={22 + i * 26} fontSize="8" fill="#6b6b6b">
            Feature {String.fromCharCode(65 + i)}
          </text>
          <rect x="52" y={12 + i * 26} width={(v / 100) * 150} height="12" rx="2" fill="#2f6fd6" />
        </g>
      ))}
    </svg>
  );
}

export function ScatterChart() {
  const points = [
    [22, 88], [30, 80], [34, 76], [40, 70], [46, 66], [50, 60], [55, 58],
    [58, 50], [62, 48], [66, 44], [70, 38], [74, 34], [80, 28], [85, 22],
    [45, 72], [52, 64], [60, 54], [68, 42], [76, 32], [38, 78],
  ];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      <line x1="20" y1="130" x2="210" y2="20" stroke="#141414" strokeWidth="1" />
      {points.map(([x, y], i) => (
        <circle
          key={i}
          cx={20 + (x / 100) * 190}
          cy={130 - ((100 - y) / 100) * 110}
          r="3"
          fill="#2f6fd6"
        />
      ))}
    </svg>
  );
}

export function ResidualsChart() {
  const bars = [12, 28, 55, 82, 100, 78, 50, 30, 14];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((v, i) => (
        <rect
          key={i}
          x={12 + i * 23}
          y={130 - (v / 100) * 110}
          width="18"
          height={(v / 100) * 110}
          rx="2"
          fill="#a5c4e8"
        />
      ))}
    </svg>
  );
}

export function HeatmapChart() {
  const palette = ["#b23a2e", "#d98a6a", "#e9e2d4", "#8fb4dd", "#3f6fb0"];
  const grid = [
    [4, 2, 3, 1, 0],
    [2, 4, 0, 3, 1],
    [3, 0, 4, 2, 1],
    [1, 3, 2, 4, 0],
    [0, 1, 1, 0, 4],
  ];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      {grid.map((row, r) =>
        row.map((v, cIdx) => (
          <rect
            key={`${r}-${cIdx}`}
            x={20 + cIdx * 34}
            y={10 + r * 26}
            width="32"
            height="24"
            fill={palette[v]}
          />
        ))
      )}
    </svg>
  );
}

export function BoxPlotChart() {
  const boxes = [
    { x: 20, top: 40, h: 30 },
    { x: 60, top: 45, h: 28 },
    { x: 100, top: 70, h: 22 },
    { x: 140, top: 60, h: 26 },
    { x: 180, top: 80, h: 18 },
  ];
  const labels = ["RF", "XGB", "GB", "LR", "SVR"];
  return (
    <svg width="100%" height="150" viewBox="0 0 220 150" aria-hidden="true">
      {boxes.map((b, i) => (
        <g key={i}>
          <line
            x1={b.x + 12}
            y1={b.top - 12}
            x2={b.x + 12}
            y2={b.top + b.h + 12}
            stroke="#2f6fd6"
            strokeWidth="1"
          />
          <rect x={b.x} y={b.top} width="24" height={b.h} rx="2" fill="#a5c4e8" stroke="#2f6fd6" />
          <line
            x1={b.x}
            y1={b.top + b.h / 2}
            x2={b.x + 24}
            y2={b.top + b.h / 2}
            stroke="#2f6fd6"
            strokeWidth="1.4"
          />
          <text x={b.x + 12} y="144" fontSize="8" fill="#6b6b6b" textAnchor="middle">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
