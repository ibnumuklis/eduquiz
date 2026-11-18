-- EDUQUIZ — learning features (signature changes: save_answer, grade_answer, get_quiz_monitor). See DATABASE.md.

drop function if exists public.save_answer(uuid, uuid, uuid[], text);
create or replace function public.save_answer(
  p_attempt uuid, p_question uuid, p_selected uuid[] default '{}', p_text text default null, p_data jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; qq public.quiz_questions; v_sel uuid[] := coalesce(p_selected, '{}'); v_count int;
  v_data jsonb := null; v_opts uuid[]; v_matches text[]; k text; v jsonb;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'in_progress' then perform public._raise('ALREADY_SUBMITTED', 'Jawaban sudah dikumpulkan'); end if;
  if now() > a.expires_at + interval '30 seconds' then
    perform public._finalize_attempt(a.id, true);
    return jsonb_build_object('expired', true, 'answered_count', a.answered_count);
  end if;
  if not (p_question = any(a.question_order)) then
    perform public._raise('INVALID_INPUT', 'Soal tidak termasuk dalam kuis ini');
  end if;
  if exists (select 1 from public.student_answers where attempt_id = a.id and question_id = p_question and locked) then
    perform public._raise('ANSWER_LOCKED', 'Jawaban soal ini sudah diperiksa dan dikunci');
  end if;
  select * into qq from public.quiz_questions where id = p_question;
  select coalesce(array_agg(x::uuid), '{}') into v_opts
  from jsonb_array_elements_text(coalesce(a.option_order -> p_question::text, '[]'::jsonb)) x
  where not (coalesce(a.hidden_options -> p_question::text, '[]'::jsonb) ? x);

  if qq.type in ('multiple_choice', 'true_false', 'multiple_select', 'poll') then
    v_sel := array(select distinct unnest(v_sel));
    if exists (select 1 from unnest(v_sel) s where not (s = any(v_opts))) then
      perform public._raise('INVALID_INPUT', 'Pilihan jawaban tidak valid');
    end if;
    if qq.type <> 'multiple_select' and cardinality(v_sel) > 1 then
      perform public._raise('INVALID_INPUT', 'Pilih satu jawaban saja');
    end if;
    p_text := null;
  elsif qq.type = 'ordering' then
    if cardinality(v_sel) > 0 and (cardinality(v_sel) <> cardinality(v_opts)
        or (select count(distinct s) from unnest(v_sel) s) <> cardinality(v_sel)
        or exists (select 1 from unnest(v_sel) s where not (s = any(v_opts)))) then
      perform public._raise('INVALID_INPUT', 'Urutan jawaban tidak valid');
    end if;
    p_text := null;
  elsif qq.type in ('tf_grid', 'matching') then
    if p_data is not null and jsonb_typeof(p_data) <> 'object' then
      perform public._raise('INVALID_INPUT', 'Format jawaban tidak valid');
    end if;
    select coalesce(array_agg(distinct o.match_text), '{}') into v_matches
    from public.question_options o where o.question_id = p_question;
    v_data := '{}'::jsonb;
    for k, v in select * from jsonb_each(coalesce(p_data, '{}'::jsonb)) loop
      if public.try_uuid(k) is null or not (public.try_uuid(k) = any(v_opts)) then
        perform public._raise('INVALID_INPUT', 'Pernyataan tidak valid');
      end if;
      if qq.type = 'tf_grid' then
        if jsonb_typeof(v) <> 'boolean' then perform public._raise('INVALID_INPUT', 'Pilih Benar atau Salah'); end if;
        v_data := v_data || jsonb_build_object(k, v);
      elsif jsonb_typeof(v) = 'string' and v #>> '{}' <> '' then
        if not ((v #>> '{}') = any(v_matches)) then perform public._raise('INVALID_INPUT', 'Pasangan jawaban tidak valid'); end if;
        v_data := v_data || jsonb_build_object(k, v);
      end if;
    end loop;
    if v_data = '{}'::jsonb then v_data := null; end if;
    v_sel := '{}'; p_text := null;
  else
    v_sel := '{}';
    p_text := left(p_text, case when qq.type = 'word_cloud' then 60 else 5000 end);
  end if;

  insert into public.student_answers (attempt_id, question_id, school_id, student_id, selected_option_ids, text_answer, answer_data)
  values (a.id, p_question, a.school_id, v_uid, v_sel, p_text, v_data)
  on conflict (attempt_id, question_id) do update
    set selected_option_ids = excluded.selected_option_ids, text_answer = excluded.text_answer,
        answer_data = excluded.answer_data;

  select count(*) into v_count from public.student_answers
  where attempt_id = a.id and public._is_answered(selected_option_ids, text_answer, answer_data);
  update public.quiz_attempts set answered_count = v_count, last_active_at = now() where id = a.id;
  return jsonb_build_object('expired', false, 'answered_count', v_count, 'saved_at', now());
end $$;

drop function if exists public.grade_answer(uuid, numeric);
create or replace function public.grade_answer(p_answer uuid, p_points numeric, p_feedback text default null, p_rubric jsonb default null)
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
  if qq.type in ('poll', 'word_cloud') then perform public._raise('INVALID_INPUT', 'Soal survei tidak dinilai'); end if;
  if p_points is null or p_points < 0 or p_points > qq.points then
    perform public._raise('INVALID_INPUT', format('Nilai harus antara 0 dan %s', qq.points));
  end if;
  if p_feedback is not null and char_length(p_feedback) > 2000 then
    perform public._raise('INVALID_INPUT', 'Umpan balik maksimal 2000 karakter');
  end if;
  if p_rubric is not null and jsonb_typeof(p_rubric) <> 'array' then
    perform public._raise('INVALID_INPUT', 'Format rubrik tidak valid');
  end if;
  update public.student_answers
     set points_awarded = p_points, is_correct = (p_points = qq.points), needs_manual_grading = false,
         graded_by = v_uid, graded_at = now(),
         teacher_feedback = nullif(trim(coalesce(p_feedback, '')), ''), rubric_scores = p_rubric
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

drop function if exists public.get_quiz_monitor(uuid);
create or replace function public.get_quiz_monitor(p_quiz uuid)
returns table (
  student_id uuid, full_name text, email text, class_name text, attempt_id uuid, attempt_number int,
  status text, started_at timestamptz, last_active_at timestamptz, submitted_at timestamptz,
  answered_count int, total_questions int, progress numeric, score numeric, passed boolean, pending_manual int,
  integrity_count int, time_multiplier numeric)
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
         r.score, r.passed, r.pending_manual,
         coalesce(l.integrity_count, 0),
         coalesce(acc.time_multiplier, 1)::numeric
  from eligible e
  join public.profiles p on p.id = e.sid
  left join latest l on l.student_id = e.sid
  left join public.quiz_results r on r.attempt_id = l.id
  left join public.student_accommodations acc on acc.school_id = q.school_id and acc.student_id = e.sid
  order by p.full_name;
end $$;

revoke execute on function public.save_answer(uuid, uuid, uuid[], text, jsonb) from public, anon;
grant execute on function public.save_answer(uuid, uuid, uuid[], text, jsonb) to authenticated;
revoke execute on function public.grade_answer(uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.grade_answer(uuid, numeric, text, jsonb) to authenticated;
revoke execute on function public.get_quiz_monitor(uuid) from public, anon;
grant execute on function public.get_quiz_monitor(uuid) to authenticated;
