-- Run this once in the Supabase SQL Editor.
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- Only users explicitly listed here may create or manage posts.
create table if not exists public.blog_authors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.blog_authors enable row level security;

create policy "Authors can read their own author record"
  on public.blog_authors for select
  using (auth.uid() = user_id);

alter table public.blog_posts enable row level security;

create policy "Public can read published posts"
  on public.blog_posts for select
  using (status = 'published' or auth.uid() = author_id);

create policy "Authors can create their own posts"
  on public.blog_posts for insert
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.blog_authors where user_id = auth.uid())
  );

create policy "Authors can update their own posts"
  on public.blog_posts for update
  using (
    auth.uid() = author_id
    and exists (select 1 from public.blog_authors where user_id = auth.uid())
  )
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.blog_authors where user_id = auth.uid())
  );

create policy "Authors can delete their own posts"
  on public.blog_posts for delete
  using (
    auth.uid() = author_id
    and exists (select 1 from public.blog_authors where user_id = auth.uid())
  );

create index if not exists blog_posts_published_at_idx
  on public.blog_posts (published_at desc)
  where status = 'published';
