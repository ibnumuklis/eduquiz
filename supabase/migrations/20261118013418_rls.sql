-- =====================================================================
-- EDUQUIZ — 0002 Authorization helpers, privileges & Row Level Security
-- Helpers are SECURITY DEFINER so that policies never recurse into RLS.
-- They only ever answer questions about the *calling* user.
-- =====================================================================

-- ---------- Helper functions ----------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- membership regardless of school status (to show "school inactive" screens)
create or replace function public.has_membership(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_members m
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- role in an *active* school (null when none)
create or replace function public.member_role(p_school uuid)
returns public.member_role language sql stable security definer set search_path = public as $$
  select m.role from public.school_members m
  join public.schools s on s.id = m.school_id
  where m.school_id = p_school and m.user_id = auth.uid()
    and m.status = 'active' and s.status = 'active';
$$;

create or replace function public.is_member(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.member_role(p_school) is not null;
$$;

create or replace function public.is_school_admin(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p_school) = 'school_admin', false);
$$;

-- staff = school_admin or teacher (school admins can also teach)
create or replace function public.is_staff(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p_school) in ('school_admin', 'teacher'), false);
$$;

create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class and (
      public.is_school_admin(c.school_id)
      or (public.is_staff(c.school_id) and (
            c.homeroom_teacher_id = auth.uid()
            or exists (select 1 from public.teacher_subjects ts
                       where ts.class_id = c.id and ts.teacher_id = auth.uid())))
    )
  );
$$;

create or replace function public.in_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_students cs
    where cs.class_id = p_class and cs.student_id = auth.uid()
      and public.is_member(cs.school_id)
  );
$$;

create or replace function public.can_manage_quiz(p_quiz uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz and (
      (q.teacher_id = auth.uid() and public.is_staff(q.school_id))
      or public.is_school_admin(q.school_id)
    )
  );
$$;

create or replace function public.student_can_view_quiz(p_quiz uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz
      and q.status in ('published', 'closed')
      and public.member_role(q.school_id) = 'student'
      and (
        exists (select 1 from public.quiz_assignments qa
                join public.class_students cs on cs.class_id = qa.class_id
                where qa.quiz_id = q.id and cs.student_id = auth.uid())
        or exists (select 1 from public.quiz_attempts a
                   where a.quiz_id = q.id and a.student_id = auth.uid())
      )
  );
$$;

create or replace function public.can_view_profile(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_target = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1
      from public.school_members viewer
      join public.school_members target on target.school_id = viewer.school_id
      join public.schools s on s.id = viewer.school_id and s.status = 'active'
      where viewer.user_id = auth.uid() and viewer.status = 'active'
        and target.user_id = p_target
        and (viewer.role in ('school_admin', 'teacher') or target.role in ('school_admin', 'teacher'))
    );
$$;

-- ---------- Privileges ----------------------------------------------
-- Defense in depth: anonymous users get nothing at all.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- Writes are column-scoped so users can never touch protected columns
-- (role, is_super_admin, xp, school_id, teacher_id, status, keys...).
revoke insert, update, delete on all tables in schema public from authenticated;

grant update (name, address, email, phone, logo_url, academic_year, semester, timezone,
              leaderboard_enabled, leaderboard_show_names)
  on public.schools to authenticated;

grant update (full_name, avatar_url, phone) on public.profiles to authenticated;

grant update (role, status, student_number) on public.school_members to authenticated;
grant delete on public.school_members to authenticated;

grant update (revoked_at) on public.school_invitations to authenticated;

grant insert (school_id, name, grade_level, academic_year, homeroom_teacher_id),
      update (name, grade_level, academic_year, homeroom_teacher_id), delete
  on public.classes to authenticated;

grant insert (school_id, class_id, student_id), delete on public.class_students to authenticated;

grant insert (school_id, name, code), update (name, code), delete on public.subjects to authenticated;

grant insert (school_id, teacher_id, subject_id, class_id), delete on public.teacher_subjects to authenticated;

grant insert (school_id, teacher_id, subject_id, title, description, access, duration_minutes,
              start_at, end_at, max_attempts, shuffle_questions, shuffle_options, passing_grade,
              show_result, show_explanation),
      update (subject_id, title, description, access, duration_minutes, start_at, end_at,
              max_attempts, shuffle_questions, shuffle_options, passing_grade, show_result,
              show_explanation),
      delete
  on public.quizzes to authenticated;

grant insert (quiz_id, type, prompt, image_path, points, explanation, accepted_answers,
              case_sensitive, manual_grading, position),
      update (type, prompt, image_path, points, explanation, accepted_answers, case_sensitive,
              manual_grading, position),
      delete
  on public.quiz_questions to authenticated;

grant insert (question_id, label, is_correct, position),
      update (label, is_correct, position), delete
  on public.question_options to authenticated;

grant insert (quiz_id, class_id), delete on public.quiz_assignments to authenticated;

grant update (read_at), delete on public.notifications to authenticated;

-- Students must never read answer keys through the table API.
-- Teachers read them through RLS below; students use get_attempt()/get_attempt_review().
-- (No column grants needed: RLS on these tables excludes students entirely.)

-- ---------- Enable RLS on every table -------------------------------
alter table public.schools              enable row level security;
alter table public.profiles             enable row level security;
alter table public.school_members       enable row level security;
alter table public.school_invitations   enable row level security;
alter table public.classes              enable row level security;
alter table public.class_students       enable row level security;
alter table public.subjects             enable row level security;
alter table public.teacher_subjects     enable row level security;
alter table public.quizzes              enable row level security;
alter table public.quiz_questions       enable row level security;
alter table public.question_options     enable row level security;
alter table public.quiz_assignments     enable row level security;
alter table public.quiz_attempts        enable row level security;
alter table public.student_answers      enable row level security;
alter table public.quiz_results         enable row level security;
alter table public.achievements         enable row level security;
alter table public.student_achievements enable row level security;
alter table public.xp_ledger            enable row level security;
alter table public.notifications        enable row level security;
alter table public.activity_logs        enable row level security;

-- ---------- schools ---------------------------------------------------
create policy schools_select on public.schools for select to authenticated
  using (public.is_super_admin() or public.has_membership(id));
create policy schools_update on public.schools for update to authenticated
  using (public.is_school_admin(id)) with check (public.is_school_admin(id));
-- insert: create_school() RPC; status: set_school_status() RPC (super admin)

-- ---------- profiles --------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- school_members -------------------------------------------
create policy members_select on public.school_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff(school_id) or public.is_super_admin());
create policy members_update on public.school_members for update to authenticated
  using (public.is_school_admin(school_id) and user_id <> auth.uid())
  with check (public.is_school_admin(school_id) and user_id <> auth.uid());
create policy members_delete on public.school_members for delete to authenticated
  using (public.is_school_admin(school_id) and user_id <> auth.uid());

-- ---------- school_invitations ---------------------------------------
create policy invitations_select on public.school_invitations for select to authenticated
  using (public.is_school_admin(school_id) or public.is_super_admin());
create policy invitations_update on public.school_invitations for update to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

-- ---------- classes ---------------------------------------------------
create policy classes_select on public.classes for select to authenticated
  using (public.is_super_admin() or public.is_school_admin(school_id)
         or (homeroom_teacher_id = auth.uid() and public.is_staff(school_id))
         or public.teaches_class(id) or public.in_class(id));
create policy classes_insert on public.classes for insert to authenticated
  with check (public.is_school_admin(school_id));
create policy classes_update on public.classes for update to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));
create policy classes_delete on public.classes for delete to authenticated
  using (public.is_school_admin(school_id));

-- ---------- class_students -------------------------------------------
create policy class_students_select on public.class_students for select to authenticated
  using (student_id = auth.uid() or public.teaches_class(class_id) or public.is_super_admin());
create policy class_students_insert on public.class_students for insert to authenticated
  with check (public.is_school_admin(school_id));
create policy class_students_delete on public.class_students for delete to authenticated
  using (public.is_school_admin(school_id));

-- ---------- subjects --------------------------------------------------
create policy subjects_select on public.subjects for select to authenticated
  using (public.is_member(school_id) or public.is_super_admin());
create policy subjects_insert on public.subjects for insert to authenticated
  with check (public.is_school_admin(school_id));
create policy subjects_update on public.subjects for update to authenticated
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));
create policy subjects_delete on public.subjects for delete to authenticated
  using (public.is_school_admin(school_id));

-- ---------- teacher_subjects -----------------------------------------
create policy teacher_subjects_select on public.teacher_subjects for select to authenticated
  using (teacher_id = auth.uid() or public.is_school_admin(school_id) or public.is_super_admin());
create policy teacher_subjects_insert on public.teacher_subjects for insert to authenticated
  with check (public.is_school_admin(school_id));
create policy teacher_subjects_delete on public.teacher_subjects for delete to authenticated
  using (public.is_school_admin(school_id));

-- ---------- quizzes ---------------------------------------------------
create policy quizzes_select on public.quizzes for select to authenticated
  using (public.is_super_admin()
         or (teacher_id = auth.uid() and public.is_staff(school_id))
         or public.is_school_admin(school_id)
         or public.student_can_view_quiz(id));
create policy quizzes_insert on public.quizzes for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_staff(school_id));
create policy quizzes_update on public.quizzes for update to authenticated
  using ((teacher_id = auth.uid() and public.is_staff(school_id)) or public.is_school_admin(school_id))
  with check ((teacher_id = auth.uid() and public.is_staff(school_id)) or public.is_school_admin(school_id));
create policy quizzes_delete on public.quizzes for delete to authenticated
  using ((teacher_id = auth.uid() and public.is_staff(school_id)) or public.is_school_admin(school_id));

-- ---------- quiz_questions (answer keys: staff only) -----------------
create policy questions_select on public.quiz_questions for select to authenticated
  using (public.can_manage_quiz(quiz_id) or public.is_super_admin());
create policy questions_insert on public.quiz_questions for insert to authenticated
  with check (public.can_manage_quiz(quiz_id));
create policy questions_update on public.quiz_questions for update to authenticated
  using (public.can_manage_quiz(quiz_id)) with check (public.can_manage_quiz(quiz_id));
create policy questions_delete on public.quiz_questions for delete to authenticated
  using (public.can_manage_quiz(quiz_id));

-- ---------- question_options (answer keys: staff only) ---------------
create policy options_select on public.question_options for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.quiz_questions qq where qq.id = question_id and public.can_manage_quiz(qq.quiz_id)));
create policy options_insert on public.question_options for insert to authenticated
  with check (exists (
    select 1 from public.quiz_questions qq where qq.id = question_id and public.can_manage_quiz(qq.quiz_id)));
create policy options_update on public.question_options for update to authenticated
  using (exists (
    select 1 from public.quiz_questions qq where qq.id = question_id and public.can_manage_quiz(qq.quiz_id)))
  with check (exists (
    select 1 from public.quiz_questions qq where qq.id = question_id and public.can_manage_quiz(qq.quiz_id)));
create policy options_delete on public.question_options for delete to authenticated
  using (exists (
    select 1 from public.quiz_questions qq where qq.id = question_id and public.can_manage_quiz(qq.quiz_id)));

-- ---------- quiz_assignments -----------------------------------------
create policy assignments_select on public.quiz_assignments for select to authenticated
  using (public.can_manage_quiz(quiz_id) or public.in_class(class_id) or public.is_super_admin());
create policy assignments_insert on public.quiz_assignments for insert to authenticated
  with check (public.can_manage_quiz(quiz_id) and public.teaches_class(class_id));
create policy assignments_delete on public.quiz_assignments for delete to authenticated
  using (public.can_manage_quiz(quiz_id));

-- ---------- quiz_attempts (writes only via RPC) ----------------------
create policy attempts_select on public.quiz_attempts for select to authenticated
  using (student_id = auth.uid() or public.can_manage_quiz(quiz_id) or public.is_super_admin());

-- ---------- student_answers (students use RPC; staff read/grade) -----
create policy answers_select on public.student_answers for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.quiz_attempts a where a.id = attempt_id and public.can_manage_quiz(a.quiz_id)));

-- ---------- quiz_results (read-only to clients) ----------------------
create policy results_select on public.quiz_results for select to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_quiz(quiz_id)
    or (student_id = auth.uid() and exists (
          select 1 from public.quizzes q where q.id = quiz_id and q.show_result))
  );

-- ---------- gamification ---------------------------------------------
create policy achievements_select on public.achievements for select to authenticated using (true);
create policy student_achievements_select on public.student_achievements for select to authenticated
  using (student_id = auth.uid() or public.is_staff(school_id) or public.is_super_admin());
create policy xp_ledger_select on public.xp_ledger for select to authenticated
  using (student_id = auth.uid() or public.is_super_admin());

-- ---------- notifications --------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ---------- activity_logs --------------------------------------------
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_super_admin() or (school_id is not null and public.is_school_admin(school_id)));

-- ---------- Integrity triggers (tenant consistency) ------------------
-- Child rows inherit school_id from their parent; client-supplied values are ignored.
create or replace function public.tg_question_school()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select q.school_id into new.school_id from public.quizzes q where q.id = new.quiz_id;
  if tg_op = 'UPDATE' and new.quiz_id <> old.quiz_id then
    raise exception 'quiz_id is immutable';
  end if;
  return new;
end $$;
create trigger quiz_questions_school before insert or update on public.quiz_questions
  for each row execute function public.tg_question_school();

create or replace function public.tg_option_school()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select qq.school_id into new.school_id from public.quiz_questions qq where qq.id = new.question_id;
  return new;
end $$;
create trigger question_options_school before insert or update on public.question_options
  for each row execute function public.tg_option_school();

create or replace function public.tg_assignment_school()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_class_school uuid;
begin
  select q.school_id into new.school_id from public.quizzes q where q.id = new.quiz_id;
  select c.school_id into v_class_school from public.classes c where c.id = new.class_id;
  if v_class_school is distinct from new.school_id then
    raise exception 'Class and quiz belong to different schools' using errcode = '42501';
  end if;
  new.assigned_by := coalesce(new.assigned_by, auth.uid());
  return new;
end $$;
create trigger quiz_assignments_school before insert on public.quiz_assignments
  for each row execute function public.tg_assignment_school();

create or replace function public.tg_class_student_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select c.school_id into new.school_id from public.classes c where c.id = new.class_id;
  if not exists (select 1 from public.school_members m
                 where m.school_id = new.school_id and m.user_id = new.student_id and m.role = 'student') then
    raise exception 'User is not a student of this school' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger class_students_check before insert on public.class_students
  for each row execute function public.tg_class_student_check();

create or replace function public.tg_teacher_subject_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.school_members m
                 where m.school_id = new.school_id and m.user_id = new.teacher_id
                   and m.role in ('teacher', 'school_admin'))
     or not exists (select 1 from public.subjects s where s.id = new.subject_id and s.school_id = new.school_id)
     or not exists (select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id) then
    raise exception 'Teacher, subject and class must belong to the same school' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger teacher_subjects_check before insert on public.teacher_subjects
  for each row execute function public.tg_teacher_subject_check();

create or replace function public.tg_class_homeroom_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.homeroom_teacher_id is not null and not exists (
    select 1 from public.school_members m
    where m.school_id = new.school_id and m.user_id = new.homeroom_teacher_id
      and m.role in ('teacher', 'school_admin')) then
    raise exception 'Homeroom teacher must be staff of this school' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger classes_homeroom_check before insert or update on public.classes
  for each row execute function public.tg_class_homeroom_check();

create or replace function public.tg_quiz_subject_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subject_id is not null and not exists (
    select 1 from public.subjects s where s.id = new.subject_id and s.school_id = new.school_id) then
    raise exception 'Subject belongs to another school' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger quizzes_subject_check before insert or update on public.quizzes
  for each row execute function public.tg_quiz_subject_check();

-- Admins may not demote/disable the last active admin of a school.
create or replace function public.tg_member_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'school_admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'school_admin' or new.status <> 'active')
     and (select count(*) from public.school_members m
          where m.school_id = old.school_id and m.role = 'school_admin' and m.status = 'active') <= 1 then
    raise exception 'A school must keep at least one active administrator';
  end if;
  return coalesce(new, old);
end $$;
create trigger school_members_last_admin before update or delete on public.school_members
  for each row execute function public.tg_member_last_admin();
