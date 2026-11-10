-- ============================================================
-- UPDATE: Bidang Advokasi (username "advo") TIDAK lagi dikecualikan dari
-- aturan waktu. Sekarang sama kayak bidang lain:
--   - Konten minta dibikinin  : minimal H-5 (hari kalender)
--   - Konten udah jadi        : minimal 3 jam sebelum jam posting
--     (bidang wajib nyentang "Konten udah jadi" di form, jam posting wajib diisi)
-- Jadi kalau mepet atau buat story/konten jadi, Advo harus nyalain toggle itu.
--
-- Cuma ngubah function enforce_post_insert (hapus kondisi v_username <> 'advo').
-- Sisanya sama persis kayak migration-pending-admin-note.sql.
--
-- Jalankan SETELAH migration-pending-admin-note.sql
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
      -- konten udah jadi (tinggal upload/repost) = minimal 3 jam sebelum jam posting
      if new.post_time is null then
        raise exception 'Jam posting wajib diisi buat konten yang udah jadi, biar bisa dicek minimal 3 jam sebelumnya.';
      end if;

      if (new.post_date + new.post_time) at time zone 'Asia/Jakarta' < now() + interval '3 hours' then
        raise exception 'Request konten yang udah jadi minimal diajukan 3 jam sebelum waktu posting.';
      end if;
    else
      -- masih minta dibikinin dari nol = minimal H-5 (hari kalender)
      if new.post_date < ((now() at time zone 'Asia/Jakarta')::date + 5) then
        raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting.';
      end if;
    end if;
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;
