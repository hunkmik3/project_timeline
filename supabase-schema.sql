-- Run this in Supabase Dashboard > SQL Editor.

create table if not exists public.timeline_projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null default 'PROJECT TIMELINE',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.timeline_projects enable row level security;

-- Anyone with the link can read and write, no sign-in required.
-- Swap the two policies below if you later need per-user access control.
drop policy if exists "timeline_public_read" on public.timeline_projects;
create policy "timeline_public_read"
  on public.timeline_projects for select
  using (true);

drop policy if exists "timeline_public_write" on public.timeline_projects;
create policy "timeline_public_write"
  on public.timeline_projects for all
  using (true) with check (true);

-- Enable realtime so people with the page open see each other's edits.
-- Wrapped because re-running the script would otherwise fail with
-- "relation is already member of publication".
do $$
begin
  alter publication supabase_realtime add table public.timeline_projects;
exception
  when duplicate_object then null;
end $$;
