import * as React from "react";
import {
  Activity,
  Folder,
  Sliders,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { strings } from "@/src/strings";
import {
  MOCK_DJ_TRACKS,
  INITIAL_SET_RESULTS,
  SetTrackResult,
  runProcess,
  ProcessController,
} from "@/src/mocks";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { CamelotBadge } from "@/src/components/CamelotBadge";
import { TrackInspector } from "@/src/components/TrackInspector";
import { Button } from "@/src/components/ui/button";
import { Slider } from "@/src/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { toast } from "sonner";

interface SetsProps {
  onProcessUpdate?: (status: {
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }) => void;
}

export default function Sets({ onProcessUpdate }: SetsProps) {
  const [results, setResults] = React.useState<SetTrackResult[]>(INITIAL_SET_RESULTS);
  const [selectedTrackId, setSelectedTrackId] = React.useState<string>(
    results[0]?.id || "trk-01"
  );
  const [seconds, setSeconds] = React.useState<number[]>([60]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeRunningId, setActiveRunningId] = React.useState<string | null>(null);

  const [progress, setProgress] = React.useState({
    current: 8,
    total: 16,
    filename: "Adam Ten, Mita Gami - The Beat.wav",
    percent: 50,
  });

  const processRef = React.useRef<ProcessController | null>(null);
  const selectedTrack =
    results.find((t) => t.id === selectedTrackId) || results[0] || null;

  // Agrupamiento por sección: Warmup, Peak, Closing
  const groupedSections = React.useMemo(() => {
    const sections: Array<{
      key: "Warmup" | "Peak" | "Closing";
      title: string;
      tracks: SetTrackResult[];
      minBpm: number;
      maxBpm: number;
    }> = [
      { key: "Warmup", title: strings.sets.warmupSectionHeader, tracks: [], minBpm: 999, maxBpm: 0 },
      { key: "Peak", title: strings.sets.peakSectionHeader, tracks: [], minBpm: 999, maxBpm: 0 },
      { key: "Closing", title: strings.sets.closingSectionHeader, tracks: [], minBpm: 999, maxBpm: 0 },
    ];

    results.forEach((trk) => {
      const sec = sections.find((s) => s.key === trk.bestSection);
      if (sec) {
        sec.tracks.push(trk);
        if (trk.bpm < sec.minBpm) sec.minBpm = trk.bpm;
        if (trk.bpm > sec.maxBpm) sec.maxBpm = trk.bpm;
      }
    });

    return sections.filter((s) => s.tracks.length > 0);
  }, [results]);

  // Lista aplanada para visualización y curva de energía
  const sortedTracks = React.useMemo(() => {
    return groupedSections.flatMap((s) => s.tracks);
  }, [groupedSections]);

  const handleStartAnalysis = () => {
    setIsRunning(true);
    toast(strings.sets.toastStarted);

    onProcessUpdate?.({
      isRunning: true,
      name: strings.sets.title,
      current: 1,
      total: 16,
    });

    processRef.current = runProcess<SetTrackResult[]>(
      "sets",
      MOCK_DJ_TRACKS.slice(0, 16),
      {
        onProgress(prog) {
          setProgress(prog);
          const target = results[prog.current - 1];
          if (target) setActiveRunningId(target.id);
          onProcessUpdate?.({
            isRunning: true,
            name: strings.sets.title,
            current: prog.current,
            total: prog.total,
          });
        },
        onResult(data) {
          setIsRunning(false);
          setActiveRunningId(null);
          setResults(data);
          toast.success(strings.sets.toastCompleted);
          onProcessUpdate?.({
            isRunning: false,
            name: "",
            current: 0,
            total: 0,
          });
        },
        onError(err) {
          setIsRunning(false);
          setActiveRunningId(null);
          toast.error(err);
          onProcessUpdate?.({
            isRunning: false,
            name: "",
            current: 0,
            total: 0,
          });
        },
      },
      { stepDelayMs: 400 }
    );
  };

  const handleCancel = () => {
    if (processRef.current) {
      processRef.current.cancel();
      processRef.current = null;
    }
    setIsRunning(false);
    setActiveRunningId(null);
    toast(strings.sets.toastCanceled);
    onProcessUpdate?.({
      isRunning: false,
      name: "",
      current: 0,
      total: 0,
    });
  };

  // Puntos para la curva de energía SVG de 64px de alto
  const curvePoints = React.useMemo(() => {
    if (sortedTracks.length === 0) return { path: "", points: [] };
    const width = 640;
    const height = 64;
    const paddingX = 24;
    const paddingY = 12;
    const usableW = width - paddingX * 2;
    const usableH = height - paddingY * 2;

    const pts = sortedTracks.map((trk, i) => {
      const x = paddingX + (i / Math.max(1, sortedTracks.length - 1)) * usableW;
      const energy =
        trk.bestSection === "Warmup"
          ? trk.warmupScore
          : trk.bestSection === "Peak"
          ? trk.peakScore
          : trk.closingScore;
      const y = height - paddingY - (energy / 100) * usableH;
      return { x, y, trk, energy };
    });

    const path = pts.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, "");

    return { path, points: pts };
  }, [sortedTracks]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#09090b]">
      {/* PANEL CENTRAL: Tabla con padding lateral 24px */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior de 44px */}
        <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] relative">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
              {strings.sets.title}
            </h1>
            <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
              {results.length} pistas clasificadas
            </span>
          </div>

          {/* Estado mientras corre */}
          {isRunning && (
            <div className="flex items-center gap-2 text-[12px] font-mono text-zinc-400">
              <span className="text-zinc-200 font-semibold tabular-nums">
                {progress.current}/{progress.total}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="truncate max-w-[240px] text-zinc-400">
                {progress.filename}
              </span>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="h-7 text-[12px] border-white/6 hover:bg-white/5 text-zinc-300"
              >
                {strings.common.cancel}
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={handleStartAnalysis}
              disabled={isRunning}
              className="h-7 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              {strings.sets.analyze}
            </Button>
          </div>

          {/* Barra de progreso de 2px adherida */}
          {isRunning && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/6 overflow-hidden">
              <div
                style={{ width: `${progress.percent}%` }}
                className="h-full bg-[#F97316] transition-all duration-300 ease-out"
              />
            </div>
          )}
        </div>

        {/* Barra de opciones de análisis de sets */}
        <div className="h-[40px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] text-[12px]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <Folder className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-mono text-[11px] text-zinc-300">
                /Music/Promos/Weekend_Pack
              </span>
            </div>
          </div>

          {/* Selector de segundos */}
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-zinc-400">
              {strings.sets.secondsLabel}:
            </span>
            <div className="w-24">
              <Slider
                value={seconds}
                onValueChange={setSeconds}
                min={30}
                max={120}
                step={15}
                className="[&_.range-thumb]:h-3 [&_.range-thumb]:w-3"
              />
            </div>
            <span className="font-mono text-[11px] text-zinc-300 w-8 tabular-nums">
              {seconds[0]}s
            </span>
          </div>
        </div>

        {/* Encima de la tabla: Curva de energía del set (Línea SVG 1px, 64px alto) */}
        <div className="px-6 py-2 border-b border-white/6 bg-[#09090b] shrink-0">
          <div className="flex items-center justify-between mb-1 text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-zinc-500 text-[10px]">
              {strings.sets.energyCurveTitle}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              Dinámica de sesión: 120 → 130 BPM
            </span>
          </div>

          <div className="relative w-full h-[64px] rounded-[6px] bg-[#111113] border border-white/6 overflow-hidden">
            <svg
              width="100%"
              height="64"
              viewBox="0 0 640 64"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              {/* Líneas guía sutiles */}
              <line x1="0" y1="16" x2="640" y2="16" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="32" x2="640" y2="32" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="48" x2="640" y2="48" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

              {/* Curva de 1px */}
              <path
                d={curvePoints.path}
                fill="none"
                stroke="#F97316"
                strokeWidth="1"
                className="transition-all duration-300"
              />

              {/* Puntos para cada pista */}
              {curvePoints.points.map((pt) => {
                const isSelected = pt.trk.id === selectedTrackId;
                return (
                  <circle
                    key={pt.trk.id}
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 4 : 2.5}
                    fill={isSelected ? "#F97316" : "#111113"}
                    stroke="#F97316"
                    strokeWidth={isSelected ? 2 : 1}
                    className="cursor-pointer transition-all hover:scale-150"
                    onClick={() => setSelectedTrackId(pt.trk.id)}
                  >
                    <title>{`${pt.trk.title} (${pt.energy}%)`}</title>
                  </circle>
                );
              })}
            </svg>
          </div>
        </div>

        {/* TABLA CON AGRUPACIÓN STICKY POR SECCIÓN (Padding lateral 24px = px-6, 5 columnas) */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#09090b] z-20 border-b border-white/6">
              <tr className="h-8 text-[11px] font-normal uppercase text-zinc-500 select-none tracking-[0.06em]">
                <th className="w-10 text-center font-normal">#</th>
                <th className="w-[50%] font-normal pl-2">{strings.sets.tableTrack}</th>
                <th className="w-20 font-normal pl-2">{strings.sets.tableBpm}</th>
                <th className="w-20 font-normal pl-2">{strings.sets.tableKey}</th>
                <th className="w-auto font-normal pl-2">{strings.sets.tableSection}</th>
              </tr>
            </thead>
            <tbody>
              {groupedSections.map((sec) => (
                <React.Fragment key={sec.key}>
                  {/* Encabezado sticky de sección: "WARMUP 5 · 121–124 BPM" */}
                  <tr className="sticky top-8 bg-[#111113]/95 backdrop-blur z-10 border-y border-white/6 h-7 text-[11px] font-mono text-zinc-400 select-none">
                    <td colSpan={5} className="px-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-200 tracking-wider">
                          {sec.title} {sec.tracks.length} · {sec.minBpm}–{sec.maxBpm} BPM
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase">
                          {sec.key === "Warmup"
                            ? "Apertura & Tono"
                            : sec.key === "Peak"
                            ? "Hora Clímax"
                            : "Cierre & Bajada"}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Pistas de esta sección */}
                  {sec.tracks.map((trk, idx) => {
                    const isSelected = trk.id === selectedTrackId;
                    const isRowProcessing = trk.id === activeRunningId;
                    const winnerScore =
                      trk.bestSection === "Warmup"
                        ? trk.warmupScore
                        : trk.bestSection === "Peak"
                        ? trk.peakScore
                        : trk.closingScore;

                    return (
                      <tr
                        key={trk.id}
                        onClick={() => setSelectedTrackId(trk.id)}
                        className={`h-[44px] transition-colors duration-150 cursor-pointer select-none group ${
                          isSelected
                            ? "bg-white/[0.05] border-l-2 border-[#F97316]"
                            : "hover:bg-white/[0.03] border-l-2 border-transparent"
                        }`}
                      >
                        {/* Columna 1: # */}
                        <td className="w-10 text-center font-mono text-[12px] text-zinc-500 tabular-nums">
                          {isRowProcessing ? (
                            <span className="w-2 h-2 rounded-full bg-[#F97316] inline-block animate-pulse" />
                          ) : (
                            String(idx + 1).padStart(2, "0")
                          )}
                        </td>

                        {/* Columna 2: Pista (Carátula 32px + 2 líneas) */}
                        <td className="pl-2 pr-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <TrackArtwork camelotKey={trk.key} size={32} />
                            <div className="flex-1 min-w-0 flex flex-col justify-center leading-tight">
                              <span className="text-[13px] font-medium text-zinc-100 truncate">
                                {trk.title}
                              </span>
                              <span className="text-[12px] text-zinc-500 truncate mt-0.5">
                                {trk.artist}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Columna 3: BPM */}
                        <td className="w-20 pl-2 font-mono text-[13px] text-zinc-200 tabular-nums">
                          {trk.bpm}
                        </td>

                        {/* Columna 4: Key */}
                        <td className="w-20 pl-2">
                          <CamelotBadge camelotKey={trk.key} />
                        </td>

                        {/* Columna 5: Medidor de 3 segmentos (W/P/C) de 72px + número del ganador */}
                        <td className="pl-2 pr-3">
                          <div className="flex items-center gap-2.5">
                            {/* Medidor de 72px con 3 segmentos W / P / C */}
                            <div
                              className="w-[72px] h-[7px] flex gap-[2px] rounded-[2px] bg-black/40 p-[1px] border border-white/6"
                              title={`Warmup: ${trk.warmupScore}% | Peak: ${trk.peakScore}% | Closing: ${trk.closingScore}%`}
                            >
                              {/* W (Warmup) */}
                              <div
                                className={`flex-1 rounded-[1px] transition-colors ${
                                  trk.bestSection === "Warmup"
                                    ? "bg-[#F97316]"
                                    : "bg-zinc-700/60"
                                }`}
                              />
                              {/* P (Peak) */}
                              <div
                                className={`flex-1 rounded-[1px] transition-colors ${
                                  trk.bestSection === "Peak"
                                    ? "bg-[#F97316]"
                                    : "bg-zinc-700/60"
                                }`}
                              />
                              {/* C (Closing) */}
                              <div
                                className={`flex-1 rounded-[1px] transition-colors ${
                                  trk.bestSection === "Closing"
                                    ? "bg-[#F97316]"
                                    : "bg-zinc-700/60"
                                }`}
                              />
                            </div>

                            {/* Número del ganador */}
                            <span className="font-mono text-[11px] font-semibold text-zinc-200 tabular-nums w-8 text-right">
                              {winnerScore}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PANEL DERECHO: Inspector de 340px */}
      <TrackInspector track={selectedTrack}>
        {selectedTrack && (
          <div className="space-y-3 pt-2">
            {/* Desglose de scores Warmup / Peak / Closing */}
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {strings.sets.energyAnalysis}
              </span>

              <div className="space-y-2 text-[12px]">
                {/* Warmup */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Warmup</span>
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {selectedTrack.warmupScore}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/6 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${selectedTrack.warmupScore}%` }}
                      className={`h-full ${
                        selectedTrack.bestSection === "Warmup"
                          ? "bg-[#F97316]"
                          : "bg-zinc-700"
                      }`}
                    />
                  </div>
                </div>

                {/* Peak */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Peak (Hora Pico)</span>
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {selectedTrack.peakScore}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/6 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${selectedTrack.peakScore}%` }}
                      className={`h-full ${
                        selectedTrack.bestSection === "Peak"
                          ? "bg-[#F97316]"
                          : "bg-zinc-700"
                      }`}
                    />
                  </div>
                </div>

                {/* Closing */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Closing (Cierre)</span>
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {selectedTrack.closingScore}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/6 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${selectedTrack.closingScore}%` }}
                      className={`h-full ${
                        selectedTrack.bestSection === "Closing"
                          ? "bg-[#F97316]"
                          : "bg-zinc-700"
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Recomendación de set */}
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {strings.sets.recommendationLabel}
                </span>
              </div>
              <p className="text-zinc-300 text-[12px] leading-relaxed">
                {selectedTrack.bestSection === "Peak"
                  ? `Pista con alto impacto rítmico (${selectedTrack.bpm} BPM) y energía superior. Óptima para la hora culminante del set.`
                  : selectedTrack.bestSection === "Warmup"
                  ? `Construcción melódica y tempo moderado (${selectedTrack.bpm} BPM). Perfecta para calentar la pista en la primera hora.`
                  : `Texturas envolventes y tempo controlado (${selectedTrack.bpm} BPM). Idónea para la transición hacia el cierre.`}
              </p>
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  );
}
