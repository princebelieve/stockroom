import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import './passwordInput.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  toggleLabel?: string
}

export function PasswordInput({ toggleLabel = 'password', className = '', ...inputProps }: Props) {
  const [visible, setVisible] = useState(false)
  const description = toggleLabel.trim() || 'password'
  return <div className="password-wrap"><input {...inputProps} className={`password-field${className ? ` ${className}` : ''}`} type={visible ? 'text' : 'password'} /><button type="button" className="icon-button password-toggle" onClick={() => setVisible(value => !value)} aria-label={`${visible ? 'Hide' : 'Show'} ${description}`} title={`${visible ? 'Hide' : 'Show'} ${description}`}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
}
