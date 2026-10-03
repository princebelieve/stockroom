import type { ShopField } from './shop-fields.mjs'
export type BusinessMode = 'printing' | 'general' | 'grocery' | 'supermarket' | 'wholesale' | 'food-service' | 'food-manufacturing' | 'bakery' | 'drinks' | 'hotel' | 'pharmacy' | 'health-beauty' | 'clothing' | 'electronics' | 'building' | 'cement' | 'automotive' | 'agriculture' | 'furniture' | 'office' | 'books' | 'hardware' | 'hospitality' | 'bulk' | 'services'
export type ShopProfile = { features?: { services: boolean }; fields: ShopField[]; version: number; mode: 'general' | 'suggested' | 'custom'; industry: BusinessMode; itemLabel: string; inventoryLabel: string; unit: string; categories: string[] }
export const businessModes: Record<BusinessMode, { label: string; unit: string; note: string }>
export function normalizeShopProfile(value?: unknown): ShopProfile
export function validateShopProfile(value: unknown): ShopProfile
export function businessWorkspace(profile: unknown): { checkoutLabel: string; overviewTitle: string; overviewDescription: string; services: boolean }
