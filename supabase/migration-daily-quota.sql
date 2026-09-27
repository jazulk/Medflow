-- ============================================================
-- FITUR: Kuota maksimal request per kombinasi Format (prefix) + Platform
-- per hari. Misal: [FEEDS] + Instagram maks 2/hari, [VIDEO] + TikTok maks 1/hari.
--
-- - Admin atur lewat dialog: bisa ada banyak rule sekaligus (kombinasi beda-beda).
-- - Kombinasi yang nggak ada rule-nya = nggak dibatasin sama sekali.
-- - Yang dihitung: post di tanggal & platform & prefix yang sama, status
--   apa aja KECUALI "Ditolak" (ditolak dianggap nggak jadi, nggak makan kuota).
-- - Berlaku pas submit baru DAN pas edit (platform/tanggal/prefix diganti).
-- - Admin TETEP exempt (bisa nambah walau kuota penuh, konsisten sama rule lain).
--
-- Jalankan SETELAH migration-request-lock-window.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

create table if not exists daily_quota_rules (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  platform text not null,
  max_per_day int not null check (max_per_day > 0),
  created_at timestamptz not null default now(),
  unique (prefix, platform)
);

alter table daily_quota_rules enable row level security;

drop policy if exists "daily_quota_rules_select_all" on daily_quota_rules;
create policy "daily_quota_rules_select_all" on daily_quota_rules
  for select using (auth.uid() is not null);

drop policy if exists "daily_quota_rules_admin_all" on daily_quota_rules;
create policy "daily_quota_rules_admin_all" on daily_quota_rules
  for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Realtime biar rule keupdate langsung tanpa refresh
alter publication supabase_realtime add table daily_quota_rules;

-- Helper: cek satu post kena kuota harian atau nggak, raise exception kalau penuh.
-- p_exclude_id dipake pas UPDATE biar baris yang lagi diedit nggak dihitung dobel.
create or replace function check_daily_quota(p_title text, p_platform text, p_post_date date, p_exclude_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_max int;
  v_count int;
begin
  if p_post_date is null then
    return;
  end if;

  v_prefix := substring(p_title from '^(\[[A-Z]+\])');
  if v_prefix is null then
    return;
  end if;

  select max_per_day into v_max
    from daily_quota_rules
    where prefix = v_prefix and platform = p_platform;

  if v_max is null then
    return; -- kombinasi ini nggak ada rule-nya, bebas
  end if;

  select count(*) into v_count
    from posts
    where platform = p_platform
      and post_date = p_post_date
      and status <> 'Ditolak'
      and substring(title from '^(\[[A-Z]+\])') = v_prefix
      and (p_exclude_id is null or id <> p_exclude_id);

  if v_count >= v_max then
    raise exception 'Kuota %s + %s buat tanggal %s udah penuh (maks %s per hari).', v_prefix, p_platform, to_char(p_post_date, 'DD Mon YYYY'), v_max;
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
    perform check_daily_quota(new.title, new.platform, new.post_date, null);

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

-- Cek yang sama juga pas UPDATE (misal bidang geser platform/tanggal posting
-- ke kombinasi yang lagi penuh kuotanya), exempt admin.
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
    perform check_daily_quota(new.title, new.platform, new.post_date, new.id);
  end if;

  return new;
end;
$$;
