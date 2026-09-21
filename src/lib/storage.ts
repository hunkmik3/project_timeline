import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProjectState } from './types';
import { DEFAULT_OFF_DAYS } from './calendar';
import { DEFAULT_CATEGORIES } from './presets';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase now issues publishable keys (sb_publishable_…) and is retiring the
// legacy anon JWT. Accept either, so whichever the dashboard shows works.
// Both must be written out in full — Next inlines NEXT_PUBLIC_* literally.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const TABLE = 'timeline_projects';

/**
 * Identifies this browser tab's writes. Supabase echoes every change back over
 * realtime, including our own: applying that echo replays an older snapshot and
 * silently drops anything edited while the save was in flight. Stamping the
 * payload lets the subscription ignore its own writes.
 */
const CLIENT_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

/** Carried inside the jsonb payload, stripped again by normalizeProject. */
type StoredProject = ProjectState & { _clientId?: string };

export type StorageMode = 'local' | 'supabase';

/** With keys it runs on the shared DB, without them it falls back to localStorage. */
export const storageMode: StorageMode =
  SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'local';

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  }
  return client;
}

export function emptyProject(): ProjectState {
  return {
    title: 'PROJECT TIMELINE',
    rangeStart: null,
    rangeEnd: null,
    tasks: [],
    categories: DEFAULT_CATEGORIES.map(({ id, name, color, textColor }) => ({
      id,
      name,
      color,
      textColor,
    })),
    taskLibrary: [],
    offDays: { ...DEFAULT_OFF_DAYS },
  };
}

/** Backfill missing fields from older saves so a schema change cannot break the UI. */
export function normalizeProject(raw: unknown): ProjectState {
  const base = emptyProject();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<ProjectState>;

  return {
    title: p.title ?? base.title,
    rangeStart: p.rangeStart ?? null,
    rangeEnd: p.rangeEnd ?? null,
    tasks: Array.isArray(p.tasks)
      ? p.tasks.map((t, i) => ({
          id: t.id ?? crypto.randomUUID(),
          name: t.name ?? '',
          start: t.start ?? '',
          end: t.end ?? '',
          categoryId: t.categoryId ?? null,
          color: t.color ?? null,
          textColor: t.textColor ?? null,
          note: t.note ?? '',
          order: t.order ?? i,
          dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        }))
      : [],
    categories: Array.isArray(p.categories) && p.categories.length > 0 ? p.categories : base.categories,
    taskLibrary: Array.isArray(p.taskLibrary)
      ? p.taskLibrary.map((t) => ({
          id: t.id ?? crypto.randomUUID(),
          name: t.name ?? '',
          color: t.color ?? null,
          textColor: t.textColor ?? null,
        })).filter((t) => t.name.trim() !== '')
      : [],
    offDays: { ...base.offDays, ...(p.offDays ?? {}) },
  };
}

const localKey = (slug: string) => `timeline:${slug}`;

/**
 * The theme setting shares the `timeline:` prefix, so it has to be kept out of
 * the project listing — and its name kept out of the slugs people can take.
 */
const RESERVED_SLUGS = new Set(['theme']);

export interface ProjectSummary {
  slug: string;
  title: string;
  updatedAt: string | null;
}

/** Turns a project name into a URL-safe slug. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    // Strips Vietnamese tone marks so "Kịch bản" becomes "kich-ban" rather than
    // collapsing to a row of hyphens.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'project';
}

/** Appends -2, -3 … until the slug is free. */
export function uniqueSlug(name: string, taken: string[]): string {
  const base = slugify(name);
  const used = new Set([...taken, ...RESERVED_SLUGS]);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (storageMode === 'local') {
    const out: ProjectSummary[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith('timeline:')) continue;
      const slug = key.slice('timeline:'.length);
      if (RESERVED_SLUGS.has(slug)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key) as string) as { title?: string };
        out.push({ slug, title: data.title || slug, updatedAt: null });
      } catch {
        // A key that is not a project payload is simply not one.
      }
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  const { data, error } = await supabase()
    .from(TABLE)
    .select('slug,title,updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Could not list projects: ${error.message}`);
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    title: (r.title as string) || (r.slug as string),
    updatedAt: (r.updated_at as string) ?? null,
  }));
}

export async function createProject(slug: string, title: string): Promise<void> {
  const state = { ...emptyProject(), title };
  await saveProject(slug, state);
}

export async function deleteProject(slug: string): Promise<void> {
  if (storageMode === 'local') {
    localStorage.removeItem(localKey(slug));
    return;
  }
  const { error } = await supabase().from(TABLE).delete().eq('slug', slug);
  if (error) throw new Error(`Could not delete project: ${error.message}`);
}

/**
 * Reads the browser copy regardless of the active mode. Used right after
 * switching to Supabase, so work saved locally before the switch can be
 * carried over instead of silently stranded.
 */
export function readLocalProject(slug: string): ProjectState | null {
  try {
    const raw = localStorage.getItem(localKey(slug));
    return raw ? normalizeProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function loadProject(slug: string): Promise<ProjectState | null> {
  if (storageMode === 'local') {
    try {
      const raw = localStorage.getItem(localKey(slug));
      return raw ? normalizeProject(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  const { data, error } = await supabase()
    .from(TABLE)
    .select('data')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`Could not read from Supabase: ${error.message}`);
  return data ? normalizeProject(data.data) : null;
}

export async function saveProject(slug: string, state: ProjectState): Promise<void> {
  if (storageMode === 'local') {
    localStorage.setItem(localKey(slug), JSON.stringify(state));
    return;
  }

  const { error } = await supabase()
    .from(TABLE)
    .upsert(
      {
        slug,
        title: state.title,
        data: { ...state, _clientId: CLIENT_ID } satisfies StoredProject,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' },
    );

  if (error) throw new Error(`Could not save to Supabase: ${error.message}`);
}

/** See other people's edits immediately. Local mode has nothing to listen to. */
export function subscribeProject(
  slug: string,
  onChange: (state: ProjectState) => void,
): () => void {
  if (storageMode === 'local') return () => {};

  const channel = supabase()
    .channel(`timeline:${slug}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `slug=eq.${slug}` },
      (payload) => {
        const data = (payload.new as { data?: StoredProject } | null)?.data;
        if (!data) return;
        // Our own write coming back — applying it would undo newer local edits.
        if (data._clientId === CLIENT_ID) return;
        onChange(normalizeProject(data));
      },
    )
    .subscribe();

  return () => {
    void supabase().removeChannel(channel);
  };
}
