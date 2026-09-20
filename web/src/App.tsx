import { AudioLines, Languages, Terminal } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { CommandMenu } from '@/components/command-menu'
import { NAV_ITEMS } from '@/lib/nav'
import { useView } from '@/hooks/useView'
import { useI18n, useT } from '@/i18n/I18nProvider'
import { SystemStatusProvider, useSystemStatus, type StatusState } from '@/lib/system-status'
import { VIEW_COMPONENTS } from '@/views'
import logo from '@/assets/musickind-logo.svg'

const DOT_CLASS: Record<StatusState, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
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
          <span
            className={`absolute right-1 bottom-1 size-1.5 rounded-full ${DOT_CLASS[state]}`}
          />
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

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon">
          <SidebarHeader className="items-center justify-center py-3">
            <img src={logo} alt="" className="size-6" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.key} className="flex justify-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        isActive={view === item.key}
                        onClick={() => setView(item.key)}
                        aria-label={t(`nav.${item.key}`)}
                        className="size-8 justify-center p-2"
                      >
                        <item.icon />
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">{t(`nav.${item.key}`)}</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="items-center gap-1 py-3">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('common.language')}
                  onClick={toggleLang}
                  className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Languages className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('common.language')}</TooltipContent>
            </Tooltip>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <div className="flex h-full w-full items-center justify-center">
            <ActiveView />
          </div>
        </SidebarInset>
      </SidebarProvider>
      <CommandMenu />
      <Toaster theme="dark" />
    </TooltipProvider>
  )
}

function App() {
  return (
    <SystemStatusProvider>
      <Shell />
    </SystemStatusProvider>
  )
}

export default App
