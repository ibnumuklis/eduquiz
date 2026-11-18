-- =====================================================================
-- EDUQUIZ — 0006 Hardening (Supabase security advisor)
--  * Functions get EXECUTE for PUBLIC by default; revoke it so `anon`
--    can call nothing. RLS helpers stay executable by `authenticated`
--    (policies run as the caller); trigger functions need no grant.
--  * Pin search_path on the remaining utility functions.
-- =====================================================================
do $$
declare f text;
begin
  -- RLS helpers: authenticated only
  foreach f in array array[
    'public.is_super_admin()', 'public.has_membership(uuid)', 'public.member_role(uuid)',
    'public.is_member(uuid)', 'public.is_school_admin(uuid)', 'public.is_staff(uuid)',
    'public.teaches_class(uuid)', 'public.in_class(uuid)', 'public.can_manage_quiz(uuid)',
    'public.student_can_view_quiz(uuid)', 'public.can_view_profile(uuid)', 'public.try_uuid(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Trigger functions: nobody needs to call them directly
  foreach f in array array[
    'public.set_updated_at()', 'public.tg_question_school()', 'public.tg_option_school()',
    'public.tg_assignment_school()', 'public.tg_class_student_check()', 'public.tg_teacher_subject_check()',
    'public.tg_class_homeroom_check()', 'public.tg_quiz_subject_check()', 'public.tg_member_last_admin()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  -- Internal-only helpers (also callable from SECURITY DEFINER code as the owner)
  foreach f in array array['public._normalize_answer(text, boolean)', 'public._level_for_xp(int)', 'public._require_uid()'] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

alter function public.set_updated_at() set search_path = public;
alter function public._raise(text, text) set search_path = public;
alter function public._gen_code(int) set search_path = public;
alter function public._require_uid() set search_path = public;
alter function public._normalize_answer(text, boolean) set search_path = public;
alter function public._level_for_xp(int) set search_path = public;
alter function public.try_uuid(text) set search_path = public;
