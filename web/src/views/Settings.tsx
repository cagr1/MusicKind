import * as React from 'react'
import {
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n, useT, type Lang } from '@/i18n/I18nProvider'
import { getJson, installDependency, postJson } from '@/lib/api'
import { electron } from '@/lib/electron'

export interface SettingsData {
  discogsKey: string
  discogsSecret: string
  lastfmApiKey: string
  acoustidApiKey: string
  language: Lang
  defaultOutputDir: string
}
export interface DependencyState {
  ffmpeg: boolean | null
  librosa: boolean | null
  numpy: boolean | null
  demucs: boolean | null
  acoustid: boolean | null
}
type DependencyKey = keyof DependencyState
export type InstallGroup = 'audio' | 'stems'
export type DependencyAction = 'verify' | 'install' | null
const EMPTY_SETTINGS: SettingsData = {
  discogsKey: '',
  discogsSecret: '',
  lastfmApiKey: '',
  acoustidApiKey: '',
  language: 'es',
  defaultOutputDir: 'output',
}
const EMPTY_DEPS: DependencyState = {
  ffmpeg: null,
  librosa: null,
  numpy: null,
  demucs: null,
  acoustid: null,
}

export function normalizeSettings(value: Partial<SettingsData> | undefined): SettingsData {
  return {
    ...EMPTY_SETTINGS,
    ...value,
    language: value?.language === 'en' ? 'en' : 'es',
    defaultOutputDir: value?.defaultOutputDir?.trim() || 'output',
  }
}
export function dependencyGroup(key: DependencyKey): InstallGroup | null {
  if (key === 'demucs') return 'stems'
  if (key === 'librosa' || key === 'numpy') return 'audio'
  return null
}
export function dependencyAction(
  key: DependencyKey,
  value: boolean | null,
  group: InstallGroup | null,
): DependencyAction {
  if (value === true) return 'verify'
  return key === 'ffmpeg' || key === 'acoustid' || group ? 'install' : null
}
export function dependencyBusy(
  key: DependencyKey,
  group: InstallGroup | null,
  checking: boolean,
  installing: InstallGroup | 'ffmpeg' | 'chromaprint' | null,
): boolean {
  const target = key === 'ffmpeg' ? 'ffmpeg' : key === 'acoustid' ? 'chromaprint' : group
  return checking || (installing !== null && installing === target)
}
export function dependencyLabel(
  value: boolean | null,
  labels: { checking: string; installed: string; missing: string; unavailable: string },
): string {
  if (value === true) return labels.installed
  if (value === false) return labels.missing
  return labels.checking || labels.unavailable
}

export async function installChromaprintAndVerify(
  install: () => Promise<{ success: boolean; error?: string; message?: string }>,
  verify: () => Promise<void>,
): Promise<void> {
  const result = await install()
  if (!result.success)
    throw new Error(result.message || result.error || 'Chromaprint installation failed')
  await verify()
}

function SecretInput({
  value,
  visible,
  label,
  onChange,
  onToggle,
}: {
  value: string
  visible: boolean
  label: string
  onChange: (value: string) => void
  onToggle: () => void
}) {
  return (
    <div className="relative flex w-full max-w-[320px] items-center">
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full border-line bg-surface-elevated pr-8 font-mono text-[11px]"
        aria-label={label}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 text-zinc-500 hover:text-zinc-200"
        aria-label={label}
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

export function Settings() {
  const t = useT()
  const { lang, setLang } = useI18n()
  const [form, setForm] = React.useState<SettingsData>(EMPTY_SETTINGS)
  const [deps, setDeps] = React.useState<DependencyState>(EMPTY_DEPS)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [installing, setInstalling] = React.useState<
    InstallGroup | 'ffmpeg' | 'chromaprint' | null
  >(null)
  const [visibleSecrets, setVisibleSecrets] = React.useState<Record<string, boolean>>({})
  const checkDependencies = React.useCallback(async () => {
    setChecking(true)
    try {
      const [depResponse, ffmpegResponse] = await Promise.all([
        getJson<{ deps?: Omit<DependencyState, 'ffmpeg'> }>('/api/check-deps'),
        getJson<{ installed?: boolean }>('/api/ffmpeg-status'),
      ])
      setDeps({
        ffmpeg: ffmpegResponse.installed === true,
        librosa: depResponse.deps?.librosa ?? null,
        numpy: depResponse.deps?.numpy ?? null,
        demucs: depResponse.deps?.demucs ?? null,
        acoustid: depResponse.deps?.acoustid ?? null,
      })
    } finally {
      setChecking(false)
    }
  }, [])
  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getJson<{ settings?: Partial<SettingsData> }>('/api/settings')
      const settings = normalizeSettings(response.settings)
      setForm(settings)
      setLang(settings.language)
      await checkDependencies()
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('settings.loadError'))
    } finally {
      setLoading(false)
    }
  }, [checkDependencies, setLang, t])
  React.useEffect(() => {
    void load()
  }, [load])
  const setField = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const save = async () => {
    setSaving(true)
    try {
      await postJson('/api/settings', form)
      toast.success(t('settings.saved'))
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : t('settings.loadError'))
    } finally {
      setSaving(false)
    }
  }
  const chooseOutput = async () => {
    const directory = await electron.openDirectory(t('settings.chooseFolder'))
    if (directory) setField('defaultOutputDir', directory)
  }
  const install = async (group: InstallGroup) => {
    setInstalling(group)
    try {
      await installDependency(group)
      await checkDependencies()
      toast.success(t('settings.installDone'))
    } catch (installError) {
      toast.error(installError instanceof Error ? installError.message : t('settings.installError'))
    } finally {
      setInstalling(null)
    }
  }
  const installFfmpeg = async () => {
    setInstalling('ffmpeg')
    try {
      const result = await electron.installFFmpeg()
      if (!result.success)
        throw new Error(result.message || result.error || t('settings.installError'))
      await checkDependencies()
      toast.success(t('settings.installDone'))
    } catch (installError) {
      toast.error(installError instanceof Error ? installError.message : t('settings.installError'))
    } finally {
      setInstalling(null)
    }
  }
  const installChromaprint = async () => {
    setInstalling('chromaprint')
    try {
      await installChromaprintAndVerify(() => electron.installChromaprint(), checkDependencies)
      toast.success(t('settings.installDone'))
    } catch (installError) {
      toast.error(installError instanceof Error ? installError.message : t('settings.installError'))
    } finally {
      setInstalling(null)
    }
  }
  const toggleSecret = (key: string) =>
    setVisibleSecrets((current) => ({ ...current, [key]: !current[key] }))
  const secretRows: Array<{ key: keyof SettingsData; label: string }> = [
    { key: 'discogsSecret', label: t('settings.discogsSecret') },
    { key: 'lastfmApiKey', label: t('settings.lastfmApiKey') },
    { key: 'acoustidApiKey', label: t('settings.acoustidApiKey') },
  ]
  const dependencyRows: Array<{ key: DependencyKey; label: string; group: InstallGroup | null }> = [
    { key: 'ffmpeg', label: t('settings.ffmpeg'), group: null },
    { key: 'librosa', label: t('settings.librosa'), group: 'audio' },
    { key: 'numpy', label: t('settings.numpy'), group: 'audio' },
    { key: 'demucs', label: t('settings.demucs'), group: 'stems' },
    { key: 'acoustid', label: t('settings.acoustid'), group: null },
  ]
  const labels = {
    checking: t('settings.checking'),
    installed: t('settings.installed'),
    missing: t('settings.missing'),
    unavailable: t('settings.unavailable'),
  }
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <Loader2 className="size-5 animate-spin" aria-label={t('settings.checking')} />
      </div>
    )
  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-app">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-6">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-zinc-100">
            {t('settings.title')}
          </h1>
        </div>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={saving}
          className="h-7 bg-brand text-[11px] text-white hover:bg-brand-hover"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {t('settings.save')}
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-[640px] space-y-8">
          {error ? (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                className="mt-3 border-red-400/30 text-red-100"
              >
                {t('settings.retry')}
              </Button>
            </div>
          ) : null}
          <details className="rounded border border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-zinc-300">{t('settings.advancedKeys')}</summary>
            <div className="mt-3 space-y-3">
              <SettingRow label={t('settings.discogsKey')}>
                <Input value={form.discogsKey} onChange={(event) => setField('discogsKey', event.target.value)} className="h-7 w-full max-w-[320px] border-line bg-surface-elevated font-mono text-[11px]" />
              </SettingRow>
              {secretRows.map(({ key, label }) => (
                <SettingRow key={key} label={label}>
                  <SecretInput value={form[key] as string} visible={visibleSecrets[key]} label={visibleSecrets[key] ? t('settings.hideSecret') : t('settings.showSecret')} onChange={(value) => setField(key, value)} onToggle={() => toggleSecret(key)} />
                </SettingRow>
              ))}
            </div>
          </details>
          <SettingsSection title={t('settings.language')}>
            <SettingRow label={t('settings.language')}>
              <Select
                value={lang}
                onValueChange={(value: Lang) => {
                  setLang(value)
                  setField('language', value)
                }}
              >
                <SelectTrigger className="h-7 w-full max-w-[320px] border-line bg-surface-elevated text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">{t('settings.spanish')}</SelectItem>
                  <SelectItem value="en">{t('settings.english')}</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </SettingsSection>
          <SettingsSection title={t('settings.output')}>
            <SettingRow label={t('settings.output')}>
              <div className="flex w-full max-w-[320px] gap-1.5">
                <Input
                  readOnly
                  value={form.defaultOutputDir}
                  className="h-7 min-w-0 border-line bg-surface-elevated font-mono text-[10px] text-zinc-400"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void chooseOutput()}
                      aria-label={t('settings.chooseFolder')}
                      className="border-line bg-surface-elevated"
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('settings.chooseFolder')}</TooltipContent>
                </Tooltip>
              </div>
            </SettingRow>
          </SettingsSection>
          <SettingsSection
            title={t('settings.dependencies')}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void checkDependencies()}
                disabled={checking || Boolean(installing)}
                className="h-6 text-[10px] text-zinc-400"
              >
                <CheckCircle2 className="size-3 text-emerald-400" />
                {t('settings.verifyAll')}
              </Button>
            }
          >
            {dependencyRows.map(({ key, label, group }) => (
              <DependencyRow
                key={key}
                label={label}
                value={deps[key]}
                status={dependencyLabel(deps[key], labels)}
                action={
                  dependencyAction(key, deps[key], group) === 'verify'
                    ? () => void checkDependencies()
                    : key === 'ffmpeg'
                      ? () => void installFfmpeg()
                      : key === 'acoustid'
                        ? () => void installChromaprint()
                        : group
                          ? () => void install(group)
                          : undefined
                }
                actionLabel={deps[key] === true ? t('settings.verify') : t('settings.install')}
                busy={dependencyBusy(key, group, checking, installing)}
                hint={key === 'acoustid' ? t('settings.acoustidHint') : undefined}
              />
            ))}
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}
function SettingsSection({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded border border-line bg-surface-panel">
        {children}
      </div>
    </section>
  )
}
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-zinc-300">{label}</p>
        {hint ? (
          <p className="mt-0.5 max-w-[230px] text-[10px] leading-snug text-zinc-600">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}
function DependencyRow({
  label,
  value,
  status,
  action,
  actionLabel,
  busy,
  hint,
}: {
  label: string
  value: boolean | null
  status: string
  action?: () => void
  actionLabel: string
  busy: boolean
  hint?: string
}) {
  return (
    <div className="flex min-h-11 items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span
          className={`size-1.5 rounded-full ${value === true ? 'bg-emerald-500' : value === false ? 'bg-zinc-600' : 'bg-amber-500'}`}
        />
        <div>
          {hint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p tabIndex={0} className="cursor-help text-[11px] font-medium text-zinc-300">
                  {label}
                </p>
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          ) : (
            <p className="text-[11px] font-medium text-zinc-300">{label}</p>
          )}
          <p className="text-[10px] text-zinc-600">{status}</p>
        </div>
      </div>
      {action ? (
        <Button
          variant="outline"
          size="xs"
          onClick={action}
          disabled={busy}
          className="border-line bg-surface-elevated text-[10px]"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : value === true ? (
            <>
              <RotateCcw className="size-3" />
              {actionLabel}
            </>
          ) : (
            <>
              <Download className="size-3 text-brand" />
              {actionLabel}
            </>
          )}
        </Button>
      ) : value === true ? (
        <Check className="size-3.5 text-emerald-400" />
      ) : null}
    </div>
  )
}
