import { ListX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { useT } from '@/i18n/I18nProvider'

export function SelectionControls({
  selection,
  t,
  hasRows,
}: {
  selection: { count: number; remove: () => void; clear: () => void }
  t: ReturnType<typeof useT>
  hasRows: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {selection.count > 0 && (
        <Button variant="outline" size="sm" onClick={() => selection.remove()}>
          <Trash2 />
          {selection.count} {t('common.selected')} · {t('common.remove')}
        </Button>
      )}
      {hasRows && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('common.clearTable')}
                onClick={selection.clear}
              >
                <ListX />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.clearTable')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

export function RowCheckbox({
  checked,
  disabled,
  label,
  onClick,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onClick: (shiftKey: boolean) => void
}) {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event.shiftKey)
      }}
      aria-label={label}
    />
  )
}
