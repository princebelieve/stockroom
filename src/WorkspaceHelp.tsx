import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'

export function WorkspaceHelp({children}:{children:ReactNode}) {
  return <details className="workspace-help"><summary><CircleHelp size={17} aria-hidden="true" /> Help</summary><div>{children}</div></details>
}
