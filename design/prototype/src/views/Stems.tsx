import * as React from "react";
import {
  Split,
  Play,
  Pause,
  FolderOpen,
  Volume2,
  VolumeX,
  Mic,
  Music,
  Disc,
} from "lucide-react";
import { strings } from "@/src/strings";
import {
  MOCK_DJ_TRACKS,
  INITIAL_STEMS_RESULT,
  StemsResult,
  runProcess,
  ProcessController,
} from "@/src/mocks";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { CamelotBadge } from "@/src/components/CamelotBadge";
import { Button } from "@/src/components/ui/button";
import { Slider } from "@/src/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { toast } from "sonner";

interface StemsProps {
  onProcessUpdate?: (status: {
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }) => void;
}

export default function Stems({ onProcessUpdate }: StemsProps) {
  const [results, setResults] = React.useState<StemsResult>(INITIAL_STEMS_RESULT);
  const [targetFormat, setTargetFormat] = React.useState<"WAV" | "MP3">("WAV");
  const [isRunning, setIsRunning] = React.useState(false);

  // Estado del DAW: reproducción global y playhead sincronizado
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playheadPos, setPlayheadPos] = React.useState(0.24); // 24% del track

  // Canales del DAW: Mute, Solo y Volumen
  const [lanes, setLanes] = React.useState({
    original: { mute: false, solo: false, volume: 85 },
    vocals: { mute: false, solo: false, volume: 100 },
    instrumental: { mute: false, solo: false, volume: 90 },
  });

  const [progress, setProgress] = React.useState({
    current: 1,
    total: 1,
    filename: results.sourceFile,
    percent: 65,
  });

  const processRef = React.useRef<ProcessController | null>(null);

  // Reloj de reproducción suave para mover el playhead conjunto
  React.useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setPlayheadPos((prev) => (prev >= 1 ? 0 : prev + 0.003));
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleStartSeparation = () => {
    setIsRunning(true);
    toast(strings.stems.toastStarted);

    onProcessUpdate?.({
      isRunning: true,
      name: strings.stems.title,
      current: 1,
      total: 1,
    });

    processRef.current = runProcess<StemsResult>(
      "stems",
      [MOCK_DJ_TRACKS[0]],
      {
        onProgress(prog) {
          setProgress(prog);
          onProcessUpdate?.({
            isRunning: true,
            name: strings.stems.title,
            current: prog.current,
            total: prog.total,
          });
        },
        onResult(data) {
          setIsRunning(false);
          setResults({
            ...data,
            format: targetFormat,
            vocalsPath: `/Output/Stems/${results.sourceFile.replace(/\.[^.]+$/, "")}_(Vocals).${targetFormat.toLowerCase()}`,
            instrumentalPath: `/Output/Stems/${results.sourceFile.replace(/\.[^.]+$/, "")}_(Instrumental).${targetFormat.toLowerCase()}`,
          });
          toast.success(strings.stems.toastCompleted);
          onProcessUpdate?.({
            isRunning: false,
            name: "",
            current: 0,
            total: 0,
          });
        },
        onError(err) {
          setIsRunning(false);
          toast.error(err);
          onProcessUpdate?.({
            isRunning: false,
            name: "",
            current: 0,
            total: 0,
          });
        },
      },
      { stepDelayMs: 600 }
    );
  };

  const handleCancel = () => {
    if (processRef.current) {
      processRef.current.cancel();
      processRef.current = null;
    }
    setIsRunning(false);
    toast(strings.stems.toastCanceled);
    onProcessUpdate?.({
      isRunning: false,
      name: "",
      current: 0,
      total: 0,
    });
  };

  const toggleMute = (laneKey: "original" | "vocals" | "instrumental") => {
    setLanes((prev) => ({
      ...prev,
      [laneKey]: { ...prev[laneKey], mute: !prev[laneKey].mute },
    }));
  };

  const toggleSolo = (laneKey: "original" | "vocals" | "instrumental") => {
    setLanes((prev) => ({
      ...prev,
      [laneKey]: { ...prev[laneKey], solo: !prev[laneKey].solo },
    }));
  };

  const changeVolume = (
    laneKey: "original" | "vocals" | "instrumental",
    val: number[]
  ) => {
    setLanes((prev) => ({
      ...prev,
      [laneKey]: { ...prev[laneKey], volume: val[0] },
    }));
  };

  const totalSeconds = 348;
  const currentSeconds = Math.round(playheadPos * totalSeconds);
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Marcadores de tiempo para la regla: 0:00, 0:30, 1:00... hasta 5:30
  const timeMarkers = [
    "0:00",
    "0:30",
    "1:00",
    "1:30",
    "2:00",
    "2:30",
    "3:00",
    "3:30",
    "4:00",
    "4:30",
    "5:00",
    "5:30",
  ];

  // Generación determinista de formas de onda para cada carril
  const generateLaneBars = (_seedPrefix: string, _color: string, activeMultiplier: number) => {
    const count = 120;
    const bars = [];
    for (let i = 0; i < count; i++) {
      const pos = i / count;
      const wave = Math.sin(pos * Math.PI * 4) * 0.4 + 0.5;
      const noise = Math.abs(Math.sin((i * 13 + 7) * 0.35));
      const h = Math.max(4, Math.round((wave * 0.6 + noise * 0.4) * 56 * activeMultiplier));
      bars.push(h);
    }
    return bars;
  };

  const originalBars = React.useMemo(() => generateLaneBars("orig", "#71717a", 1), []);
  const vocalsBars = React.useMemo(() => generateLaneBars("voc", "#F97316", 0.85), []);
  const instrumentalBars = React.useMemo(() => generateLaneBars("inst", "#d4d4d8", 0.95), []);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPos = Math.max(0, Math.min(1, clickX / rect.width));
    setPlayheadPos(newPos);
  };

  const originalPath = `/Music/Promos/${results.sourceFile}`;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#09090b]">
      {/* Barra superior de 44px */}
      <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] relative">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
            {strings.stems.title}
          </h1>
          <span className="text-[12px] text-zinc-500 font-mono">
            Demucs v4 Hybrid Separation
          </span>
        </div>

        {/* Estado mientras corre */}
        {isRunning && (
          <div className="flex items-center gap-2 text-[12px] font-mono text-zinc-400">
            <span className="text-zinc-200 font-semibold tabular-nums">
              {progress.percent}%
            </span>
            <span className="text-zinc-600">·</span>
            <span className="truncate max-w-[240px] text-zinc-400">
              Separando pistas estéreo...
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
            onClick={handleStartSeparation}
            disabled={isRunning}
            className="h-7 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
          >
            <Split className="w-3.5 h-3.5 mr-1.5" />
            {strings.stems.separate}
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

      {/* Cabecera de la pista original: Carátula 48px, título, BPM y Key */}
      <div className="px-6 py-3 border-b border-white/6 flex items-center justify-between bg-[#111113]/50 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <TrackArtwork camelotKey="8A" size={48} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-zinc-100 truncate">
                {results.title}
              </span>
              <CamelotBadge camelotKey="8A" />
            </div>
            <div className="flex items-center gap-3 text-[12px] text-zinc-400 mt-0.5">
              <span>{results.artist}</span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono text-zinc-300">122 BPM</span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono text-zinc-500">{results.sourceFile}</span>
            </div>
          </div>
        </div>

        {/* Selector de formato de salida y controles de transporte */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-zinc-500">{strings.stems.formatLabel}:</span>
            <Select
              value={targetFormat}
              onValueChange={(v: "WAV" | "MP3") => setTargetFormat(v)}
            >
              <SelectTrigger className="h-7 text-[11px] font-mono border-white/6 bg-[#18181b] w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#18181b] border-white/6 text-[11px]">
                <SelectItem value="WAV">WAV 24-bit</SelectItem>
                <SelectItem value="MP3">MP3 320k</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Botón Play/Pause global y cronómetro */}
          <div className="flex items-center gap-2 pl-4 border-l border-white/6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-8 w-8 rounded-full border-white/10 bg-[#18181b] hover:bg-[#F97316] text-white transition-colors cursor-pointer"
              aria-label={isPlaying ? "Pausar DAW" : "Reproducir DAW"}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </Button>

            <span className="font-mono text-[13px] text-zinc-200 tabular-nums">
              {formatTime(currentSeconds)}
            </span>
            <span className="text-zinc-600 font-mono text-[12px]">/</span>
            <span className="font-mono text-[12px] text-zinc-500 tabular-nums">
              {formatTime(totalSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* ÁREA DE TRABAJO DAW: Regla de tiempo y 3 carriles de ancho completo (72px alto cada uno) */}
      <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-2 select-none">
        {/* Regla de tiempo arriba (0:00, 0:30, 1:00...) */}
        <div className="flex items-center h-5 text-[10px] font-mono text-zinc-500 pl-[180px] pr-2 border-b border-white/6 relative">
          {timeMarkers.map((marker, idx) => (
            <div
              key={marker}
              style={{ left: `${(idx / (timeMarkers.length - 1)) * 100}%` }}
              className="absolute -translate-x-1/2 flex flex-col items-center"
            >
              <span>{marker}</span>
              <div className="h-1 w-px bg-white/10" />
            </div>
          ))}
        </div>

        {/* Contenedor relativo de los 3 carriles con playhead vertical continuo */}
        <div className="relative flex-1 flex flex-col space-y-2">
          {/* LÍNEA DE PLAYHEAD GLOBAL (A través de los tres carriles) */}
          <div
            style={{
              left: `calc(180px + (100% - 180px) * ${playheadPos})`,
            }}
            className="absolute top-0 bottom-0 w-[1.5px] bg-[#F97316] z-30 pointer-events-none transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(249,115,22,0.6)]"
          >
            {/* Cabezal triangular superior */}
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-[#F97316] -ml-[3.25px]" />
          </div>

          {/* CARRIL 1: Original (zinc-500) */}
          <div className="h-[72px] rounded-[6px] bg-[#111113] border border-white/6 flex items-center overflow-hidden group">
            {/* Controles del carril a la izquierda (180px) */}
            <div className="w-[180px] h-full shrink-0 px-3 py-2 border-r border-white/6 flex flex-col justify-between bg-[#111113] z-20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                  <Disc className="w-3.5 h-3.5 text-zinc-500" />
                  {strings.stems.originalCardTitle}
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toast.info(`Ubicación: ${originalPath}`)}
                      className="h-5 w-5 text-zinc-500 hover:text-zinc-200"
                    >
                      <FolderOpen className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mostrar original en carpeta</TooltipContent>
                </Tooltip>
              </div>

              {/* Botones Mute / Solo y Slider de volumen */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleMute("original")}
                  className={`w-5 h-5 rounded-[3px] text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer transition-colors ${
                    lanes.original.mute
                      ? "bg-red-500 text-white"
                      : "bg-[#18181b] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => toggleSolo("original")}
                  className={`w-5 h-5 rounded-[3px] text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer transition-colors ${
                    lanes.original.solo
                      ? "bg-[#F97316] text-white"
                      : "bg-[#18181b] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  S
                </button>

                <div className="flex-1 px-1">
                  <Slider
                    value={[lanes.original.volume]}
                    onValueChange={(val) => changeVolume("original", val)}
                    max={100}
                    step={1}
                    className="[&_.range-thumb]:h-2.5 [&_.range-thumb]:w-2.5"
                  />
                </div>
              </div>
            </div>

            {/* Forma de onda completa en zinc-500 (72px alto) */}
            <div
              onClick={handleTimelineClick}
              className={`flex-1 h-full flex items-center px-4 cursor-pointer relative overflow-hidden transition-opacity ${
                lanes.original.mute ? "opacity-30" : "opacity-100"
              }`}
            >
              <div className="w-full h-full flex items-center justify-between gap-[2px]">
                {originalBars.map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}px` }}
                    className="flex-1 rounded-[1px] bg-zinc-500 hover:brightness-125 transition-all"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* CARRIL 2: Voces (naranja #F97316) */}
          <div className="h-[72px] rounded-[6px] bg-[#111113] border border-white/6 flex items-center overflow-hidden group">
            {/* Controles del carril */}
            <div className="w-[180px] h-full shrink-0 px-3 py-2 border-r border-white/6 flex flex-col justify-between bg-[#111113] z-20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#F97316] flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5" />
                  {strings.stems.vocalsCardTitle}
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toast.info(`Ubicación: ${results.vocalsPath}`)}
                      className="h-5 w-5 text-zinc-500 hover:text-zinc-200"
                    >
                      <FolderOpen className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mostrar voces en carpeta</TooltipContent>
                </Tooltip>
              </div>

              {/* Botones Mute / Solo y Slider */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleMute("vocals")}
                  className={`w-5 h-5 rounded-[3px] text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer transition-colors ${
                    lanes.vocals.mute
                      ? "bg-red-500 text-white"
                      : "bg-[#18181b] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => toggleSolo("vocals")}
                  className={`w-5 h-5 rounded-[3px] text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer transition-colors ${
                    lanes.vocals.solo
                      ? "bg-[#F97316] text-white"
                      : "bg-[#18181b] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  S
                </button>

                <div className="flex-1 px-1">
                  <Slider
                    value={[lanes.vocals.volume]}
                    onValueChange={(val) => changeVolume("vocals", val)}
                    max={100}
                    step={1}
                    className="[&_.range-thumb]:h-2.5 [&_.range-thumb]:w-2.5"
                  />
                </div>
              </div>
            </div>

            {/* Forma de onda completa en naranja #F97316 */}
            <div
              onClick={handleTimelineClick}
              className={`flex-1 h-full flex items-center px-4 cursor-pointer relative overflow-hidden transition-opacity ${
                lanes.vocals.mute ? "opacity-30" : "opacity-100"
              }`}
            >
              <div className="w-full h-full flex items-center justify-between gap-[2px]">
                {vocalsBars.map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}px` }}
                    className="flex-1 rounded-[1px] bg-[#F97316] hover:brightness-125 transition-all"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* CARRIL 3: Instrumental (zinc-300) */}
          <div className="h-[72px] rounded-[6px] bg-[#111113] border border-white/6 flex items-center overflow-hidden group">
            {/* Controles del carril */}
            <div className="w-[180px] h-full shrink-0 px-3 py-2 border-r border-white/6 flex flex-col justify-between bg-[#111113] z-20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-zinc-400" />
                  {strings.stems.instrumentalCardTitle}
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toast.info(`Ubicación: ${results.instrumentalPath}`)}
                      className="h-5 w-5 text-zinc-500 hover:text-zinc-200"
                    >
                      <FolderOpen className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mostrar instrumental en carpeta</TooltipContent>
                </Tooltip>
              </div>

              {/* Botones Mute / Solo y Slider */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleMute("instrumental")}
                  className={`w-5 h-5 rounded-[3px] text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer transition-colors ${
                    lanes.instrumental.mute
                      ? "bg-red-500 text-white"
                      : "bg-[#18181b] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => toggleSolo("instrumental")}
                  className={`w-5 h-5 rounded-[3px] text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer transition-colors ${
                    lanes.instrumental.solo
                      ? "bg-[#F97316] text-white"
                      : "bg-[#18181b] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  S
                </button>

                <div className="flex-1 px-1">
                  <Slider
                    value={[lanes.instrumental.volume]}
                    onValueChange={(val) => changeVolume("instrumental", val)}
                    max={100}
                    step={1}
                    className="[&_.range-thumb]:h-2.5 [&_.range-thumb]:w-2.5"
                  />
                </div>
              </div>
            </div>

            {/* Forma de onda completa en zinc-300 */}
            <div
              onClick={handleTimelineClick}
              className={`flex-1 h-full flex items-center px-4 cursor-pointer relative overflow-hidden transition-opacity ${
                lanes.instrumental.mute ? "opacity-30" : "opacity-100"
              }`}
            >
              <div className="w-full h-full flex items-center justify-between gap-[2px]">
                {instrumentalBars.map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}px` }}
                    className="flex-1 rounded-[1px] bg-zinc-300 hover:brightness-125 transition-all"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
