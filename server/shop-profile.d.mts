import type { ShopField } from './shop-fields.mjs'
export type BusinessMode = 'printing' | 'general' | 'grocery' | 'supermarket' | 'wholesale' | 'liquids' | 'food-service' | 'food-manufacturing' | 'bakery' | 'drinks' | 'hotel' | 'pharmacy' | 'health-beauty' | 'clothing' | 'electronics' | 'building' | 'cement' | 'automotive' | 'agriculture' | 'furniture' | 'office' | 'books' | 'hardware' | 'hospitality' | 'bulk' | 'services'
export type CatalogueWorkspace = 'product-sales' | 'oil-sales' | 'order-counter' | 'tables-tabs'
export type ShopProfile = { brandColor?: string; reportingTimeZone?: string; restaurant?: boolean; fastFood?: boolean; workflows?: 'stock' | 'payments' | 'both' | 'fast-food' | 'restaurant'; features?: { services: boolean; productSales?: boolean }; fields: ShopField[]; version: number; mode: 'general' | 'suggested' | 'custom'; industry: BusinessMode; itemLabel: string; inventoryLabel: string; unit: string; categories: string[]; workspaceCatalogues: Partial<Record<CatalogueWorkspace, { categories: string[]; units: string[]; disabledCategories?: string[]; disabledUnits?: string[] }>> }
export const businessModes: Record<BusinessMode, { label: string; unit: string; note: string }>
export const catalogueWorkspaces: Record<CatalogueWorkspace, string>
export function productCatalogueOptions(industry?: BusinessMode): { categories: string[]; units: string[] }
export function workspaceCatalogueOptions(profile: unknown, workspace?: CatalogueWorkspace): { categories: string[]; units: string[] }
export function workspaceCatalogueSettings(profile: unknown, workspace?: CatalogueWorkspace): { categories: string[]; units: string[]; disabledCategories: string[]; disabledUnits: string[] }
export function normalizeShopProfile(value?: unknown): ShopProfile
export function validateShopProfile(value: unknown): ShopProfile
export function businessWorkspace(profile: unknown): { checkoutLabel: string; overviewTitle: string; overviewDescription: string; services: boolean; stock: boolean; productSales: boolean; payments: boolean; fastFood: boolean; restaurant: boolean; liquids: boolean; oil: boolean }

export const businessPresets: Record<string, { label: string; industry: BusinessMode; workflow: ShopProfile['workflows']; screen: 'Oil' | 'POS' | 'Payments' | 'Counter' | 'Restaurant'; workspace: string; unit?: string; itemLabel?: string; inventoryLabel?: string; categories?: string[] }>
export function applyBusinessPreset(profile: unknown, key: string): ShopProfile

export const businessPresetGuidance: Record<string, string>
