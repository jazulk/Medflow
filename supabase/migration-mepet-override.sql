-- ============================================================
-- UPDATE jatah mepet:
--   1) Admin bisa ngatur jatah BEDA per departemen (override). Departemen yang nggak
--      di-override pakai jatah default (app_settings.mepet_quota).
--   2) Admin bisa nandain / nyabut tanda "pakai jatah mepet" manual di form
--      postingan (buat nyatet postingan lama yang udah pakai jatah sebelum
--      fitur ini ada). Trigger update udah ngebolehin admin ubah is_mepet.
--
-- Jalankan SETELAH migration-mepet-quota.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

alter table app_settings add column if not exists mepet_quota_overrides jsonb not null default '{}'::jsonb;

-- jatah efektif satu bidang = override kalau ada, kalau nggak ya default
create or replace function mepet_quota_for(p_bidang text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((s.mepet_quota_overrides ->> p_bidang)::integer, s.mepet_quota)
  from app_settings s where s.id;
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
        raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting. Kalau emang mepet, nyalain "Pakai keringanan mepet" (jatah terbatas per departemen).';
      end if;

      v_quota := mepet_quota_for(new.requested_by_name);
      v_used := mepet_used(new.requested_by_name);

      if v_used >= coalesce(v_quota, 0) then
        raise exception 'Jatah keringanan mepet departemen % udah habis (% dari % kepake).', new.requested_by_name, v_used, coalesce(v_quota, 0);
      end if;
    end if;
  elsif v_role = 'admin' then
    -- admin boleh nandain manual (buat nyatet jatah yang udah kepake sebelum fitur ini ada)
    new.is_mepet := coalesce(new.is_mepet, false);
  else
    new.is_mepet := false;
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;

