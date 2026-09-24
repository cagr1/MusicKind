import {
  Activity,
  AudioLines,
  FileAudio,
  Languages,
  ListMusic,
  RefreshCw,
  Search,
  Settings,
  Tags,
  Terminal,
} from 'lucide-react'
import { Suspense } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { CommandMenu } from '@/components/command-menu'
import { NAV_ITEMS } from '@/lib/nav'
import { useView } from '@/hooks/useView'
import { useI18n, useT } from '@/i18n/I18nProvider'
import { SystemStatusProvider, useSystemStatus, type StatusState } from '@/lib/system-status'
import { VIEW_COMPONENTS } from '@/views'
import logo from '@/assets/musickind-logo.svg'
import { Popover } from 'radix-ui'
import { PlayerProvider } from '@/lib/player'
import { ProcessProvider, useProcess } from '@/lib/process'
import { Skeleton } from '@/components/ui/skeleton'

const DOT_CLASS: Record<StatusState, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
}

function ViewFallback() {
  return (
    <div className="flex h-full flex-col gap-4 p-6" aria-busy="true">
      <Skeleton className="h-8 w-48 bg-white/[0.06]" />
      <Skeleton className="h-12 w-full bg-white/[0.06]" />
      <Skeleton className="h-12 w-full bg-white/[0.06]" />
      <Skeleton className="h-12 w-full bg-white/[0.06]" />
    </div>
  )
}

function StatusIndicator({
  icon: Icon,
  state,
  label,
}: {
  icon: typeof AudioLines
  state: StatusState
  label: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex size-8 items-center justify-center text-sidebar-foreground/80">
          <Icon className="size-4" />
          <span className={`absolute right-1 bottom-1 size-1.5 rounded-full ${DOT_CLASS[state]}`} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function Shell() {
  const { view, setView } = useView()
  const t = useT()
  const { toggleLang } = useI18n()
  const status = useSystemStatus()
  const ActiveView = VIEW_COMPONENTS[view]
  const { active } = useProcess()
  const navIcons = {
    classifier: Tags,
    sets: ListMusic,
    converter: RefreshCw,
    metadata: FileAudio,
    bpm: Activity,
    stems: AudioLines,
    settings: Settings,
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen w-screen overflow-hidden bg-surface-app text-zinc-100">
        <aside className="flex w-[220px] shrink-0 flex-col justify-between border-r border-line bg-surface-app">
          <div>
            <div className="flex h-[58px] items-center gap-3 border-b border-line px-4">
              <img src={logo} alt="MusicKind" className="size-7" />
              <div className="leading-none">
                <p className="text-[13px] font-semibold">{t('app.name')}</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  {t('app.tagline')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
              }
              className="mx-3 mt-3 flex h-8 w-[calc(100%-24px)] items-center justify-between
                rounded border border-line bg-surface-panel px-2.5 text-[11px] text-zinc-500
                hover:text-zinc-300"
              aria-label={t('commandPalette.open')}
            >
              <span className="flex items-center gap-2">
                <Search className="size-3.5" />
                {t('commandPalette.search')}
              </span>
              <kbd className="font-mono text-[10px]">⌘K</kbd>
            </button>
            <nav className="space-y-0.5 p-2" aria-label={t('common.navigation')}>
              {NAV_ITEMS.map((item) => {
                const Icon = navIcons[item.key]
                const isActive = view === item.key

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setView(item.key)}
                    className={`flex h-8 w-full items-center gap-2.5 rounded px-3 text-left text-[12px] font-medium ${
                      isActive
                        ? 'bg-white/[0.07] text-zinc-50'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                    }`}
                  >
                    <Icon className={`size-4 ${isActive ? 'text-brand' : ''}`} />
                    <span>{t(`nav.${item.key}`)}</span>
                  </button>
                )
              })}
            </nav>
          </div>
          <div className="border-t border-line">
            {active.status === 'running' || active.status === 'paused' ? (
              <div className="space-y-1.5 bg-surface-panel p-3">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="truncate text-zinc-300">{active.name}</span>
                  <span className="text-brand">
                    {active.current}/{active.total}
                  </span>
                </div>
                <div className="h-0.5 bg-white/10">
                  <div
                    className="h-full bg-brand transition-all"
                    style={{
                      width: `${(active.current / Math.max(1, active.total)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-between px-3 text-[11px] text-zinc-500 hover:bg-white/[0.03]"
                    aria-label={t('status.title')}
                  >
                    <span>{t('status.title')}</span>
                    <span
                      className={`size-1.5 rounded-full ${
                        status.ffmpeg === 'ok' && status.python === 'ok'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                    />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="top"
                    align="start"
                    className="w-64 space-y-2 rounded border border-line bg-surface-panel p-3 text-[11px] shadow-xl"
                  >
                    <p className="font-semibold uppercase tracking-wider text-zinc-300">
                      {t('status.title')}
                    </p>
                    <StatusIndicator
                      icon={AudioLines}
                      state={status.ffmpeg}
                      label={t(`status.ffmpeg.${status.ffmpeg}`)}
                    />
                    <StatusIndicator
                      icon={Terminal}
                      state={status.python}
                      label={t(`status.python.${status.python}`)}
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
            <button
              type="button"
              aria-label={t('common.language')}
              onClick={toggleLang}
              className="flex h-9 w-full items-center gap-2 px-3 text-[11px] text-zinc-500 hover:text-zinc-200"
            >
              <Languages className="size-4" />
              {t('common.language')}
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">
          <Suspense fallback={<ViewFallback />}>
            <ActiveView />
          </Suspense>
        </main>
      </div>
      <CommandMenu />
      <Toaster theme="dark" />
    </TooltipProvider>
  )
}

function App() {
  return (
    <SystemStatusProvider>
      <ProcessProvider>
        <PlayerProvider>
          <Shell />
        </PlayerProvider>
      </ProcessProvider>
    </SystemStatusProvider>
  )
}

export default App
