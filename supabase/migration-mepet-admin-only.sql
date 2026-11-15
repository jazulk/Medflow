-- ============================================================
-- UPDATE jatah mepet: BIDANG NGGAK BISA pakai jatah sendiri.
-- Alurnya: bidang konfirmasi ke admin Medfo dulu -> admin yang nginputin
-- request-nya (form admin: pilih "Bidang Pengaju" = departemen, centang
-- "Tandai pakai jatah mepet", isi bidang pemakainya).
--
-- - Request bidang yang kurang dari H-5 selalu ditolak (kecuali "Konten udah jadi").
-- - is_mepet dari bidang selalu dipaksa false di trigger.
-- - Bidang tetap bisa LIAT pemakaian jatah departemennya (dialog + badge).
-- - Admin tetap bebas (nggak kena H-5), jatah tercatat lewat tanda manual.
--
-- Cuma re-create enforce_post_insert.
-- Jalankan SETELAH migration-mepet-bidang.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

create or replace function enforce_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_bidang text;
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
    new.is_mepet := false; -- jatah mepet cuma bisa ditandai admin

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
      -- mepet (kurang dari H-5): bidang NGGAK bisa pakai jatah sendiri.
      -- Harus konfirmasi ke admin Medfo dulu, lalu admin yang nginputin request-nya.
      if new.post_date < v_today then
        raise exception 'Tanggal posting udah lewat, pilih tanggal hari ini atau setelahnya.';
      end if;

      raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting. Kalau emang mepet, konfirmasi dulu ke admin Medfo -- pakai jatah keringanan mepet departemen cuma bisa diinputin admin.';
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

