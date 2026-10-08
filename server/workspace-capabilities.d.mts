import type { ShopProfile } from './shop-profile.mjs'
export function workspaceCapabilities(profile: ShopProfile): Record<string,string>
export function workspaceScreenAvailable(profile: ShopProfile, screen: string): boolean
