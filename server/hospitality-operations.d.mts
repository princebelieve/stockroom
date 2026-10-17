export function validateHospitalityRecord(record: any, previous?: any, context?: { records?: any[]; groupRecords?: any[]; groupUpdates?: any[]; trustedChannelUpdate?: boolean }): any
export function requiresHospitalitySync(operation: any): boolean
export function requiresHotelShiftSync(operation: any): boolean
export function requiresHotelDepositSync(operation: any): boolean
export function requiresHotelGroupChangeSync(operation: any): boolean
export function hotelDepositRequirement(room: any, checkIn: string, checkOut: string): number
export function handleHospitality(input: any): Promise<any>
