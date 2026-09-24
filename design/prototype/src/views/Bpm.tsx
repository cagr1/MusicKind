import * as React from "react";
import {
  Activity,
  Folder,
  Save,
  Check,
} from "lucide-react";
import { strings } from "@/src/strings";
import {
  MOCK_DJ_TRACKS,
  INITIAL_BPM_RESULTS,
  BpmTrackResult,
  runProcess,
  ProcessController,
} from "@/src/mocks";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { CamelotBadge } from "@/src/components/CamelotBadge";
import { MiniWaveform } from "@/src/components/MiniWaveform";
import { TrackInspector } from "@/src/components/TrackInspector";
import { CamelotWheel } from "@/src/components/CamelotWheel";
import { Button } from "@/src/components/ui/button";
import { Slider } from "@/src/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { toast } from "sonner";

interface BpmProps {
  onProcessUpdate?: (status: {
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }) => void;
}

export default function Bpm({ onProcessUpdate }: BpmProps) {
  const [results, setResults] = React.useState<BpmTrackResult[]>(INITIAL_BPM_RESULTS);
  // Rastreo de cambios por fila para saber cuáles han sido editados
  const [originalValues] = React.useState<Map<string, { bpm: number; key: string }>>(() => {
    const map = new Map<string, { bpm: number; key: string }>();
    INITIAL_BPM_RESULTS.forEach((r) => map.set(r.id, { bpm: r.bpm, key: r.key }));
    return map;
  });

  const [selectedTrackId, setSelectedTrackId] = React.useState<string>(
    results[0]?.id || "trk-01"
  );
  const [seconds, setSeconds] = React.useState<number[]>([60]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeRunningId, setActiveRunningId] = React.useState<string | null>(null);

  const [progress, setProgress] = React.useState({
    current: 8,
    total: 15,
    filename: "Vintage Culture - Weak.aiff",
    percent: 53,
  });

  const processRef = React.useRef<ProcessController | null>(null);
  const selectedTrack =
    results.find((t) => t.id === selectedTrackId) || results[0] || null;

  // Calcula cuántas filas tienen cambios pendientes respecto al original
  const modifiedTracks = React.useMemo(() => {
    return results.filter((trk) => {
      const orig = originalValues.get(trk.id);
      if (!orig) return false;
      return orig.bpm !== trk.bpm || orig.key !== trk.key;
    });
  }, [results, originalValues]);

  const handleStartAnalysis = () => {
    setIsRunning(true);
    toast(strings.bpm.toastStarted);

    onProcessUpdate?.({
      isRunning: true,
      name: strings.bpm.title,
      current: 1,
      total: 15,
    });

    processRef.current = runProcess<BpmTrackResult[]>(
      "bpm",
      MOCK_DJ_TRACKS.slice(0, 15),
      {
        onProgress(prog) {
          setProgress(prog);
          const target = results[prog.current - 1];
          if (target) setActiveRunningId(target.id);
          onProcessUpdate?.({
            isRunning: true,
            name: strings.bpm.title,
            current: prog.current,
            total: prog.total,
          });
        },
        onResult(data) {
          setIsRunning(false);
          setActiveRunningId(null);
          setResults(data);
          toast.success(strings.bpm.toastCompleted);
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
    onProcessUpdate?.({
      isRunning: false,
      name: "",
      current: 0,
      total: 0,
    });
  };

  const handleBpmChange = (trackId: string, val: string) => {
    const parsed = parseInt(val, 10);
    setResults((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, bpm: isNaN(parsed) ? t.bpm : parsed } : t))
    );
  };

  const handleKeyChange = (trackId: string, newKey: string) => {
    setResults((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, key: newKey } : t))
    );
  };

  const handleSaveRow = (trackId: string) => {
    const trk = results.find((t) => t.id === trackId);
    if (trk) {
      originalValues.set(trackId, { bpm: trk.bpm, key: trk.key });
      // Provocar re-render de modifiedTracks
      setResults([...results]);
      toast.success(strings.bpm.toastRowSaved);
    }
  };

  const handleSaveAll = () => {
    results.forEach((trk) => {
      originalValues.set(trk.id, { bpm: trk.bpm, key: trk.key });
    });
    setResults([...results]);
    toast.success(strings.bpm.toastAllSaved);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#09090b]">
      {/* PANEL CENTRAL: Tabla con padding lateral 24px */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior de 44px */}
        <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] relative">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
              {strings.bpm.title}
            </h1>
            <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
              {results.length} pistas
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

            {/* Botón "Guardar {count} cambios" si hay modificaciones pendientes */}
            {modifiedTracks.length > 0 && !isRunning && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAll}
                className="h-7 text-[12px] font-mono border-white/6 bg-[#18181b] hover:bg-[#202024] text-zinc-200"
              >
                <Save className="w-3.5 h-3.5 mr-1.5 text-[#F97316]" />
                Guardar {modifiedTracks.length} cambios
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
              {strings.bpm.analyze}
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

        {/* Barra de opciones de BPM */}
        <div className="h-[40px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] text-[12px]">
          <div className="flex items-center gap-2 text-zinc-400">
            <Folder className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-mono text-[11px] text-zinc-300">
              /Users/dj/Music/DJ_Promos_2026
            </span>
          </div>

          {/* Selector de segundos de análisis */}
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-zinc-400">
              {strings.bpm.secondsLabel}:
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

        {/* TABLA CON 5 COLUMNAS MÁXIMO (Padding lateral 24px = px-6, Filas 44px) */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#09090b] z-10 border-b border-white/6">
              <tr className="h-8 text-[11px] font-normal uppercase text-zinc-500 select-none tracking-[0.06em]">
                <th className="w-10 text-center font-normal">#</th>
                <th className="w-[50%] font-normal pl-2">{strings.bpm.tableTrack}</th>
                <th className="w-24 font-normal pl-2">{strings.bpm.tableBpm}</th>
                <th className="w-24 font-normal pl-2">{strings.bpm.tableKey}</th>
                <th className="w-auto font-normal pl-2 text-right pr-2">
                  {strings.bpm.tableActions}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((trk, idx) => {
                const isSelected = trk.id === selectedTrackId;
                const isRowProcessing = trk.id === activeRunningId;

                // Comprobamos si esta fila fue modificada
                const orig = originalValues.get(trk.id);
                const isRowModified = orig ? orig.bpm !== trk.bpm || orig.key !== trk.key : false;

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

                    {/* Columna 2: Pista (Carátula 32px + 2 líneas + MiniWaveform 64x20) */}
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

                        {/* Forma de onda 64x20 */}
                        <MiniWaveform
                          seed={trk.id}
                          isSelected={isSelected}
                          className="shrink-0"
                        />
                      </div>
                    </td>

                    {/* Columna 3: BPM editable como texto mono directo sin flechas, borde solo en hover/foco */}
                    <td className="w-24 pl-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        value={trk.bpm}
                        onChange={(e) => handleBpmChange(trk.id, e.target.value)}
                        className="w-16 h-7 px-1.5 rounded-[4px] font-mono text-[13px] text-zinc-100 tabular-nums bg-transparent border border-transparent hover:border-white/10 focus:border-[#F97316] focus:bg-[#18181b] focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Columna 4: Key (El chip Camelot ES el control: clic -> Popover con rueda Camelot) */}
                    <td className="w-24 pl-2" onClick={(e) => e.stopPropagation()}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <div>
                            <CamelotBadge
                              camelotKey={trk.key}
                              interactive
                            />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto p-3 bg-[#111113] border-white/6 flex flex-col items-center gap-2"
                        >
                          <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                            Seleccionar tonalidad Camelot
                          </span>
                          <CamelotWheel
                            currentKey={trk.key}
                            onSelectKey={(newKey) => handleKeyChange(trk.id, newKey)}
                            size={140}
                          />
                        </PopoverContent>
                      </Popover>
                    </td>

                    {/* Columna 5: Acción Guardar visible SOLO si hay cambios en esa fila */}
                    <td className="pl-2 pr-2 text-right">
                      {isRowModified ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRow(trk.id);
                          }}
                          className="h-6 px-2 text-[11px] font-mono text-[#F97316] hover:bg-[#F97316]/10 hover:text-[#ea580c]"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {strings.bpm.saveRow}
                        </Button>
                      ) : (
                        <Check className="w-3.5 h-3.5 text-zinc-600 inline-block opacity-40 mr-2" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PANEL DERECHO: Inspector de 340px */}
      <TrackInspector
        track={selectedTrack}
        onKeyChange={(newKey) => {
          if (selectedTrack) handleKeyChange(selectedTrack.id, newKey);
        }}
      >
        {selectedTrack && (
          <div className="space-y-3 pt-2">
            {/* Detalles de beatgrid y detección de tempo */}
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-2 text-[12px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {strings.bpm.inspectorBeatgrid}
              </span>

              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{strings.bpm.originalBpmLabel}</span>
                  <span className="text-zinc-300 tabular-nums">
                    {originalValues.get(selectedTrack.id)?.bpm ?? selectedTrack.bpm} BPM
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{strings.bpm.currentBpmLabel}</span>
                  <span className="text-[#F97316] font-semibold tabular-nums">
                    {selectedTrack.bpm} BPM
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-white/6">
                  <span className="text-zinc-500">Confianza de fase</span>
                  <span className="text-emerald-400">99.4% (Locked)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  );
}
