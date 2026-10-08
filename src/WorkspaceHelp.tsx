import { CircleHelp } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function WorkspaceHelp({children, title = 'How this screen works'}:{children:ReactNode; title?:string}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  return <div className="workspace-help"><button type="button" className="tutorial-trigger" onClick={() => dialog.current?.showModal()}><CircleHelp size={17} aria-hidden="true" /> Quick guide</button>{createPortal(<dialog ref={dialog} className="workspace-tutorial" aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}><header><h2 id={titleId}>{title}</h2><button type="button" className="filter-button" aria-label="Close quick guide" onClick={() => dialog.current?.close()}>Close</button></header><div className="tutorial-content">{children}</div><button type="button" className="primary-button" onClick={() => dialog.current?.close()}>Got it</button></dialog>, document.body)}</div>
}
