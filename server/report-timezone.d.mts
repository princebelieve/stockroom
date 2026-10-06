export function reportTimeZone(value?: unknown): string
export function reportCalendar(timeZone: string, instant: Date): (value: string) => string
export function businessDate(value: Date | string, timeZone?: string): string
export function nextBusinessDate(date: string): string
export function businessDayStart(date: string, timeZone?: string): string
