import * as React from "react";
import {
  CAMELOT_MAP,
  getHarmonicMatches,
  normalizeCamelot,
  getCamelotRgba,
} from "@/src/utils/camelot";

interface CamelotWheelProps {
  currentKey: string;
  onSelectKey?: (key: string) => void;
  size?: number; // default 120
  className?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArcSlice(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  startDeg: number,
  endDeg: number
) {
  const p1 = polarToCartesian(cx, cy, rOut, startDeg);
  const p2 = polarToCartesian(cx, cy, rOut, endDeg);
  const p3 = polarToCartesian(cx, cy, rIn, endDeg);
  const p4 = polarToCartesian(cx, cy, rIn, startDeg);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rOut} ${rOut} 0 0 1 ${p2.x.toFixed(
    2
  )} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${rIn} ${rIn} 0 0 0 ${p4.x.toFixed(
    2
  )} ${p4.y.toFixed(2)} Z`;
}

export function CamelotWheel({
  currentKey,
  onSelectKey,
  size = 120,
  className = "",
}: CamelotWheelProps) {
  const normKey = normalizeCamelot(currentKey);
  const { exact, compatibleSet } = React.useMemo(
    () => getHarmonicMatches(normKey),
    [normKey]
  );

  const cx = 60;
  const cy = 60;
  // Radios para 120x120:
  // Anillo exterior (B - Major): rIn = 43, rOut = 57
  // Anillo interior (A - Minor): rIn = 27, rOut = 41
  const rInB = 43;
  const rOutB = 57;
  const rInA = 27;
  const rOutA = 41;

  // Generamos los 12 sectores (1 a 12)
  const numbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`relative shrink-0 select-none ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        className="w-full h-full overflow-visible"
      >
        {/* Núcleo central con tonalidad actual en grande */}
        <circle
          cx={cx}
          cy={cy}
          r={24}
          fill="#111113"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-mono text-[11px] font-bold fill-zinc-100 select-none"
        >
          {normKey}
        </text>
        <text
          x={cx}
          y={cy + 9}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[7.5px] uppercase tracking-wider fill-zinc-500 font-mono select-none"
        >
          {CAMELOT_MAP[normKey]?.musicalKey || ""}
        </text>

        {/* Sectores de los 12 tonos */}
        {numbers.map((num) => {
          // Ángulo central del número: 12 está a -90°, 3 a 0°, etc.
          const centerAngle = (num - 3) * 30;
          const startAngle = centerAngle - 13.8;
          const endAngle = centerAngle + 13.8;

          // Claves correspondientes
          const keyB = `${num}B`;
          const keyA = `${num}A`;

          const isExactB = exact === keyB;
          const isExactA = exact === keyA;
          const isCompB = compatibleSet.has(keyB);
          const isCompA = compatibleSet.has(keyA);

          // Path y coordenadas de texto para B (anillo exterior)
          const pathB = describeArcSlice(cx, cy, rInB, rOutB, startAngle, endAngle);
          const textPosB = polarToCartesian(cx, cy, (rInB + rOutB) / 2, centerAngle);

          // Path y coordenadas de texto para A (anillo interior)
          const pathA = describeArcSlice(cx, cy, rInA, rOutA, startAngle, endAngle);
          const textPosA = polarToCartesian(cx, cy, (rInA + rOutA) / 2, centerAngle);

          // Color y estilo para B
          let fillB = "rgba(255,255,255,0.03)";
          let strokeB = "rgba(255,255,255,0.04)";
          let textFillB = "rgba(161,161,170,0.35)";

          if (isExactB) {
            fillB = CAMELOT_MAP[keyB]?.hex || "#F97316";
            strokeB = "#ffffff";
            textFillB = "#ffffff";
          } else if (isCompB) {
            fillB = getCamelotRgba(keyB, 0.35);
            strokeB = getCamelotRgba(keyB, 0.6);
            textFillB = "#f4f4f5";
          }

          // Color y estilo para A
          let fillA = "rgba(255,255,255,0.03)";
          let strokeA = "rgba(255,255,255,0.04)";
          let textFillA = "rgba(161,161,170,0.35)";

          if (isExactA) {
            fillA = CAMELOT_MAP[keyA]?.hex || "#F97316";
            strokeA = "#ffffff";
            textFillA = "#ffffff";
          } else if (isCompA) {
            fillA = getCamelotRgba(keyA, 0.35);
            strokeA = getCamelotRgba(keyA, 0.6);
            textFillA = "#f4f4f5";
          }

          return (
            <g key={num}>
              {/* Segmento B (Outer Ring - Major) */}
              <path
                d={pathB}
                fill={fillB}
                stroke={strokeB}
                strokeWidth={isExactB ? 1.5 : 0.6}
                className={onSelectKey ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
                onClick={() => onSelectKey?.(keyB)}
              >
                <title>{`${keyB} (${CAMELOT_MAP[keyB]?.musicalKey})`}</title>
              </path>
              <text
                x={textPosB.x}
                y={textPosB.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={textFillB}
                className="font-mono text-[7px] font-semibold select-none pointer-events-none"
              >
                {keyB}
              </text>

              {/* Segmento A (Inner Ring - Minor) */}
              <path
                d={pathA}
                fill={fillA}
                stroke={strokeA}
                strokeWidth={isExactA ? 1.5 : 0.6}
                className={onSelectKey ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
                onClick={() => onSelectKey?.(keyA)}
              >
                <title>{`${keyA} (${CAMELOT_MAP[keyA]?.musicalKey})`}</title>
              </path>
              <text
                x={textPosA.x}
                y={textPosA.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={textFillA}
                className="font-mono text-[6.5px] font-semibold select-none pointer-events-none"
              >
                {keyA}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
