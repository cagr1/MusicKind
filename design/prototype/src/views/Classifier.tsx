import * as React from "react";
import {
  Folder,
  Tags,
  SlidersHorizontal,
  Plus,
  X,
  Radio,
  Music,
  Activity,
  FolderOpen,
  CheckCircle2,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import { strings } from "@/src/strings";
import {
  MOCK_DJ_TRACKS,
  INITIAL_GENRES,
  INITIAL_CLASSIFIER_RESULTS,
  ClassifierResult,
  runProcess,
  ProcessController,
  AppConfig,
} from "@/src/mocks";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { CamelotBadge } from "@/src/components/CamelotBadge";
import { MiniWaveform } from "@/src/components/MiniWaveform";
import { TrackInspector } from "@/src/components/TrackInspector";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
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

interface ClassifierProps {
  config: AppConfig;
  onNavigate: (view: "settings") => void;
  onProcessUpdate?: (status: {
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }) => void;
}

export default function Classifier({
  config,
  onNavigate,
  onProcessUpdate,
}: ClassifierProps) {
  // Estado inicial "terminado" con 30 filas de mock
  const [results, setResults] = React.useState<ClassifierResult[]>(
    INITIAL_CLASSIFIER_RESULTS
  );
  const [selectedTrackId, setSelectedTrackId] = React.useState<string>(
    results[0]?.id || "trk-01"
  );
  const [selectedFolder, setSelectedFolder] = React.useState<string>(
    "/Users/dj/Music/DJ_Promos_2026"
  );
  const [dryRun, setDryRun] = React.useState(true);
  const [genres, setGenres] = React.useState<string[]>(INITIAL_GENRES);
  const [newGenreInput, setNewGenreInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [isSorted, setIsSorted] = React.useState(false);
  const [activeRunningId, setActiveRunningId] = React.useState<string | null>(null);

  const [progress, setProgress] = React.useState({
    current: 12,
    total: 30,
    filename: "Mochakk, Joni - Jealous (Extended Club Mix).mp3",
    percent: 40,
  });

  const processRef = React.useRef<ProcessController | null>(null);
  const selectedTrack =
    results.find((t) => t.id === selectedTrackId) || results[0] || null;

  // Calcula la distribución por género para la barra segmentada de 4px
  const genreDistribution = React.useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach((r) => {
      counts[r.detectedGenre] = (counts[r.detectedGenre] || 0) + 1;
    });
    const total = results.length || 1;
    const colors = [
      "#F97316", // Naranja primario
      "#38bdf8", // Cyan
      "#a855f7", // Purple
      "#4ade80", // Green
      "#f472b6", // Pink
      "#facc15", // Yellow
      "#a1a1aa", // Gray
    ];
    return Object.entries(counts).map(([genre, count], idx) => ({
      genre,
      count,
      percent: (count / total) * 100,
      color: colors[idx % colors.length],
    }));
  }, [results]);

  const handleStartClassification = () => {
    setIsRunning(true);
    setIsSorted(false);
    toast(strings.classifier.toastStarted);

    onProcessUpdate?.({
      isRunning: true,
      name: strings.classifier.title,
      current: 1,
      total: MOCK_DJ_TRACKS.length,
    });

    processRef.current = runProcess<ClassifierResult[]>(
      "classifier",
      MOCK_DJ_TRACKS,
      {
        onProgress(prog) {
          setProgress(prog);
          const targetTrk = results[prog.current - 1];
          if (targetTrk) {
            setActiveRunningId(targetTrk.id);
          }
          onProcessUpdate?.({
            isRunning: true,
            name: strings.classifier.title,
            current: prog.current,
            total: prog.total,
          });
        },
        onResult(finalResults) {
          setIsRunning(false);
          setActiveRunningId(null);
          setResults(finalResults);
          toast.success(strings.common.completed);
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
    toast(strings.classifier.toastCanceled);
    onProcessUpdate?.({
      isRunning: false,
      name: "",
      current: 0,
      total: 0,
    });
  };

  const handleAddGenre = () => {
    const trimmed = newGenreInput.trim();
    if (trimmed && !genres.includes(trimmed)) {
      setGenres([...genres, trimmed]);
      setNewGenreInput("");
    }
  };

  const handleRemoveGenre = (genreToRemove: string) => {
    if (genres.length <= 1) return;
    setGenres(genres.filter((g) => g !== genreToRemove));
  };

  const handleSortFiles = () => {
    setIsSorted(true);
    toast.success(strings.classifier.toastSorted);
  };

  const handleUndoSort = () => {
    setIsSorted(false);
    toast.info(strings.classifier.toastUndone);
  };

  const handleChangeGenre = (trackId: string, newGenre: string) => {
    setResults((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              detectedGenre: newGenre,
              destinationFolder: `/Music/Organized/${newGenre}`,
            }
          : t
      )
    );
  };

  const handleChangeKey = (newKey: string) => {
    if (!selectedTrack) return;
    setResults((prev) =>
      prev.map((t) => (t.id === selectedTrack.id ? { ...t, key: newKey } : t))
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#09090b]">
      {/* PANEL CENTRAL: Tabla con padding lateral 24px */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior de 44px */}
        <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] relative">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
              {strings.classifier.title}
            </h1>
            <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
              {results.length} pistas
            </span>
          </div>

          {/* Estado central mientras corre el proceso */}
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

          {/* Acciones superiores a la derecha */}
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
              onClick={handleStartClassification}
              disabled={isRunning}
              className="h-7 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
            >
              <Tags className="w-3.5 h-3.5 mr-1.5" />
              {strings.classifier.classify}
            </Button>
          </div>

          {/* Barra de progreso de 2px adherida bajo la barra superior mientras corre */}
          {isRunning && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/6 overflow-hidden">
              <div
                style={{ width: `${progress.percent}%` }}
                className="h-full bg-[#F97316] transition-all duration-300 ease-out"
              />
            </div>
          )}
        </div>

        {/* Barra de opciones de entrada: Carpeta, modo simulación y botón "Géneros · 6" */}
        <div className="h-[40px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] text-[12px]">
          <div className="flex items-center gap-4">
            {/* Carpeta seleccionada como chip discreto */}
            <div className="flex items-center gap-2 text-zinc-400">
              <Folder className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[240px]">
                {selectedFolder}
              </span>
            </div>

            {/* Switch de modo simulación */}
            <div className="flex items-center gap-2 border-l border-white/6 pl-4">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
                className="scale-75 data-[state=checked]:bg-[#F97316]"
              />
              <label
                htmlFor="dry-run"
                className="text-[12px] text-zinc-400 cursor-pointer select-none"
              >
                {strings.classifier.dryRunLabel}
              </label>
            </div>
          </div>

          {/* Botón Popover: "Géneros · {count}" */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] font-mono border-white/6 bg-[#111113] hover:bg-[#18181b] text-zinc-300 gap-1.5"
              >
                <SlidersHorizontal className="w-3 h-3 text-[#F97316]" />
                <span>
                  {strings.classifier.activeGenresButton} · {genres.length}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 p-3 bg-[#111113] border-white/6 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-white/6 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {strings.classifier.activeGenres}
                </span>
                <span className="text-[11px] font-mono text-zinc-500">
                  {genres.length} configurados
                </span>
              </div>

              {/* Chips de géneros */}
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#18181b] border border-white/6 text-[11px] text-zinc-200"
                  >
                    <span>{g}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGenre(g)}
                      className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      aria-label={`Eliminar ${g}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Agregar nuevo género */}
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  value={newGenreInput}
                  onChange={(e) => setNewGenreInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddGenre()}
                  placeholder={strings.classifier.addGenrePlaceholder}
                  className="h-7 text-[11px] bg-[#18181b] border-white/6"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddGenre}
                  className="h-7 text-[11px] border-white/6"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Encima de la tabla: Barra segmentada de 4px con distribución por género + leyenda mono */}
        <div className="px-6 py-2.5 border-b border-white/6 bg-[#09090b] space-y-1.5 shrink-0">
          <div className="h-[4px] w-full rounded-full bg-white/6 flex overflow-hidden">
            {genreDistribution.map((item) => (
              <div
                key={item.genre}
                style={{
                  width: `${item.percent}%`,
                  backgroundColor: item.color,
                }}
                className="h-full transition-all duration-300"
                title={`${item.genre}: ${item.count} pistas (${Math.round(
                  item.percent
                )}%)`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 overflow-x-auto text-[11px] font-mono text-zinc-400 whitespace-nowrap scrollbar-none">
            {genreDistribution.map((item) => (
              <span key={item.genre} className="inline-flex items-center gap-1.5">
                <span
                  style={{ backgroundColor: item.color }}
                  className="w-1.5 h-1.5 rounded-full"
                />
                <span className="text-zinc-300 font-medium">{item.genre}</span>
                <span className="text-zinc-500 tabular-nums">{item.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* CONTENEDOR DE TABLA (Padding lateral 24px = px-6, 5 columnas máximo, filas de 44px) */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#09090b] z-10 border-b border-white/6">
              <tr className="h-8 text-[11px] font-normal uppercase text-zinc-500 select-none tracking-[0.06em]">
                <th className="w-10 text-center font-normal">#</th>
                <th className="w-[45%] font-normal pl-2">{strings.classifier.tableTrack}</th>
                <th className="w-20 font-normal pl-2">{strings.classifier.tableBpm}</th>
                <th className="w-20 font-normal pl-2">{strings.classifier.tableKey}</th>
                <th className="w-auto font-normal pl-2">{strings.classifier.tableGenre}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((trk, idx) => {
                const isSelected = trk.id === selectedTrackId;
                const isRowProcessing = trk.id === activeRunningId;

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

                        {/* Forma de onda en fila (64x20), se tiñe naranja si seleccionada */}
                        <MiniWaveform
                          seed={trk.id}
                          isSelected={isSelected}
                          className="shrink-0"
                        />
                      </div>
                    </td>

                    {/* Columna 3: BPM */}
                    <td className="w-20 pl-2 font-mono text-[13px] text-zinc-200 tabular-nums">
                      {trk.bpm}
                    </td>

                    {/* Columna 4: Key (CamelotBadge 22px alto, mono 11px) */}
                    <td className="w-20 pl-2">
                      <CamelotBadge camelotKey={trk.key} />
                    </td>

                    {/* Columna 5: Género (select inline, chevron solo en hover) + Fuente icono 14px */}
                    <td className="pl-2 pr-3">
                      <div className="flex items-center justify-between gap-2">
                        <Select
                          value={trk.detectedGenre}
                          onValueChange={(val) => handleChangeGenre(trk.id, val)}
                        >
                          <SelectTrigger className="h-7 text-[12px] border-none bg-transparent hover:bg-white/5 focus:ring-0 p-1 w-[160px] text-zinc-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#18181b] border-white/6 text-[12px]">
                            {genres.map((g) => (
                              <SelectItem key={g} value={g}>
                                {g}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Icono de Fuente (14px con Tooltip) */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-zinc-500 hover:text-zinc-300 p-1 cursor-default shrink-0">
                              {trk.source === "Spotify" && (
                                <Music className="w-3.5 h-3.5 text-emerald-400/80" />
                              )}
                              {trk.source === "Last.fm" && (
                                <Radio className="w-3.5 h-3.5 text-red-400/80" />
                              )}
                              {trk.source === "BPM" && (
                                <Activity className="w-3.5 h-3.5 text-amber-400/80" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            Fuente: {trk.source} (Análisis espectral)
                          </TooltipContent>
                        </Tooltip>
                      </div>
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
        onKeyChange={handleChangeKey}
      >
        {/* Datos secundarios del Clasificador: Carpeta destino, archivo original y fuente */}
        {selectedTrack && (
          <div className="space-y-3 pt-2">
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-2 text-[12px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {strings.classifier.inspectorFolder}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-zinc-300 truncate">
                  {selectedTrack.destinationFolder}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-zinc-400 hover:text-zinc-200 shrink-0"
                      onClick={() =>
                        toast.info(`Abriendo: ${selectedTrack.destinationFolder}`)
                      }
                      aria-label="Abrir carpeta"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Abrir en Finder</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-1.5 text-[12px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {strings.classifier.inspectorOriginalFile}
              </span>
              <p className="font-mono text-[11px] text-zinc-400 truncate">
                {selectedTrack.filename}
              </p>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/6">
                <span className="text-zinc-500">Algoritmo de clasificación</span>
                <span className="text-zinc-300 font-mono">
                  {selectedTrack.source} (v2.4)
                </span>
              </div>
            </div>

            {/* Acciones de ordenamiento */}
            <div className="pt-2">
              {!isSorted ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSortFiles}
                  className="w-full text-[12px] h-8 border-white/6 bg-[#111113] hover:bg-[#18181b] text-zinc-200"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  {strings.classifier.sortFiles}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndoSort}
                  className="w-full text-[12px] h-8 border-white/6 bg-[#111113] hover:bg-[#18181b] text-zinc-300"
                >
                  <Undo2 className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                  {strings.classifier.undoSort}
                </Button>
              )}
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  );
}
