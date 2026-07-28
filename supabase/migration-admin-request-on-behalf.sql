-- ============================================================
-- Migration: admin bisa submit request atas nama bidang tertentu
-- Kasus: bidang urgent minta tolong admin postingin sesuatu,
-- atau admin bantu input-in request yang bidangnya nggak sempat akses app.
--
-- requested_by (uuid) TETAP dikunci ke auth.uid() -- siapa yang beneran
-- input tetap jujur ke-track buat audit, walau atas nama bidang lain.
-- Cuma requested_by_name (teks tampilan) yang boleh di-override, dan HANYA
-- kalau yang insert role-nya admin. Bidang tetap nggak bisa spoof nama bidang lain.
--
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
  v_username text;
begin
  select role, bidang_name, username into v_role, v_bidang, v_username
  from profiles where id = auth.uid();

  new.requested_by := auth.uid();

  -- admin boleh nitip nama bidang lain (misal bantuin urgent request);
  -- selain admin, requested_by_name selalu dipaksa ke bidang_name akun sendiri.
  if v_role = 'admin' and new.requested_by_name is not null and length(trim(new.requested_by_name)) > 0 then
    new.requested_by_name := trim(new.requested_by_name);
  else
    new.requested_by_name := v_bidang;
  end if;

  -- kalau yang insert adalah akun bidang, status WAJIB 'Request' apapun yang dikirim client
  if v_role = 'bidang' then
    new.status := 'Request';

    -- bidang Advokasi dikecualikan dari H-5 (info sering mendadak)
    if v_username <> 'advo' then
      if new.post_date is null or new.post_date < ((now() at time zone 'Asia/Jakarta')::date + 5) then
        raise exception 'Request cuma bisa diajukan minimal H-5 dari tanggal posting.';
      end if;
    end if;

    -- catatan: validasi jam 08:00-21:00 buat KOLOM post_time udah dihandle
    -- lewat constraint posts_post_time_check, BUKAN buat ngeblok jam submit.
  end if;

  -- admin nggak kena H-5 sama sekali (baik submit atas nama sendiri maupun atas nama bidang lain)
  -- -- ini emang udah perilaku lama, dipertahankan apa adanya di sini.

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;

-- Trigger-nya sendiri nggak berubah (masih pakai function yang sama), jadi
-- nggak perlu drop+recreate trigger, cukup replace function-nya aja di atas.
