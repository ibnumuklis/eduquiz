-- EDUQUIZ — learning features (student session, power-ups, analysis). See DATABASE.md.

-- ---------- Student session ------------------------------------------
create or replace function public.start_attempt(p_quiz uuid default null, p_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  q public.quizzes;
  v_open public.quiz_attempts;
  v_used int; v_max int;
  v_order uuid[];
  v_subset uuid[];
  v_remedial boolean := false;
  v_opt jsonb := '{}'::jsonb;
  v_keep uuid[];
  v_reduce boolean := false;
  v_mult numeric := 1;
  v_seed text;
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
  v_max := case when q.mode = 'practice' then 50 else q.max_attempts end;
  if v_used >= v_max then
    perform public._raise('MAX_ATTEMPTS', 'Batas percobaan sudah tercapai');
  end if;

  -- Practice mode: after the first attempt only the questions not yet mastered are served (remedial).
  if q.mode = 'practice' and v_used > 0 then
    select array_agg(qq.id) into v_subset
    from public.quiz_questions qq
    where qq.quiz_id = q.id and qq.type not in ('poll', 'word_cloud')
      and not exists (select 1 from public.student_answers sa join public.quiz_attempts at on at.id = sa.attempt_id
                      where sa.question_id = qq.id and at.student_id = v_uid and at.quiz_id = q.id
                        and at.status = 'submitted' and (sa.needs_manual_grading or sa.points_awarded >= qq.points));
    v_remedial := v_subset is not null;
  end if;

  -- Accommodations
  select coalesce(sa.time_multiplier, 1), coalesce(sa.reduce_options, false) into v_mult, v_reduce
  from public.student_accommodations sa where sa.school_id = q.school_id and sa.student_id = v_uid;
  v_mult := coalesce(v_mult, 1); v_reduce := coalesce(v_reduce, false);

  -- Question order: questions sharing a stimulus stay together (one stable random key per group).
  v_seed := gen_random_uuid()::text;
  select array_agg(qq.id order by
           case when q.shuffle_questions then md5(v_seed || coalesce(qq.stimulus_id, qq.id)::text) else '' end,
           g.minpos, qq.position, qq.created_at)
    into v_order
  from public.quiz_questions qq
  join (select coalesce(x.stimulus_id, x.id) as gk, min(x.position) as minpos
        from public.quiz_questions x
        where x.quiz_id = q.id and (v_subset is null or x.id = any(v_subset))
        group by 1) g on g.gk = coalesce(qq.stimulus_id, qq.id)
  where qq.quiz_id = q.id and (v_subset is null or qq.id = any(v_subset));
  if v_order is null then perform public._raise('INVALID_QUIZ', 'Kuis belum memiliki soal'); end if;

  for r in
    select qq.id, qq.type,
           array_agg(o.id order by case when (q.shuffle_options and qq.type <> 'true_false') or qq.type = 'ordering'
                                        then random() else 0 end, o.position, o.created_at) as opts
    from public.quiz_questions qq join public.question_options o on o.question_id = qq.id
    where qq.quiz_id = q.id and qq.id = any(v_order) group by qq.id, qq.type
  loop
    v_keep := r.opts;
    if v_reduce and r.type = 'multiple_choice' and cardinality(r.opts) >= 4 then
      select array_agg(z.x order by z.i) into v_keep from (
        select u.x, u.i, o.is_correct,
               row_number() over (partition by o.is_correct order by u.i) as rn
        from unnest(r.opts) with ordinality u(x, i) join public.question_options o on o.id = u.x) z
      where z.is_correct or z.rn <= greatest(1, ceil(cardinality(r.opts) / 2.0)::int - 1);
    end if;
    v_opt := v_opt || jsonb_build_object(r.id::text, to_jsonb(v_keep));
  end loop;

  begin
    insert into public.quiz_attempts (quiz_id, school_id, student_id, attempt_number, expires_at,
                                      question_order, option_order, total_questions, is_remedial, time_multiplier)
    values (q.id, q.school_id, v_uid, v_used + 1,
            least(now() + make_interval(secs => (q.duration_minutes * 60 * v_mult)::float8),
                  coalesce(q.end_at, 'infinity'::timestamptz)),
            v_order, v_opt, cardinality(v_order), v_remedial, v_mult)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.quiz_attempts
    where quiz_id = q.id and student_id = v_uid and status = 'in_progress';
    return v_id;
  end;

  select full_name into v_name from public.profiles where id = v_uid;
  perform public.notify(q.teacher_id, q.school_id, 'attempt.started',
    coalesce(nullif(v_name, ''), 'Siswa') || ' mulai mengerjakan', q.title,
    '/teacher/quizzes/' || q.id || '/monitor', 'started:' || v_id);
  perform public.log_activity(q.school_id, 'attempt.started', 'attempt', v_id,
    jsonb_build_object('quiz_id', q.id, 'remedial', v_remedial));
  return v_id;
end $$;

-- Student-safe view of an attempt: questions WITHOUT answer keys.
create or replace function public.get_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; v_questions jsonb; v_answers jsonb;
  v_name text; v_nis text; v_read boolean;
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
           'stimulus', (select jsonb_build_object('id', s.id, 'title', s.title, 'content', s.content, 'image_path', s.image_path)
                        from public.quiz_stimuli s where s.id = qq.stimulus_id),
           'rubric', case when qq.type = 'essay' then qq.payload->'rubric' end,
           'has_hint', coalesce(qq.payload->>'hint', '') <> '',
           'hint', case when a.powerup_log->>'hint' = qq.id::text then qq.payload->>'hint' end,
           'options', coalesce((
              select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by oo.ord)
              from jsonb_array_elements_text(coalesce(a.option_order -> qq.id::text, '[]'::jsonb)) with ordinality oo(opt_id, ord)
              join public.question_options o on o.id = oo.opt_id::uuid
              where not (coalesce(a.hidden_options -> qq.id::text, '[]'::jsonb) ? oo.opt_id)), '[]'::jsonb),
           'right_choices', case when qq.type = 'matching' then (
              select coalesce(jsonb_agg(t.m order by md5(a.id::text || t.m)), '[]'::jsonb)
              from (select distinct o.match_text as m from public.question_options o
                    where o.question_id = qq.id and o.match_text is not null) t) end
         ) order by t.ord), '[]'::jsonb)
    into v_questions
  from unnest(a.question_order) with ordinality t(qid, ord)
  join public.quiz_questions qq on qq.id = t.qid;

  select coalesce(jsonb_object_agg(sa.question_id::text, jsonb_build_object(
           'selected_option_ids', to_jsonb(sa.selected_option_ids), 'text_answer', sa.text_answer,
           'answer_data', sa.answer_data, 'locked', sa.locked,
           'is_correct', case when sa.locked then sa.is_correct end)), '{}'::jsonb)
    into v_answers
  from public.student_answers sa where sa.attempt_id = a.id;

  select p.full_name, m.student_number into v_name, v_nis
  from public.profiles p left join public.school_members m on m.user_id = p.id and m.school_id = a.school_id
  where p.id = v_uid;
  select read_aloud into v_read from public.student_accommodations where school_id = a.school_id and student_id = v_uid;

  return jsonb_build_object(
    'attempt', jsonb_build_object('id', a.id, 'status', a.status, 'started_at', a.started_at,
        'expires_at', a.expires_at, 'submitted_at', a.submitted_at, 'attempt_number', a.attempt_number,
        'answered_count', a.answered_count, 'total_questions', a.total_questions,
        'is_remedial', a.is_remedial, 'time_multiplier', a.time_multiplier,
        'powerups_used', to_jsonb(a.powerups_used), 'integrity_count', a.integrity_count),
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'description', q.description,
        'duration_minutes', q.duration_minutes, 'show_result', q.show_result, 'mode', q.mode,
        'require_fullscreen', q.require_fullscreen, 'detect_tab_switch', q.detect_tab_switch,
        'show_watermark', q.show_watermark, 'powerups_enabled', q.powerups_enabled,
        'instant_feedback', q.instant_feedback, 'theme', q.theme),
    'student', jsonb_build_object('full_name', v_name, 'student_number', v_nis, 'read_aloud', coalesce(v_read, false)),
    'server_now', now(),
    'questions', case when a.status = 'in_progress' then v_questions else '[]'::jsonb end,
    'answers', v_answers);
end $$;


-- Instant feedback (practice-friendly): grades one saved answer and locks it.
create or replace function public.check_answer(p_attempt uuid, p_question uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; qq public.quiz_questions; sa public.student_answers; g record;
  v_retry boolean;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'in_progress' then perform public._raise('ALREADY_SUBMITTED', 'Jawaban sudah dikumpulkan'); end if;
  if now() > a.expires_at + interval '30 seconds' then
    perform public._finalize_attempt(a.id, true);
    return jsonb_build_object('expired', true);
  end if;
  select * into q from public.quizzes where id = a.quiz_id;
  if not q.instant_feedback then perform public._raise('FORBIDDEN', 'Umpan balik langsung tidak aktif pada kuis ini'); end if;
  if not (p_question = any(a.question_order)) then perform public._raise('INVALID_INPUT', 'Soal tidak termasuk dalam kuis ini'); end if;
  select * into qq from public.quiz_questions where id = p_question;
  select * into sa from public.student_answers where attempt_id = a.id and question_id = p_question for update;
  if not found or not public._is_answered(sa.selected_option_ids, sa.text_answer, sa.answer_data) then
    perform public._raise('INVALID_INPUT', 'Jawab soal terlebih dahulu');
  end if;
  if sa.locked then perform public._raise('ANSWER_LOCKED', 'Jawaban soal ini sudah diperiksa'); end if;

  select * into g from public._grade_question(qq, sa.selected_option_ids, sa.text_answer, sa.answer_data);
  update public.student_answers set locked = true, is_correct = g.is_correct, points_awarded = g.points
  where id = sa.id;

  if g.needs_manual or qq.type in ('poll', 'word_cloud') then
    return jsonb_build_object('graded', false, 'locked', true);
  end if;
  v_retry := g.is_correct is false and q.powerups_enabled and not ('second_chance' = any(a.powerups_used));
  return jsonb_build_object('graded', true, 'locked', true, 'is_correct', g.is_correct, 'points', g.points,
    'can_retry', v_retry,
    'key', case when v_retry then null else public._answer_key(qq) end,
    'explanation', case when v_retry then null else qq.explanation end);
end $$;

-- Positive power-ups: each kind once per attempt; never in exam mode.
create or replace function public.use_powerup(p_attempt uuid, p_question uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; qq public.quiz_questions; sa public.student_answers;
  v_wrong uuid[]; v_hide uuid[]; v_n int; v_res jsonb;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'in_progress' or now() > a.expires_at + interval '30 seconds' then
    perform public._raise('ALREADY_SUBMITTED', 'Pengerjaan sudah berakhir');
  end if;
  select * into q from public.quizzes where id = a.quiz_id;
  if not q.powerups_enabled or q.mode = 'exam' then perform public._raise('FORBIDDEN', 'Power-up tidak aktif pada kuis ini'); end if;
  if p_kind not in ('fifty_fifty', 'hint', 'second_chance') then perform public._raise('INVALID_INPUT', 'Power-up tidak dikenal'); end if;
  if p_kind = any(a.powerups_used) then perform public._raise('POWERUP_USED', 'Power-up ini sudah dipakai'); end if;
  if not (p_question = any(a.question_order)) then perform public._raise('INVALID_INPUT', 'Soal tidak termasuk dalam kuis ini'); end if;
  select * into qq from public.quiz_questions where id = p_question;
  select * into sa from public.student_answers where attempt_id = a.id and question_id = p_question for update;

  if p_kind = 'fifty_fifty' then
    if qq.type <> 'multiple_choice' then perform public._raise('INVALID_INPUT', '50:50 hanya untuk soal pilihan ganda'); end if;
    if sa.locked then perform public._raise('ANSWER_LOCKED', 'Jawaban soal ini sudah dikunci'); end if;
    select array_agg(e.x::uuid) into v_wrong
    from jsonb_array_elements_text(coalesce(a.option_order -> qq.id::text, '[]'::jsonb)) e(x)
    join public.question_options o on o.id = e.x::uuid
    where not o.is_correct and not (coalesce(a.hidden_options -> qq.id::text, '[]'::jsonb) ? e.x);
    v_n := least(2, coalesce(cardinality(v_wrong), 0) - 1);
    if v_n < 1 then perform public._raise('INVALID_INPUT', 'Opsi jawaban terlalu sedikit untuk 50:50'); end if;
    select array_agg(x) into v_hide from (select x from unnest(v_wrong) x order by random() limit v_n) z;
    update public.quiz_attempts set hidden_options = hidden_options || jsonb_build_object(qq.id::text, to_jsonb(v_hide))
    where id = a.id;
    update public.student_answers set selected_option_ids = '{}'
    where attempt_id = a.id and question_id = qq.id and selected_option_ids && v_hide;
    v_res := jsonb_build_object('hidden', to_jsonb(v_hide));
  elsif p_kind = 'hint' then
    if coalesce(trim(qq.payload->>'hint'), '') = '' then perform public._raise('INVALID_INPUT', 'Soal ini tidak memiliki petunjuk'); end if;
    v_res := jsonb_build_object('hint', qq.payload->>'hint');
  else
    if sa.id is null or not sa.locked or sa.is_correct is not false then
      perform public._raise('INVALID_INPUT', 'Kesempatan kedua hanya untuk jawaban yang sudah diperiksa dan salah');
    end if;
    update public.student_answers set locked = false, is_correct = null, points_awarded = null where id = sa.id;
    v_res := jsonb_build_object('unlocked', true);
  end if;

  update public.quiz_attempts
     set powerups_used = powerups_used || p_kind,
         powerup_log = powerup_log || jsonb_build_object(p_kind, qq.id),
         last_active_at = now()
   where id = a.id;
  return v_res || jsonb_build_object('kind', p_kind);
end $$;

-- Integrity events (focus loss, fullscreen exit, copy/paste). Signals for the teacher, never auto-penalties.
create or replace function public.log_integrity_event(p_attempt uuid, p_kind text, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; v_name text; v_count int;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'in_progress' then return jsonb_build_object('ignored', true, 'count', a.integrity_count); end if;
  if p_kind not in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'context_menu') then
    perform public._raise('INVALID_INPUT', 'Jenis kejadian tidak dikenal');
  end if;
  if a.integrity_count >= 500 then return jsonb_build_object('count', a.integrity_count); end if;

  insert into public.integrity_events (attempt_id, quiz_id, school_id, student_id, kind, detail)
  values (a.id, a.quiz_id, a.school_id, v_uid, p_kind, left(p_detail, 200));
  update public.quiz_attempts set integrity_count = integrity_count + 1 where id = a.id
  returning integrity_count into v_count;

  if v_count = 3 then
    select * into q from public.quizzes where id = a.quiz_id;
    select full_name into v_name from public.profiles where id = v_uid;
    perform public.notify(q.teacher_id, q.school_id, 'integrity.warning',
      'Perhatian: ' || coalesce(nullif(v_name, ''), 'Siswa') || ' meninggalkan halaman kuis',
      q.title || ' — 3 kejadian tercatat', '/teacher/quizzes/' || q.id || '/monitor', 'integrity:' || a.id);
  end if;
  return jsonb_build_object('count', v_count);
end $$;

-- Result + review (keys only when allowed)
create or replace function public.get_attempt_review(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; res public.quiz_results;
  v_is_staff boolean; v_items jsonb; v_show_keys boolean; v_used int; v_can_practice boolean;
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
      'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'mode', q.mode),
      'attempt', jsonb_build_object('id', a.id, 'submitted_at', a.submitted_at));
  end if;
  v_show_keys := v_is_staff or q.show_explanation;

  select count(*) into v_used from public.quiz_attempts where quiz_id = q.id and student_id = a.student_id;
  v_can_practice := q.mode = 'practice' and q.status = 'published' and not coalesce(res.mastered, false)
                    and (q.end_at is null or q.end_at > now()) and v_used < 50
                    and not exists (select 1 from public.quiz_attempts x where x.quiz_id = q.id
                                    and x.student_id = a.student_id and x.attempt_number > a.attempt_number);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', qq.id, 'type', qq.type, 'prompt', qq.prompt, 'image_path', qq.image_path, 'points', qq.points,
      'explanation', case when v_show_keys then qq.explanation end,
      'accepted_answers', case when v_show_keys then to_jsonb(qq.accepted_answers) end,
      'rubric', qq.payload->'rubric',
      'stimulus', (select jsonb_build_object('title', s.title, 'content', s.content, 'image_path', s.image_path)
                   from public.quiz_stimuli s where s.id = qq.stimulus_id),
      'objective', (select jsonb_build_object('code', lo.code, 'description', lo.description)
                    from public.learning_objectives lo where lo.id = qq.objective_id),
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                      'is_correct', case when v_show_keys then o.is_correct end,
                      'match_text', case when v_show_keys then o.match_text end) order by o.position)
                   from public.question_options o where o.question_id = qq.id), '[]'::jsonb),
      'answer', jsonb_build_object('selected_option_ids', to_jsonb(coalesce(sa.selected_option_ids, '{}')),
                 'text_answer', sa.text_answer, 'answer_data', sa.answer_data, 'is_correct', sa.is_correct,
                 'points_awarded', sa.points_awarded, 'needs_manual_grading', coalesce(sa.needs_manual_grading, false),
                 'answer_id', sa.id, 'teacher_feedback', sa.teacher_feedback, 'rubric_scores', sa.rubric_scores)
    ) order by t.ord), '[]'::jsonb)
  into v_items
  from unnest(a.question_order) with ordinality t(qid, ord)
  join public.quiz_questions qq on qq.id = t.qid
  left join public.student_answers sa on sa.attempt_id = a.id and sa.question_id = qq.id;

  return jsonb_build_object('visible', true, 'show_keys', v_show_keys,
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'passing_grade', q.passing_grade,
             'mode', q.mode, 'mastery_target', q.mastery_target),
    'attempt', jsonb_build_object('id', a.id, 'started_at', a.started_at, 'submitted_at', a.submitted_at,
               'attempt_number', a.attempt_number, 'auto_submitted', a.auto_submitted, 'is_late', a.is_late,
               'is_remedial', a.is_remedial, 'integrity_count', a.integrity_count,
               'powerups_used', to_jsonb(a.powerups_used)),
    'can_practice_again', v_can_practice,
    'result', to_jsonb(res), 'items', v_items);
end $$;



-- ---------- Analysis: heatmap, item analysis, distractors, TP mastery ----
create or replace function public.get_quiz_analysis(p_quiz uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.quizzes; v jsonb;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak melihat analisis kuis ini'); end if;
  select * into q from public.quizzes where id = p_quiz;

  with fin as (   -- latest submitted attempt per student
    select distinct on (a.student_id) a.* from public.quiz_attempts a
    where a.quiz_id = p_quiz and a.status = 'submitted'
    order by a.student_id, a.attempt_number desc
  ),
  qs as (
    select qq.*, row_number() over (order by qq.position, qq.created_at) as no
    from public.quiz_questions qq where qq.quiz_id = p_quiz
  ),
  -- Per student & question: latest attempt (standard/exam) or best across attempts (practice).
  cell as (
    select f.student_id, qs.id as qid, qs.type, qs.points,
      case when q.mode = 'practice' then (
             select case when bool_or(sa.needs_manual_grading) and coalesce(max(sa.points_awarded), 0) < qs.points then -2
                         when count(sa.id) filter (where public._is_answered(sa.selected_option_ids, sa.text_answer, sa.answer_data)) = 0 then -1
                         else round(coalesce(max(sa.points_awarded), 0) / qs.points, 3) end
             from public.quiz_attempts at
             join public.student_answers sa on sa.attempt_id = at.id and sa.question_id = qs.id
             where at.quiz_id = p_quiz and at.student_id = f.student_id and at.status = 'submitted')
           else (
             select case when sa.needs_manual_grading then -2
                         when sa.id is null or not public._is_answered(sa.selected_option_ids, sa.text_answer, sa.answer_data) then -1
                         else round(coalesce(sa.points_awarded, 0) / qs.points, 3) end
             from (select 1) one left join public.student_answers sa on sa.attempt_id = f.id and sa.question_id = qs.id
             where qs.id = any(f.question_order))
      end as ratio
    from fin f cross join qs
    where qs.type not in ('poll', 'word_cloud')
  )
  select jsonb_build_object(
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'passing_grade', q.passing_grade,
                               'mastery_target', q.mastery_target, 'mode', q.mode),
    'objectives', coalesce((select jsonb_agg(jsonb_build_object('id', lo.id, 'code', lo.code, 'description', lo.description)
                                             order by lo.code)
                            from public.learning_objectives lo
                            where lo.id in (select objective_id from qs where objective_id is not null)), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', qs.id, 'no', qs.no, 'type', qs.type, 'prompt', left(qs.prompt, 240), 'points', qs.points,
        'objective_id', qs.objective_id,
        'responses', (select count(*) from cell c where c.qid = qs.id and c.ratio is not null and c.ratio >= 0),
        'p_value', (select round(avg(greatest(c.ratio, 0)), 3) from cell c where c.qid = qs.id and c.ratio is not null and c.ratio <> -2),
        'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct,
                        'match_text', o.match_text,
                        'count', (select count(*) from fin f join public.student_answers sa
                                    on sa.attempt_id = f.id and sa.question_id = qs.id
                                  where o.id = any(sa.selected_option_ids))) order by o.position), '[]'::jsonb)
                    from public.question_options o where o.question_id = qs.id),
        'words', case when qs.type in ('word_cloud', 'short_answer', 'fill_blank') then (
                    select coalesce(jsonb_agg(jsonb_build_object('text', w.t, 'count', w.c) order by w.c desc, w.t), '[]'::jsonb)
                    from (select lower(trim(sa.text_answer)) as t, count(*) as c
                          from fin f join public.student_answers sa on sa.attempt_id = f.id and sa.question_id = qs.id
                          where coalesce(trim(sa.text_answer), '') <> ''
                          group by 1 order by 2 desc limit 60) w) end
      ) order by qs.no) from qs), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'student_id', f.student_id, 'name', p.full_name, 'student_number', m.student_number,
        'class_name', (select string_agg(distinct c.name, ', ') from public.quiz_assignments qa
                       join public.class_students cs on cs.class_id = qa.class_id and cs.student_id = f.student_id
                       join public.classes c on c.id = qa.class_id where qa.quiz_id = p_quiz),
        'attempt_id', f.id, 'attempts', f.attempt_number, 'score', r.score, 'passed', r.passed,
        'mastered', r.mastered, 'game_score', r.game_score, 'integrity_count', f.integrity_count,
        'cells', (select coalesce(jsonb_object_agg(c.qid::text, c.ratio), '{}'::jsonb) from cell c where c.student_id = f.student_id)
      ) order by p.full_name)
      from fin f join public.profiles p on p.id = f.student_id
      left join public.quiz_results r on r.attempt_id = f.id
      left join public.school_members m on m.school_id = q.school_id and m.user_id = f.student_id), '[]'::jsonb)
  ) into v;
  return v;
end $$;


-- ---------- Privileges for new / changed functions -------------------
revoke execute on function public._grade_question(public.quiz_questions, uuid[], text, jsonb) from public, anon, authenticated;
revoke execute on function public._answer_key(public.quiz_questions) from public, anon, authenticated;
revoke execute on function public._recompute_result(uuid) from public, anon, authenticated;
revoke execute on function public._update_gamification(uuid) from public, anon, authenticated;
revoke execute on function public._finalize_attempt(uuid, boolean) from public, anon, authenticated;
revoke execute on function public._copy_question(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.tg_stimulus_school() from public, anon, authenticated;
revoke execute on function public.tg_objective_check() from public, anon, authenticated;
revoke execute on function public.tg_folder_owner() from public, anon, authenticated;
revoke execute on function public.tg_quiz_mode() from public, anon, authenticated;
revoke execute on function public.tg_accommodation_check() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public._is_answered(uuid[], text, jsonb)', 'public.try_numeric(text)',
    'public.save_question(uuid, uuid, jsonb)', 'public.import_questions(uuid, jsonb)',
    'public.duplicate_quiz(uuid)', 'public.publish_quiz(uuid)',
    'public.start_attempt(uuid, text)', 'public.get_attempt(uuid)',
    'public.check_answer(uuid, uuid)', 'public.use_powerup(uuid, uuid, text)',
    'public.log_integrity_event(uuid, text, text)', 'public.get_attempt_review(uuid)',
    'public.get_quiz_analysis(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

alter function public._is_answered(uuid[], text, jsonb) set search_path = public;
alter function public.try_numeric(text) set search_path = public;
