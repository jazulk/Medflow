-- ============================================================
-- Content Tracker — Schema Supabase
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
-- Menyimpan role & nama bidang untuk tiap akun auth.users
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null check (role in ('admin','bidang','viewer')),
  bidang_name text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles_select_all_authenticated" on profiles;
create policy "profiles_select_all_authenticated"
  on profiles for select
  to authenticated
  using (true);

-- Tidak ada policy insert/update/delete untuk client -> hanya lewat seed script (service_role)

-- ---------- POSTS ----------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null check (platform in ('Instagram','TikTok','YouTube','Website BEM')),
  status text not null default 'Request' check (status in ('Request','On Progress','Siap Posting','Sudah Diposting','Ditolak')),
  submit_date date,
  post_date date,
  post_time time check (post_time is null or (post_time >= '08:00' and post_time <= '21:00')),
  pic text,
  pj text,
  caption text,
  source_link text,
  rejection_note text,
  requested_by uuid references profiles(id),
  requested_by_name text,
  updated_by uuid references profiles(id),
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table posts enable row level security;

-- Semua akun yang login (admin & bidang) bisa lihat SEMUA postingan
drop policy if exists "posts_select_all_authenticated" on posts;
create policy "posts_select_all_authenticated"
  on posts for select
  to authenticated
  using (true);

-- Cuma admin & bidang yang boleh insert (viewer read-only, nggak boleh nulis apa-apa).
-- Nilai requested_by, requested_by_name, dan status di-force oleh trigger di bawah,
-- jadi client tidak bisa menitipkan status lain lewat request body.
drop policy if exists "posts_insert_authenticated" on posts;
create policy "posts_insert_admin_or_bidang"
  on posts for insert
  to authenticated
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','bidang'))
  );

-- Admin boleh update semua. Bidang boleh update HANYA postingan miliknya sendiri,
-- dan cuma kalau status masih "Request" atau "On Progress" (status tetap dikunci
-- lewat trigger di bawah, terlepas dari policy ini).
drop policy if exists "posts_update_admin_only" on posts;
drop policy if exists "posts_update_own_or_admin" on posts;
create policy "posts_update_own_or_admin"
  on posts for update
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or (requested_by = auth.uid() and status in ('Request','On Progress'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or (requested_by = auth.uid() and status in ('Request','On Progress'))
  );

-- Admin boleh delete semua. Bidang boleh delete HANYA postingan miliknya sendiri,
-- dan cuma kalau status masih "Request" atau "Ditolak".
drop policy if exists "posts_delete_admin_only" on posts;
drop policy if exists "posts_delete_own_or_admin" on posts;
create policy "posts_delete_own_or_admin"
  on posts for delete
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or (requested_by = auth.uid() and status in ('Request','Ditolak'))
  );

-- ---------- TRIGGER: kunci requested_by & status saat insert ----------
create or replace function enforce_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_bidang text;
  v_username text;
begin
  select role, bidang_name, username into v_role, v_bidang, v_username
  from profiles where id = auth.uid();

  new.requested_by := auth.uid();
  new.requested_by_name := v_bidang;

  -- kalau yang insert adalah akun bidang, status WAJIB 'Request' apapun yang dikirim client
  if v_role = 'bidang' then
    new.status := 'Request';

    -- bidang Advokasi dikecualikan dari H-5 (info sering mendadak)
    if v_username <> 'advo' then
      if new.post_date is null or new.post_date < ((now() at time zone 'Asia/Jakarta')::date + 5) then
        raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting.';
      end if;
    end if;

    -- catatan: validasi jam 08:00-21:00 buat KOLOM post_time udah dihandle
    -- lewat constraint posts_post_time_check, BUKAN buat ngeblok jam submit.
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_post_insert on posts;
create trigger trg_enforce_post_insert
  before insert on posts
  for each row execute function enforce_post_insert();

-- ---------- TRIGGER: auto-update updated_at ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_posts_updated_at on posts;
create trigger trg_posts_updated_at
  before update on posts
  for each row execute function set_updated_at();

-- ---------- TRIGGER: kunci status saat bidang edit postingan sendiri ----------
create or replace function enforce_post_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();

  new.updated_by := auth.uid();

  if coalesce(v_role, '') <> 'admin' then
    new.status := old.status;
    new.rejection_note := old.rejection_note;
    new.requested_by := old.requested_by;
    new.requested_by_name := old.requested_by_name;
    new.archived_at := old.archived_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_post_update on posts;
create trigger trg_enforce_post_update
  before update on posts
  for each row execute function enforce_post_update();

-- ---------- HISTORY: catat siapa ubah apa & kapan ----------
create table if not exists post_history (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  changed_by uuid references profiles(id),
  changed_by_name text,
  changes jsonb not null,
  changed_at timestamptz default now()
);

create index if not exists idx_post_history_post_id on post_history(post_id);

alter table post_history enable row level security;

-- Admin & viewer bisa lihat history SEMUA postingan.
-- Bidang cuma bisa lihat history postingan yang mereka ajukan sendiri.
drop policy if exists "post_history_select_admin_or_owner" on post_history;
create policy "post_history_select_admin_or_owner"
  on post_history for select
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','viewer'))
    or exists (select 1 from posts p where p.id = post_history.post_id and p.requested_by = auth.uid())
  );

create or replace function log_post_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '[]'::jsonb;
  v_actor_name text;
  v_fields text[] := array['title','platform','status','post_date','post_time','pic','pj','caption','source_link','rejection_note','archived_at'];
  f text;
  old_val text;
  new_val text;
  old_json jsonb;
  new_json jsonb;
begin
  select bidang_name into v_actor_name from profiles where id = auth.uid();

  if TG_OP = 'INSERT' then
    v_changes := jsonb_build_array(jsonb_build_object('field', 'created', 'old', null, 'new', 'Request dibuat'));
  else
    old_json := to_jsonb(old);
    new_json := to_jsonb(new);
    foreach f in array v_fields loop
      old_val := old_json ->> f;
      new_val := new_json ->> f;
      if old_val is distinct from new_val then
        v_changes := v_changes || jsonb_build_object('field', f, 'old', old_val, 'new', new_val);
      end if;
    end loop;

    if jsonb_array_length(v_changes) = 0 then
      return new;
    end if;
  end if;

  insert into post_history (post_id, changed_by, changed_by_name, changes)
  values (new.id, auth.uid(), coalesce(v_actor_name, 'System'), v_changes);

  return new;
end;
$$;

drop trigger if exists trg_log_post_history_insert on posts;
create trigger trg_log_post_history_insert
  after insert on posts
  for each row execute function log_post_history();

drop trigger if exists trg_log_post_history_update on posts;
create trigger trg_log_post_history_update
  after update on posts
  for each row execute function log_post_history();

-- ---------- LOG PENGHAPUSAN: catat snapshot + siapa yang hapus (buat bukti/audit) ----------
create table if not exists deleted_posts_log (
  id uuid primary key default gen_random_uuid(),
  original_post_id uuid,
  snapshot jsonb not null,
  deleted_by uuid references profiles(id),
  deleted_by_name text,
  deleted_at timestamptz default now()
);

create index if not exists idx_deleted_posts_log_original_id on deleted_posts_log(original_post_id);

alter table deleted_posts_log enable row level security;

drop policy if exists "deleted_posts_log_select_admin" on deleted_posts_log;
create policy "deleted_posts_log_select_admin"
  on deleted_posts_log for select
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create or replace function log_post_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select bidang_name into v_actor_name from profiles where id = auth.uid();

  insert into deleted_posts_log (original_post_id, snapshot, deleted_by, deleted_by_name)
  values (old.id, to_jsonb(old), auth.uid(), coalesce(v_actor_name, 'System'));

  return old;
end;
$$;

drop trigger if exists trg_log_post_deletion on posts;
create trigger trg_log_post_deletion
  before delete on posts
  for each row execute function log_post_deletion();
