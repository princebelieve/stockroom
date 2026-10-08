import { CloudOff, Wifi } from 'lucide-react'

export function syncErrorMessage(message: string) {
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)
    ? 'Could not reach cloud sync. Changes remain saved on this device.' : message
}

export function SyncStatusIndicator({ online, status }: { online:boolean; status:{configured:boolean;pending:number;pendingSettings?:number;conflicts?:number;lastError:string} }) {
  const setup = status.pendingSettings || 0
  const waiting = status.pending ? setup === status.pending
    ? `${setup} setup change${setup === 1 ? '' : 's'} waiting`
    : `${status.pending} change${status.pending === 1 ? '' : 's'} waiting${setup ? ` · ${setup} setup` : ''}` : ''
  const ready = online && status.configured && !status.lastError && !status.conflicts
  const label = !online ? 'Offline' : !status.configured ? 'Sync not configured' : status.lastError ? 'Sync unavailable' : status.conflicts ? `${status.conflicts} change${status.conflicts===1?' needs':'s need'} review` : status.pending ? 'Waiting to sync' : 'Up to date'
  return <div className={ready ? 'sync-status sync-ready' : 'sync-status offline'}>{ready ? <Wifi size={16}/> : <CloudOff size={16}/>}<span>{label}{waiting && ` · ${waiting}`}</span></div>
}
