import { getCamelotRgba, normalizeCamelot } from '@/lib/camelot'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/i18n/I18nProvider'

interface CamelotBadgeProps {
  camelotKey?: string | null
  className?: string
  onClick?: () => void
  interactive?: boolean
  keySource?: 'tag' | 'analysis' | null
}

export function CamelotBadge({
  camelotKey,
  className = '',
  onClick,
  interactive = false,
  keySource = null,
}: CamelotBadgeProps) {
  const t = useT()
  const key = normalizeCamelot(camelotKey)
  const isAnalysis = keySource === 'analysis' && key !== null
  const style = {
    backgroundColor: key ? getCamelotRgba(key, 0.12) : 'rgb(39 39 42)',
    color: key ? getCamelotRgba(key, 0.85) : 'rgb(161 161 170)',
    ...(isAnalysis ? { borderColor: getCamelotRgba(key, 0.6) } : {}),
  }
  const classes = [
    'inline-flex h-[22px] shrink-0 items-center justify-center rounded px-2',
    'font-mono text-[11px] font-semibold tabular-nums transition-all',
    ...(isAnalysis ? ['border border-dashed'] : []),
    className,
  ].join(' ')

  const badge =
    interactive || onClick ? (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={`${classes} cursor-pointer hover:brightness-125 focus-visible:outline-none
          focus-visible:ring-1 focus-visible:ring-brand`}
      >
        {key ?? '—'}
      </button>
    ) : (
      <span style={style} className={classes}>
        {key ?? '—'}
      </span>
    )

  if (!isAnalysis) return badge

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{t('music.estimated')}</TooltipContent>
    </Tooltip>
  )
}
