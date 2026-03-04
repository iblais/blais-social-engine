-- Growth tables: content_pipeline, ab_tests

create table public.content_pipeline (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title text not null,
  description text not null default '',
  stage text not null default 'idea' check (stage in ('idea','scored','approved','scheduled')),
  score integer,
  created_at timestamptz not null default now()
);

alter table public.content_pipeline enable row level security;
create policy "Users manage own pipeline" on public.content_pipeline for all using (auth.uid() = user_id);

create table public.ab_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name text not null,
  variant_a text not null,
  variant_b text not null,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  winner text,
  metrics_a jsonb default '{}',
  metrics_b jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table public.ab_tests enable row level security;
create policy "Users manage own ab tests" on public.ab_tests for all using (auth.uid() = user_id);
