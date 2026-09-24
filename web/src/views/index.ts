import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { NavKey } from '@/lib/nav'

type ViewComponent = LazyExoticComponent<ComponentType>

export const VIEW_COMPONENTS: Record<NavKey, ViewComponent> = {
  classifier: lazy(() =>
    import('./Classifier').then(({ Classifier }) => ({ default: Classifier })),
  ),
  sets: lazy(() => import('./Sets').then(({ Sets }) => ({ default: Sets }))),
  converter: lazy(() => import('./Converter').then(({ Converter }) => ({ default: Converter }))),
  metadata: lazy(() => import('./Metadata').then(({ Metadata }) => ({ default: Metadata }))),
  bpm: lazy(() => import('./Bpm').then(({ Bpm }) => ({ default: Bpm }))),
  stems: lazy(() => import('./Stems').then(({ Stems }) => ({ default: Stems }))),
  settings: lazy(() => import('./Settings').then(({ Settings }) => ({ default: Settings }))),
}
