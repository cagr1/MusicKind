import * as React from "react";

interface MiniWaveformProps {
  seed?: string | number;
  isSelected?: boolean;
  className?: string;
}

export function MiniWaveform({
  seed = 1,
  isSelected = false,
  className = "",
}: MiniWaveformProps) {
  // Genera barras deterministas basadas en el seed (64px de ancho, 20px de alto)
  const bars = React.useMemo(() => {
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const count = 18; // 18 barras en 64px (2px barra + 1.5px gap)
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      const pseudo = Math.abs(Math.sin((hash + i * 37) * 0.28));
      // Altura entre 3px y 18px
      const height = Math.max(3, Math.round(pseudo * 17));
      result.push(height);
    }
    return result;
  }, [seed]);

  const barColor = isSelected ? "#F97316" : "#52525b";

  return (
    <svg
      width="64"
      height="20"
      viewBox="0 0 64 20"
      className={`shrink-0 transition-colors duration-150 ${className}`}
      aria-hidden="true"
    >
      {bars.map((h, i) => {
        const x = i * 3.5 + 1.5;
        const y = (20 - h) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="2"
            height={h}
            rx="0.75"
            fill={barColor}
            className="transition-colors duration-150"
          />
        );
      })}
    </svg>
  );
}
