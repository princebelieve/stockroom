import { useEffect, useState, type ReactNode } from 'react'

export function NavigationSection({ title, active, screens, children }: { title: string; active: string; screens: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const members = screens.join(',')
  useEffect(() => { if (members.split(',').includes(active)) setOpen(true) }, [active, members])
  return <details className="navigation-section" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{title}</summary><div>{children}</div></details>
}
