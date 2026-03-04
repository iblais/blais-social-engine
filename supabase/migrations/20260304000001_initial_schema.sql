-- Blais Social Engine — Initial Schema
-- All tables use UUID PKs, TIMESTAMPTZ, RLS with user_id = auth.uid()

-- ============================================================
-- PROFILES (mirrors auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- SOCIAL ACCOUNTS
-- ============================================================
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','bluesky','pinterest','tiktok','youtube','twitter')),
  platform_user_id text not null,
  username text not null,
  display_name text,
  avatar_url text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  is_active boolean not null default true,
  meta jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform, platform_user_id)
);

alter table public.social_accounts enable row level security;
create policy "Users manage own accounts" on public.social_accounts for all using (auth.uid() = user_id);

-- ============================================================
-- CONTENT PILLARS
-- ============================================================
create table public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  description text,
  post_frequency integer not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.content_pillars enable row level security;
create policy "Users manage own pillars" on public.content_pillars for all using (auth.uid() = user_id);

-- ============================================================
-- HASHTAG GROUPS
-- ============================================================
create table public.hashtag_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  hashtags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.hashtag_groups enable row level security;
create policy "Users manage own hashtag groups" on public.hashtag_groups for all using (auth.uid() = user_id);

-- ============================================================
-- CAPTION TEMPLATES
-- ============================================================
create table public.caption_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  template text not null,
  variables text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.caption_templates enable row level security;
create policy "Users manage own templates" on public.caption_templates for all using (auth.uid() = user_id);

-- ============================================================
-- POSTS
-- ============================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','bluesky','pinterest','tiktok','youtube','twitter')),
  caption text not null default '',
  media_type text not null default 'image' check (media_type in ('image','video','carousel')),
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','posted','failed','retry')),
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  pillar_id uuid references public.content_pillars(id) on delete set null,
  hashtag_group_id uuid references public.hashtag_groups(id) on delete set null,
  error_message text,
  retry_count integer not null default 0,
  meta jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_posts_status on public.posts(status);
create index idx_posts_scheduled on public.posts(scheduled_at) where status = 'scheduled';
create index idx_posts_account on public.posts(account_id);
create index idx_posts_user on public.posts(user_id);

alter table public.posts enable row level security;
create policy "Users manage own posts" on public.posts for all using (auth.uid() = user_id);

-- ============================================================
-- POST MEDIA
-- ============================================================
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_url text not null,
  storage_path text,
  media_type text not null default 'image' check (media_type in ('image','video')),
  sort_order integer not null default 0,
  width integer,
  height integer,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index idx_post_media_post on public.post_media(post_id);

alter table public.post_media enable row level security;
create policy "Users manage own post media" on public.post_media
  for all using (
    exists (select 1 from public.posts where posts.id = post_media.post_id and posts.user_id = auth.uid())
  );

-- ============================================================
-- MEDIA ASSETS (library)
-- ============================================================
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  url text not null,
  media_type text not null default 'image' check (media_type in ('image','video')),
  file_size bigint not null default 0,
  width integer,
  height integer,
  folder text,
  created_at timestamptz not null default now()
);

alter table public.media_assets enable row level security;
create policy "Users manage own assets" on public.media_assets for all using (auth.uid() = user_id);

-- ============================================================
-- POST METRICS
-- ============================================================
create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  impressions integer not null default 0,
  reach integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  engagement_rate real not null default 0,
  collected_at timestamptz not null default now()
);

create index idx_post_metrics_post on public.post_metrics(post_id);

alter table public.post_metrics enable row level security;
create policy "Users view own post metrics" on public.post_metrics
  for select using (
    exists (select 1 from public.posts where posts.id = post_metrics.post_id and posts.user_id = auth.uid())
  );

-- ============================================================
-- ACCOUNT METRICS
-- ============================================================
create table public.account_metrics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  followers integer not null default 0,
  following integer not null default 0,
  posts_count integer not null default 0,
  engagement_rate real not null default 0,
  collected_at timestamptz not null default now()
);

create index idx_account_metrics_account on public.account_metrics(account_id);

alter table public.account_metrics enable row level security;
create policy "Users view own account metrics" on public.account_metrics
  for select using (
    exists (select 1 from public.social_accounts where social_accounts.id = account_metrics.account_id and social_accounts.user_id = auth.uid())
  );

-- ============================================================
-- APP SETTINGS (key-value per user)
-- ============================================================
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, key)
);

alter table public.app_settings enable row level security;
create policy "Users manage own settings" on public.app_settings for all using (auth.uid() = user_id);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_activity_log_user on public.activity_log(user_id);
create index idx_activity_log_created on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;
create policy "Users view own activity" on public.activity_log for all using (auth.uid() = user_id);

-- ============================================================
-- SCHEDULE TEMPLATES
-- ============================================================
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slots jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.schedule_templates enable row level security;
create policy "Users manage own schedule templates" on public.schedule_templates for all using (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.social_accounts for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.posts for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.app_settings for each row execute function public.update_updated_at();
