-- ============================================================
-- UPDATE jatah mepet: catat BIDANG mana (di dalam departemen) yang
-- makai jatah, biar keliatan "dipake bidang apa di postingan apa".
--
-- - Kolom posts.mepet_bidang (teks bebas, misal "Humas").
-- - Bidang wajib ngisi pas nyalain toggle mepet (dicek di trigger).
-- - Nggak ada toggle mepet = kolom dikosongin otomatis.
-- - Non-admin nggak bisa ngubah mepet_bidang setelah request dibuat.
-- - Pakai trigger terpisah (nama sengaja "zz" biar jalan paling akhir,
--   setelah trigger enforce ngatur is_mepet), jadi function lain nggak disentuh.
--
-- Jalankan SETELAH migration-mepet-override.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

alter table posts add column if not exists mepet_bidang text;

create or replace function guard_mepet_bidang()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();

  if TG_OP = 'UPDATE' and coalesce(v_role, '') <> 'admin' then
    new.mepet_bidang := old.mepet_bidang;
    return new;
  end if;

  if not coalesce(new.is_mepet, false) then
    new.mepet_bidang := null;
    return new;
  end if;

  new.mepet_bidang := nullif(trim(coalesce(new.mepet_bidang, '')), '');

  if TG_OP = 'INSERT' and v_role = 'bidang' and new.mepet_bidang is null then
    raise exception 'Isi dulu bidang mana yang makai jatah keringanan mepet ini.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_zz_mepet_bidang_guard on posts;
create trigger trg_zz_mepet_bidang_guard
  before insert or update on posts
  for each row execute function guard_mepet_bidang();
