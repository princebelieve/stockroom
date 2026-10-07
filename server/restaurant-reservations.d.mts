export function reservationBookId(branchId: string): string
export function requiresReservationSync(operation: any): boolean
export function reservationChange(previous: any, input: any, context: any): any
export function validateReservationBook(record: any, previous?: any, snapshot?: boolean, layout?: any, tabs?: any[], archives?: any[]): any
export function validateReservationArchive(record: any, book?: any, previous?: any): any
export function checkReservationOpening(book: any, input: any, tableId: string, guests: number, at: string): any
export function handleReservations(options: any): Promise<any>
