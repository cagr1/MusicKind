import * as React from "react";
import {
  ArrowRightLeft,
  Folder,
  FolderOpen,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { strings } from "@/src/strings";
import {
  MOCK_DJ_TRACKS,
  INITIAL_CONVERTER_RESULTS,
  INITIAL_CLASSIFIER_RESULTS,
  ConverterResult,
  runProcess,
  ProcessController,
  AppConfig,
} from "@/src/mocks";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { TrackInspector } from "@/src/components/TrackInspector";
import { Button } from "@/src/components/ui/button";
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

interface ConverterProps {
  config: AppConfig;
  onNavigate: (view: "settings") => void;
  onProcessUpdate?: (status: {
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }) => void;
}

const getSourceFormat = (filename: string) => {
  const ext = filename.split(".").pop()?.toUpperCase() || "MP3";
  return ext;
};

export default function Converter({
  config: _config,
  onNavigate: _onNavigate,
  onProcessUpdate,
}: ConverterProps) {
  const [results, setResults] = React.useState<ConverterResult[]>(
    INITIAL_CONVERTER_RESULTS
  );
  const [selectedTrackId, setSelectedTrackId] = React.useState<string>(
    results[0]?.id || "trk-01"
  );
  const [targetFormat, setTargetFormat] = React.useState<"MP3" | "WAV" | "AIFF" | "FLAC">("WAV");
  const [bitrate, setBitrate] = React.useState("320 kbps");
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeRunningId, setActiveRunningId] = React.useState<string | null>(null);

  const [progress, setProgress] = React.useState({
    current: 6,
    total: 12,
    filename: "Adam Ten, Mita Gami - The Beat.wav",
    percent: 50,
  });

  const processRef = React.useRef<ProcessController | null>(null);
  const selectedResult =
    results.find((t) => t.id === selectedTrackId) || results[0] || null;

  // Enlazar con datos de audio (BPM y Key) para el Inspector
  const selectedAudioInfo = React.useMemo(() => {
    if (!selectedResult) return null;
    const match = INITIAL_CLASSIFIER_RESULTS.find((c) => c.id === selectedResult.id);
    return {
      id: selectedResult.id,
      title: selectedResult.title,
      artist: selectedResult.artist,
      bpm: match?.bpm || 124,
      key: match?.key || "8A",
      filename: selectedResult.filename,
    };
  }, [selectedResult]);

  const handleStartConversion = () => {
    setIsRunning(true);
    toast(strings.converter.toastStarted);

    onProcessUpdate?.({
      isRunning: true,
      name: strings.converter.title,
      current: 1,
      total: 12,
    });

    processRef.current = runProcess<ConverterResult[]>(
      "converter",
      MOCK_DJ_TRACKS.slice(0, 12),
      {
        onProgress(prog) {
          setProgress(prog);
          const target = results[prog.current - 1];
          if (target) setActiveRunningId(target.id);
          onProcessUpdate?.({
            isRunning: true,
            name: strings.converter.title,
            current: prog.current,
            total: prog.total,
          });
        },
        onResult(data) {
          setIsRunning(false);
          setActiveRunningId(null);
          const adapted = data.map((item) => ({
            ...item,
            targetFormat,
            bitrate: targetFormat === "MP3" ? bitrate : undefined,
            outputPath: `/Output/${item.filename.replace(/\.[^.]+$/, "")}.${targetFormat.toLowerCase()}`,
          }));
          setResults(adapted);
          toast.success(strings.converter.toastCompleted);
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
      { stepDelayMs: 380 }
    );
  };

  const handleCancel = () => {
    if (processRef.current) {
      processRef.current.cancel();
      processRef.current = null;
    }
    setIsRunning(false);
    setActiveRunningId(null);
    toast(strings.converter.toastCanceled);
    onProcessUpdate?.({
      isRunning: false,
      name: "",
      current: 0,
      total: 0,
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#09090b]">
      {/* PANEL CENTRAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior de 44px */}
        <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] relative">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
              {strings.converter.title}
            </h1>
            <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
              {results.length} archivos
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
              onClick={handleStartConversion}
              disabled={isRunning}
              className="h-7 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
              {strings.converter.convert}
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

        {/* Barra de opciones de conversión */}
        <div className="h-[40px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] text-[12px]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-zinc-400">
              <Folder className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-mono text-[11px] text-zinc-300">
                /Users/dj/Music/DJ_Promos_2026
              </span>
            </div>

            <div className="flex items-center gap-2 border-l border-white/6 pl-4">
              <span className="text-[11px] text-zinc-500">
                {strings.converter.formatLabel}:
              </span>
              <Select
                value={targetFormat}
                onValueChange={(val: "MP3" | "WAV" | "AIFF" | "FLAC") =>
                  setTargetFormat(val)
                }
              >
                <SelectTrigger className="h-6 text-[11px] font-mono border-white/6 bg-[#111113] w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-white/6 text-[11px]">
                  <SelectItem value="WAV">WAV (PCM)</SelectItem>
                  <SelectItem value="AIFF">AIFF</SelectItem>
                  <SelectItem value="FLAC">FLAC</SelectItem>
                  <SelectItem value="MP3">MP3 (CBR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetFormat === "MP3" && (
              <div className="flex items-center gap-2 border-l border-white/6 pl-4">
                <span className="text-[11px] text-zinc-500">
                  {strings.converter.bitrateLabel}:
                </span>
                <Select value={bitrate} onValueChange={setBitrate}>
                  <SelectTrigger className="h-6 text-[11px] font-mono border-white/6 bg-[#111113] w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-white/6 text-[11px]">
                    <SelectItem value="320 kbps">320 kbps</SelectItem>
                    <SelectItem value="256 kbps">256 kbps</SelectItem>
                    <SelectItem value="192 kbps">192 kbps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Resumen arriba: "12 archivos · 486 MB → 1.2 GB" */}
          <div className="text-[11px] font-mono text-zinc-400">
            {strings.converter.summaryFormat}
          </div>
        </div>

        {/* TABLA COMPACTA (Padding lateral 24px = px-6, 5 columnas máximo) */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#09090b] z-10 border-b border-white/6">
              <tr className="h-8 text-[11px] font-normal uppercase text-zinc-500 select-none tracking-[0.06em]">
                <th className="w-10 text-center font-normal">#</th>
                <th className="w-[45%] font-normal pl-2">{strings.converter.tableFile}</th>
                <th className="w-28 font-normal pl-2">{strings.converter.tableConversion}</th>
                <th className="w-36 font-normal pl-2">{strings.converter.tableSize}</th>
                <th className="w-auto font-normal pl-2 text-right pr-2">
                  {strings.converter.tableStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, idx) => {
                const isSelected = item.id === selectedTrackId;
                const isItemProcessing = item.id === activeRunningId;
                const srcFmt = getSourceFormat(item.filename);

                // Tamaños mock
                const origMb = (12.4 + (idx % 7) * 1.8).toFixed(1);
                const targetMb = targetFormat === "WAV" || targetFormat === "AIFF"
                  ? (54.2 + (idx % 7) * 5.4).toFixed(1)
                  : (11.8 + (idx % 7) * 1.2).toFixed(1);

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedTrackId(item.id)}
                    className={`h-[44px] transition-colors duration-150 cursor-pointer select-none group ${
                      isSelected
                        ? "bg-white/[0.05] border-l-2 border-[#F97316]"
                        : "hover:bg-white/[0.03] border-l-2 border-transparent"
                    }`}
                  >
                    {/* Columna 1: # */}
                    <td className="w-10 text-center font-mono text-[12px] text-zinc-500 tabular-nums">
                      {isItemProcessing ? (
                        <span className="w-2 h-2 rounded-full bg-[#F97316] inline-block animate-pulse" />
                      ) : (
                        String(idx + 1).padStart(2, "0")
                      )}
                    </td>

                    {/* Columna 2: Archivo (Carátula 32px + 2 líneas) */}
                    <td className="pl-2 pr-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <TrackArtwork camelotKey="8A" size={32} />
                        <div className="flex-1 min-w-0 flex flex-col justify-center leading-tight">
                          <span className="text-[13px] font-medium text-zinc-100 truncate">
                            {item.title}
                          </span>
                          <span className="text-[12px] text-zinc-500 truncate mt-0.5">
                            {item.artist}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Columna 3: Conversión (MP3 → WAV en mono) */}
                    <td className="w-28 pl-2 font-mono text-[12px] text-zinc-300">
                      <span>{srcFmt}</span>
                      <span className="text-zinc-500 mx-1.5">→</span>
                      <span className="text-zinc-100 font-semibold">{targetFormat}</span>
                    </td>

                    {/* Columna 4: Tamaño ("16.4 MB → 62.1 MB") */}
                    <td className="w-36 pl-2 font-mono text-[11px] text-zinc-400 tabular-nums">
                      <span>{origMb} MB</span>
                      <span className="text-zinc-600 mx-1">→</span>
                      <span className="text-zinc-200">{targetMb} MB</span>
                    </td>

                    {/* Columna 5: Estado (icono + botón "Mostrar en carpeta" SOLO en hover) */}
                    <td className="pl-2 pr-2 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {isItemProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 text-[#F97316] animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80" />
                        )}

                        {/* Botón Mostrar en carpeta visible SOLO en hover */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info(`Ubicación: ${item.outputPath}`);
                              }}
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                              aria-label={strings.common.showInFolder}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {strings.common.showInFolder}
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
      <TrackInspector track={selectedAudioInfo}>
        {selectedResult && (
          <div className="space-y-3 pt-2">
            {/* Especificaciones de conversión */}
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-2 text-[12px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {strings.converter.inspectorSpecs}
              </span>

              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{strings.converter.originalFormat}</span>
                  <span className="text-zinc-300">
                    {getSourceFormat(selectedResult.filename)} · 320 kbps (44.1 kHz)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">{strings.converter.targetFormat}</span>
                  <span className="text-[#F97316] font-semibold">
                    {targetFormat} · {targetFormat === "MP3" ? bitrate : "24-bit / 48 kHz PCM"}
                  </span>
                </div>
              </div>
            </div>

            {/* Ruta de salida completa */}
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-1.5 text-[12px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {strings.converter.outputPath}
              </span>
              <p className="font-mono text-[11px] text-zinc-400 break-all leading-tight">
                {selectedResult.outputPath}
              </p>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(`Abriendo Finder en: ${selectedResult.outputPath}`)}
                  className="w-full h-7 text-[11px] border-white/6 bg-[#18181b] hover:bg-[#202024] text-zinc-300"
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                  {strings.common.showInFolder}
                </Button>
              </div>
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  );
}
