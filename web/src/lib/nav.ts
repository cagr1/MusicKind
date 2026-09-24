import {
  Activity,
  AudioLines,
  FileAudio,
  ListMusic,
  RefreshCw,
  Settings,
  Tags,
  type LucideIcon,
} from 'lucide-react'

export type NavKey = 'classifier' | 'sets' | 'converter' | 'metadata' | 'bpm' | 'stems' | 'settings'

export interface NavItem {
  key: NavKey
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'classifier', icon: Tags },
  { key: 'sets', icon: ListMusic },
  { key: 'converter', icon: RefreshCw },
  { key: 'metadata', icon: FileAudio },
  { key: 'bpm', icon: Activity },
  { key: 'stems', icon: AudioLines },
  { key: 'settings', icon: Settings },
]
