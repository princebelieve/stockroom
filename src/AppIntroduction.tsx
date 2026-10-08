import { useState } from 'react'
import { Boxes, ReceiptText, Users, Utensils } from 'lucide-react'

const slides = [
  { icon: ReceiptText, title: 'Keep daily sales moving', text: 'Record sales and payments, issue receipts and find past transactions in one place.' },
  { icon: Boxes, title: 'Know what is in stock', text: 'Receive supplies, track quantities and costs, and spot goods that need attention.' },
  { icon: Utensils, title: 'Give every order a clear next step', text: 'Use the order counter for takeaway, or tables and tabs for restaurant service. Follow preparation and payment separately.' },
  { icon: Users, title: 'Bring your business together', text: 'Manage customers and staff access. Save daily work on this device and synchronize with other devices when connected.' },
]
export function AppIntroduction({ onContinue }: { onContinue: () => void }) {
  const [step, setStep] = useState(0)
  const slide = slides[step]
  return <section className="login-card app-introduction" aria-label="Welcome to Stockroom"><span className="intro-eyebrow">Welcome to Stockroom</span><div className="intro-illustration"><slide.icon size={72} strokeWidth={1.5} aria-hidden="true" /></div><div aria-live="polite" aria-atomic="true"><h1>{slide.title}</h1><p>{slide.text}</p></div><p className="intro-note">Choose the workspaces that fit your business during setup.</p><nav className="intro-progress" aria-label="Introduction steps">{slides.map((item, index) => <button type="button" key={item.title} aria-label={`Step ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)} />)}</nav><div className="intro-actions"><button type="button" className="text-button" onClick={step ? () => setStep(step - 1) : onContinue}>{step ? 'Back' : 'Skip introduction'}</button><button type="button" className="primary-button" onClick={() => step < slides.length - 1 ? setStep(step + 1) : onContinue()}>{step < slides.length - 1 ? 'Next' : 'Continue to sign in'}</button></div></section>
}
