import * as React from "react";
import {
  Eye,
  EyeOff,
  RotateCcw,
  Download,
  FolderOpen,
  Save,
  CheckCircle2,
} from "lucide-react";
import { strings } from "@/src/strings";
import { AppConfig } from "@/src/mocks";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
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

interface SettingsProps {
  config: AppConfig;
  onChangeConfig: (newConfig: AppConfig) => void;
}

export default function Settings({ config, onChangeConfig }: SettingsProps) {
  const [formData, setFormData] = React.useState<AppConfig>(config);
  const [showSpotifySecret, setShowSpotifySecret] = React.useState(false);
  const [showLastFmSecret, setShowLastFmSecret] = React.useState(false);
  const [showAcoustIdSecret, setShowAcoustIdSecret] = React.useState(false);

  React.useEffect(() => {
    setFormData(config);
  }, [config]);

  const handleSave = () => {
    onChangeConfig(formData);
    toast.success(strings.settings.toastSettingsSaved);
  };

  const handleToggleDep = (dep: "ffmpeg" | "librosa" | "demucs") => {
    const updated = {
      ...formData,
      dependencies: {
        ...formData.dependencies,
        [dep]: !formData.dependencies[dep],
      },
    };
    setFormData(updated);
    onChangeConfig(updated);
    toast.success(strings.settings.toastDepInstalled);
  };

  const handleVerifyAll = () => {
    const updated = {
      ...formData,
      dependencies: {
        ffmpeg: true,
        librosa: true,
        demucs: true,
      },
    };
    setFormData(updated);
    onChangeConfig(updated);
    toast.success(strings.settings.toastVerifiedAll);
  };

  const handleBrowseOutput = () => {
    const newPath = "/Users/dj/Music/DJ_Library_Export_2026";
    const updated = { ...formData, outputFolder: newPath };
    setFormData(updated);
    onChangeConfig(updated);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#09090b]">
      {/* Barra superior de 44px */}
      <div className="h-[44px] px-6 border-b border-white/6 flex items-center justify-between shrink-0 bg-[#09090b]">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold text-zinc-100 tracking-tight">
            {strings.settings.title}
          </h1>
          <span className="text-[12px] text-zinc-500 font-mono">
            macOS Preference Panel
          </span>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          className="h-7 text-[12px] bg-[#F97316] hover:bg-[#ea580c] text-white font-medium cursor-pointer"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {strings.common.save}
        </Button>
      </div>

      {/* Contenido: UNA columna centrada max-w-[640px] con filas de ajuste tipo macOS */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-[640px] mx-auto space-y-8 select-none">
          {/* SECCIÓN 1: API KEYS */}
          <div className="space-y-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {strings.settings.navApiKeys}
            </h2>

            <div className="rounded-[6px] border border-white/6 bg-[#111113] divide-y divide-white/6">
              {/* Spotify Client ID */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="text-zinc-300 font-medium text-[12px]">
                  {strings.settings.spotifyClientId}
                </span>
                <Input
                  value={formData.spotifyClientId}
                  onChange={(e) =>
                    setFormData({ ...formData, spotifyClientId: e.target.value })
                  }
                  className="h-7 w-[320px] text-[12px] font-mono border-white/6 bg-[#18181b]"
                />
              </div>

              {/* Spotify Client Secret */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="text-zinc-300 font-medium text-[12px]">
                  {strings.settings.spotifyClientSecret}
                </span>
                <div className="relative flex items-center w-[320px]">
                  <Input
                    type={showSpotifySecret ? "text" : "password"}
                    value={formData.spotifyClientSecret}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        spotifyClientSecret: e.target.value,
                      })
                    }
                    className="h-7 w-full text-[12px] font-mono border-white/6 bg-[#18181b] pr-7"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSpotifySecret(!showSpotifySecret)}
                    className="absolute right-2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    aria-label={
                      showSpotifySecret
                        ? strings.settings.hideSecret
                        : strings.settings.showSecret
                    }
                  >
                    {showSpotifySecret ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Last.fm Key */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="text-zinc-300 font-medium text-[12px]">
                  {strings.settings.lastFmKey}
                </span>
                <div className="relative flex items-center w-[320px]">
                  <Input
                    type={showLastFmSecret ? "text" : "password"}
                    value={formData.lastFmKey}
                    onChange={(e) =>
                      setFormData({ ...formData, lastFmKey: e.target.value })
                    }
                    className="h-7 w-full text-[12px] font-mono border-white/6 bg-[#18181b] pr-7"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLastFmSecret(!showLastFmSecret)}
                    className="absolute right-2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    aria-label={
                      showLastFmSecret
                        ? strings.settings.hideSecret
                        : strings.settings.showSecret
                    }
                  >
                    {showLastFmSecret ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* AcoustID Key */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="text-zinc-300 font-medium text-[12px]">
                  {strings.settings.acoustIdKey}
                </span>
                <div className="relative flex items-center w-[320px]">
                  <Input
                    type={showAcoustIdSecret ? "text" : "password"}
                    value={formData.acoustIdKey}
                    onChange={(e) =>
                      setFormData({ ...formData, acoustIdKey: e.target.value })
                    }
                    className="h-7 w-full text-[12px] font-mono border-white/6 bg-[#18181b] pr-7"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAcoustIdSecret(!showAcoustIdSecret)}
                    className="absolute right-2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    aria-label={
                      showAcoustIdSecret
                        ? strings.settings.hideSecret
                        : strings.settings.showSecret
                    }
                  >
                    {showAcoustIdSecret ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: IDIOMA */}
          <div className="space-y-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {strings.settings.navLanguage}
            </h2>

            <div className="rounded-[6px] border border-white/6 bg-[#111113] p-3 flex items-center justify-between text-[13px]">
              <span className="text-zinc-300 font-medium text-[12px]">
                {strings.settings.languageSelect}
              </span>
              <Select
                value={formData.language}
                onValueChange={(val: "es" | "en") =>
                  setFormData({ ...formData, language: val })
                }
              >
                <SelectTrigger className="h-7 w-[320px] text-[12px] border-white/6 bg-[#18181b]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-white/6 text-[12px]">
                  <SelectItem value="es">{strings.settings.languageSpanish}</SelectItem>
                  <SelectItem value="en">{strings.settings.languageEnglish}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SECCIÓN 3: CARPETA DE SALIDA */}
          <div className="space-y-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {strings.settings.navOutput}
            </h2>

            <div className="rounded-[6px] border border-white/6 bg-[#111113] p-3 flex items-center justify-between text-[13px]">
              <span className="text-zinc-300 font-medium text-[12px]">
                {strings.settings.outputFolderLabel}
              </span>
              <div className="flex items-center gap-1.5 w-[320px]">
                <Input
                  readOnly
                  value={formData.outputFolder}
                  className="h-7 font-mono text-[11px] text-zinc-400 border-white/6 bg-[#18181b]"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleBrowseOutput}
                      className="h-7 w-7 shrink-0 border-white/6 bg-[#18181b]"
                      aria-label={strings.settings.selectFolder}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{strings.settings.selectFolder}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: DEPENDENCIAS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {strings.settings.navDependencies}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleVerifyAll}
                className="h-6 text-[11px] text-zinc-400 hover:text-white"
              >
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                {strings.settings.depVerifyAll}
              </Button>
            </div>

            <div className="rounded-[6px] border border-white/6 bg-[#111113] divide-y divide-white/6">
              {/* FFmpeg */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      formData.dependencies.ffmpeg ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-zinc-300 font-medium text-[12px]">
                    {strings.settings.depFfmpeg}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleDep("ffmpeg")}
                  className="h-6 text-[11px] border-white/6 bg-[#18181b]"
                >
                  {formData.dependencies.ffmpeg ? (
                    <>
                      <RotateCcw className="w-3 h-3 mr-1 text-zinc-400" />
                      {strings.settings.depVerify}
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 mr-1 text-[#F97316]" />
                      {strings.settings.depInstall}
                    </>
                  )}
                </Button>
              </div>

              {/* Librosa */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      formData.dependencies.librosa ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-zinc-300 font-medium text-[12px]">
                    {strings.settings.depLibrosa}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleDep("librosa")}
                  className="h-6 text-[11px] border-white/6 bg-[#18181b]"
                >
                  {formData.dependencies.librosa ? (
                    <>
                      <RotateCcw className="w-3 h-3 mr-1 text-zinc-400" />
                      {strings.settings.depVerify}
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 mr-1 text-[#F97316]" />
                      {strings.settings.depInstall}
                    </>
                  )}
                </Button>
              </div>

              {/* Demucs */}
              <div className="flex items-center justify-between px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      formData.dependencies.demucs ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-zinc-300 font-medium text-[12px]">
                    {strings.settings.depDemucs}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleDep("demucs")}
                  className="h-6 text-[11px] border-white/6 bg-[#18181b]"
                >
                  {formData.dependencies.demucs ? (
                    <>
                      <RotateCcw className="w-3 h-3 mr-1 text-zinc-400" />
                      {strings.settings.depVerify}
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3 mr-1 text-[#F97316]" />
                      {strings.settings.depInstall}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* SECCIÓN 5: ACERCA DE */}
          <div className="space-y-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {strings.settings.navAbout}
            </h2>

            <div className="rounded-[6px] border border-white/6 bg-[#111113] p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-zinc-100">
                  {strings.settings.aboutAppName}
                </span>
                <span className="font-mono text-[11px] text-zinc-400">
                  {strings.settings.aboutVersion}
                </span>
              </div>
              <p className="text-[12px] text-zinc-400">
                {strings.settings.aboutEngine}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
