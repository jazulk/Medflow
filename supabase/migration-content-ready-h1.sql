-- ============================================================
-- Migration: H-1 buat konten yang udah jadi dari bidang
-- (repost story dari akun bidang sendiri, atau video yang udah direkam --
-- Medfo cuma tinggal upload/repost, nggak perlu waktu bikin desain/edit).
--
-- H-5 tetap berlaku default buat request yang minta DIBIKININ kontennya.
-- Advokasi tetap full-exempt dari kedua rule ini (perilaku lama, nggak berubah).
--
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- (jalankan SETELAH migration-admin-request-on-behalf.sql)
-- ============================================================

alter table posts add column if not exists content_ready boolean not null default false;

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

  if v_role = 'bidang' then
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

    -- catatan: validasi jam 08:00-21:00 buat KOLOM post_time udah dihandle
    -- lewat constraint posts_post_time_check, BUKAN buat ngeblok jam submit.
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;
