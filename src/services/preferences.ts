import type { Direction, FontSize } from '../data/demo.ts';

export const STORAGE_KEY = 'baixi-yuji.preferences.v1';
export interface Preferences { version: 1; fontSize: FontSize; favorites: Direction[]; }
export const defaults: Preferences = { version: 1, fontSize: 'standard', favorites: [] };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return { ...defaults, favorites: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || !value || !('version' in value) || value.version !== 1) return { ...defaults, favorites: [] };
    const candidate = value as Partial<Preferences>;
    return {
      version: 1,
      fontSize: candidate.fontSize === 'large' ? 'large' : 'standard',
      favorites: Array.isArray(candidate.favorites)
        ? [...new Set(candidate.favorites.filter((id): id is Direction => id === 'outbound' || id === 'inbound'))] : [],
    };
  } catch { return { ...defaults, favorites: [] }; }
}

export function loadPreferences(storage?: Store): { preferences: Preferences; error: boolean } {
  try { return { preferences: parsePreferences((storage ?? window.localStorage).getItem(STORAGE_KEY)), error: false }; }
  catch { return { preferences: { ...defaults, favorites: [] }, error: true }; }
}

export function savePreferences(preferences: Preferences, storage?: Store): boolean {
  try { (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(preferences)); return true; }
  catch { return false; }
}
