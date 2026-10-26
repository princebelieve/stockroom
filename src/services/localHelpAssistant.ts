import guideChapters from '../user-guide.json'
import { allScreenHelpEntries } from '../lib/screenHelp'

type GuideChapter = { id: string; title: string; steps: string[]; note?: string }
export type LocalHelpAnswer = {
  title: string
  answer: string
  screen?: string
  section?: string
  tab?: string
  taskId?: string
  destinationLabel?: string
  destinationHint?: string
  guideTopic: string
  confidence: 'good' | 'low'
}
export type HelpRoute = { label: string; hint?: string; screen: string; section?: string; tab?: string; taskId?: string }

const chapters: GuideChapter[] = [...guideChapters as GuideChapter[], ...allScreenHelpEntries()]
const stopWords = new Set('a an and are as at be can do does for from how i in is it me my of on or the this to what where which who with would'.split(' '))
const aliases: Record<string, string[]> = {
  reprint: ['receipt', 'print again'], scanner: ['barcode', 'scan'], printer: ['receipt printer', 'print'],
  staff: ['employee', 'cashier', 'team'], login: ['sign in', 'password'], setup: ['set up', 'configure', 'workspace'],
  church: ['donation', 'pledge', 'fund', 'donor', 'collection'], product: ['item', 'catalogue', 'inventory', 'stock'],
  refund: ['return', 'money back'], sale: ['sales', 'transaction', 'receipt'],
}

function terms(value: string) {
  const base = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length > 1 && !stopWords.has(word))
  const expanded = [...base]
  for (const word of base) for (const [key, synonyms] of Object.entries(aliases)) {
    if (word === key || synonyms.some(synonym => synonym.split(' ').includes(word))) expanded.push(key, ...synonyms.flatMap(item => item.split(' ')))
  }
  return [...new Set(expanded)]
}

function destination(chapter: GuideChapter): Pick<LocalHelpAnswer, 'screen' | 'section' | 'tab'> {
  const title = chapter.title.toLowerCase()
  if (/church collections/.test(title)) return { screen: 'Payments', tab: 'Church collections' }
  if (/receipt|sales history|reprint/.test(title)) return { screen: 'Sales', section: 'sales-receipt-history' }
  if (/printer|device|barcode|scanner/.test(title)) return { screen: 'Device' }
  if (/staff|cashier|access permission|team member/.test(title)) return { screen: 'Team', section: 'team-members' }
  if (/product|inventory|catalogue|stock/.test(title)) return { screen: 'Inventory', section: 'products' }
  if (/workspace|business setup|getting started|settings/.test(title)) return { screen: 'Settings' }
  if (/payment|job|invoice/.test(title)) return { screen: 'Payments' }
  if (/subscription/.test(title)) return { screen: 'Subscription' }
  if (/report|profit/.test(title)) return { screen: 'Reports' }
  if (/customer|wallet/.test(title)) return { screen: 'Wallet' }
  return {}
}

function score(questionTerms: string[], chapter: GuideChapter, context?: string) {
  const titleTerms = terms(chapter.title)
  const bodyTerms = terms([...chapter.steps, chapter.note || ''].join(' '))
  let points = 0
  for (const term of questionTerms) {
    if (titleTerms.includes(term)) points += 4
    else if (bodyTerms.includes(term)) points += 1
  }
  if (questionTerms.some(term => chapter.title.toLowerCase().includes(term))) points += 3
  if (context && terms(context).some(term => titleTerms.includes(term))) points += 2
  return points
}

function greetingReply(question: string): LocalHelpAnswer | null {
  const text = question.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim()
  const match = text.match(/^(hello|hi|hey|good morning|good afternoon|good evening|good day|how are you(?: doing)?)(?: there)?(?: how are you(?: doing)?)?$/)
  if (!match) return null
  const greeting = match[1]
  let answer: string
  if (greeting === 'how are you' || greeting === 'how are you doing') {
    answer = "I'm doing well, thank you. What are you trying to do in Stockroom? I can explain the steps and help you open the right screen."
  } else if (greeting.startsWith('good ')) {
    answer = `${greeting[0].toUpperCase()}${greeting.slice(1)}! What can I help you find in Stockroom today?`
  } else {
    answer = greeting === 'hi'
      ? 'Hello! What are you trying to do in Stockroom? I can explain the steps and help you open the right screen.'
      : 'Hi! What are you trying to do in Stockroom? I can explain the steps and help you open the right screen.'
  }
  return { title: greeting.startsWith('good ') ? `${greeting[0].toUpperCase()}${greeting.slice(1)}!` : greeting === 'how are you' || greeting === 'how are you doing' ? 'Doing well, thanks!' : 'Hello!', answer, guideTopic: 'greeting', confidence: 'good' }
}

/** Offline, extractive help: searches the same instructions shown in the user guide. */
export function answerHelpQuestion(question: string, options: { role?: string; context?: string; routes?: HelpRoute[] } = {}): LocalHelpAnswer | null {
  const greeting = greetingReply(question)
  if (greeting) return greeting
  const queryTerms = terms(question)
  if (!queryTerms.length) return null
  const candidates = chapters
    .filter(chapter => options.role === 'owner' || chapter.id !== 'section-33')
    .map(chapter => ({ chapter, points: score(queryTerms, chapter, options.context) }))
    .sort((a, b) => b.points - a.points)
  const best = candidates[0]
  const rankedRoutes = (options.routes || []).map(route => ({ route, points: score(queryTerms, { id: route.screen, title: route.label, steps: [route.hint || ''] }) }))
    .sort((a, b) => b.points - a.points)
  const bestRoute = rankedRoutes[0]
  if (!best || best.points < 4) {
    if (!bestRoute || bestRoute.points < 4) return null
    return {
      title: bestRoute.route.label,
      answer: bestRoute.route.hint || `Open ${bestRoute.route.label} from the navigation menu.`,
      screen: bestRoute.route.screen,
      section: bestRoute.route.section,
      tab: bestRoute.route.tab,
      taskId: bestRoute.route.taskId,
      destinationLabel: bestRoute.route.label,
      destinationHint: bestRoute.route.hint,
      guideTopic: 'navigation',
      confidence: 'low',
    }
  }

  const matchedSteps = best.chapter.steps
    .map((text, index) => ({ text, index, points: score(queryTerms, { ...best.chapter, title: '', steps: [text], note: '' }) }))
    .filter(step => step.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
  const steps = matchedSteps.length ? matchedSteps.map((step, index) => `${index + 1}. ${step.text}`) : best.chapter.steps.slice(0, 3).map((step, index) => `${index + 1}. ${step}`)
  const note = best.chapter.note ? `\n\nKeep in mind: ${best.chapter.note}` : ''
  const contextualRoute = (options.routes || []).map(route => ({ route, points: score(terms(best.chapter.title), { id: route.screen, title: route.label, steps: [route.hint || ''] }) }))
    .sort((a, b) => b.points - a.points)[0]
  const matchingRoute = bestRoute && bestRoute.points > 0 ? bestRoute.route : contextualRoute?.points > 0 ? contextualRoute.route : undefined
  return {
    title: best.chapter.title,
    answer: `${steps.join('\n')}${note}`,
    ...(matchingRoute || destination(best.chapter)),
    destinationLabel: matchingRoute?.label,
    destinationHint: matchingRoute?.hint,
    guideTopic: best.chapter.id,
    confidence: best.points >= 8 ? 'good' : 'low',
  }
}
