-- ============================================================
-- UPDATE jatah mepet: dihitung PER DEPARTEMEN (bukan per akun bidang).
--   PSDM   : Senor, Litbang, KWU, Kader
--   HDK    : Lugri, Dagri
--   SOSPOL : Advokasi, Pengmas
--   (Biro MEDFO = Pubinfo, Mulmed = admin, nggak kena jatah)
--
-- Bidang yang makai jatah = akun yang tercatat sebagai "Diajukan Oleh" di
-- postingannya, jadi kolom teks bebas posts.mepet_bidang nggak dipakai lagi
-- dan dihapus. Override jatah per departemen disimpan di
-- app_settings.mepet_quota_overrides dengan key nama departemen (PSDM/HDK/SOSPOL);
-- nilai lama (kalau ada) dibersihin dulu.
--
-- Pembagian departemen -> bidang ada di frontend (src/constants.js, DEPARTEMEN);
-- nggak ada aturan DB yang bergantung ke situ (jatah mepet cuma bisa diinput admin).
--
-- Jalankan SETELAH migration-mepet-admin-only.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

drop trigger if exists trg_zz_mepet_bidang_guard on posts;
drop function if exists guard_mepet_bidang();
alter table posts drop column if exists mepet_bidang;

update app_settings set mepet_quota_overrides = '{}'::jsonb where id;
