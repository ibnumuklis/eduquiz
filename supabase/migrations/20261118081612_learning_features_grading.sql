-- EDUQUIZ — learning features (grading & question builder). See DATABASE.md.

-- ---------- Grading primitives ---------------------------------------
create or replace function public._is_answered(p_selected uuid[], p_text text, p_data jsonb)
returns boolean language sql immutable as $$
  select cardinality(coalesce(p_selected, '{}')) > 0
      or coalesce(trim(p_text), '') <> ''
      or (p_data is not null and jsonb_typeof(p_data) = 'object' and p_data <> '{}'::jsonb);
$$;

drop function if exists public._grade_question(public.quiz_questions, uuid[], text);

-- Grading rules (documented in DATABASE.md):
--  multiple_choice / true_false : exactly the single correct option -> full points
--  multiple_select              : points * max(0, (hits - wrong) / total_correct)
--  tf_grid (PGK B/S)            : points * statements_judged_correctly / statements
--  matching                     : points * pairs_matched / pairs
--  ordering                     : points * items_in_correct_position / items
--  short_answer / fill_blank    : normalized match; otherwise 0 or manual review
--  essay                        : always manual review (rubric guides the teacher)
--  poll / word_cloud            : not scored
create or replace function public._grade_question(
  p_question public.quiz_questions, p_selected uuid[], p_text text, p_data jsonb,
  out is_correct boolean, out points numeric, out needs_manual boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_correct uuid[];
  v_hit int; v_wrong int; v_total int;
  v_norm text;
  v_sel uuid[] := coalesce(p_selected, '{}');
  v_data jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
begin
  needs_manual := false;
  if p_question.type in ('poll', 'word_cloud') then
    is_correct := null; points := 0; return;
  end if;

  if p_question.type in ('multiple_choice', 'true_false', 'multiple_select') then
    select coalesce(array_agg(o.id), '{}') into v_correct
    from public.question_options o where o.question_id = p_question.id and o.is_correct;
    v_total := cardinality(v_correct);
    select count(*) into v_hit from unnest(v_sel) s where s = any(v_correct);
    v_wrong := cardinality(v_sel) - v_hit;
    if p_question.type = 'multiple_select' then
      is_correct := v_total > 0 and v_hit = v_total and v_wrong = 0;
      points := case when v_total = 0 then 0
                     else round(p_question.points * greatest(0, v_hit - v_wrong)::numeric / v_total, 2) end;
    else
      is_correct := cardinality(v_sel) = 1 and v_hit = 1;
      points := case when is_correct then p_question.points else 0 end;
    end if;

  elsif p_question.type = 'tf_grid' then
    select count(*), count(*) filter (where v_data -> o.id::text = to_jsonb(o.is_correct))
      into v_total, v_hit
    from public.question_options o where o.question_id = p_question.id;
    is_correct := v_total > 0 and v_hit = v_total;
    points := case when v_total = 0 then 0 else round(p_question.points * v_hit::numeric / v_total, 2) end;

  elsif p_question.type = 'matching' then
    select count(*), count(*) filter (
             where lower(trim(coalesce(v_data ->> o.id::text, ''))) = lower(trim(coalesce(o.match_text, '')))
               and coalesce(trim(o.match_text), '') <> '')
      into v_total, v_hit
    from public.question_options o where o.question_id = p_question.id;
    is_correct := v_total > 0 and v_hit = v_total;
    points := case when v_total = 0 then 0 else round(p_question.points * v_hit::numeric / v_total, 2) end;

  elsif p_question.type = 'ordering' then
    select coalesce(array_agg(o.id order by o.position, o.created_at), '{}') into v_correct
    from public.question_options o where o.question_id = p_question.id;
    v_total := cardinality(v_correct);
    select count(*) into v_hit from unnest(v_sel) with ordinality s(id, i)
    where s.i <= v_total and v_correct[s.i] = s.id;
    is_correct := v_total > 0 and v_hit = v_total and cardinality(v_sel) = v_total;
    points := case when v_total = 0 or cardinality(v_sel) = 0 then 0
                   else round(p_question.points * v_hit::numeric / v_total, 2) end;

  elsif p_question.type = 'essay' then
    if coalesce(trim(p_text), '') <> '' then
      is_correct := null; points := null; needs_manual := true;
    else
      is_correct := false; points := 0;
    end if;

  else -- short_answer / fill_blank
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

-- Answer key for instant feedback (only revealed by check_answer).
create or replace function public._answer_key(p_question public.quiz_questions)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when p_question.type in ('multiple_choice', 'true_false', 'multiple_select') then
      jsonb_build_object('correct_option_ids',
        (select coalesce(jsonb_agg(o.id), '[]'::jsonb) from public.question_options o
         where o.question_id = p_question.id and o.is_correct))
    when p_question.type = 'tf_grid' then
      jsonb_build_object('grid', (select coalesce(jsonb_object_agg(o.id::text, o.is_correct), '{}'::jsonb)
                                  from public.question_options o where o.question_id = p_question.id))
    when p_question.type = 'matching' then
      jsonb_build_object('matches', (select coalesce(jsonb_object_agg(o.id::text, o.match_text), '{}'::jsonb)
                                     from public.question_options o where o.question_id = p_question.id))
    when p_question.type = 'ordering' then
      jsonb_build_object('order', (select coalesce(jsonb_agg(o.id order by o.position, o.created_at), '[]'::jsonb)
                                   from public.question_options o where o.question_id = p_question.id))
    when p_question.type in ('short_answer', 'fill_blank') then
      jsonb_build_object('accepted_answers', to_jsonb(p_question.accepted_answers))
    else '{}'::jsonb end;
$$;

-- ---------- Results: accuracy score, game score, mastery -------------
create or replace function public._recompute_result(p_attempt uuid)
returns public.quiz_results language plpgsql security definer set search_path = public as $$
declare
  a public.quiz_attempts; q public.quizzes;
  v_possible numeric; v_earned numeric; v_correct int; v_wrong int; v_pending int; v_unanswered int;
  v_scored int; v_score numeric; v_acc numeric; v_dur int; v_allot int; v_game int; v_target numeric;
  res public.quiz_results;
begin
  select * into a from public.quiz_attempts where id = p_attempt;
  select * into q from public.quizzes where id = a.quiz_id;

  select count(*), coalesce(sum(points), 0) into v_scored, v_possible
  from public.quiz_questions where id = any(a.question_order) and type not in ('poll', 'word_cloud');
  select coalesce(sum(sa.points_awarded), 0),
         count(*) filter (where sa.is_correct is true),
         count(*) filter (where sa.is_correct is false and public._is_answered(sa.selected_option_ids, sa.text_answer, sa.answer_data)),
         count(*) filter (where sa.needs_manual_grading)
    into v_earned, v_correct, v_wrong, v_pending
  from public.student_answers sa join public.quiz_questions qq on qq.id = sa.question_id
  where sa.attempt_id = p_attempt and qq.type not in ('poll', 'word_cloud');
  v_unanswered := greatest(0, v_scored - v_correct - v_wrong - v_pending);

  -- Game score: accuracy (max 1000) + speed bonus (max 500). Never used for the rapor.
  v_acc := case when v_possible > 0 then least(1, v_earned / v_possible) else 0 end;
  v_dur := greatest(0, extract(epoch from (least(coalesce(a.submitted_at, now()), a.expires_at) - a.started_at))::int);
  v_allot := greatest(1, extract(epoch from (a.expires_at - a.started_at))::int);
  v_game := case when q.mode = 'exam' then 0
                 else round(v_acc * 1000 + v_acc * 500 * greatest(0, 1 - v_dur::numeric / v_allot))::int end;

  -- Practice mode: the score is cumulative mastery over every attempt (best points per question).
  if q.mode = 'practice' then
    select coalesce(sum(qq.points), 0) into v_possible
    from public.quiz_questions qq where qq.quiz_id = q.id and qq.type not in ('poll', 'word_cloud');
    select coalesce(sum(b), 0) into v_earned from (
      select max(sa.points_awarded) as b
      from public.student_answers sa
      join public.quiz_attempts at on at.id = sa.attempt_id
      join public.quiz_questions qq on qq.id = sa.question_id
      where at.quiz_id = q.id and at.student_id = a.student_id
        and (at.status = 'submitted' or at.id = a.id) and qq.type not in ('poll', 'word_cloud')
      group by sa.question_id) x;
  end if;
  v_score := case when v_possible > 0 then round(least(100, v_earned / v_possible * 100), 2) else 0 end;
  v_target := case when q.mode = 'practice' then q.mastery_target else q.passing_grade end;

  insert into public.quiz_results (attempt_id, quiz_id, school_id, student_id, score, points_earned, points_possible,
                                   correct_count, wrong_count, unanswered_count, pending_manual, passed,
                                   duration_seconds, graded_at, game_score, mastered)
  values (a.id, a.quiz_id, a.school_id, a.student_id, v_score, v_earned, v_possible, v_correct, v_wrong,
          v_unanswered, v_pending, v_score >= q.passing_grade, v_dur, now(), v_game,
          v_pending = 0 and v_score >= v_target)
  on conflict (attempt_id) do update set
    score = excluded.score, points_earned = excluded.points_earned, points_possible = excluded.points_possible,
    correct_count = excluded.correct_count, wrong_count = excluded.wrong_count,
    unanswered_count = excluded.unanswered_count, pending_manual = excluded.pending_manual,
    passed = excluded.passed, game_score = excluded.game_score, mastered = excluded.mastered, graded_at = now()
  returning * into res;
  return res;
end $$;

create or replace function public._update_gamification(p_attempt uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.quiz_results; q public.quizzes;
  v_tz text; v_today date; v_prof public.profiles; v_streak int; v_xp int := 0; v_count int;
begin
  select * into r from public.quiz_results where attempt_id = p_attempt;
  select * into q from public.quizzes where id = r.quiz_id;
  if q.mode = 'exam' then return 0; end if;   -- exams carry no gamification
  select coalesce(timezone, 'Asia/Jakarta') into v_tz from public.schools where id = r.school_id;
  v_today := (now() at time zone v_tz)::date;
  select * into v_prof from public.profiles where id = r.student_id for update;

  v_streak := case when v_prof.last_activity_date = v_today then v_prof.current_streak
                   when v_prof.last_activity_date = v_today - 1 then v_prof.current_streak + 1
                   else 1 end;
  update public.profiles set current_streak = v_streak, longest_streak = greatest(longest_streak, v_streak),
                             last_activity_date = v_today
  where id = r.student_id;

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
  if q.mode = 'practice' and r.mastered then
    perform public._grant_achievement(r.student_id, r.school_id, 'practice_master');
  end if;
  if (select level from public.profiles where id = r.student_id) >= 5 then
    perform public._grant_achievement(r.student_id, r.school_id, 'level_5');
  end if;
  return v_xp;
end $$;

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
      select * into g from public._grade_question(qq, sa.selected_option_ids, sa.text_answer, sa.answer_data);
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
    jsonb_build_object('quiz_id', q.id, 'score', res.score, 'auto', p_auto, 'integrity', a.integrity_count));
  return res;
end $$;

-- ---------- Question builder -----------------------------------------
create or replace function public.save_question(p_quiz uuid, p_question uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_question;
  v_type public.question_type;
  v_school uuid;
  v_prompt text := trim(coalesce(p_data->>'prompt', ''));
  v_points numeric;
  v_opts jsonb := coalesce(p_data->'options', '[]'::jsonb);
  v_answers text[];
  v_manual boolean := coalesce((p_data->>'manual_grading')::boolean, false);
  v_payload jsonb; v_rubric jsonb; v_hint text;
  v_stim uuid := public.try_uuid(p_data->>'stimulus_id');
  v_obj uuid := public.try_uuid(p_data->>'objective_id');
  v_obj_code text := nullif(trim(coalesce(p_data->>'objective_code', '')), '');
  v_n_opt int; v_n_ok int; v_pos int; v_opt_types boolean;
  o jsonb; i int := 0;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then
    perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini');
  end if;
  select school_id into v_school from public.quizzes where id = p_quiz;
  begin
    v_type := (p_data->>'type')::public.question_type;
  exception when others then
    perform public._raise('INVALID_INPUT', 'Tipe soal tidak valid');
  end;
  if v_type is null then perform public._raise('INVALID_INPUT', 'Tipe soal tidak valid'); end if;
  if v_prompt = '' or char_length(v_prompt) > 5000 then
    perform public._raise('INVALID_INPUT', 'Pertanyaan wajib diisi (maks. 5000 karakter)');
  end if;
  begin
    v_points := coalesce((p_data->>'points')::numeric, 1);
  exception when others then
    perform public._raise('INVALID_INPUT', 'Bobot nilai harus berupa angka');
  end;
  if v_points <= 0 or v_points > 1000 then
    perform public._raise('INVALID_INPUT', 'Bobot nilai harus antara 0 dan 1000');
  end if;
  if nullif(p_data->>'image_path', '') is not null
     and (split_part(p_data->>'image_path', '/', 2) <> p_quiz::text
          or split_part(p_data->>'image_path', '/', 1) <> v_school::text) then
    perform public._raise('INVALID_INPUT', 'Gambar tidak valid untuk kuis ini');
  end if;
  if jsonb_typeof(v_opts) <> 'array' then perform public._raise('INVALID_INPUT', 'Format opsi tidak valid'); end if;

  -- Stimulus (same quiz) and learning objective (same school)
  if v_stim is not null and not exists (select 1 from public.quiz_stimuli where id = v_stim and quiz_id = p_quiz) then
    perform public._raise('INVALID_INPUT', 'Stimulus tidak ditemukan pada kuis ini');
  end if;
  if v_obj is null and v_obj_code is not null then
    select id into v_obj from public.learning_objectives where school_id = v_school and code = upper(v_obj_code);
    if v_obj is null then perform public._raise('INVALID_INPUT', format('Kode TP "%s" belum terdaftar', v_obj_code)); end if;
  elsif v_obj is not null and not exists (select 1 from public.learning_objectives where id = v_obj and school_id = v_school) then
    perform public._raise('INVALID_INPUT', 'Tujuan pembelajaran tidak valid');
  end if;

  -- Payload: hint (power-up) and rubric (essay)
  v_hint := nullif(left(trim(coalesce(p_data->'payload'->>'hint', p_data->>'hint', '')), 1000), '');
  if v_type = 'essay' and jsonb_typeof(p_data->'payload'->'rubric') = 'array' then
    if jsonb_array_length(p_data->'payload'->'rubric') > 10 then
      perform public._raise('INVALID_INPUT', 'Rubrik maksimal 10 kriteria');
    end if;
    select jsonb_agg(jsonb_build_object(
             'criterion', left(trim(e->>'criterion'), 300),
             'points', greatest(0, least(1000, coalesce(public.try_numeric(e->>'points'), 0)))))
      into v_rubric
    from jsonb_array_elements(p_data->'payload'->'rubric') e
    where trim(coalesce(e->>'criterion', '')) <> '';
  end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object('hint', v_hint, 'rubric', v_rubric));

  select coalesce(array_agg(trim(x)) filter (where trim(x) <> ''), '{}') into v_answers
  from jsonb_array_elements_text(case when jsonb_typeof(p_data->'accepted_answers') = 'array'
                                      then p_data->'accepted_answers' else '[]'::jsonb end) x;

  v_opt_types := v_type in ('multiple_choice', 'multiple_select', 'true_false', 'poll', 'tf_grid', 'matching', 'ordering');
  if v_opt_types then
    v_n_opt := jsonb_array_length(v_opts);
    select count(*) into v_n_ok from jsonb_array_elements(v_opts) e where coalesce((e->>'is_correct')::boolean, false);
    if v_n_opt < 2 or v_n_opt > 10 then
      perform public._raise('INVALID_INPUT', case v_type when 'tf_grid' then 'PGK Benar/Salah memerlukan 2–10 pernyataan'
        when 'matching' then 'Menjodohkan memerlukan 2–10 pasangan' when 'ordering' then 'Mengurutkan memerlukan 2–10 item'
        else 'Soal pilihan memerlukan 2–10 opsi' end);
    end if;
    if exists (select 1 from jsonb_array_elements(v_opts) e where trim(coalesce(e->>'label', '')) = '') then
      perform public._raise('INVALID_INPUT', 'Teks opsi tidak boleh kosong');
    end if;
    if exists (select 1 from jsonb_array_elements(v_opts) e where char_length(trim(e->>'label')) > 1000
                                                             or char_length(trim(coalesce(e->>'match_text', ''))) > 1000) then
      perform public._raise('INVALID_INPUT', 'Teks opsi maksimal 1000 karakter');
    end if;
    if v_type in ('multiple_choice', 'true_false') and v_n_ok <> 1 then
      perform public._raise('INVALID_INPUT', 'Pilih tepat satu jawaban benar');
    end if;
    if v_type = 'multiple_select' and v_n_ok < 1 then
      perform public._raise('INVALID_INPUT', 'Pilih minimal satu jawaban benar');
    end if;
    if v_type = 'matching' and exists (select 1 from jsonb_array_elements(v_opts) e
                                       where trim(coalesce(e->>'match_text', '')) = '') then
      perform public._raise('INVALID_INPUT', 'Setiap pasangan harus memiliki jawaban jodohnya');
    end if;
    v_answers := '{}';
    v_manual := false;
  else
    v_opts := '[]'::jsonb;
    if v_type = 'essay' then
      v_answers := '{}'; v_manual := true;
    elsif v_type = 'word_cloud' then
      v_answers := '{}'; v_manual := false;
    elsif cardinality(v_answers) = 0 and not v_manual then
      perform public._raise('INVALID_INPUT', 'Isi minimal satu kunci jawaban atau aktifkan penilaian manual');
    end if;
  end if;

  if v_id is null then
    select coalesce(max(position), -1) + 1 into v_pos from public.quiz_questions where quiz_id = p_quiz;
    insert into public.quiz_questions (quiz_id, type, prompt, image_path, points, explanation,
                                       accepted_answers, case_sensitive, manual_grading, position,
                                       payload, stimulus_id, objective_id)
    values (p_quiz, v_type, v_prompt, nullif(p_data->>'image_path', ''), v_points,
            nullif(trim(coalesce(p_data->>'explanation', '')), ''), v_answers,
            coalesce((p_data->>'case_sensitive')::boolean, false), v_manual, v_pos,
            v_payload, v_stim, v_obj)
    returning id into v_id;
  else
    update public.quiz_questions set
      type = v_type, prompt = v_prompt, image_path = nullif(p_data->>'image_path', ''), points = v_points,
      explanation = nullif(trim(coalesce(p_data->>'explanation', '')), ''), accepted_answers = v_answers,
      case_sensitive = coalesce((p_data->>'case_sensitive')::boolean, false), manual_grading = v_manual,
      payload = v_payload, stimulus_id = v_stim, objective_id = v_obj
    where id = v_id and quiz_id = p_quiz;
    if not found then perform public._raise('NOT_FOUND', 'Soal tidak ditemukan'); end if;
  end if;

  -- Upsert options: keep ids that still exist (attempt option orders stay valid), drop the rest.
  delete from public.question_options
  where question_id = v_id
    and id not in (select public.try_uuid(e->>'id') from jsonb_array_elements(v_opts) e
                   where public.try_uuid(e->>'id') is not null);
  for o in select * from jsonb_array_elements(v_opts) loop
    if public.try_uuid(o->>'id') is not null
       and exists (select 1 from public.question_options where id = public.try_uuid(o->>'id') and question_id = v_id) then
      update public.question_options
         set label = trim(o->>'label'),
             is_correct = case when v_type in ('poll', 'matching', 'ordering') then false
                               else coalesce((o->>'is_correct')::boolean, false) end,
             match_text = case when v_type = 'matching' then trim(o->>'match_text') end,
             position = i
      where id = public.try_uuid(o->>'id');
    else
      insert into public.question_options (question_id, label, is_correct, match_text, position)
      values (v_id, trim(o->>'label'),
              case when v_type in ('poll', 'matching', 'ordering') then false
                   else coalesce((o->>'is_correct')::boolean, false) end,
              case when v_type = 'matching' then trim(o->>'match_text') end, i);
    end if;
    i := i + 1;
  end loop;
  return v_id;
end $$;

create or replace function public.try_numeric(p text)
returns numeric language plpgsql immutable as $$
begin
  return p::numeric;
exception when others then
  return null;
end $$;

-- Bulk import (Excel/CSV): each row is a save_question payload. Rows fail independently.
create or replace function public.import_questions(p_quiz uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_ok int := 0; v_err jsonb := '[]'::jsonb; v_msg text;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    perform public._raise('INVALID_INPUT', 'File tidak berisi soal');
  end if;
  if jsonb_array_length(p_rows) > 300 then
    perform public._raise('INVALID_INPUT', 'Maksimal 300 soal per impor');
  end if;
  for r in select value, ordinality from jsonb_array_elements(p_rows) with ordinality loop
    begin
      perform public.save_question(p_quiz, null, r.value - 'row');
      v_ok := v_ok + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_err := v_err || jsonb_build_object('row', coalesce(public.try_numeric(r.value->>'row')::int, r.ordinality::int), 'message', v_msg);
    end;
  end loop;
  if v_ok > 0 then
    perform public.log_activity((select school_id from public.quizzes where id = p_quiz), 'questions.imported', 'quiz', p_quiz,
      jsonb_build_object('imported', v_ok, 'failed', jsonb_array_length(v_err)));
  end if;
  return jsonb_build_object('imported', v_ok, 'errors', v_err);
end $$;

create or replace function public._copy_question(p_question uuid, p_target_quiz uuid, p_position int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_new uuid; src public.quiz_questions; s public.quiz_stimuli; v_stim uuid;
begin
  select * into src from public.quiz_questions where id = p_question;
  v_stim := src.stimulus_id;
  if v_stim is not null and src.quiz_id <> p_target_quiz then
    select * into s from public.quiz_stimuli where id = src.stimulus_id;
    select id into v_stim from public.quiz_stimuli
    where quiz_id = p_target_quiz and content = s.content and coalesce(title, '') = coalesce(s.title, '') limit 1;
    if v_stim is null then
      insert into public.quiz_stimuli (quiz_id, title, content, image_path)
      values (p_target_quiz, s.title, s.content,
              case when split_part(s.image_path, '/', 2) = p_target_quiz::text then s.image_path end)
      returning id into v_stim;
    end if;
  end if;
  insert into public.quiz_questions (quiz_id, school_id, type, prompt, image_path, points, explanation,
                                     accepted_answers, case_sensitive, manual_grading, position,
                                     payload, stimulus_id, objective_id)
  values (p_target_quiz, src.school_id, src.type, src.prompt, src.image_path, src.points, src.explanation,
          src.accepted_answers, src.case_sensitive, src.manual_grading, p_position,
          src.payload, v_stim, src.objective_id)
  returning id into v_new;
  insert into public.question_options (question_id, school_id, label, is_correct, match_text, position)
  select v_new, school_id, label, is_correct, match_text, position from public.question_options where question_id = p_question;
  return v_new;
end $$;

create or replace function public.duplicate_quiz(p_quiz uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); v_src public.quizzes; v_new uuid; r record;
begin
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  select * into v_src from public.quizzes where id = p_quiz;
  insert into public.quizzes (school_id, teacher_id, subject_id, title, description, access, duration_minutes,
    max_attempts, shuffle_questions, shuffle_options, passing_grade, show_result, show_explanation,
    folder_id, mode, mastery_target, require_fullscreen, detect_tab_switch, show_watermark,
    powerups_enabled, instant_feedback, theme)
  values (v_src.school_id, v_uid, v_src.subject_id, left(v_src.title || ' (Salinan)', 150), v_src.description,
    v_src.access, v_src.duration_minutes, v_src.max_attempts, v_src.shuffle_questions, v_src.shuffle_options,
    v_src.passing_grade, v_src.show_result, v_src.show_explanation,
    case when v_src.teacher_id = v_uid then v_src.folder_id end, v_src.mode, v_src.mastery_target,
    v_src.require_fullscreen, v_src.detect_tab_switch, v_src.show_watermark, v_src.powerups_enabled,
    v_src.instant_feedback, v_src.theme)
  returning id into v_new;
  for r in select id, position from public.quiz_questions where quiz_id = p_quiz order by position, created_at loop
    perform public._copy_question(r.id, v_new, r.position);
  end loop;
  perform public.log_activity(v_src.school_id, 'quiz.duplicated', 'quiz', v_new, jsonb_build_object('source', p_quiz));
  return v_new;
end $$;

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
  if not exists (select 1 from public.quiz_questions where quiz_id = p_quiz and type not in ('poll', 'word_cloud'))
     and v_quiz.mode <> 'standard' then
    perform public._raise('INVALID_QUIZ', 'Mode latihan/ujian memerlukan minimal satu soal yang dinilai');
  end if;

  select format('Soal no. %s', rn) into v_bad from (
    select qq.*, row_number() over (order by position, created_at) as rn,
      (select count(*) from public.question_options o where o.question_id = qq.id) as n_opt,
      (select count(*) from public.question_options o where o.question_id = qq.id and o.is_correct) as n_ok,
      (select count(*) from public.question_options o where o.question_id = qq.id and coalesce(trim(o.match_text), '') = '') as n_nomatch
    from public.quiz_questions qq where qq.quiz_id = p_quiz
  ) t
  where (t.type in ('multiple_choice', 'true_false') and (t.n_opt < 2 or t.n_ok <> 1))
     or (t.type = 'multiple_select' and (t.n_opt < 2 or t.n_ok < 1))
     or (t.type in ('tf_grid', 'ordering', 'poll') and t.n_opt < 2)
     or (t.type = 'matching' and (t.n_opt < 2 or t.n_nomatch > 0))
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

