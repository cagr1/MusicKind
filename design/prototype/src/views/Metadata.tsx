import * as React from "react";
import {
  ScanSearch,
  Folder,
  Save,
} from "lucide-react";
import { strings } from "@/src/strings";
import {
  MOCK_DJ_TRACKS,
  INITIAL_METADATA_RESULTS,
  MetadataResult,
  runProcess,
  ProcessController,
} from "@/src/mocks";
import { TrackArtwork } from "@/src/components/TrackArtwork";
import { TrackInspector } from "@/src/components/TrackInspector";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";

interface MetadataProps {
  onProcessUpdate?: (status: {
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }) => void;
}

export default function Metadata({ onProcessUpdate }: MetadataProps) {
  const [results, setResults] = React.useState<MetadataResult[]>(
    INITIAL_METADATA_RESULTS
  );
  // Guardamos copias originales sin editar para mostrar tachados
  const [originalValues] = React.useState<Map<string, MetadataResult>>(() => {
    const map = new Map<string, MetadataResult>();
    INITIAL_METADATA_RESULTS.forEach((r) => map.set(r.id, { ...r }));
    return map;
  });

  const [selectedTrackId, setSelectedTrackId] = React.useState<string>(
    results[0]?.id || "trk-01"
  );
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeRunningId, setActiveRunningId] = React.useState<string | null>(null);

  // Estado del formulario de edición en el inspector
  const selectedTrack =
    results.find((t) => t.id === selectedTrackId) || results[0] || null;

  const [formFields, setFormFields] = React.useState<{
    title: string;
    artist: string;
    album: string;
    year: string;
    genre: string;
  }>({
    title: "",
    artist: "",
    album: "",
    year: "2026",
    genre: "",
  });

  // Sincronizar formulario al cambiar de pista seleccionada
  React.useEffect(() => {
    if (selectedTrack) {
      setFormFields({
        title: selectedTrack.title,
        artist: selectedTrack.artist,
        album: selectedTrack.album,
        year: selectedTrack.year,
        genre: selectedTrack.genre,
      });
    }
  }, [selectedTrackId, selectedTrack]);

  const [progress, setProgress] = React.useState({
    current: 7,
    total: 14,
    filename: "Artbat, Argy - Tibet.wav",
    percent: 50,
  });

  const processRef = React.useRef<ProcessController | null>(null);

  const handleStartIdentification = () => {
    setIsRunning(true);
    toast(strings.metadata.toastStarted);

    onProcessUpdate?.({
      isRunning: true,
      name: strings.metadata.title,
      current: 1,
      total: 14,
    });

    processRef.current = runProcess<MetadataResult[]>(
      "metadata",
      MOCK_DJ_TRACKS.slice(0, 14),
      {
        onProgress(prog) {
          setProgress(prog);
          const target = results[prog.current - 1];
          if (target) setActiveRunningId(target.id);
          onProcessUpdate?.({
            isRunning: true,
            name: strings.metadata.title,
            current: prog.current,
            total: prog.total,
          });
        },
        onResult(data) {
          setIsRunning(false);
          setActiveRunningId(null);
          setResults(data);
          toast.success(strings.metadata.toastIdentified);
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

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrack) return;

    setResults((prev) =>
      prev.map((item) =>
        item.id === selectedTrack.id
          ? {
              ...item,
              title: formFields.title,
              artist: formFields.artist,
              album: formFields.album,
              year: formFields.year,
              genre: formFields.genre,
            }
          : item
      )
    );

    toast.success(strings.metadata.toastUpdated);
  };

  const originalTrack = selectedTrack ? originalValues.get(selectedTrack.id) : null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#09090b]">
      {/* PANEL CENTRAL: Tabla con padding lateral 24px */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior de 44px */}
        <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] relative">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
              {strings.metadata.title}
            </h1>
            <span className="text-[12px] text-zinc-500 font-mono tabular-nums">
              {results.length} etiquetas
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
              onClick={handleStartIdentification}
              disabled={isRunning}
              className="h-7 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
            >
              <ScanSearch className="w-3.5 h-3.5 mr-1.5" />
              {strings.metadata.identify}
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

        {/* Barra de opciones */}
        <div className="h-[40px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b] text-[12px]">
          <div className="flex items-center gap-2 text-zinc-400">
            <Folder className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-mono text-[11px] text-zinc-300">
              /Users/dj/Music/DJ_Promos_2026
            </span>
          </div>

          <div className="text-[11px] font-mono text-zinc-500">
            Huella acústica AcoustID + Base de datos MusicBrainz
          </div>
        </div>

        {/* TABLA CON 5 COLUMNAS MÁXIMO (Padding lateral 24px = px-6) */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 bg-[#09090b] z-10 border-b border-white/6">
              <tr className="h-8 text-[11px] font-normal uppercase text-zinc-500 select-none tracking-[0.06em]">
                <th className="w-10 text-center font-normal">#</th>
                <th className="w-[45%] font-normal pl-2">{strings.metadata.tableTrack}</th>
                <th className="w-[28%] font-normal pl-2">{strings.metadata.tableAlbum}</th>
                <th className="w-20 font-normal pl-2">{strings.metadata.tableYear}</th>
                <th className="w-auto font-normal pl-2 pr-2 text-right">
                  {strings.metadata.tableConfidence}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, idx) => {
                const isSelected = item.id === selectedTrackId;
                const isItemProcessing = item.id === activeRunningId;

                // Confianza: ámbar si < 80%, zinc-300 si >= 80%
                const confColor =
                  item.confidence < 80 ? "text-amber-400" : "text-zinc-300";

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

                    {/* Columna 2: Pista (Carátula 32px + Título y Artista en 2 líneas) */}
                    <td className="pl-2 pr-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <TrackArtwork camelotKey={item.key || "8A"} size={32} />
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

                    {/* Columna 3: Álbum */}
                    <td className="pl-2 pr-3 text-[12px] text-zinc-300 truncate">
                      {item.album || "—"}
                    </td>

                    {/* Columna 4: Año */}
                    <td className="w-20 pl-2 font-mono text-[12px] text-zinc-400 tabular-nums">
                      {item.year}
                    </td>

                    {/* Columna 5: Confianza (mono, ámbar solo si < 80%, zinc-300 si >= 80%) */}
                    <td className="pl-2 pr-2 text-right">
                      <span className={`font-mono text-[12px] font-medium tabular-nums ${confColor}`}>
                        {item.confidence}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PANEL DERECHO: Inspector de 340px con FORMULARIO DE EDICIÓN EN LUGAR DEL SHEET */}
      <TrackInspector
        track={
          selectedTrack
            ? {
                id: selectedTrack.id,
                title: selectedTrack.title,
                artist: selectedTrack.artist,
                bpm: selectedTrack.bpm,
                key: selectedTrack.key,
                filename: selectedTrack.filename,
              }
            : null
        }
      >
        {selectedTrack && (
          <form onSubmit={handleSaveForm} className="space-y-3 pt-2">
            <div className="rounded-[6px] bg-[#111113] border border-white/6 p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-white/6 pb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {strings.metadata.inspectorEditTitle}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  ID3v2.4
                </span>
              </div>

              {/* Título: original tachado en zinc-600 -> editable en zinc-100 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">{strings.metadata.fieldTitle}</span>
                  <span className="line-through text-zinc-600 font-mono text-[10px] truncate max-w-[160px]">
                    {originalTrack?.title || selectedTrack.filename}
                  </span>
                </div>
                <Input
                  value={formFields.title}
                  onChange={(e) =>
                    setFormFields((f) => ({ ...f, title: e.target.value }))
                  }
                  className="h-7 text-[12px] bg-[#18181b] border-white/6 text-zinc-100"
                />
              </div>

              {/* Artista: original tachado -> editable */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">{strings.metadata.fieldArtist}</span>
                  <span className="line-through text-zinc-600 font-mono text-[10px] truncate max-w-[160px]">
                    {originalTrack?.artist || "Desconocido"}
                  </span>
                </div>
                <Input
                  value={formFields.artist}
                  onChange={(e) =>
                    setFormFields((f) => ({ ...f, artist: e.target.value }))
                  }
                  className="h-7 text-[12px] bg-[#18181b] border-white/6 text-zinc-100"
                />
              </div>

              {/* Álbum: original tachado -> editable */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">{strings.metadata.fieldAlbum}</span>
                  <span className="line-through text-zinc-600 font-mono text-[10px] truncate max-w-[160px]">
                    {originalTrack?.album || "Single"}
                  </span>
                </div>
                <Input
                  value={formFields.album}
                  onChange={(e) =>
                    setFormFields((f) => ({ ...f, album: e.target.value }))
                  }
                  className="h-7 text-[12px] bg-[#18181b] border-white/6 text-zinc-100"
                />
              </div>

              {/* Año & Género en 2 columnas */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">{strings.metadata.fieldYear}</span>
                    <span className="line-through text-zinc-600 font-mono text-[10px]">
                      {originalTrack?.year || "2024"}
                    </span>
                  </div>
                  <Input
                    type="text"
                    value={formFields.year}
                    onChange={(e) =>
                      setFormFields((f) => ({
                        ...f,
                        year: e.target.value,
                      }))
                    }
                    className="h-7 text-[12px] font-mono bg-[#18181b] border-white/6 text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">{strings.metadata.fieldGenre}</span>
                  </div>
                  <Input
                    value={formFields.genre}
                    onChange={(e) =>
                      setFormFields((f) => ({ ...f, genre: e.target.value }))
                    }
                    className="h-7 text-[12px] bg-[#18181b] border-white/6 text-zinc-100"
                  />
                </div>
              </div>

              {/* Botón de guardar metadatos en el Inspector */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  className="w-full h-8 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {strings.metadata.saveMetadata}
                </Button>
              </div>
            </div>
          </form>
        )}
      </TrackInspector>
    </div>
  );
}
