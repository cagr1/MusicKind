import * as React from "react";
import { Play, Pause } from "lucide-react";

interface LargeWaveformProps {
  seed?: string | number;
  durationSeconds?: number;
  className?: string;
}

export function LargeWaveform({
  seed = "trk",
  durationSeconds = 348, // 5m 48s por defecto
  className = "",
}: LargeWaveformProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0.38); // 38% por defecto (~02:12)

  // Intervalo de reproducción suave
  React.useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((p) => (p >= 1 ? 0 : p + 0.005));
    }, 150);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Generación determinista de 66 barras en 300px de ancho y 56px de alto
  const bars = React.useMemo(() => {
    let hash = 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const count = 66; // 66 barras * 4.5px = ~297px
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      // Perfil de energía musical con breakdowns y drops
      const pos = i / count;
      const energyProfile =
        0.3 +
        0.5 * Math.sin(pos * Math.PI) +
        0.2 * Math.sin(pos * Math.PI * 4);
      const noise = Math.abs(Math.sin((hash + i * 29) * 0.42));
      const val = Math.max(0.12, Math.min(0.98, energyProfile * 0.7 + noise * 0.3));
      const height = Math.round(val * 48);
      result.push(height);
    }
    return result;
  }, [seed]);

  const currentSeconds = Math.round(progress * durationSeconds);
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleWaveformClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProg = Math.max(0, Math.min(1, clickX / rect.width));
    setProgress(newProg);
  };

  return (
    <div className={`w-[300px] flex flex-col gap-1.5 select-none ${className}`}>
      {/* Contenedor SVG de la forma de onda de 300x56 */}
      <div className="relative w-[300px] h-[56px] rounded-[6px] bg-[#111113] border border-white/6 overflow-hidden flex items-center">
        <svg
          width="300"
          height="56"
          viewBox="0 0 300 56"
          onClick={handleWaveformClick}
          className="w-full h-full cursor-pointer"
        >
          {bars.map((h, idx) => {
            const x = idx * 4.5 + 2;
            const y = (56 - h) / 2;
            const barProgress = idx / bars.length;
            const isPassed = barProgress <= progress;
            const barFill = isPassed ? "#d4d4d8" : "#3f3f46";

            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width="2.5"
                height={h}
                rx="1"
                fill={barFill}
              />
            );
          })}

          {/* Línea del playhead a través de la onda */}
          <line
            x1={progress * 300}
            y1={0}
            x2={progress * 300}
            y2={56}
            stroke="#F97316"
            strokeWidth="1.5"
          />
        </svg>

        {/* Botón flotante Play/Pause al posar el cursor o visible */}
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className="absolute left-2 bottom-2 w-6 h-6 rounded-full bg-black/70 hover:bg-[#F97316] text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
        >
          {isPlaying ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 fill-current ml-0.5" />
          )}
        </button>
      </div>

      {/* Lectura de tiempo mm:ss en mono */}
      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-400 px-0.5">
        <span className="text-zinc-200 font-medium">
          {formatTime(currentSeconds)}
        </span>
        <span className="text-zinc-500">
          {formatTime(durationSeconds)}
        </span>
      </div>
    </div>
  );
}
