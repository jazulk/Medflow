-- ============================================================
-- FITUR: Admin bisa kasih alasan pas balikin postingan dari
-- "Sudah Diposting" ke "On Progress" / "Siap Posting"
-- (misal: salah tanggal upload, ada revisi desain dari Mulmed).
-- Pola sama kayak rejection_note: cuma admin yang boleh isi/ubah.
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

alter table posts add column if not exists revision_note text;

-- Kunci revision_note biar cuma admin yang bisa isi/ubah (bidang nggak bisa spoof/hapus)
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
    new.revision_note := old.revision_note;
    new.requested_by := old.requested_by;
    new.requested_by_name := old.requested_by_name;
    new.archived_at := old.archived_at;
  end if;

  return new;
end;
$$;

-- Ikutin kolom revision_note biar kecatat juga di Riwayat Perubahan
create or replace function log_post_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '[]'::jsonb;
  v_actor_name text;
  v_fields text[] := array['title','platform','status','post_date','post_time','pic','pj','caption','source_link','rejection_note','revision_note','archived_at'];
  f text;
  old_val text;
  new_val text;
  old_json jsonb;
  new_json jsonb;
begin
  select bidang_name into v_actor_name from profiles where id = auth.uid();

  if TG_OP = 'INSERT' then
    v_changes := jsonb_build_array(jsonb_build_object('field', 'created', 'old', null, 'new', 'Request dibuat'));
  else
    old_json := to_jsonb(old);
    new_json := to_jsonb(new);
    foreach f in array v_fields loop
      old_val := old_json ->> f;
      new_val := new_json ->> f;
      if old_val is distinct from new_val then
        v_changes := v_changes || jsonb_build_object('field', f, 'old', old_val, 'new', new_val);
      end if;
    end loop;

    if jsonb_array_length(v_changes) = 0 then
      return new;
    end if;
  end if;

  insert into post_history (post_id, changed_by, changed_by_name, changes)
  values (new.id, auth.uid(), coalesce(v_actor_name, 'System'), v_changes);

  return new;
end;
$$;
