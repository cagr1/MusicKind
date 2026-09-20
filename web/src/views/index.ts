import type { ComponentType } from 'react'
import type { NavKey } from '@/lib/nav'
import { Classifier } from './Classifier'
import { Sets } from './Sets'
import { Converter } from './Converter'
import { Metadata } from './Metadata'
import { Bpm } from './Bpm'
import { Stems } from './Stems'
import { Settings } from './Settings'

export const VIEW_COMPONENTS: Record<NavKey, ComponentType> = {
  classifier: Classifier,
  sets: Sets,
  converter: Converter,
  metadata: Metadata,
  bpm: Bpm,
  stems: Stems,
  settings: Settings,
}
