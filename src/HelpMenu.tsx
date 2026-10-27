import { SupportContacts } from './SupportContacts'
import { useScreenHelp } from './WorkspaceHelp'
import { useEffect, useRef, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { answerHelpQuestion, type HelpRoute } from './services/localHelpAssistant'

function contextualQuestion(topic?: { title: string; description: string }) {
  const title = (topic?.title || '').toLowerCase()
  if (/receipt|payment history/.test(title)) return 'How can I reprint a receipt?'
  if (/overview|business overview/.test(title)) return 'How do I set up Stockroom for my business?'
  if (/payment/.test(title)) return 'How do I set up church collections?'
  if (/device|printer|scanner/.test(title)) return 'How do I set up a barcode scanner?'
  if (/inventory|product|stock|purchas/.test(title)) return 'How do I add a product?'
  if (/staff|team|access/.test(title)) return 'Where do I manage staff access?'
  if (/sales|transaction/.test(title)) return 'Where can I find a saved receipt?'
  return 'How do I find a screen in Stockroom?'
}

function SupportNavigationHelp({ navigate, topic, role, routes }: { navigate: (screen: string, section?: string, tab?: string, taskId?: string) => void; topic?: { title: string; description: string }; role?: string; routes?: HelpRoute[] }) {
  const [question, setQuestion] = useState('')
  const [submittedQuestion, setSubmittedQuestion] = useState('')
  const [answer, setAnswer] = useState<ReturnType<typeof answerHelpQuestion>>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!submittedQuestion || !answerRef.current) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    requestAnimationFrame(() => answerRef.current?.scrollIntoView({ behavior, block: 'nearest' }))
  }, [answer, submittedQuestion])
  function ask(value = question) {
    const clean = value.trim()
    if (!clean) return
    setQuestion('')
    setSubmittedQuestion(clean)
    setAnswer(answerHelpQuestion(clean, { role, context: `${topic?.title || ''} ${topic?.description || ''}`, routes }))
  }
  const example = contextualQuestion(topic)
  return <section className="help-navigation-assistant" aria-label="Chat with Stockroom help assistant">
    <h2>Chat with Stockroom</h2><p>I’m Stockroom’s in-app help assistant. I use the written guide and the screens available to you to answer Stockroom questions.</p>
    {submittedQuestion && <div className="help-navigation-conversation"><p className="help-navigation-user-message">{submittedQuestion}</p>{answer ? <div ref={answerRef} tabIndex={-1} className="help-navigation-answer" role="status"><strong>{answer.title}</strong><p>{answer.answer}</p>{answer.destinationLabel && <p className="help-navigation-route-hint">In your navigation: <strong>{answer.destinationLabel}</strong>{answer.destinationHint ? ` — ${answer.destinationHint}` : ''}</p>}<div className="help-navigation-answer-actions">{answer.screen && <button type="button" className="filter-button" onClick={() => navigate(answer.screen!, answer.section, answer.tab, answer.taskId)}>Open {answer.destinationLabel || answer.title}</button>}<button type="button" className="text-button" onClick={() => navigate('Guide')}>Open full guide</button></div></div> : <div ref={answerRef} tabIndex={-1} className="help-navigation-answer" role="status"><strong>I couldn’t find an answer in Stockroom’s built-in help.</strong><p>I’m Stockroom’s in-app help assistant, so I can answer from the written guide and your available screens. Please search the user guide or contact Stockroom support for this question.</p><div className="help-navigation-answer-actions"><button type="button" className="filter-button" onClick={() => navigate('Guide')}>Open the user guide</button><a className="filter-button" href="mailto:support@sbi.globalcreest.com">Email Stockroom support</a></div></div>}</div>}
    <form onSubmit={event => { event.preventDefault(); ask() }}><label htmlFor="help-navigation-question">Your question</label><input id="help-navigation-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask another question…" maxLength={200} /><button className="primary-button" type="submit" disabled={!question.trim()}>Ask</button></form>
    <button type="button" className="text-button help-navigation-suggestion" onClick={() => setQuestion(example)}>Example for this screen: “{example}”</button>
  </section>
}

export function HelpMenu({ guide, headers, scope, className, screenHelpTopic, navigate, role, routes }: { guide?: () => void; headers?: Record<string, string>; scope?: string; className?: string; screenHelpTopic?: { title: string; description: string }; navigate?: (screen: string, section?: string, tab?: string, taskId?: string) => void; role?: string; routes?: HelpRoute[] }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [proactiveSuggestion, setProactiveSuggestion] = useState(false)
  const screenHelp = useScreenHelp()
  useEffect(() => {
    if (!scope || !navigate) return
    const key = `stockroom-help-suggestion:${scope}`
    try { if (Date.now() - Number(localStorage.getItem(key) || 0) < 7 * 24 * 60 * 60 * 1000) return } catch { return }
    let timer: number | undefined
    const schedule = () => { if (timer) window.clearTimeout(timer); setProactiveSuggestion(false); if (document.visibilityState !== 'visible') return; timer = window.setTimeout(() => { if (document.visibilityState !== 'visible' || menu.current?.open) return; try { localStorage.setItem(key, String(Date.now())) } catch { /* Storage is optional. */ } setProactiveSuggestion(true) }, 60_000) }
    const onVisibility = () => schedule()
    document.addEventListener('pointerdown', schedule); document.addEventListener('keydown', schedule); document.addEventListener('scroll', schedule, true); document.addEventListener('visibilitychange', onVisibility); schedule()
    return () => { if (timer) window.clearTimeout(timer); document.removeEventListener('pointerdown', schedule); document.removeEventListener('keydown', schedule); document.removeEventListener('scroll', schedule, true); document.removeEventListener('visibilitychange', onVisibility) }
  }, [scope, Boolean(navigate), screenHelpTopic?.title])
  useEffect(() => { const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && menu.current) menu.current.open = false }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus() } }; document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) } }, [])
  return <details ref={menu} className={`help-menu${className ? ` ${className}` : ''}`} onToggle={() => setProactiveSuggestion(false)}><summary aria-label={proactiveSuggestion ? 'Chat with Stockroom for help finding something.' : 'Chat with Stockroom help assistant'} title={proactiveSuggestion ? 'Chat with Stockroom for help finding something.' : 'Chat with Stockroom help assistant'} data-suggesting={proactiveSuggestion}><MessageCircle size={18} aria-hidden="true" /><span className="help-menu-trigger-label">Chat with help</span></summary><div className="help-menu-panel">{screenHelp && <button type="button" className="filter-button" onClick={() => { if (menu.current) menu.current.open = false; screenHelp(screenHelpTopic ? { title: screenHelpTopic.title, children: <p>{screenHelpTopic.description}</p> } : undefined) }}>Help for this screen</button>}{guide && <button type="button" className="filter-button" onClick={() => { if (menu.current) menu.current.open = false; guide() }}>Open the user guide</button>}{navigate && <SupportNavigationHelp topic={screenHelpTopic} role={role} routes={routes} navigate={(screen, section, tab, taskId) => { if (menu.current) menu.current.open = false; navigate(screen, section, tab, taskId) }} />}<SupportContacts headers={headers} scope={scope} /></div></details>
}
