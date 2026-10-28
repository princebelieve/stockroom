import { useEffect, useRef } from 'react'

function editableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')))
}

function platformModifier() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? 'Cmd' : 'Ctrl'
}

export function KeyboardShortcuts({ screen, screenTitle, open, onOpenChange, onFindTool }: {
  screen: string
  screenTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onFindTool: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const modifier = platformModifier()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || editableTarget(event.target)) return
      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        onOpenChange(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(false)
        onFindTool()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onFindTool, onOpenChange])

  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) {
      if (!previousFocus.current) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
      closeButton.current?.focus()
    } else if (!open && element?.open) {
      element.close()
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [open])

  const screenTip = screen === 'Settings'
    ? 'Use tool search to find settings tasks, device setup, or another available screen without hunting through the side menu.'
    : screen === 'Inventory' || screen === 'Stocktake' || screen === 'Movements'
      ? 'Use tool search to jump between stock tasks, sales, and reports.'
      : screen === 'POS' || screen === 'Oil' || screen === 'Payments' || screen === 'Counter' || screen === 'Restaurant'
        ? 'Use tool search to move between sales, receipts, customers, and stock tasks.'
        : screen === 'Sales' || screen === 'Reports'
        ? 'Use tool search to jump between receipts, reports, customers, and other available screens.'
        : 'Use tool search to find any screen available to your role and business.'

  return <dialog ref={dialog} className="workspace-tutorial keyboard-shortcuts-dialog" aria-labelledby="keyboard-shortcuts-title" onCancel={event => { event.preventDefault(); onOpenChange(false) }} onClose={() => { if (open) onOpenChange(false) }}>
    <header><div><p className="kicker">{screenTitle}</p><h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2></div><button ref={closeButton} type="button" className="filter-button" onClick={() => onOpenChange(false)}>Close</button></header>
    <p className="keyboard-shortcuts-tip">{screenTip}</p>
    <dl className="keyboard-shortcuts-list">
      <div><dt><kbd>{modifier} K</kbd></dt><dd>Find a screen or tool</dd></div>
      <div><dt><kbd>?</kbd></dt><dd>Show these shortcuts for the current screen</dd></div>
      <div><dt><kbd>Esc</kbd></dt><dd>Close this guide or an open menu</dd></div>
    </dl>
  </dialog>
}
