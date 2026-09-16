import type { TaskCategory } from './types';

export interface CategoryPreset extends TaskCategory {
  /** A task name containing one of these picks up this colour. Longer match wins. */
  keywords: string[];
}

/** Palette taken from the spreadsheet this replaces. */
export const DEFAULT_CATEGORIES: CategoryPreset[] = [
  {
    id: 'kick-start',
    name: 'KICK-START',
    color: '#BDD7EE',
    textColor: '#000000',
    keywords: ['KICK-START', 'KICK START', 'KICKSTART'],
  },
  {
    id: 'treatment',
    name: 'TREATMENT',
    color: '#D9AECD',
    textColor: '#000000',
    keywords: ['TREATMENT'],
  },
  {
    id: 'director-pitch',
    name: 'DIRECTOR PITCH',
    color: '#FFFF00',
    textColor: '#000000',
    keywords: ['DIRECTOR PITCH', 'PITCH'],
  },
  {
    id: 'concept',
    name: 'CONCEPT',
    color: '#D6E4EA',
    textColor: '#000000',
    keywords: ['CONCEPT'],
  },
  {
    id: 'storyboard',
    name: 'STORYBOARD',
    color: '#FFD966',
    textColor: '#000000',
    keywords: ['STORYBOARD', 'SB'],
  },
  {
    id: 'feedback',
    name: 'FEEDBACK',
    color: '#FF0000',
    textColor: '#FFFFFF',
    keywords: ['FEEDBACK'],
  },
  {
    id: 'animatic',
    name: 'ANIMATIC',
    color: '#B4A7D6',
    textColor: '#000000',
    keywords: ['ANIMATIC'],
  },
  {
    id: 'production',
    name: 'PRODUCTION',
    color: '#A9D08E',
    textColor: '#000000',
    keywords: ['PRODUCTION', 'SHOOT', 'QUAY'],
  },
  {
    id: 'delivery',
    name: 'DELIVERY',
    color: '#00B050',
    textColor: '#FFFFFF',
    keywords: ['DELIVERY', 'FINAL', 'MASTER'],
  },
];

/**
 * Guess the category from a task name. "REVISION CONCEPT R1" -> CONCEPT,
 * "REVISION STORYBOARD R1" -> STORYBOARD (longest keyword wins).
 */
export function guessCategoryId(name: string, categories: CategoryPreset[]): string | null {
  const upper = name.toUpperCase();
  let best: { id: string; len: number } | null = null;

  for (const cat of categories) {
    for (const kw of cat.keywords) {
      if (upper.includes(kw) && (!best || kw.length > best.len)) {
        best = { id: cat.id, len: kw.length };
      }
    }
  }
  return best?.id ?? null;
}

export const SWATCHES = [
  '#FF0000', '#FF8C00', '#FFD966', '#FFFF00', '#A9D08E', '#00B050',
  '#BDD7EE', '#D6E4EA', '#9DC3E6', '#B4A7D6', '#D9AECD', '#F4B8B8',
  '#D9D9D9', '#A6A6A6', '#404040', '#000000',
];

/** Black or white text, whichever reads better on the given fill. */
export function readableTextColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#000000';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}
