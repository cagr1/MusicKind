/**
 * MusicKind - Desktop DJ Audio Suite
 * React 19 + TypeScript + Tailwind v4
 * Professional Audio Instrument aesthetic (Teenage Engineering / Ableton Live 12 / Nothing OS)
 */

import * as React from "react";
import {
  Tags,
  Disc,
  ArrowRightLeft,
  ScanSearch,
  Activity,
  Split,
  Settings as SettingsIcon,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { strings } from "@/src/strings";
import { INITIAL_CONFIG, AppConfig } from "@/src/mocks";
import Classifier from "@/src/views/Classifier";
import Sets from "@/src/views/Sets";
import Converter from "@/src/views/Converter";
import Metadata from "@/src/views/Metadata";
import Bpm from "@/src/views/Bpm";
import Stems from "@/src/views/Stems";
import Settings from "@/src/views/Settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/src/components/ui/command";
import { Button } from "@/src/components/ui/button";
import { Toaster } from "@/src/components/ui/sonner";
import { toast } from "sonner";

export type ViewKey =
  | "classifier"
  | "sets"
  | "converter"
  | "metadata"
  | "bpm"
  | "stems"
  | "settings";

export default function App() {
  const [activeView, setActiveView] = React.useState<ViewKey>("classifier");
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [config, setConfig] = React.useState<AppConfig>(INITIAL_CONFIG);

  // Estado global de proceso para sincronizar barra de progreso y pie de sidebar
  const [activeProcess, setActiveProcess] = React.useState<{
    isRunning: boolean;
    name: string;
    current: number;
    total: number;
  }>({
    isRunning: false,
    name: "",
    current: 0,
    total: 0,
  });

  // Atajo ⌘K / Ctrl+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Peor estado del sistema entre FFmpeg y Python
  const ffmpegOk = config.dependencies.ffmpeg;
  const pythonOk = config.dependencies.librosa;
  const isSystemHealthy = ffmpegOk && pythonOk;

  // Punto de 6px con verde/ámbar/rojo apagados
  const systemStatusColor = isSystemHealthy
    ? "bg-emerald-500/80"
    : !ffmpegOk && !pythonOk
    ? "bg-red-500/80"
    : "bg-amber-500/80";

  const navItems = [
    {
      id: "classifier" as ViewKey,
      label: strings.nav.classifier,
      icon: Tags,
    },
    {
      id: "sets" as ViewKey,
      label: strings.nav.sets,
      icon: Disc,
    },
    {
      id: "converter" as ViewKey,
      label: strings.nav.converter,
      icon: ArrowRightLeft,
    },
    {
      id: "metadata" as ViewKey,
      label: strings.nav.metadata,
      icon: ScanSearch,
    },
    {
      id: "bpm" as ViewKey,
      label: strings.nav.bpm,
      icon: Activity,
    },
    {
      id: "stems" as ViewKey,
      label: strings.nav.stems,
      icon: Split,
    },
    {
      id: "settings" as ViewKey,
      label: strings.nav.settings,
      icon: SettingsIcon,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 select-none">
        {/* SIDEBAR: Ancho fijo 220px sobrio y funcional */}
        <aside className="w-[220px] shrink-0 border-r border-white/6 bg-[#09090b] flex flex-col justify-between z-30 select-none">
          {/* Cabecera de la marca */}
          <div className="flex flex-col">
            <div className="h-[44px] px-4 flex items-center justify-between border-b border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-[3px] bg-[#F97316] flex items-center justify-center font-mono text-[10px] font-bold text-black select-none">
                  M
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-[13px] font-semibold text-zinc-100 tracking-tight">
                    {strings.app.name}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase mt-0.5">
                    {strings.app.tagline}
                  </span>
                </div>
              </div>
            </div>

            {/* Buscador / ⌘K */}
            <div className="px-3 pt-3 pb-1">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="w-full h-7 px-2.5 rounded-[4px] bg-[#111113] hover:bg-[#18181b] border border-white/6 flex items-center justify-between text-[11px] text-zinc-400 cursor-pointer transition-colors"
                aria-label={strings.nav.commandPalette}
              >
                <div className="flex items-center gap-1.5">
                  <Search className="w-3 h-3 text-zinc-500" />
                  <span>{strings.common.search}</span>
                </div>
                <kbd className="font-mono text-[10px] text-zinc-500 bg-white/5 px-1 rounded">
                  {strings.command.shortcutCmdK}
                </kbd>
              </button>
            </div>

            {/* Navegación principal */}
            <nav className="p-2 space-y-0.5" aria-label="Navegación principal">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`w-full h-8 px-3 rounded-[4px] flex items-center gap-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-white/[0.06] text-zinc-100 border-l-2 border-[#F97316]"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-l-2 border-transparent"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? "text-[#F97316]" : "text-zinc-500"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* PIE DEL SIDEBAR: Estado del proceso O Punto de sistema de 6px */}
          <div className="border-t border-white/6 bg-[#09090b]">
            {activeProcess.isRunning ? (
              /* Si hay proceso corriendo: Nombre + barra de 2px + contador "12/48" */
              <div className="p-3 space-y-1.5 bg-[#111113]/80">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-300 font-medium truncate">
                    {activeProcess.name}
                  </span>
                  <span className="text-[#F97316] font-semibold tabular-nums">
                    {activeProcess.current}/{activeProcess.total}
                  </span>
                </div>
                <div className="h-[2px] w-full bg-white/6 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${
                        (activeProcess.current /
                          Math.max(1, activeProcess.total)) *
                        100
                      }%`,
                    }}
                    className="h-full bg-[#F97316] transition-all duration-200"
                  />
                </div>
              </div>
            ) : (
              /* Si no hay proceso: Punto de estado de 6px con popover de dependencias */
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full h-10 px-3 flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] cursor-pointer transition-colors"
                    aria-label={strings.nav.systemStatus}
                  >
                    <span className="font-mono text-zinc-400">
                      {strings.systemStatus.title}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${systemStatusColor}`}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  className="w-72 p-3 bg-[#111113] border-white/6 space-y-2.5 shadow-xl text-[12px]"
                >
                  <div className="flex items-center justify-between border-b border-white/6 pb-2">
                    <span className="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider">
                      {strings.systemStatus.title}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isSystemHealthy
                          ? "text-emerald-400 bg-emerald-500/10"
                          : "text-amber-400 bg-amber-500/10"
                      }`}
                    >
                      {isSystemHealthy
                        ? strings.systemStatus.ready
                        : strings.systemStatus.warning}
                    </span>
                  </div>

                  <div className="space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">FFmpeg 6.1</span>
                      <span
                        className={
                          ffmpegOk ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {ffmpegOk ? "OK" : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Python librosa</span>
                      <span
                        className={
                          pythonOk ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {pythonOk ? "Active" : "Missing"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Demucs v4</span>
                      <span
                        className={
                          config.dependencies.demucs
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }
                      >
                        {config.dependencies.demucs ? "2.1 GB" : "Pending"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-white/6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveView("settings")}
                      className="w-full h-6 text-[11px] justify-between text-zinc-400 hover:text-white p-0"
                    >
                      <span>{strings.systemStatus.openSettings}</span>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL: Layout de 3 paneles con centro y derecha (Inspector) */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#09090b]">
          {activeView === "classifier" && (
            <Classifier
              config={config}
              onNavigate={(v) => setActiveView(v)}
              onProcessUpdate={setActiveProcess}
            />
          )}
          {activeView === "sets" && (
            <Sets onProcessUpdate={setActiveProcess} />
          )}
          {activeView === "converter" && (
            <Converter
              config={config}
              onNavigate={(v) => setActiveView(v)}
              onProcessUpdate={setActiveProcess}
            />
          )}
          {activeView === "metadata" && (
            <Metadata onProcessUpdate={setActiveProcess} />
          )}
          {activeView === "bpm" && (
            <Bpm onProcessUpdate={setActiveProcess} />
          )}
          {activeView === "stems" && (
            <Stems onProcessUpdate={setActiveProcess} />
          )}
          {activeView === "settings" && (
            <Settings config={config} onChangeConfig={setConfig} />
          )}
        </main>

        {/* PALETA DE COMANDOS GLOBAL (⌘K con cmdk) */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder={strings.command.placeholder} />
          <CommandList className="bg-[#111113] border-white/6 text-zinc-200">
            <CommandEmpty className="text-zinc-500 py-6 text-center text-[12px]">
              {strings.command.noResults}
            </CommandEmpty>

            <CommandGroup heading={strings.command.navigationGroup}>
              <CommandItem
                onSelect={() => {
                  setActiveView("classifier");
                  setCommandOpen(false);
                }}
              >
                <Tags className="mr-2 h-4 w-4 text-[#F97316]" />
                <span>{strings.command.goToClassifier}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setActiveView("sets");
                  setCommandOpen(false);
                }}
              >
                <Disc className="mr-2 h-4 w-4 text-[#F97316]" />
                <span>{strings.command.goToSets}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setActiveView("converter");
                  setCommandOpen(false);
                }}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4 text-[#F97316]" />
                <span>{strings.command.goToConverter}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setActiveView("metadata");
                  setCommandOpen(false);
                }}
              >
                <ScanSearch className="mr-2 h-4 w-4 text-[#F97316]" />
                <span>{strings.command.goToMetadata}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setActiveView("bpm");
                  setCommandOpen(false);
                }}
              >
                <Activity className="mr-2 h-4 w-4 text-[#F97316]" />
                <span>{strings.command.goToBpm}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setActiveView("stems");
                  setCommandOpen(false);
                }}
              >
                <Split className="mr-2 h-4 w-4 text-[#F97316]" />
                <span>{strings.command.goToStems}</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setActiveView("settings");
                  setCommandOpen(false);
                }}
              >
                <SettingsIcon className="mr-2 h-4 w-4 text-zinc-400" />
                <span>{strings.command.goToSettings}</span>
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading={strings.command.actionsGroup}>
              <CommandItem
                onSelect={() => {
                  setActiveView("settings");
                  setCommandOpen(false);
                  toast.info(strings.systemStatus.title);
                }}
              >
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-400" />
                <span>{strings.command.checkDependencies}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        {/* NOTIFICACIONES TOAST (sonner) */}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#18181b",
              color: "#f4f4f5",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "12px",
              fontFamily: "Geist, system-ui, sans-serif",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
