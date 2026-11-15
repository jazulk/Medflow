-- ============================================================
-- FITUR: Jatah keringanan "request mepet" per bidang.
--
-- Aturan normal: request konten yang masih harus dibikinin minimal H-5.
-- Keringanan: tiap bidang dapet N kali (default 3) boleh request lebih
-- mepet dari H-5 (tapi tanggal posting nggak boleh udah lewat).
--
-- - Bidang harus NYALAIN toggle "Pakai keringanan mepet" di form request.
--   Tanpa toggle, request mepet tetap ditolak.
-- - Toggle yang kepake ditandain di postingan (kolom is_mepet), jadi
--   keliatan di mana jatahnya kepake (badge di kartu + dialog rekap).
-- - Postingan yang dihapus / dipindah ke Pending nggak ngitung (jatah balik).
-- - Admin ngatur limit + tanggal mulai hitung (buat reset) lewat dialog.
-- - Admin tetap exempt dari semua aturan waktu.
-- - Konten udah jadi (content_ready) pakai aturan 3 jam sendiri, nggak makan jatah.
--
-- Jalankan SETELAH migration-advo-no-exempt.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- 1) Kolom baru
alter table posts add column if not exists is_mepet boolean not null default false;

alter table app_settings add column if not exists mepet_quota integer not null default 3;
alter table app_settings add column if not exists mepet_count_since date;

alter table app_settings drop constraint if exists app_settings_mepet_quota_check;
alter table app_settings add constraint app_settings_mepet_quota_check check (mepet_quota >= 0 and mepet_quota <= 20);

-- 2) Hitung jatah yang udah kepake satu bidang (dipakai trigger)
create or replace function mepet_used(p_bidang text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from posts p, app_settings s
  where s.id
    and p.is_mepet
    and p.requested_by_name = p_bidang
    and p.status <> 'Pending'
    and (s.mepet_count_since is null or p.submit_date >= s.mepet_count_since);
$$;

-- 3) Insert trigger: sama kayak migration-advo-no-exempt.sql + aturan mepet
create or replace function enforce_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_bidang text;
  v_quota integer;
  v_used integer;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select role, bidang_name into v_role, v_bidang
  from profiles where id = auth.uid();

  new.requested_by := auth.uid();

  if v_role = 'admin' and new.requested_by_name is not null and length(trim(new.requested_by_name)) > 0 then
    new.requested_by_name := trim(new.requested_by_name);
  else
    new.requested_by_name := v_bidang;
  end if;

  if coalesce(v_role, '') <> 'admin' then
    new.note_visible := false;
    new.rejection_note := null;
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

    if new.post_date is null then
      raise exception 'Tanggal posting wajib diisi.';
    end if;

    if new.content_ready then
      -- konten udah jadi = minimal 3 jam sebelum jam posting (nggak makan jatah mepet)
      new.is_mepet := false;

      if new.post_time is null then
        raise exception 'Jam posting wajib diisi buat konten yang udah jadi, biar bisa dicek minimal 3 jam sebelumnya.';
      end if;

      if (new.post_date + new.post_time) at time zone 'Asia/Jakarta' < now() + interval '3 hours' then
        raise exception 'Request konten yang udah jadi minimal diajukan 3 jam sebelum waktu posting.';
      end if;
    elsif new.post_date >= v_today + 5 then
      -- udah cukup H-5, toggle mepet nggak relevan (jatah nggak kepake)
      new.is_mepet := false;
    else
      -- mepet (kurang dari H-5): wajib pakai jatah keringanan
      if new.post_date < v_today then
        raise exception 'Tanggal posting udah lewat, pilih tanggal hari ini atau setelahnya.';
      end if;

      if not coalesce(new.is_mepet, false) then
        raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting. Kalau emang mepet, nyalain "Pakai keringanan mepet" (jatah terbatas per bidang).';
      end if;

      select mepet_quota into v_quota from app_settings where id;
      v_used := mepet_used(new.requested_by_name);

      if v_used >= coalesce(v_quota, 0) then
        raise exception 'Jatah keringanan mepet bidang % udah habis (% dari % kepake).', new.requested_by_name, v_used, coalesce(v_quota, 0);
      end if;
    end if;
  else
    -- admin / role lain: nggak pernah makan jatah
    new.is_mepet := false;
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;

-- 4) Update trigger: sama kayak migration-pending-admin-note.sql + kunci is_mepet buat non-admin
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
    new.note_visible := old.note_visible;
    new.revision_note := old.revision_note;
    new.is_mepet := old.is_mepet;
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
