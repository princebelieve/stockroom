import { useEffect, useRef, useState } from 'react'

export function usePortalMenu(persistentDrawer = false) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    menu.current?.querySelector<HTMLElement>('button, a[href], summary, input, select')?.focus()
    const close = () => { setOpen(false); toggle.current?.focus() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab') return
      const items = [...(menu.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, input:not(:disabled), select:not(:disabled)') || [])].filter(item => item.getClientRects().length)
      if (!items.length) return
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    const resize = () => { if (!persistentDrawer && !window.matchMedia('(max-width: 650px)').matches) setOpen(false) }
    document.addEventListener('keydown', key); window.addEventListener('resize', resize)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', key); window.removeEventListener('resize', resize); if (menu.current?.contains(document.activeElement)) toggle.current?.focus() }
  }, [open, persistentDrawer])
  return { open, setOpen, menu, toggle }
}
