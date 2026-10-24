-- ============================================================
-- UPDATE: (1) Status "Ditolak" diganti jadi "Pending".
--         (2) Alasan dari admin nggak lagi nempel ke status. Admin punya
--             toggle "Tampilkan alasan" di form edit; selama toggle nyala
--             dan alasannya keisi, alasan tampil di kartu & detail, apa pun
--             statusnya. Admin sendiri yang matiin toggle / hapus teksnya.
--
-- Kolom teks alasan tetap pakai `rejection_note` (biar nggak ada yang pecah),
-- cuma labelnya di UI jadi "Alasan Admin". Kolom baru: `note_visible`.
--
-- Pending = request ditahan dulu, TIDAK makan kuota harian (sama kayak
-- Ditolak sebelumnya).
--
-- Jalankan SETELAH migration-h3-jam.sql
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- 1) Kolom toggle
alter table posts add column if not exists note_visible boolean not null default false;

-- 2) Alasan lama dari status Ditolak tetap tampil (toggle dinyalain buat yang udah ada isinya)
update posts
set note_visible = true
where status = 'Ditolak' and rejection_note is not null and length(trim(rejection_note)) > 0;

-- 3) Ganti nama status: drop constraint DULU, baru update data, baru pasang lagi
alter table posts drop constraint if exists posts_status_check;
update posts set status = 'Pending' where status = 'Ditolak';
alter table posts add constraint posts_status_check
  check (status in ('Request','On Progress','Siap Posting','Sudah Diposting','Pending'));

-- 4) Policy hapus: bidang boleh hapus postingan sendiri kalau status Request atau Pending
drop policy if exists "posts_delete_own_or_admin" on posts;
create policy "posts_delete_own_or_admin"
  on posts for delete
  to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or (requested_by = auth.uid() and status in ('Request','Pending'))
  );

-- 5) Kuota harian: Pending nggak dihitung
create or replace function check_daily_quota(p_title text, p_platform text, p_post_date date, p_exclude_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_max int;
  v_count int;
begin
  if p_post_date is null then
    return;
  end if;

  v_prefix := substring(p_title from '^(\[[A-Z]+\])');
  if v_prefix is null then
    return;
  end if;

  select max_per_day into v_max
    from daily_quota_rules
    where prefix = v_prefix and platform = p_platform;

  if v_max is null then
    return; -- kombinasi ini nggak ada rule-nya, bebas
  end if;

  select count(*) into v_count
    from posts
    where platform = p_platform
      and post_date = p_post_date
      and status <> 'Pending'
      and substring(title from '^(\[[A-Z]+\])') = v_prefix
      and (p_exclude_id is null or id <> p_exclude_id);

  if v_count >= v_max then
    raise exception 'Kuota %s + %s buat tanggal %s udah penuh (maks %s per hari).', v_prefix, p_platform, to_char(p_post_date, 'DD Mon YYYY'), v_max;
  end if;
end;
$$;

-- 6) Insert: bidang nggak boleh nitip alasan admin / toggle lewat request body
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

    if v_username <> 'advo' then
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
  end if;

  if new.submit_date is null then
    new.submit_date := current_date;
  end if;

  return new;
end;
$$;

-- 7) Update: toggle alasan ikut dikunci, cuma admin yang bisa ubah
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
    new.note_visible := old.note_visible;
    new.revision_note := old.revision_note;
    new.requested_by := old.requested_by;
    new.requested_by_name := old.requested_by_name;
    new.archived_at := old.archived_at;

    if new.post_time is not null and (new.post_time < '08:00' or new.post_time > '21:00') then
      raise exception 'Jam posting harus di antara 08:00 - 21:00 WIB.';
    end if;

    perform check_feed_lock(new.title, new.post_date);
    perform check_daily_quota(new.title, new.platform, new.post_date, new.id);
  end if;

  return new;
end;
$$;

-- 8) Riwayat perubahan: catat juga perubahan toggle alasan
create or replace function log_post_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '[]'::jsonb;
  v_actor_name text;
  v_fields text[] := array['title','platform','status','post_date','post_time','pic','pj','caption','source_link','rejection_note','note_visible','revision_note','archived_at'];
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
