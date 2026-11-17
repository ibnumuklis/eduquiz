-- =====================================================================
-- EDUQUIZ — 0003 Server-side business logic (RPC)
-- All functions validate auth.uid() themselves. Internal helpers are
-- revoked from client roles at the end of this file.
-- =====================================================================

alter table public.quizzes add column if not exists start_notified_at timestamptz;
alter table public.xp_ledger drop constraint if exists xp_ledger_source_type_check;
alter table public.xp_ledger add constraint xp_ledger_source_type_check
  check (source_type in ('quiz', 'achievement'));

-- ---------- Error helper --------------------------------------------
create or replace function public._raise(p_code text, p_message text)
returns void language plpgsql as $$
begin
  -- clients map the hint to a friendly message
  raise exception '%', p_message using hint = p_code, errcode = 'P0001';
end $$;

create or replace function public._require_uid()
returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then perform public._raise('UNAUTHENTICATED', 'Silakan login terlebih dahulu'); end if;
  return v;
end $$;

-- ---------- Profiles: created automatically for every auth user -------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''),
          coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------- Audit + notification primitives (internal) ---------------
create or replace function public.log_activity(
  p_school uuid, p_action text, p_entity_type text default null,
  p_entity_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_logs (school_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_school, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function public.notify(
  p_user uuid, p_school uuid, p_type text, p_title text, p_body text,
  p_link text default null, p_dedupe text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, school_id, type, title, body, link, dedupe_key)
  values (p_user, p_school, p_type, p_title, p_body, p_link, p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
$$;

create or replace function public._gen_code(p_len int default 8)
returns text language sql volatile as $$
  -- unambiguous alphabet (no 0/O/1/I)
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_len);
$$;

-- ---------- Schools & onboarding ------------------------------------
create or replace function public.create_school(
  p_name text, p_address text default null, p_email text default null, p_phone text default null,
  p_timezone text default 'Asia/Jakarta')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  v_id uuid;
  v_slug text;
begin
  if char_length(trim(coalesce(p_name, ''))) < 3 then
    perform public._raise('INVALID_INPUT', 'Nama sekolah minimal 3 karakter');
  end if;
  if (select count(*) from public.schools where created_by = v_uid) >= 3 then
    perform public._raise('LIMIT_REACHED', 'Batas pembuatan sekolah (3) sudah tercapai');
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  v_slug := left(v_slug, 50);
  if char_length(v_slug) < 3 then v_slug := 'sekolah'; end if;
  v_slug := v_slug || '-' || lower(public._gen_code(5));

  insert into public.schools (name, slug, address, email, phone, timezone, created_by)
  values (trim(p_name), v_slug, p_address, p_email, p_phone, coalesce(p_timezone, 'Asia/Jakarta'), v_uid)
  returning id into v_id;

  insert into public.school_members (school_id, user_id, role) values (v_id, v_uid, 'school_admin');
  perform public.log_activity(v_id, 'school.created', 'school', v_id, jsonb_build_object('name', p_name));
  return v_id;
end $$;

create or replace function public.set_school_status(p_school uuid, p_status public.school_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_uid();
  if not public.is_super_admin() then
    perform public._raise('FORBIDDEN', 'Hanya Super Admin yang dapat mengubah status sekolah');
  end if;
  update public.schools set status = p_status where id = p_school;
  if not found then perform public._raise('NOT_FOUND', 'Sekolah tidak ditemukan'); end if;
  perform public.log_activity(p_school, 'school.status_changed', 'school', p_school,
                              jsonb_build_object('status', p_status));
end $$;

create or replace function public.create_invitation(
  p_school uuid, p_role public.member_role, p_email text default null, p_full_name text default null,
  p_student_number text default null, p_class uuid default null, p_max_uses int default 1,
  p_valid_days int default 14)
returns public.school_invitations language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  v_row public.school_invitations;
  v_code text;
  i int := 0;
begin
  if not (public.is_school_admin(p_school) or (public.is_super_admin() and p_role = 'school_admin')) then
    perform public._raise('FORBIDDEN', 'Anda tidak berhak membuat undangan untuk sekolah ini');
  end if;
  if p_class is not null and not exists (select 1 from public.classes where id = p_class and school_id = p_school) then
    perform public._raise('INVALID_INPUT', 'Kelas tidak ditemukan di sekolah ini');
  end if;
  if p_email is not null and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform public._raise('INVALID_INPUT', 'Format email tidak valid');
  end if;
  if p_email is not null and exists (
       select 1 from public.school_members m join public.profiles p on p.id = m.user_id
       where m.school_id = p_school and lower(p.email) = lower(p_email)) then
    perform public._raise('DUPLICATE', 'Pengguna dengan email ini sudah menjadi anggota sekolah');
  end if;
  loop
    v_code := public._gen_code(8);
    exit when not exists (select 1 from public.school_invitations where code = v_code);
    i := i + 1;
    if i > 10 then perform public._raise('INTERNAL', 'Gagal membuat kode undangan'); end if;
  end loop;

  insert into public.school_invitations
    (school_id, code, role, email, full_name, student_number, class_id, max_uses, expires_at, created_by)
  values (p_school, v_code, p_role, nullif(lower(trim(p_email)), ''), nullif(trim(p_full_name), ''),
          nullif(trim(p_student_number), ''), p_class,
          greatest(1, least(coalesce(p_max_uses, 1), 1000)),
          now() + make_interval(days => greatest(1, least(coalesce(p_valid_days, 14), 90))), v_uid)
  returning * into v_row;

  perform public.log_activity(p_school, 'invitation.created', 'invitation', v_row.id,
                              jsonb_build_object('role', p_role, 'email', v_row.email));
  return v_row;
end $$;

-- Bulk import from CSV (rows: [{email, full_name, student_number, class_name}]).
-- Returns a per-row report; valid rows become email-bound student invitations.
create or replace function public.import_students(p_school uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_idx int := 0;
  v_email text; v_name text; v_nis text; v_class_name text; v_class uuid;
  v_inv public.school_invitations;
  v_report jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_ok int := 0;
begin
  perform public._require_uid();
  if not public.is_school_admin(p_school) then
    perform public._raise('FORBIDDEN', 'Hanya admin sekolah yang dapat mengimpor siswa');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    perform public._raise('INVALID_INPUT', 'Data impor harus berupa daftar maksimal 1000 baris');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_email := lower(trim(coalesce(v_row->>'email', '')));
    v_name := trim(coalesce(v_row->>'full_name', ''));
    v_nis := nullif(trim(coalesce(v_row->>'student_number', '')), '');
    v_class_name := nullif(trim(coalesce(v_row->>'class_name', '')), '');
    v_class := null;

    begin
      if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Email tidak valid';
      end if;
      if char_length(v_name) < 2 then raise exception 'Nama wajib diisi'; end if;
      if v_email = any(v_seen) then raise exception 'Email duplikat di file'; end if;
      if v_class_name is not null then
        select id into v_class from public.classes where school_id = p_school and lower(name) = lower(v_class_name)
        order by created_at desc limit 1;
        if v_class is null then raise exception 'Kelas "%" tidak ditemukan', v_class_name; end if;
      end if;
      if v_nis is not null and exists (select 1 from public.school_members
                                        where school_id = p_school and student_number = v_nis) then
        raise exception 'NIS % sudah dipakai', v_nis;
      end if;
      if exists (select 1 from public.school_invitations
                 where school_id = p_school and email = v_email and revoked_at is null
                   and used_count < max_uses and expires_at > now()) then
        raise exception 'Undangan aktif untuk email ini sudah ada';
      end if;
      v_inv := public.create_invitation(p_school, 'student', v_email, v_name, v_nis, v_class, 1, 30);
      v_seen := v_seen || v_email;
      v_ok := v_ok + 1;
      v_report := v_report || jsonb_build_object('row', v_idx, 'email', v_email, 'ok', true, 'code', v_inv.code);
    exception when others then
      v_report := v_report || jsonb_build_object('row', v_idx, 'email', v_email, 'ok', false, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('imported', v_ok, 'failed', v_idx - v_ok, 'rows', v_report);
end $$;

create or replace function public._accept_invitation_row(p_inv public.school_invitations, p_uid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_existing public.school_members;
begin
  select * into v_existing from public.school_members where school_id = p_inv.school_id and user_id = p_uid;
  if found then
    if v_existing.role <> p_inv.role then
      perform public._raise('CONFLICT', 'Anda sudah terdaftar di sekolah ini dengan peran berbeda');
    end if;
  else
    insert into public.school_members (school_id, user_id, role, student_number)
    values (p_inv.school_id, p_uid, p_inv.role,
            case when p_inv.role = 'student'
                  and not exists (select 1 from public.school_members
                                  where school_id = p_inv.school_id and student_number = p_inv.student_number)
                 then p_inv.student_number end);
  end if;

  if p_inv.class_id is not null and p_inv.role = 'student' then
    insert into public.class_students (school_id, class_id, student_id)
    values (p_inv.school_id, p_inv.class_id, p_uid) on conflict do nothing;
  end if;

  update public.profiles set full_name = p_inv.full_name
  where id = p_uid and p_inv.full_name is not null and (full_name = '' or full_name = split_part(email, '@', 1));

  update public.school_invitations set used_count = used_count + 1 where id = p_inv.id;
  perform public.log_activity(p_inv.school_id, 'invitation.accepted', 'invitation', p_inv.id,
                              jsonb_build_object('role', p_inv.role));
  return p_inv.school_id;
end $$;

create or replace function public.accept_invitation(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  v_inv public.school_invitations;
  v_email text; v_confirmed timestamptz;
begin
  select * into v_inv from public.school_invitations
  where code = upper(trim(p_code)) for update;
  if not found or v_inv.revoked_at is not null then
    perform public._raise('NOT_FOUND', 'Kode undangan tidak valid');
  end if;
  if v_inv.expires_at < now() then perform public._raise('EXPIRED', 'Kode undangan sudah kedaluwarsa'); end if;
  if v_inv.used_count >= v_inv.max_uses then perform public._raise('EXHAUSTED', 'Kode undangan sudah digunakan'); end if;
  if not exists (select 1 from public.schools where id = v_inv.school_id and status = 'active') then
    perform public._raise('SCHOOL_INACTIVE', 'Sekolah sedang tidak aktif');
  end if;
  if v_inv.email is not null then
    select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
    if v_email is distinct from v_inv.email then
      perform public._raise('EMAIL_MISMATCH', 'Undangan ini ditujukan untuk email lain');
    end if;
    if v_confirmed is null then
      perform public._raise('EMAIL_UNVERIFIED', 'Verifikasi email Anda terlebih dahulu');
    end if;
  end if;
  return public._accept_invitation_row(v_inv, v_uid);
end $$;

-- Auto-accept all invitations bound to the caller's verified email.
create or replace function public.accept_pending_invitations()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  v_email text; v_confirmed timestamptz;
  v_inv public.school_invitations;
  n int := 0;
begin
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null or v_email is null then return 0; end if;
  for v_inv in
    select i.* from public.school_invitations i
    join public.schools s on s.id = i.school_id and s.status = 'active'
    where i.email = v_email and i.revoked_at is null and i.used_count < i.max_uses and i.expires_at > now()
      and not exists (select 1 from public.school_members m where m.school_id = i.school_id and m.user_id = v_uid)
    for update of i
  loop
    begin
      perform public._accept_invitation_row(v_inv, v_uid);
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;

-- Super admin: grant school-admin rights to an existing account by email.
create or replace function public.assign_school_admin(p_school uuid, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_inv public.school_invitations;
begin
  perform public._require_uid();
  if not public.is_super_admin() then perform public._raise('FORBIDDEN', 'Hanya Super Admin'); end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    v_inv := public.create_invitation(p_school, 'school_admin', p_email, null, null, null, 1, 30);
    return 'invited:' || v_inv.code;
  end if;
  insert into public.school_members (school_id, user_id, role) values (p_school, v_user, 'school_admin')
  on conflict (school_id, user_id) do update set role = 'school_admin', status = 'active';
  perform public.log_activity(p_school, 'member.admin_assigned', 'profile', v_user, '{}'::jsonb);
  return 'assigned';
end $$;

-- ---------- Quiz management -----------------------------------------
create or replace function public.publish_quiz(p_quiz uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes;
  v_bad text;
  v_student record;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  select * into v_quiz from public.quizzes where id = p_quiz for update;

  if not exists (select 1 from public.quiz_questions where quiz_id = p_quiz) then
    perform public._raise('INVALID_QUIZ', 'Kuis belum memiliki soal');
  end if;

  select format('Soal no. %s', rn) into v_bad from (
    select qq.*, row_number() over (order by position, created_at) as rn,
      (select count(*) from public.question_options o where o.question_id = qq.id) as n_opt,
      (select count(*) from public.question_options o where o.question_id = qq.id and o.is_correct) as n_ok
    from public.quiz_questions qq where qq.quiz_id = p_quiz
  ) t
  where (t.type in ('multiple_choice', 'true_false') and (t.n_opt < 2 or t.n_ok <> 1))
     or (t.type = 'multiple_select' and (t.n_opt < 2 or t.n_ok < 1))
     or (t.type in ('short_answer', 'fill_blank') and cardinality(t.accepted_answers) = 0 and not t.manual_grading)
  limit 1;
  if v_bad is not null then
    perform public._raise('INVALID_QUIZ', v_bad || ' belum memiliki kunci jawaban yang valid');
  end if;

  if v_quiz.access = 'assigned' and not exists (select 1 from public.quiz_assignments where quiz_id = p_quiz) then
    perform public._raise('INVALID_QUIZ', 'Tugaskan kuis ke minimal satu kelas atau aktifkan akses kode');
  end if;
  if v_quiz.end_at is not null and v_quiz.end_at <= now() then
    perform public._raise('INVALID_QUIZ', 'Tanggal selesai sudah lewat');
  end if;

  update public.quizzes set status = 'published', published_at = coalesce(published_at, now()), closed_at = null
  where id = p_quiz;

  for v_student in
    select distinct cs.student_id from public.quiz_assignments qa
    join public.class_students cs on cs.class_id = qa.class_id
    where qa.quiz_id = p_quiz
  loop
    perform public.notify(v_student.student_id, v_quiz.school_id, 'quiz.new', 'Kuis baru: ' || v_quiz.title,
      case when v_quiz.start_at is not null and v_quiz.start_at > now()
           then 'Dimulai ' || to_char(v_quiz.start_at at time zone (select timezone from public.schools where id = v_quiz.school_id), 'DD Mon YYYY HH24:MI')
           else 'Sudah dapat dikerjakan sekarang' end,
      '/student/quizzes/' || p_quiz, 'quiz.new:' || p_quiz);
  end loop;

  perform public.log_activity(v_quiz.school_id, 'quiz.published', 'quiz', p_quiz, jsonb_build_object('title', v_quiz.title));
end $$;

create or replace function public.close_quiz(p_quiz uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_att uuid;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  update public.quizzes set status = 'closed', closed_at = now() where id = p_quiz returning school_id into v_school;
  for v_att in select id from public.quiz_attempts where quiz_id = p_quiz and status = 'in_progress' loop
    perform public._finalize_attempt(v_att, true);
  end loop;
  perform public.log_activity(v_school, 'quiz.closed', 'quiz', p_quiz, '{}'::jsonb);
end $$;

create or replace function public.unpublish_quiz(p_quiz uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  if exists (select 1 from public.quiz_attempts where quiz_id = p_quiz) then
    perform public._raise('CONFLICT', 'Kuis sudah dikerjakan siswa; gunakan Tutup Kuis');
  end if;
  update public.quizzes set status = 'draft' where id = p_quiz;
end $$;

create or replace function public.regenerate_access_code(p_quiz uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  loop
    v_code := public._gen_code(6);
    exit when not exists (select 1 from public.quizzes where access_code = v_code);
  end loop;
  update public.quizzes set access_code = v_code where id = p_quiz;
  return v_code;
end $$;

create or replace function public._copy_question(p_question uuid, p_target_quiz uuid, p_position int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_new uuid;
begin
  insert into public.quiz_questions (quiz_id, school_id, type, prompt, image_path, points, explanation,
                                     accepted_answers, case_sensitive, manual_grading, position)
  select p_target_quiz, school_id, type, prompt, image_path, points, explanation,
         accepted_answers, case_sensitive, manual_grading, p_position
  from public.quiz_questions where id = p_question
  returning id into v_new;
  insert into public.question_options (question_id, school_id, label, is_correct, position)
  select v_new, school_id, label, is_correct, position from public.question_options where question_id = p_question;
  return v_new;
end $$;

create or replace function public.duplicate_quiz(p_quiz uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v_src public.quizzes; v_new uuid; r record;
begin
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  select * into v_src from public.quizzes where id = p_quiz;
  insert into public.quizzes (school_id, teacher_id, subject_id, title, description, access, duration_minutes,
    max_attempts, shuffle_questions, shuffle_options, passing_grade, show_result, show_explanation)
  values (v_src.school_id, v_uid, v_src.subject_id, left(v_src.title || ' (Salinan)', 150), v_src.description,
    v_src.access, v_src.duration_minutes, v_src.max_attempts, v_src.shuffle_questions, v_src.shuffle_options,
    v_src.passing_grade, v_src.show_result, v_src.show_explanation)
  returning id into v_new;
  for r in select id, position from public.quiz_questions where quiz_id = p_quiz order by position, created_at loop
    perform public._copy_question(r.id, v_new, r.position);
  end loop;
  perform public.log_activity(v_src.school_id, 'quiz.duplicated', 'quiz', v_new, jsonb_build_object('source', p_quiz));
  return v_new;
end $$;

create or replace function public.duplicate_question(p_question uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_quiz uuid; v_pos int;
begin
  perform public._require_uid();
  select quiz_id, position into v_quiz, v_pos from public.quiz_questions where id = p_question;
  if v_quiz is null or not public.can_manage_quiz(v_quiz) then
    perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola soal ini');
  end if;
  update public.quiz_questions set position = position + 1 where quiz_id = v_quiz and position > v_pos;
  return public._copy_question(p_question, v_quiz, v_pos + 1);
end $$;

create or replace function public.reorder_questions(p_quiz uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  update public.quiz_questions q set position = t.ord - 1
  from unnest(p_ids) with ordinality as t(id, ord)
  where q.id = t.id and q.quiz_id = p_quiz;
end $$;

-- Question bank: copy questions from any quiz the caller manages into a target quiz.
create or replace function public.copy_questions_to_quiz(p_target_quiz uuid, p_question_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_pos int; r record; n int := 0; v_target_school uuid;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_target_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  select school_id into v_target_school from public.quizzes where id = p_target_quiz;
  select coalesce(max(position), -1) into v_pos from public.quiz_questions where quiz_id = p_target_quiz;
  for r in
    select qq.id from public.quiz_questions qq
    join unnest(p_question_ids) with ordinality t(id, ord) on t.id = qq.id
    where public.can_manage_quiz(qq.quiz_id) and qq.school_id = v_target_school
    order by t.ord
  loop
    v_pos := v_pos + 1;
    perform public._copy_question(r.id, p_target_quiz, v_pos);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Grading primitives --------------------------------------
create or replace function public._normalize_answer(p_text text, p_case_sensitive boolean)
returns text language sql immutable as $$
  select case when p_case_sensitive
              then regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g')
              else lower(regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g')) end;
$$;

-- Returns (is_correct, points, needs_manual). Rules (documented in DATABASE.md):
--  * multiple_choice / true_false : exactly the single correct option -> full points, else 0
--  * multiple_select             : points * max(0, (correct_picked - wrong_picked) / total_correct)
--  * short_answer / fill_blank   : normalized match with any accepted answer -> full points;
--                                  otherwise 0, or pending manual grading when enabled / no key.
create or replace function public._grade_question(
  p_question public.quiz_questions, p_selected uuid[], p_text text,
  out is_correct boolean, out points numeric, out needs_manual boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_correct uuid[];
  v_hit int; v_wrong int; v_total int;
  v_norm text;
begin
  needs_manual := false;
  if p_question.type in ('multiple_choice', 'true_false', 'multiple_select') then
    select coalesce(array_agg(id), '{}') into v_correct
    from public.question_options where question_id = p_question.id and question_options.is_correct;
    v_total := cardinality(v_correct);
    select count(*) into v_hit from unnest(coalesce(p_selected, '{}')) s where s = any(v_correct);
    v_wrong := cardinality(coalesce(p_selected, '{}')) - v_hit;
    if p_question.type = 'multiple_select' then
      is_correct := v_total > 0 and v_hit = v_total and v_wrong = 0;
      points := case when v_total = 0 then 0
                     else round(p_question.points * greatest(0, v_hit - v_wrong)::numeric / v_total, 2) end;
    else
      is_correct := cardinality(coalesce(p_selected, '{}')) = 1 and v_hit = 1;
      points := case when is_correct then p_question.points else 0 end;
    end if;
  else
    v_norm := public._normalize_answer(p_text, p_question.case_sensitive);
    if v_norm <> '' and exists (
         select 1 from unnest(p_question.accepted_answers) a
         where public._normalize_answer(a, p_question.case_sensitive) = v_norm) then
      is_correct := true; points := p_question.points;
    elsif v_norm <> '' and (p_question.manual_grading or cardinality(p_question.accepted_answers) = 0) then
      is_correct := null; points := null; needs_manual := true;
    else
      is_correct := false; points := 0;
    end if;
  end if;
end $$;

create or replace function public._level_for_xp(p_xp int)
returns int language sql immutable as $$
  select floor(sqrt(greatest(p_xp, 0) / 50.0))::int + 1;
$$;

create or replace function public._award_xp(p_student uuid, p_school uuid, p_source_type text, p_source uuid, p_amount int)
returns int language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  if p_amount <= 0 then return 0; end if;
  insert into public.xp_ledger (student_id, school_id, source_type, source_id, amount)
  values (p_student, p_school, p_source_type, p_source, p_amount)
  on conflict (student_id, source_type, source_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 0; end if;           -- idempotent: never award twice
  update public.profiles set xp = xp + p_amount, level = public._level_for_xp(xp + p_amount)
  where id = p_student;
  return p_amount;
end $$;

create or replace function public._grant_achievement(p_student uuid, p_school uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ach public.achievements; v_inserted int;
begin
  select * into v_ach from public.achievements where code = p_code;
  if not found then return; end if;
  insert into public.student_achievements (student_id, achievement_id, school_id)
  values (p_student, v_ach.id, p_school) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    perform public._award_xp(p_student, p_school, 'achievement', v_ach.id, v_ach.xp_reward);
    perform public.notify(p_student, p_school, 'achievement', 'Pencapaian baru: ' || v_ach.name,
                          v_ach.description, '/student/achievements', 'ach:' || v_ach.id);
  end if;
end $$;

create or replace function public._update_gamification(p_attempt uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.quiz_results;
  v_tz text; v_today date; v_prof public.profiles; v_streak int; v_xp int := 0; v_count int;
begin
  select * into r from public.quiz_results where attempt_id = p_attempt;
  select coalesce(timezone, 'Asia/Jakarta') into v_tz from public.schools where id = r.school_id;
  v_today := (now() at time zone v_tz)::date;
  select * into v_prof from public.profiles where id = r.student_id for update;

  v_streak := case when v_prof.last_activity_date = v_today then v_prof.current_streak
                   when v_prof.last_activity_date = v_today - 1 then v_prof.current_streak + 1
                   else 1 end;
  update public.profiles set current_streak = v_streak, longest_streak = greatest(longest_streak, v_streak),
                             last_activity_date = v_today
  where id = r.student_id;

  -- One XP award per quiz per student (retakes never farm XP).
  v_xp := public._award_xp(r.student_id, r.school_id, 'quiz', r.quiz_id,
                           10 + round(r.score / 10)::int + case when r.passed then 20 else 0 end);
  if v_xp > 0 then update public.quiz_results set xp_awarded = v_xp where id = r.id; end if;

  select count(*) into v_count from public.quiz_results where student_id = r.student_id;
  if v_count >= 1 then perform public._grant_achievement(r.student_id, r.school_id, 'first_quiz'); end if;
  if v_count >= 5 then perform public._grant_achievement(r.student_id, r.school_id, 'five_quizzes'); end if;
  if v_count >= 20 then perform public._grant_achievement(r.student_id, r.school_id, 'twenty_quizzes'); end if;
  if r.score = 100 and r.pending_manual = 0 then perform public._grant_achievement(r.student_id, r.school_id, 'perfect_score'); end if;
  if r.passed then perform public._grant_achievement(r.student_id, r.school_id, 'first_pass'); end if;
  if v_streak >= 3 then perform public._grant_achievement(r.student_id, r.school_id, 'streak_3'); end if;
  if v_streak >= 7 then perform public._grant_achievement(r.student_id, r.school_id, 'streak_7'); end if;
  if r.duration_seconds > 0 and r.score >= 80 and r.duration_seconds < 120 then
    perform public._grant_achievement(r.student_id, r.school_id, 'speedster');
  end if;
  if (select level from public.profiles where id = r.student_id) >= 5 then
    perform public._grant_achievement(r.student_id, r.school_id, 'level_5');
  end if;
  return v_xp;
end $$;

-- Recalculate the result row from the graded answers (used after manual grading).
create or replace function public._recompute_result(p_attempt uuid)
returns public.quiz_results language plpgsql security definer set search_path = public as $$
declare
  a public.quiz_attempts; q public.quizzes;
  v_possible numeric; v_earned numeric; v_correct int; v_wrong int; v_pending int; v_unanswered int;
  v_score numeric; res public.quiz_results;
begin
  select * into a from public.quiz_attempts where id = p_attempt;
  select * into q from public.quizzes where id = a.quiz_id;

  select coalesce(sum(points), 0) into v_possible from public.quiz_questions where id = any(a.question_order);
  select coalesce(sum(sa.points_awarded), 0),
         count(*) filter (where sa.is_correct is true),
         count(*) filter (where sa.is_correct is false and (cardinality(sa.selected_option_ids) > 0 or coalesce(trim(sa.text_answer), '') <> '')),
         count(*) filter (where sa.needs_manual_grading)
    into v_earned, v_correct, v_wrong, v_pending
  from public.student_answers sa where sa.attempt_id = p_attempt;
  v_unanswered := greatest(0, cardinality(a.question_order) - v_correct - v_wrong - v_pending);
  v_score := case when v_possible > 0 then round(least(100, v_earned / v_possible * 100), 2) else 0 end;

  insert into public.quiz_results (attempt_id, quiz_id, school_id, student_id, score, points_earned, points_possible,
                                   correct_count, wrong_count, unanswered_count, pending_manual, passed,
                                   duration_seconds, graded_at)
  values (a.id, a.quiz_id, a.school_id, a.student_id, v_score, v_earned, v_possible, v_correct, v_wrong,
          v_unanswered, v_pending, v_score >= q.passing_grade,
          greatest(0, extract(epoch from (least(coalesce(a.submitted_at, now()), a.expires_at) - a.started_at))::int),
          now())
  on conflict (attempt_id) do update set
    score = excluded.score, points_earned = excluded.points_earned, points_possible = excluded.points_possible,
    correct_count = excluded.correct_count, wrong_count = excluded.wrong_count,
    unanswered_count = excluded.unanswered_count, pending_manual = excluded.pending_manual,
    passed = excluded.passed, graded_at = now()
  returning * into res;
  return res;
end $$;

-- Finalize (grade) an attempt exactly once. Caller must hold no assumptions:
-- row is locked FOR UPDATE, so concurrent submits are serialized and idempotent.
create or replace function public._finalize_attempt(p_attempt uuid, p_auto boolean)
returns public.quiz_results language plpgsql security definer set search_path = public as $$
declare
  a public.quiz_attempts; q public.quizzes; qq public.quiz_questions; sa public.student_answers;
  g record; res public.quiz_results; v_name text;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status = 'submitted' then
    select * into res from public.quiz_results where attempt_id = p_attempt;
    return res;
  end if;
  select * into q from public.quizzes where id = a.quiz_id;

  for qq in select * from public.quiz_questions where id = any(a.question_order) loop
    select * into sa from public.student_answers where attempt_id = a.id and question_id = qq.id;
    if found then
      select * into g from public._grade_question(qq, sa.selected_option_ids, sa.text_answer);
      update public.student_answers
         set is_correct = g.is_correct, points_awarded = g.points, needs_manual_grading = g.needs_manual,
             graded_at = case when g.needs_manual then null else now() end
       where id = sa.id;
    end if;
  end loop;

  update public.quiz_attempts
     set status = 'submitted',
         submitted_at = least(now(), expires_at + interval '30 seconds'),
         auto_submitted = p_auto,
         is_late = p_auto and now() > expires_at + interval '30 seconds'
   where id = a.id;

  res := public._recompute_result(a.id);
  perform public._update_gamification(a.id);
  select * into res from public.quiz_results where attempt_id = a.id;

  select full_name into v_name from public.profiles where id = a.student_id;
  perform public.notify(q.teacher_id, q.school_id, 'attempt.submitted',
    coalesce(nullif(v_name, ''), 'Siswa') || ' menyelesaikan kuis',
    q.title || ' — nilai ' || res.score || case when res.pending_manual > 0 then ' (menunggu koreksi)' else '' end,
    '/teacher/quizzes/' || q.id || '/monitor', 'submitted:' || a.id);
  if q.show_result and res.pending_manual = 0 then
    perform public.notify(a.student_id, q.school_id, 'result.ready', 'Nilai tersedia: ' || q.title,
      'Nilai Anda ' || res.score, '/student/results/' || a.id, 'result:' || a.id);
  end if;
  perform public.log_activity(q.school_id, 'attempt.submitted', 'attempt', a.id,
    jsonb_build_object('quiz_id', q.id, 'score', res.score, 'auto', p_auto));
  return res;
end $$;

-- ---------- Student quiz session ------------------------------------
create or replace function public.start_attempt(p_quiz uuid default null, p_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  q public.quizzes;
  v_open public.quiz_attempts;
  v_used int;
  v_order uuid[];
  v_opt jsonb := '{}'::jsonb;
  v_id uuid;
  v_name text;
  r record;
begin
  if p_code is not null then
    select * into q from public.quizzes where access_code = upper(trim(p_code));
  else
    select * into q from public.quizzes where id = p_quiz;
  end if;
  if not found then perform public._raise('NOT_FOUND', 'Kuis tidak ditemukan'); end if;

  if public.member_role(q.school_id) is distinct from 'student' then
    perform public._raise('FORBIDDEN', 'Kuis ini hanya untuk siswa sekolah terkait');
  end if;
  if q.status <> 'published' then perform public._raise('QUIZ_CLOSED', 'Kuis tidak sedang dibuka'); end if;

  -- Access control: assigned class, or valid access code when code access is enabled
  if not (
    exists (select 1 from public.quiz_assignments qa join public.class_students cs on cs.class_id = qa.class_id
            where qa.quiz_id = q.id and cs.student_id = v_uid)
    or (p_code is not null and q.access in ('code', 'both'))
    or exists (select 1 from public.quiz_attempts where quiz_id = q.id and student_id = v_uid)
  ) then
    perform public._raise('FORBIDDEN', 'Kuis ini tidak ditugaskan kepada Anda');
  end if;

  -- Resume an open attempt (refresh-safe); finalize it if its time is over
  select * into v_open from public.quiz_attempts
  where quiz_id = q.id and student_id = v_uid and status = 'in_progress' for update;
  if found then
    if now() <= v_open.expires_at + interval '30 seconds' then
      return v_open.id;
    end if;
    perform public._finalize_attempt(v_open.id, true);
  end if;

  if q.start_at is not null and now() < q.start_at then
    perform public._raise('NOT_STARTED', 'Kuis belum dimulai');
  end if;
  if q.end_at is not null and now() >= q.end_at then
    perform public._raise('QUIZ_ENDED', 'Waktu pengerjaan kuis sudah berakhir');
  end if;

  select count(*) into v_used from public.quiz_attempts where quiz_id = q.id and student_id = v_uid;
  if v_used >= q.max_attempts then
    perform public._raise('MAX_ATTEMPTS', 'Batas percobaan sudah tercapai');
  end if;

  select array_agg(id order by case when q.shuffle_questions then random() else 0 end, position, created_at)
    into v_order from public.quiz_questions where quiz_id = q.id;
  if v_order is null then perform public._raise('INVALID_QUIZ', 'Kuis belum memiliki soal'); end if;

  for r in
    select qq.id, array_agg(o.id order by case when q.shuffle_options and qq.type <> 'true_false' then random() else 0 end,
                            o.position, o.created_at) as opts
    from public.quiz_questions qq join public.question_options o on o.question_id = qq.id
    where qq.quiz_id = q.id group by qq.id
  loop
    v_opt := v_opt || jsonb_build_object(r.id::text, to_jsonb(r.opts));
  end loop;

  begin
    insert into public.quiz_attempts (quiz_id, school_id, student_id, attempt_number, expires_at,
                                      question_order, option_order, total_questions)
    values (q.id, q.school_id, v_uid, v_used + 1,
            least(now() + make_interval(mins => q.duration_minutes), coalesce(q.end_at, 'infinity'::timestamptz)),
            v_order, v_opt, cardinality(v_order))
    returning id into v_id;
  exception when unique_violation then
    -- concurrent start from another tab: return that attempt
    select id into v_id from public.quiz_attempts
    where quiz_id = q.id and student_id = v_uid and status = 'in_progress';
    return v_id;
  end;

  select full_name into v_name from public.profiles where id = v_uid;
  perform public.notify(q.teacher_id, q.school_id, 'attempt.started',
    coalesce(nullif(v_name, ''), 'Siswa') || ' mulai mengerjakan', q.title,
    '/teacher/quizzes/' || q.id || '/monitor', 'started:' || v_id);
  perform public.log_activity(q.school_id, 'attempt.started', 'attempt', v_id, jsonb_build_object('quiz_id', q.id));
  return v_id;
end $$;

-- Student-safe view of an attempt: questions WITHOUT answer keys.
create or replace function public.get_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; v_questions jsonb; v_answers jsonb;
begin
  select * into a from public.quiz_attempts where id = p_attempt;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;

  if a.status = 'in_progress' and now() > a.expires_at + interval '30 seconds' then
    perform public._finalize_attempt(a.id, true);
    select * into a from public.quiz_attempts where id = p_attempt;
  end if;
  select * into q from public.quizzes where id = a.quiz_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', qq.id, 'type', qq.type, 'prompt', qq.prompt, 'image_path', qq.image_path, 'points', qq.points,
           'options', coalesce((
              select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by oo.ord)
              from jsonb_array_elements_text(coalesce(a.option_order -> qq.id::text, '[]'::jsonb)) with ordinality oo(opt_id, ord)
              join public.question_options o on o.id = oo.opt_id::uuid), '[]'::jsonb)
         ) order by t.ord), '[]'::jsonb)
    into v_questions
  from unnest(a.question_order) with ordinality t(qid, ord)
  join public.quiz_questions qq on qq.id = t.qid;

  select coalesce(jsonb_object_agg(sa.question_id::text, jsonb_build_object(
           'selected_option_ids', to_jsonb(sa.selected_option_ids), 'text_answer', sa.text_answer)), '{}'::jsonb)
    into v_answers
  from public.student_answers sa where sa.attempt_id = a.id;

  return jsonb_build_object(
    'attempt', jsonb_build_object('id', a.id, 'status', a.status, 'started_at', a.started_at,
        'expires_at', a.expires_at, 'submitted_at', a.submitted_at, 'attempt_number', a.attempt_number,
        'answered_count', a.answered_count, 'total_questions', a.total_questions),
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'description', q.description,
        'duration_minutes', q.duration_minutes, 'show_result', q.show_result),
    'server_now', now(),
    'questions', case when a.status = 'in_progress' then v_questions else '[]'::jsonb end,
    'answers', v_answers);
end $$;

create or replace function public.save_answer(
  p_attempt uuid, p_question uuid, p_selected uuid[] default '{}', p_text text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; qq public.quiz_questions; v_sel uuid[] := coalesce(p_selected, '{}'); v_count int;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'in_progress' then perform public._raise('ALREADY_SUBMITTED', 'Jawaban sudah dikumpulkan'); end if;
  if now() > a.expires_at + interval '30 seconds' then
    -- Do not raise: raising would roll back the automatic submission.
    perform public._finalize_attempt(a.id, true);
    return jsonb_build_object('expired', true, 'answered_count', a.answered_count);
  end if;
  if not (p_question = any(a.question_order)) then
    perform public._raise('INVALID_INPUT', 'Soal tidak termasuk dalam kuis ini');
  end if;
  select * into qq from public.quiz_questions where id = p_question;

  v_sel := array(select distinct unnest(v_sel));
  if qq.type in ('multiple_choice', 'true_false', 'multiple_select') then
    if exists (select 1 from unnest(v_sel) s
               where not exists (select 1 from public.question_options o where o.id = s and o.question_id = p_question)) then
      perform public._raise('INVALID_INPUT', 'Pilihan jawaban tidak valid');
    end if;
    if qq.type <> 'multiple_select' and cardinality(v_sel) > 1 then
      perform public._raise('INVALID_INPUT', 'Pilih satu jawaban saja');
    end if;
    p_text := null;
  else
    v_sel := '{}';
    p_text := left(p_text, 5000);
  end if;

  insert into public.student_answers (attempt_id, question_id, school_id, student_id, selected_option_ids, text_answer)
  values (a.id, p_question, a.school_id, v_uid, v_sel, p_text)
  on conflict (attempt_id, question_id) do update
    set selected_option_ids = excluded.selected_option_ids, text_answer = excluded.text_answer;

  select count(*) into v_count from public.student_answers
  where attempt_id = a.id and (cardinality(selected_option_ids) > 0 or coalesce(trim(text_answer), '') <> '');
  update public.quiz_attempts set answered_count = v_count, last_active_at = now() where id = a.id;
  return jsonb_build_object('expired', false, 'answered_count', v_count, 'saved_at', now());
end $$;

create or replace function public.heartbeat_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); a public.quiz_attempts;
begin
  update public.quiz_attempts set last_active_at = now()
  where id = p_attempt and student_id = v_uid and status = 'in_progress'
  returning * into a;
  if not found then
    select * into a from public.quiz_attempts where id = p_attempt and student_id = v_uid;
  end if;
  return jsonb_build_object('status', a.status, 'expires_at', a.expires_at, 'server_now', now());
end $$;

create or replace function public.submit_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); a public.quiz_attempts; res public.quiz_results;
begin
  select * into a from public.quiz_attempts where id = p_attempt;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  res := public._finalize_attempt(p_attempt, false);   -- idempotent
  return jsonb_build_object('attempt_id', p_attempt, 'status', 'submitted');
end $$;

-- Result + review for the student (keys only when the teacher allows it).
create or replace function public.get_attempt_review(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; res public.quiz_results;
  v_is_staff boolean; v_items jsonb; v_show_keys boolean;
begin
  select * into a from public.quiz_attempts where id = p_attempt;
  if not found then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  v_is_staff := public.can_manage_quiz(a.quiz_id);
  if a.student_id <> v_uid and not v_is_staff then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'submitted' then perform public._raise('NOT_SUBMITTED', 'Pengerjaan belum dikumpulkan'); end if;
  select * into q from public.quizzes where id = a.quiz_id;
  select * into res from public.quiz_results where attempt_id = a.id;

  if not v_is_staff and not q.show_result then
    return jsonb_build_object('visible', false,
      'quiz', jsonb_build_object('id', q.id, 'title', q.title),
      'attempt', jsonb_build_object('id', a.id, 'submitted_at', a.submitted_at));
  end if;
  v_show_keys := v_is_staff or q.show_explanation;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', qq.id, 'type', qq.type, 'prompt', qq.prompt, 'image_path', qq.image_path, 'points', qq.points,
      'explanation', case when v_show_keys then qq.explanation end,
      'accepted_answers', case when v_show_keys then to_jsonb(qq.accepted_answers) end,
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                      'is_correct', case when v_show_keys then o.is_correct end) order by o.position)
                   from public.question_options o where o.question_id = qq.id), '[]'::jsonb),
      'answer', jsonb_build_object('selected_option_ids', to_jsonb(coalesce(sa.selected_option_ids, '{}')),
                 'text_answer', sa.text_answer, 'is_correct', sa.is_correct,
                 'points_awarded', sa.points_awarded, 'needs_manual_grading', coalesce(sa.needs_manual_grading, false),
                 'answer_id', sa.id)
    ) order by t.ord), '[]'::jsonb)
  into v_items
  from unnest(a.question_order) with ordinality t(qid, ord)
  join public.quiz_questions qq on qq.id = t.qid
  left join public.student_answers sa on sa.attempt_id = a.id and sa.question_id = qq.id;

  return jsonb_build_object('visible', true, 'show_keys', v_show_keys,
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'passing_grade', q.passing_grade),
    'attempt', jsonb_build_object('id', a.id, 'started_at', a.started_at, 'submitted_at', a.submitted_at,
               'attempt_number', a.attempt_number, 'auto_submitted', a.auto_submitted, 'is_late', a.is_late),
    'result', to_jsonb(res), 'items', v_items);
end $$;

-- ---------- Teacher grading & monitoring ----------------------------
create or replace function public.grade_answer(p_answer uuid, p_points numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  sa public.student_answers; qq public.quiz_questions; a public.quiz_attempts; q public.quizzes; res public.quiz_results;
begin
  select * into sa from public.student_answers where id = p_answer for update;
  if not found then perform public._raise('NOT_FOUND', 'Jawaban tidak ditemukan'); end if;
  select * into a from public.quiz_attempts where id = sa.attempt_id;
  if not public.can_manage_quiz(a.quiz_id) then perform public._raise('FORBIDDEN', 'Anda tidak berhak menilai jawaban ini'); end if;
  if a.status <> 'submitted' then perform public._raise('NOT_SUBMITTED', 'Pengerjaan belum dikumpulkan'); end if;
  select * into qq from public.quiz_questions where id = sa.question_id;
  if p_points is null or p_points < 0 or p_points > qq.points then
    perform public._raise('INVALID_INPUT', format('Nilai harus antara 0 dan %s', qq.points));
  end if;
  update public.student_answers
     set points_awarded = p_points, is_correct = (p_points = qq.points), needs_manual_grading = false,
         graded_by = v_uid, graded_at = now()
   where id = p_answer;
  res := public._recompute_result(a.id);
  select * into q from public.quizzes where id = a.quiz_id;
  if res.pending_manual = 0 then
    perform public._update_gamification(a.id);
    if q.show_result then
      perform public.notify(a.student_id, q.school_id, 'result.ready', 'Nilai tersedia: ' || q.title,
        'Nilai akhir Anda ' || res.score, '/student/results/' || a.id, 'result:' || a.id);
    end if;
  end if;
  perform public.log_activity(q.school_id, 'answer.graded', 'answer', p_answer, jsonb_build_object('points', p_points));
  return to_jsonb(res);
end $$;

create or replace function public.finalize_expired_attempts(p_quiz uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0;
begin
  for v_id in select id from public.quiz_attempts
              where status = 'in_progress' and expires_at + interval '30 seconds' < now()
                and (p_quiz is null or quiz_id = p_quiz)
              order by expires_at limit 500
  loop
    perform public._finalize_attempt(v_id, true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Monitoring: one row per eligible student with live status.
create or replace function public.get_quiz_monitor(p_quiz uuid)
returns table (
  student_id uuid, full_name text, email text, class_name text, attempt_id uuid, attempt_number int,
  status text, started_at timestamptz, last_active_at timestamptz, submitted_at timestamptz,
  answered_count int, total_questions int, progress numeric, score numeric, passed boolean, pending_manual int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare q public.quizzes; v_ended boolean;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak memantau kuis ini'); end if;
  perform public.finalize_expired_attempts(p_quiz);
  select * into q from public.quizzes where id = p_quiz;
  v_ended := q.status = 'closed' or (q.end_at is not null and q.end_at < now());

  return query
  with eligible as (
    select cs.student_id as sid, string_agg(distinct c.name, ', ') as cname
    from public.quiz_assignments qa
    join public.classes c on c.id = qa.class_id
    join public.class_students cs on cs.class_id = qa.class_id
    where qa.quiz_id = p_quiz group by cs.student_id
    union
    select a.student_id, null from public.quiz_attempts a
    where a.quiz_id = p_quiz
      and not exists (select 1 from public.quiz_assignments qa join public.class_students cs on cs.class_id = qa.class_id
                      where qa.quiz_id = p_quiz and cs.student_id = a.student_id)
  ),
  latest as (
    select distinct on (a.student_id) a.* from public.quiz_attempts a
    where a.quiz_id = p_quiz order by a.student_id, a.attempt_number desc
  )
  select e.sid, p.full_name, p.email, e.cname, l.id, l.attempt_number,
         case when l.id is null then (case when v_ended then 'missed' else 'not_started' end)
              when l.status = 'in_progress' then 'in_progress'
              when l.is_late then 'late'
              else 'completed' end,
         l.started_at, l.last_active_at, l.submitted_at,
         coalesce(l.answered_count, 0), coalesce(l.total_questions, 0),
         case when coalesce(l.total_questions, 0) > 0
              then round(l.answered_count::numeric / l.total_questions * 100, 0) else 0 end,
         r.score, r.passed, r.pending_manual
  from eligible e
  join public.profiles p on p.id = e.sid
  left join latest l on l.student_id = e.sid
  left join public.quiz_results r on r.attempt_id = l.id
  order by p.full_name;
end $$;

-- ---------- Dashboards ------------------------------------------------
create or replace function public.teacher_dashboard(p_school uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v_admin boolean; v jsonb;
begin
  if not public.is_staff(p_school) then perform public._raise('FORBIDDEN', 'Akses ditolak'); end if;
  v_admin := false;  -- teacher view: own quizzes only
  with my_quizzes as (
    select * from public.quizzes where school_id = p_school and teacher_id = v_uid
  ), my_results as (
    select r.* from public.quiz_results r join my_quizzes q on q.id = r.quiz_id
  ), my_students as (
    select distinct cs.student_id from public.class_students cs
    where cs.school_id = p_school and public.teaches_class(cs.class_id)
  )
  select jsonb_build_object(
    'total_quizzes', (select count(*) from my_quizzes),
    'active_quizzes', (select count(*) from my_quizzes where status = 'published' and (end_at is null or end_at > now())),
    'finished_quizzes', (select count(*) from my_quizzes where status = 'closed' or (status = 'published' and end_at <= now())),
    'draft_quizzes', (select count(*) from my_quizzes where status = 'draft'),
    'total_students', (select count(*) from my_students),
    'average_score', (select round(avg(score), 1) from my_results),
    'total_submissions', (select count(*) from my_results),
    'pending_grading', (select count(*) from public.student_answers sa
                        join public.quiz_attempts a on a.id = sa.attempt_id
                        join my_quizzes q on q.id = a.quiz_id where sa.needs_manual_grading),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'submissions', coalesce(c, 0)) order by d), '[]'::jsonb)
                 from generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d
                 left join (select created_at::date as day, count(*) c from my_results group by 1) x on x.day = d::date),
    'distribution', (select jsonb_agg(jsonb_build_object('range', label, 'count', coalesce(c, 0)) order by lo)
                     from (values (0, 50, '0-49'), (50, 60, '50-59'), (60, 70, '60-69'), (70, 80, '70-79'),
                                  (80, 90, '80-89'), (90, 101, '90-100')) b(lo, hi, label)
                     left join lateral (select count(*) c from my_results r where r.score >= b.lo and r.score < b.hi) z on true),
    'recent', (select coalesce(jsonb_agg(x order by x.submitted_at desc), '[]'::jsonb) from (
                 select p.full_name as student, q.title as quiz, r.score, r.passed, a.submitted_at, a.id as attempt_id
                 from my_results r join public.quiz_attempts a on a.id = r.attempt_id
                 join public.quizzes q on q.id = r.quiz_id join public.profiles p on p.id = r.student_id
                 order by a.submitted_at desc limit 8) x)
  ) into v;
  return v;
end $$;

create or replace function public.school_dashboard(p_school uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._require_uid();
  if not (public.is_school_admin(p_school) or public.is_super_admin()) then perform public._raise('FORBIDDEN', 'Akses ditolak'); end if;
  select jsonb_build_object(
    'teachers', (select count(*) from public.school_members where school_id = p_school and role in ('teacher', 'school_admin') and status = 'active'),
    'students', (select count(*) from public.school_members where school_id = p_school and role = 'student' and status = 'active'),
    'classes', (select count(*) from public.classes where school_id = p_school),
    'subjects', (select count(*) from public.subjects where school_id = p_school),
    'quizzes', (select count(*) from public.quizzes where school_id = p_school),
    'published_quizzes', (select count(*) from public.quizzes where school_id = p_school and status = 'published'),
    'submissions', (select count(*) from public.quiz_results where school_id = p_school),
    'average_score', (select round(avg(score), 1) from public.quiz_results where school_id = p_school),
    'pending_invitations', (select count(*) from public.school_invitations where school_id = p_school
                            and revoked_at is null and used_count < max_uses and expires_at > now()),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'submissions', coalesce(c, 0)) order by d), '[]'::jsonb)
                 from generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d
                 left join (select created_at::date as day, count(*) c from public.quiz_results
                            where school_id = p_school group by 1) x on x.day = d::date)
  ) into v;
  return v;
end $$;

create or replace function public.platform_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._require_uid();
  if not public.is_super_admin() then perform public._raise('FORBIDDEN', 'Hanya Super Admin'); end if;
  select jsonb_build_object(
    'schools', (select count(*) from public.schools),
    'active_schools', (select count(*) from public.schools where status = 'active'),
    'teachers', (select count(distinct user_id) from public.school_members where role in ('teacher', 'school_admin')),
    'students', (select count(distinct user_id) from public.school_members where role = 'student'),
    'quizzes', (select count(*) from public.quizzes),
    'submissions', (select count(*) from public.quiz_results),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'submissions', coalesce(c, 0)) order by d), '[]'::jsonb)
                 from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d
                 left join (select created_at::date as day, count(*) c from public.quiz_results group by 1) x on x.day = d::date)
  ) into v;
  return v;
end $$;

create or replace function public.platform_schools()
returns table (id uuid, name text, slug text, status public.school_status, created_at timestamptz,
               teachers bigint, students bigint, quizzes bigint, submissions bigint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public._require_uid();
  if not public.is_super_admin() then perform public._raise('FORBIDDEN', 'Hanya Super Admin'); end if;
  return query
  select s.id, s.name, s.slug, s.status, s.created_at,
    (select count(*) from public.school_members m where m.school_id = s.id and m.role in ('teacher', 'school_admin')),
    (select count(*) from public.school_members m where m.school_id = s.id and m.role = 'student'),
    (select count(*) from public.quizzes q where q.school_id = s.id),
    (select count(*) from public.quiz_results r where r.school_id = s.id)
  from public.schools s order by s.created_at desc;
end $$;

-- Leaderboard (school-scoped XP); respects the school's privacy settings.
create or replace function public.get_leaderboard(p_school uuid, p_class uuid default null)
returns table (rank bigint, student_id uuid, display_name text, xp bigint, level int, is_me boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := public._require_uid(); s public.schools;
begin
  select * into s from public.schools where id = p_school;
  if not public.is_member(p_school) then perform public._raise('FORBIDDEN', 'Akses ditolak'); end if;
  if not s.leaderboard_enabled and not public.is_staff(p_school) then return; end if;
  if p_class is not null and not (public.in_class(p_class) or public.teaches_class(p_class)) then
    perform public._raise('FORBIDDEN', 'Akses ditolak');
  end if;
  return query
  with pool as (
    select m.user_id from public.school_members m
    where m.school_id = p_school and m.role = 'student' and m.status = 'active'
      and (p_class is null or exists (select 1 from public.class_students cs where cs.class_id = p_class and cs.student_id = m.user_id))
  ), scored as (
    select pl.user_id, coalesce((select sum(x.amount) from public.xp_ledger x
                                 where x.student_id = pl.user_id and x.school_id = p_school), 0)::bigint as total
    from pool pl
  )
  select rank() over (order by sc.total desc), sc.user_id,
         case when s.leaderboard_show_names or sc.user_id = v_uid or public.is_staff(p_school)
              then p.full_name else 'Siswa #' || left(sc.user_id::text, 4) end,
         sc.total, public._level_for_xp(sc.total::int), sc.user_id = v_uid
  from scored sc join public.profiles p on p.id = sc.user_id
  order by sc.total desc, p.full_name limit 50;
end $$;

-- ---------- Scheduled jobs (pg_cron) ---------------------------------
create or replace function public.run_scheduled_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare q record; s record; v_tz text;
begin
  perform public.finalize_expired_attempts(null);

  -- Quiz window opened -> notify students
  for q in select * from public.quizzes
           where status = 'published' and start_at is not null and start_at <= now()
             and start_at > now() - interval '1 day' and start_notified_at is null
  loop
    for s in select distinct cs.student_id from public.quiz_assignments qa
             join public.class_students cs on cs.class_id = qa.class_id where qa.quiz_id = q.id loop
      perform public.notify(s.student_id, q.school_id, 'quiz.started', 'Kuis dimulai: ' || q.title,
        'Kuis sudah dapat dikerjakan', '/student/quizzes/' || q.id, 'quiz.started:' || q.id);
    end loop;
    update public.quizzes set start_notified_at = now() where id = q.id;
  end loop;

  -- Deadline within 60 minutes -> remind students who have not submitted + teacher
  for q in select * from public.quizzes
           where status = 'published' and end_at is not null and end_at > now()
             and end_at <= now() + interval '60 minutes' and reminder_sent_at is null
  loop
    select timezone into v_tz from public.schools where id = q.school_id;
    for s in select distinct cs.student_id from public.quiz_assignments qa
             join public.class_students cs on cs.class_id = qa.class_id
             where qa.quiz_id = q.id
               and not exists (select 1 from public.quiz_attempts a where a.quiz_id = q.id
                               and a.student_id = cs.student_id and a.status = 'submitted') loop
      perform public.notify(s.student_id, q.school_id, 'quiz.deadline', 'Segera berakhir: ' || q.title,
        'Batas waktu ' || to_char(q.end_at at time zone v_tz, 'HH24:MI'), '/student/quizzes/' || q.id,
        'quiz.deadline:' || q.id);
    end loop;
    perform public.notify(q.teacher_id, q.school_id, 'quiz.deadline', 'Kuis mendekati batas waktu',
      q.title || ' berakhir ' || to_char(q.end_at at time zone v_tz, 'HH24:MI'),
      '/teacher/quizzes/' || q.id || '/monitor', 'teacher.deadline:' || q.id);
    update public.quizzes set reminder_sent_at = now() where id = q.id;
  end loop;
end $$;

-- ---------- Function privileges -------------------------------------
-- Internal functions: never callable through the API.
revoke execute on function public._raise(text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._gen_code(int) from public, anon, authenticated;
revoke execute on function public._accept_invitation_row(public.school_invitations, uuid) from public, anon, authenticated;
revoke execute on function public._copy_question(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public._grade_question(public.quiz_questions, uuid[], text) from public, anon, authenticated;
revoke execute on function public._award_xp(uuid, uuid, text, uuid, int) from public, anon, authenticated;
revoke execute on function public._grant_achievement(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._update_gamification(uuid) from public, anon, authenticated;
revoke execute on function public._recompute_result(uuid) from public, anon, authenticated;
revoke execute on function public._finalize_attempt(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.finalize_expired_attempts(uuid) from public, anon, authenticated;
revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;

-- Public RPC surface (authenticated users only; each checks permissions itself).
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_school(text, text, text, text, text)',
    'public.set_school_status(uuid, public.school_status)',
    'public.create_invitation(uuid, public.member_role, text, text, text, uuid, int, int)',
    'public.import_students(uuid, jsonb)',
    'public.accept_invitation(text)',
    'public.accept_pending_invitations()',
    'public.assign_school_admin(uuid, text)',
    'public.publish_quiz(uuid)', 'public.close_quiz(uuid)', 'public.unpublish_quiz(uuid)',
    'public.regenerate_access_code(uuid)', 'public.duplicate_quiz(uuid)', 'public.duplicate_question(uuid)',
    'public.reorder_questions(uuid, uuid[])', 'public.copy_questions_to_quiz(uuid, uuid[])',
    'public.start_attempt(uuid, text)', 'public.get_attempt(uuid)', 'public.save_answer(uuid, uuid, uuid[], text)',
    'public.heartbeat_attempt(uuid)', 'public.submit_attempt(uuid)', 'public.get_attempt_review(uuid)',
    'public.grade_answer(uuid, numeric)', 'public.get_quiz_monitor(uuid)',
    'public.teacher_dashboard(uuid)', 'public.school_dashboard(uuid)', 'public.platform_dashboard()',
    'public.platform_schools()', 'public.get_leaderboard(uuid, uuid)',
    'public._require_uid()', 'public._normalize_answer(text, boolean)', 'public._level_for_xp(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
