-- ============================================================
-- FIX: Ubah dari "1 tanggal cutoff" (maksimal tanggal X, nggak ada
-- batas atas) jadi "jendela tertutup" (mulai diblok - selesai diblok).
--
-- Soalnya desain cutoff kemarin salah: begitu lock nyala, Feeds ketolak
-- SELAMANYA (nggak cuma pas 17-22), soalnya nggak ada info kapan boleh
-- lagi. Padahal maksudnya cuma blokir 17-22 Sep doang -- tanggal 23 ke
-- atas harusnya tetep bisa disubmit dari sekarang.
--
-- Jalankan SETELAH migration-request-lock.sql (yang bikin app_settings).
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- Kolom baru: jendela tanggal (ganti feed_lock_max_date)
alter table app_settings add column if not exists feed_lock_start_date date;
alter table app_settings add column if not exists feed_lock_end_date date;

-- Migrasiin data lama: max_date jadi end_date, start_date defaultnya besok
-- (kalau ada yang udah keisi dari sebelumnya)
update app_settings
set feed_lock_end_date = coalesce(feed_lock_end_date, feed_lock_max_date),
    feed_lock_start_date = coalesce(feed_lock_start_date, current_date + 1)
where feed_lock_max_date is not null and feed_lock_end_date is null;

alter table app_settings drop column if exists feed_lock_max_date;

-- Default buat kasus carousel Foto Kepengurusan: diblok 17-22 Sep,
-- tanggal 16 & 23 ke atas tetep boleh (23 udah "buka lagi").
update app_settings
set feed_lock_start_date = '2026-09-17',
    feed_lock_end_date = '2026-09-22',
    feed_lock_message = 'Request Feeds nggak bisa buat posting tanggal 17-22 Sep dulu -- lagi disiapin buat naikin carousel Foto Kepengurusan Fasilkom 2026. Boleh lagi mulai 23 Sep. Story/Konten/Video tetep bisa seperti biasa.'
where id = true and feed_lock_start_date is null;

-- Update helper function: cek jendela [start, end] inklusif, bukan cutoff
create or replace function check_feed_lock(p_title text, p_post_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_start date;
  v_end date;
  v_prefixes text[];
  v_msg text;
  v_prefix text;
begin
  select feed_lock_enabled, feed_lock_start_date, feed_lock_end_date, feed_lock_prefixes, feed_lock_message
    into v_enabled, v_start, v_end, v_prefixes, v_msg
    from app_settings where id = true;

  if not coalesce(v_enabled, false) or v_start is null or v_end is null then
    return;
  end if;

  v_prefix := substring(p_title from '^(\[[A-Z]+\])');
  if v_prefix is null or not (v_prefix = any(v_prefixes)) then
    return; -- format ini nggak kena kunci
  end if;

  if p_post_date is not null and p_post_date between v_start and v_end then
    raise exception '%', coalesce(v_msg, format('Format %s nggak bisa buat posting tanggal %s - %s.', v_prefix, to_char(v_start, 'DD Mon'), to_char(v_end, 'DD Mon YYYY')));
  end if;
end;
$$;
