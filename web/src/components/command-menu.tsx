import * as React from 'react'
import { Languages } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { NAV_ITEMS } from '@/lib/nav'
import { useView } from '@/hooks/useView'
import { useI18n, useT } from '@/i18n/I18nProvider'

export function CommandMenu() {
  const [open, setOpen] = React.useState(false)
  const { setView } = useView()
  const { toggleLang } = useI18n()
  const t = useT()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('commandPalette.title')}
      description={t('commandPalette.description')}
    >
      <CommandInput placeholder={t('commandPalette.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('commandPalette.title')}</CommandEmpty>
        <CommandGroup heading={t('commandPalette.views')}>
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.key}
              onSelect={() => {
                setView(item.key)
                setOpen(false)
              }}
            >
              <item.icon />
              <span>{t(`nav.${item.key}`)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t('commandPalette.actions')}>
          <CommandItem
            onSelect={() => {
              toggleLang()
              setOpen(false)
            }}
          >
            <Languages />
            <span>{t('commandPalette.changeLanguage')}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
