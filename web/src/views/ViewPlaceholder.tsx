import type { LucideIcon } from 'lucide-react'

export function ViewPlaceholder({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Icon className="text-muted-foreground size-24" strokeWidth={1} />
    </div>
  )
}
