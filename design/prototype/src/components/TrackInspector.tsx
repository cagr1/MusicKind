import * as React from "react";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { CamelotWheel } from "@/src/components/CamelotWheel";
import { LargeWaveform } from "@/src/components/LargeWaveform";
import { CAMELOT_MAP, normalizeCamelot, getHarmonicMatches } from "@/src/utils/camelot";

export interface InspectorTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  filename?: string;
}

interface TrackInspectorProps {
  track: InspectorTrack | null;
  onKeyChange?: (newKey: string) => void;
  children?: React.ReactNode; // Datos secundarios específicos de cada vista
  className?: string;
}

export function TrackInspector({
  track,
  onKeyChange,
  children,
  className = "",
}: TrackInspectorProps) {
  if (!track) {
    return (
      <aside
        className={`w-[340px] shrink-0 border-l border-white/6 bg-[#09090b] flex flex-col items-center justify-center p-6 text-center text-zinc-500 select-none ${className}`}
      >
        <span className="text-[13px]">Ninguna pista seleccionada</span>
      </aside>
    );
  }

  const normKey = normalizeCamelot(track.key);
  const musicalKey = CAMELOT_MAP[normKey]?.musicalKey ?? "";
  const { exact, relative, minusOne, plusOne } = getHarmonicMatches(normKey);

  return (
    <aside
      className={`w-[340px] shrink-0 border-l border-white/6 bg-[#09090b] flex flex-col h-full overflow-hidden select-none ${className}`}
    >
      {/* Contenido con scroll y crossfade suave al cambiar de pista */}
      <div
        key={track.id}
        className="flex-1 overflow-y-auto p-5 space-y-6 transition-opacity duration-200 ease-out animate-in fade-in-50"
      >
        {/* Cabecera de la pista: Carátula 96px, Título 15px, Artista 13px */}
        <div className="flex flex-col items-center text-center gap-3">
          <TrackArtwork
            camelotKey={normKey}
            size={96}
            className="shadow-sm border border-white/6"
          />
          <div className="w-full px-2">
            <h2 className="text-[15px] font-semibold text-zinc-100 truncate leading-tight">
              {track.title}
            </h2>
            <p className="text-[13px] text-zinc-400 truncate mt-0.5">
              {track.artist}
            </p>
          </div>
        </div>

        {/* Lecturas grandes: BPM y Tonalidad a 40px en Geist Mono */}
        <div className="grid grid-cols-2 gap-3 py-2 px-3 rounded-[6px] bg-[#111113] border border-white/6">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              BPM
            </span>
            <span className="font-mono text-[40px] font-semibold text-zinc-100 tracking-tight tabular-nums leading-none mt-1">
              {track.bpm}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 mt-1">
              ±0.0% pitch
            </span>
          </div>

          <div className="flex flex-col border-l border-white/6 pl-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              KEY
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-mono text-[40px] font-semibold text-zinc-100 tracking-tight tabular-nums leading-none">
                {normKey}
              </span>
              <span className="font-mono text-[14px] text-zinc-400">
                {musicalKey}
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500 mt-1">
              {normKey.endsWith("A") ? "Minor (Menor)" : "Major (Mayor)"}
            </span>
          </div>
        </div>

        {/* Rueda Camelot de 120px + tonalidades compatibles */}
        <div className="flex flex-col items-center gap-3 p-3 rounded-[6px] bg-[#111113] border border-white/6">
          <div className="w-full flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Rueda armónica Camelot
            </span>
            <span className="text-[10px] font-mono text-zinc-500">120px</span>
          </div>

          <CamelotWheel
            currentKey={normKey}
            onSelectKey={onKeyChange}
            size={120}
          />

          {/* Fila de tonalidades compatibles: exact, relative, -1, +1 */}
          <div className="w-full pt-2 border-t border-white/6 flex items-center justify-between text-[11px] font-mono">
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-zinc-500 uppercase">Down</span>
              <span className="text-zinc-300 font-semibold">{minusOne}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-zinc-500 uppercase">Exact</span>
              <span className="text-[#F97316] font-bold">{exact}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-zinc-500 uppercase">Up</span>
              <span className="text-zinc-300 font-semibold">{plusOne}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-zinc-500 uppercase">Relat.</span>
              <span className="text-zinc-300 font-semibold">{relative}</span>
            </div>
          </div>
        </div>

        {/* Forma de onda grande 300x56 con playhead y tiempo mm:ss */}
        <div className="flex flex-col gap-1.5 p-3 rounded-[6px] bg-[#111113] border border-white/6">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Forma de onda & análisis
          </span>
          <LargeWaveform seed={track.id + track.title} />
        </div>

        {/* Datos secundarios específicos de cada vista */}
        {children && (
          <div className="space-y-4 pt-1">
            {children}
          </div>
        )}
      </div>
    </aside>
  );
}
