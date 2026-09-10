-- ============================================================
-- FITUR: Batas tanggal posting buat format tertentu (default: Feeds),
-- BUKAN nutup semua request. Story/Konten/Artikel/Video tetep jalan
-- normal nggak peduli tanggal berapa.
--
-- Dipake buat kasus: carousel Foto Kepengurusan naik 17-23 Sep, jadi
-- Feeds baru cuma boleh diajukan buat posting maksimal tanggal 16 Sep,
-- baru bisa post Feeds lagi mulai 23 Sep (pas carousel-nya kelar naik).
--
-- - Admin atur: nyala/matiin, tanggal batas terakhir, format apa aja
--   yang kena (checkbox dari opsi prefix yang ada), + pesan alasan.
-- - Bidang diblok DB-level kalau: formatnya match salah satu yang dikunci
--   DAN tanggal posting > batas terakhir.
-- - Berlaku pas submit baru DAN pas edit tanggal (nggak bisa disiasati
--   dengan submit dulu terus geser tanggalnya belakangan).
-- - Admin TETEP exempt, request yang udah masuk sebelumnya nggak kepengaruh.
--
-- Ini GANTIKAN migration-request-lock.sql versi lama (kalau itu udah
-- kejalanin duluan, jalanin file ini abis itu -- dia bakal drop kolom lama).
-- Jalankan SETELAH migration-admin-exempt-rules.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

create table if not exists app_settings (
  id boolean primary key default true,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

-- Buang kolom versi lama (full on/off) kalau ada
alter table app_settings drop column if exists requests_locked;
alter table app_settings drop column if exists requests_locked_message;

-- Kolom versi baru: lock per-format + per-tanggal
alter table app_settings add column if not exists feed_lock_enabled boolean not null default false;
alter table app_settings add column if not exists feed_lock_max_date date;
alter table app_settings add column if not exists feed_lock_prefixes text[] not null default array['[FEEDS]'];
alter table app_settings add column if not exists feed_lock_message text;

insert into app_settings (id, feed_lock_max_date, feed_lock_message)
values (
  true,
  '2026-09-16',
  'Request Feeds cuma bisa diajukan buat posting maksimal 16 Sep dulu. Baru bisa post Feeds lagi mulai 23 Sep -- lagi disiapin buat naikin carousel Foto Kepengurusan Fasilkom 2026. Story/Konten/Video tetep bisa seperti biasa.'
)
on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists "app_settings_select_all" on app_settings;
create policy "app_settings_select_all" on app_settings
  for select using (auth.uid() is not null);

drop policy if exists "app_settings_update_admin" on app_settings;
create policy "app_settings_update_admin" on app_settings
  for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Realtime biar banner-nya update otomatis ke semua user tanpa refresh
alter publication supabase_realtime add table app_settings;

-- Helper: cek satu post kena aturan lock atau nggak, raise exception kalau kena.
-- Dipisah jadi function sendiri biar bisa dipanggil dari insert & update trigger.
create or replace function check_feed_lock(p_title text, p_post_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_max_date date;
  v_prefixes text[];
  v_msg text;
  v_prefix text;
begin
  select feed_lock_enabled, feed_lock_max_date, feed_lock_prefixes, feed_lock_message
    into v_enabled, v_max_date, v_prefixes, v_msg
    from app_settings where id = true;

  if not coalesce(v_enabled, false) or v_max_date is null then
    return;
  end if;

  v_prefix := substring(p_title from '^(\[[A-Z]+\])');
  if v_prefix is null or not (v_prefix = any(v_prefixes)) then
    return; -- format ini nggak kena kunci
  end if;

  if p_post_date is not null and p_post_date > v_max_date then
    raise exception '%', coalesce(v_msg, format('Format %s cuma bisa diajukan buat posting maksimal %s.', v_prefix, to_char(v_max_date, 'DD Mon YYYY')));
  end if;
end;
$$;

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
  v_min_days int;
begin
  select role, bidang_name, username into v_role, v_bidang, v_username
  from profiles where id = auth.uid();

  new.requested_by := auth.uid();

  if v_role = 'admin' and new.requested_by_name is not null and length(trim(new.requested_by_name)) > 0 then
    new.requested_by_name := trim(new.requested_by_name);
  else
    new.requested_by_name := v_bidang;
  end if;

  -- Jam posting 08:00-21:00 WIB -- admin exempt, bidang tetap kena.
  if coalesce(v_role, '') <> 'admin' and new.post_time is not null then
    if new.post_time < '08:00' or new.post_time > '21:00' then
      raise exception 'Jam posting harus di antara 08:00 - 21:00 WIB.';
    end if;
  end if;

  if v_role = 'bidang' then
    perform check_feed_lock(new.title, new.post_date);

    new.status := 'Request';

    if v_username <> 'advo' then
      -- konten udah jadi (tinggal upload/repost) = H-1, kalau masih minta dibikinin = H-5
      v_min_days := case when new.content_ready then 1 else 5 end;

      if new.post_date is null or new.post_date < ((now() at time zone 'Asia/Jakarta')::date + v_min_days) then
        if new.content_ready then
          raise exception 'Request konten yang udah jadi minimal diajukan H-1 dari tanggal posting.';
        else
          raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting.';
        end if;
      end if;
    end if;
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;

-- Cek yang sama juga pas UPDATE (misal bidang geser tanggal posting
-- Feeds yang udah keajuin ke tanggal yang kekunci), exempt admin.
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
    new.revision_note := old.revision_note;
    new.requested_by := old.requested_by;
    new.requested_by_name := old.requested_by_name;
    new.archived_at := old.archived_at;

    if new.post_time is not null and (new.post_time < '08:00' or new.post_time > '21:00') then
      raise exception 'Jam posting harus di antara 08:00 - 21:00 WIB.';
    end if;

    perform check_feed_lock(new.title, new.post_date);
  end if;

  return new;
end;
$$;
