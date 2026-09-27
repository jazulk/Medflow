-- ============================================================
-- FITUR: Custom announcement banner di bagian paling atas halaman,
-- keliatan buat SEMUA role (admin, bidang, viewer) -- beda dari
-- banner batas tanggal Feeds yang cuma soal restriksi submit.
--
-- Dipake buat pengumuman umum, misal: "Libur Sabtu ini, request
-- diproses Senin", "Server maintenance jam 10 malam", dll.
--
-- - Admin nyalain/matiin + tulis pesannya lewat dialog kecil.
-- - Nggak ada logic pembatasan apapun, murni informasional.
--
-- Jalankan SETELAH migration-daily-quota.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

alter table app_settings add column if not exists announcement_enabled boolean not null default false;
alter table app_settings add column if not exists announcement_message text;
