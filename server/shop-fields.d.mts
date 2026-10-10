import type { ShopProfile } from './shop-profile.mjs'
export type ShopField = { id: string; label: string; type: 'text' | 'number' | 'date' | 'select'; placeholder: string; required: boolean; visible: boolean; locked: boolean; options: string[]; lookupKey?: string }
export const coreFields: ShopField[]
export function templateFields(industry?: string, itemLabel?: string): ShopField[]
export function normalizeFields(fields: unknown, industry?: string, itemLabel?: string, addLookupFields?: boolean): ShopField[]
export function validateFields(fields: unknown): void
export function readCustomValues(input: unknown): Record<string, string>
export function validateCustomValues(input: unknown, profile: ShopProfile, enforceRequired?: boolean): Record<string, string>
export function validateCoreRequirements(input: Record<string, unknown>, profile: ShopProfile): void
