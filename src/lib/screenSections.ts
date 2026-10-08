const sections: Record<string, readonly string[]> = {
  Inventory: ['products','add-search','transfers','purchasing','expiry','pricing','import','starters','options','handwritten'],
  Sales: ['sales-receipt-history','sales-history','sales-void-history','sales-payment-evidence','sales-reconciliation','returns'],
  Team: ['team-members','team-add-staff','links','team-password-recovery'],
  Wallet: ['customers','new-customer','birthdays'],
  Reports: ['summary','stock-report','expenses','new-expense'],
  Settings: ['identity','payment-methods','branches','appearance','password','backup'],
}

export function screenSection(screen: string, requested?: string) {
  const id=requested==='inventory-purchasing'?'purchasing':requested
  return id && sections[screen]?.includes(id) ? id : sections[screen]?.[0] || ''
}

export function initialScreenSections(screen: string): Record<string,string> {
  const state=window.history.state as {screen?:string;section?:string}|null
  const hash=window.location.hash.slice(1)
  const id=hash || (state?.screen===screen?state.section:undefined)
  return {[screen]:screenSection(screen,id)}
}
