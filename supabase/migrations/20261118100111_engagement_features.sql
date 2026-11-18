-- =====================================================================
-- EDUQUIZ — engagement features
--  * Integrity alarm + extra signals (shortcuts, split screen)
--  * Quiz language (natural read-aloud voice), audio questions
--  * School-shared question bank
--  * Cross-quiz (semester) mastery report per class
--  * Live mode (teacher-paced, projector leaderboard)
-- All changes are additive; existing functions are wrapped, not dropped.
-- =====================================================================

-- ---------- Quiz settings --------------------------------------------
alter table public.quizzes
  add column if not exists integrity_alarm boolean not null default true,
  add column if not exists language text not null default 'id',
  add column if not exists shared_with_school boolean not null default false;
alter table public.quizzes drop constraint if exists quizzes_language_check;
alter table public.quizzes add constraint quizzes_language_check
  check (language in ('id', 'en', 'ar', 'ja', 'ko', 'zh', 'fr', 'de'));
grant insert (integrity_alarm, language, shared_with_school),
      update (integrity_alarm, language, shared_with_school)
  on public.quizzes to authenticated;

-- ---------- Integrity: more signal kinds ------------------------------
alter table public.integrity_events drop constraint if exists integrity_events_kind_check;
alter table public.integrity_events add constraint integrity_events_kind_check
  check (kind in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'context_menu', 'shortcut', 'split_screen'));

create or replace function public.log_integrity_event(p_attempt uuid, p_kind text, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  a public.quiz_attempts; q public.quizzes; v_name text; v_count int;
begin
  select * into a from public.quiz_attempts where id = p_attempt for update;
  if not found or a.student_id <> v_uid then perform public._raise('NOT_FOUND', 'Pengerjaan tidak ditemukan'); end if;
  if a.status <> 'in_progress' then return jsonb_build_object('ignored', true, 'count', a.integrity_count); end if;
  if p_kind not in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'context_menu', 'shortcut', 'split_screen') then
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

-- ---------- Storage: allow audio (listening questions) -----------------
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif',
                                  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav',
                                  'audio/x-wav', 'audio/ogg', 'audio/webm']
 where id = 'quiz-media';

-- ---------- Audio on questions (wraps the existing builder) -------------
do $$
begin
  if to_regprocedure('public._save_question_core(uuid, uuid, jsonb)') is null then
    alter function public.save_question(uuid, uuid, jsonb) rename to _save_question_core;
  end if;
end $$;
revoke execute on function public._save_question_core(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.save_question(p_quiz uuid, p_question uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_school uuid;
  v_audio text := nullif(trim(coalesce(p_data->'payload'->>'audio_path', '')), '');
  v_plays int := coalesce(public.try_numeric(p_data->'payload'->>'audio_max_plays')::int, 0);
begin
  v_id := public._save_question_core(p_quiz, p_question, p_data);
  select school_id into v_school from public.quizzes where id = p_quiz;
  if v_audio is not null and (split_part(v_audio, '/', 1) <> v_school::text or split_part(v_audio, '/', 2) <> p_quiz::text) then
    perform public._raise('INVALID_INPUT', 'Audio tidak valid untuk kuis ini');
  end if;
  if v_plays < 0 or v_plays > 10 then perform public._raise('INVALID_INPUT', 'Batas putar audio 0–10'); end if;
  update public.quiz_questions
     set payload = case when v_audio is null then payload - 'audio_path' - 'audio_max_plays'
                        else payload || jsonb_build_object('audio_path', v_audio, 'audio_max_plays', v_plays) end
   where id = v_id;
  return v_id;
end $$;

-- ---------- Student payload: language, alarm, audio --------------------
do $$
begin
  if to_regprocedure('public._get_attempt_core(uuid)') is null then
    alter function public.get_attempt(uuid) rename to _get_attempt_core;
  end if;
end $$;
revoke execute on function public._get_attempt_core(uuid) from public, anon, authenticated;

create or replace function public.get_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; q public.quizzes; v_questions jsonb;
begin
  v := public._get_attempt_core(p_attempt);
  select * into q from public.quizzes where id = (v->'quiz'->>'id')::uuid;
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
            'audio_path', qq.payload->>'audio_path',
            'audio_max_plays', coalesce((qq.payload->>'audio_max_plays')::int, 0)) order by e.ord), '[]'::jsonb)
    into v_questions
  from jsonb_array_elements(v->'questions') with ordinality e(value, ord)
  join public.quiz_questions qq on qq.id = (e.value->>'id')::uuid;
  return jsonb_set(jsonb_set(v, '{questions}', v_questions), '{quiz}',
    (v->'quiz') || jsonb_build_object('language', q.language, 'integrity_alarm', q.integrity_alarm));
end $$;

do $$
begin
  if to_regprocedure('public._get_attempt_review_core(uuid)') is null then
    alter function public.get_attempt_review(uuid) rename to _get_attempt_review_core;
  end if;
end $$;
revoke execute on function public._get_attempt_review_core(uuid) from public, anon, authenticated;

create or replace function public.get_attempt_review(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_items jsonb; v_lang text;
begin
  v := public._get_attempt_review_core(p_attempt);
  if not coalesce((v->>'visible')::boolean, false) then return v; end if;
  select language into v_lang from public.quizzes where id = (v->'quiz'->>'id')::uuid;
  select coalesce(jsonb_agg(e.value || jsonb_build_object('audio_path', qq.payload->>'audio_path') order by e.ord), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(v->'items') with ordinality e(value, ord)
  join public.quiz_questions qq on qq.id = (e.value->>'id')::uuid;
  return jsonb_set(jsonb_set(v, '{items}', v_items), '{quiz}', (v->'quiz') || jsonb_build_object('language', v_lang));
end $$;

-- ---------- School-shared question bank --------------------------------
create or replace function public.get_school_bank(p_school uuid, p_search text default null, p_type text default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._require_uid();
  if not public.is_staff(p_school) then perform public._raise('FORBIDDEN', 'Hanya guru sekolah ini yang dapat melihat bank soal sekolah'); end if;
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', qq.id, 'type', qq.type, 'prompt', qq.prompt, 'points', qq.points, 'created_at', qq.created_at,
      'accepted_answers', to_jsonb(qq.accepted_answers),
      'quiz', jsonb_build_object('id', q.id, 'title', q.title),
      'subject', (select s.name from public.subjects s where s.id = q.subject_id),
      'owner', (select p.full_name from public.profiles p where p.id = q.teacher_id),
      'objective', (select lo.code from public.learning_objectives lo where lo.id = qq.objective_id),
      'options', coalesce((select jsonb_agg(jsonb_build_object('label', o.label, 'is_correct', o.is_correct, 'match_text', o.match_text, 'position', o.position) order by o.position)
                           from public.question_options o where o.question_id = qq.id), '[]'::jsonb)) as x
    from public.quiz_questions qq
    join public.quizzes q on q.id = qq.quiz_id
    where q.school_id = p_school and q.shared_with_school and q.teacher_id <> auth.uid()
      and (p_type is null or p_type = '' or qq.type::text = p_type)
      and (p_search is null or p_search = '' or qq.prompt ilike '%' || p_search || '%' or q.title ilike '%' || p_search || '%')
    order by qq.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) t;
  return v;
end $$;

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
    join public.quizzes src on src.id = qq.quiz_id
    join unnest(p_question_ids) with ordinality t(id, ord) on t.id = qq.id
    where qq.school_id = v_target_school
      and (public.can_manage_quiz(qq.quiz_id) or (src.shared_with_school and public.is_staff(src.school_id)))
    order by t.ord
  loop
    v_pos := v_pos + 1;
    perform public._copy_question(r.id, p_target_quiz, v_pos);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Cross-quiz mastery (semester report) -----------------------
create or replace function public.get_class_mastery(p_class uuid, p_subject uuid default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.classes; v jsonb;
begin
  perform public._require_uid();
  select * into c from public.classes where id = p_class;
  if not found or not public.teaches_class(p_class) then perform public._raise('FORBIDDEN', 'Anda tidak mengajar kelas ini'); end if;

  with qz as (
    select q.* from public.quizzes q
    where q.school_id = c.school_id
      and exists (select 1 from public.quiz_assignments qa where qa.quiz_id = q.id and qa.class_id = p_class)
      and (p_subject is null or q.subject_id = p_subject)
      and (p_from is null or coalesce(q.published_at, q.created_at)::date >= p_from)
      and (p_to is null or coalesce(q.published_at, q.created_at)::date <= p_to)
      and q.status <> 'draft'
  ),
  st as (
    select cs.student_id from public.class_students cs where cs.class_id = p_class
  ),
  fin as (   -- latest submitted attempt per student per quiz
    select distinct on (a.student_id, a.quiz_id) a.*
    from public.quiz_attempts a join qz on qz.id = a.quiz_id join st on st.student_id = a.student_id
    where a.status = 'submitted'
    order by a.student_id, a.quiz_id, a.attempt_number desc
  ),
  cell as (  -- per student × question with an objective: ratio (best across attempts for practice)
    select f.student_id, qq.objective_id,
      case when qz.mode = 'practice' then (
             select coalesce(max(sa.points_awarded), 0) / qq.points
             from public.quiz_attempts at join public.student_answers sa on sa.attempt_id = at.id and sa.question_id = qq.id
             where at.quiz_id = qz.id and at.student_id = f.student_id and at.status = 'submitted'
               and not sa.needs_manual_grading)
           else (select case when sa.needs_manual_grading then null else coalesce(sa.points_awarded, 0) / qq.points end
                 from (select 1) one left join public.student_answers sa on sa.attempt_id = f.id and sa.question_id = qq.id)
      end as ratio
    from fin f join qz on qz.id = f.quiz_id
    join public.quiz_questions qq on qq.quiz_id = qz.id and qq.objective_id is not null
    where qq.type not in ('poll', 'word_cloud') and (qz.mode = 'practice' or qq.id = any(f.question_order))
  )
  select jsonb_build_object(
    'class', jsonb_build_object('id', c.id, 'name', c.name),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('id', qz.id, 'title', qz.title, 'mode', qz.mode,
                   'date', coalesce(qz.published_at, qz.created_at), 'passing_grade', qz.passing_grade)
                   order by coalesce(qz.published_at, qz.created_at)) from qz), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(jsonb_build_object('id', lo.id, 'code', lo.code, 'description', lo.description) order by lo.code)
                   from public.learning_objectives lo
                   where lo.id in (select distinct objective_id from cell)), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'student_id', st.student_id, 'name', p.full_name, 'student_number', m.student_number,
        'quizzes_done', (select count(*) from fin f where f.student_id = st.student_id),
        'avg_score', (select round(avg(r.score), 2) from fin f join public.quiz_results r on r.attempt_id = f.id where f.student_id = st.student_id),
        'scores', (select coalesce(jsonb_object_agg(f.quiz_id::text, r.score), '{}'::jsonb)
                   from fin f join public.quiz_results r on r.attempt_id = f.id where f.student_id = st.student_id),
        'mastery', (select coalesce(jsonb_object_agg(x.objective_id::text, x.pct), '{}'::jsonb) from (
                     select cl.objective_id, round(avg(cl.ratio) * 100)::int as pct from cell cl
                     where cl.student_id = st.student_id and cl.ratio is not null group by cl.objective_id) x)
      ) order by p.full_name)
      from st join public.profiles p on p.id = st.student_id
      left join public.school_members m on m.school_id = c.school_id and m.user_id = st.student_id), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ---------- Live mode ----------------------------------------------------
create table if not exists public.live_sessions (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quizzes(id) on delete cascade,
  school_id           uuid not null references public.schools(id) on delete cascade,
  host_id             uuid not null references public.profiles(id) on delete cascade,
  code                text not null,
  status              text not null default 'lobby' check (status in ('lobby', 'question', 'reveal', 'ended')),
  question_ids        uuid[] not null,
  current_index       integer not null default -1,
  question_seconds    integer not null default 20 check (question_seconds between 5 and 120),
  question_started_at timestamptz,
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);
create unique index if not exists live_sessions_code_open_uq on public.live_sessions(code) where status <> 'ended';
create index if not exists live_sessions_quiz_idx on public.live_sessions(quiz_id);

create table if not exists public.live_players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  score      integer not null default 0,
  correct    integer not null default 0,
  joined_at  timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.live_answers (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.live_sessions(id) on delete cascade,
  player_id           uuid not null references public.live_players(id) on delete cascade,
  question_id         uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  text_answer         text check (char_length(text_answer) <= 200),
  is_correct          boolean,
  points              integer not null default 0,
  elapsed_ms          integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (session_id, player_id, question_id)
);
create index if not exists live_answers_session_q_idx on public.live_answers(session_id, question_id);

create or replace function public.is_live_player(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.live_players where session_id = p_session and student_id = auth.uid());
$$;
create or replace function public.is_live_host(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.live_sessions s where s.id = p_session
                 and (s.host_id = auth.uid() or public.can_manage_quiz(s.quiz_id)));
$$;

alter table public.live_sessions enable row level security;
alter table public.live_players  enable row level security;
alter table public.live_answers  enable row level security;
revoke all on public.live_sessions, public.live_players, public.live_answers from anon, authenticated;
grant select on public.live_sessions, public.live_players, public.live_answers to authenticated;

drop policy if exists live_sessions_select on public.live_sessions;
create policy live_sessions_select on public.live_sessions for select to authenticated
  using (host_id = auth.uid() or public.can_manage_quiz(quiz_id) or public.is_live_player(id));
drop policy if exists live_players_select on public.live_players;
create policy live_players_select on public.live_players for select to authenticated
  using (student_id = auth.uid() or public.is_live_host(session_id));
drop policy if exists live_answers_select on public.live_answers;
create policy live_answers_select on public.live_answers for select to authenticated
  using (public.is_live_host(session_id)
         or exists (select 1 from public.live_players lp where lp.id = player_id and lp.student_id = auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.live_sessions; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.live_players;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.live_answers;  exception when duplicate_object then null; end;
  end if;
end $$;

create or replace function public.live_create(p_quiz uuid, p_seconds int default 20)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); q public.quizzes; v_ids uuid[]; v_code text; v_id uuid; i int := 0;
begin
  if not public.can_manage_quiz(p_quiz) then perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini'); end if;
  if p_seconds is null or p_seconds < 5 or p_seconds > 120 then perform public._raise('INVALID_INPUT', 'Waktu per soal 5–120 detik'); end if;
  select * into q from public.quizzes where id = p_quiz;
  select array_agg(qq.id order by qq.position, qq.created_at) into v_ids
  from public.quiz_questions qq
  where qq.quiz_id = p_quiz
    and qq.type in ('multiple_choice', 'multiple_select', 'true_false', 'poll', 'short_answer', 'fill_blank', 'word_cloud');
  if v_ids is null then
    perform public._raise('INVALID_QUIZ', 'Mode Live memerlukan soal pilihan ganda, benar/salah, isian, polling, atau word cloud');
  end if;
  update public.live_sessions set status = 'ended', ended_at = now()
  where quiz_id = p_quiz and host_id = v_uid and status <> 'ended';
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.live_sessions (quiz_id, school_id, host_id, code, question_ids, question_seconds)
      values (p_quiz, q.school_id, v_uid, v_code, v_ids, p_seconds) returning id into v_id;
      exit;
    exception when unique_violation then
      i := i + 1;
      if i > 20 then perform public._raise('INVALID_INPUT', 'Gagal membuat kode, coba lagi'); end if;
    end;
  end loop;
  perform public.log_activity(q.school_id, 'live.created', 'quiz', p_quiz, jsonb_build_object('session', v_id));
  return v_id;
end $$;

create or replace function public.live_join(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_uid(); s public.live_sessions;
begin
  select * into s from public.live_sessions where code = trim(p_code) and status <> 'ended';
  if not found then perform public._raise('NOT_FOUND', 'Kode Live tidak ditemukan atau sesi sudah selesai'); end if;
  if public.member_role(s.school_id) is distinct from 'student' then
    perform public._raise('FORBIDDEN', 'Sesi Live ini hanya untuk siswa sekolah terkait');
  end if;
  insert into public.live_players (session_id, school_id, student_id) values (s.id, s.school_id, v_uid)
  on conflict (session_id, student_id) do nothing;
  return s.id;
end $$;

create or replace function public.live_control(p_session uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.live_sessions;
begin
  perform public._require_uid();
  select * into s from public.live_sessions where id = p_session for update;
  if not found or not public.is_live_host(p_session) then perform public._raise('FORBIDDEN', 'Anda bukan pemandu sesi ini'); end if;
  if s.status = 'ended' then perform public._raise('INVALID_INPUT', 'Sesi sudah selesai'); end if;
  if p_action = 'next' then
    if s.current_index + 1 >= cardinality(s.question_ids) then
      update public.live_sessions set status = 'ended', ended_at = now() where id = s.id;
    else
      update public.live_sessions set status = 'question', current_index = s.current_index + 1, question_started_at = now() where id = s.id;
    end if;
  elsif p_action = 'reveal' then
    if s.status <> 'question' then perform public._raise('INVALID_INPUT', 'Tidak ada soal yang sedang berjalan'); end if;
    update public.live_sessions set status = 'reveal' where id = s.id;
  elsif p_action = 'end' then
    update public.live_sessions set status = 'ended', ended_at = now() where id = s.id;
  else
    perform public._raise('INVALID_INPUT', 'Aksi tidak dikenal');
  end if;
end $$;

create or replace function public.live_answer(p_session uuid, p_selected uuid[] default '{}', p_text text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  s public.live_sessions; pl public.live_players; qq public.quiz_questions; g record;
  v_qid uuid; v_elapsed int; v_sel uuid[] := coalesce(p_selected, '{}'); v_pts int := 0; v_ratio numeric;
begin
  select * into s from public.live_sessions where id = p_session;
  if not found then perform public._raise('NOT_FOUND', 'Sesi tidak ditemukan'); end if;
  select * into pl from public.live_players where session_id = p_session and student_id = v_uid for update;
  if not found then perform public._raise('FORBIDDEN', 'Anda belum bergabung di sesi ini'); end if;
  if s.status <> 'question' then perform public._raise('INVALID_INPUT', 'Soal belum dibuka atau sudah ditutup'); end if;
  v_elapsed := greatest(0, (extract(epoch from (now() - s.question_started_at)) * 1000)::int);
  if v_elapsed > (s.question_seconds + 2) * 1000 then perform public._raise('INVALID_INPUT', 'Waktu menjawab habis'); end if;
  v_qid := s.question_ids[s.current_index + 1];
  select * into qq from public.quiz_questions where id = v_qid;
  v_sel := array(select distinct unnest(v_sel));
  if exists (select 1 from unnest(v_sel) x where not exists (select 1 from public.question_options o where o.id = x and o.question_id = v_qid)) then
    perform public._raise('INVALID_INPUT', 'Pilihan jawaban tidak valid');
  end if;
  if qq.type <> 'multiple_select' and cardinality(v_sel) > 1 then perform public._raise('INVALID_INPUT', 'Pilih satu jawaban saja'); end if;
  p_text := nullif(left(trim(coalesce(p_text, '')), 200), '');
  if cardinality(v_sel) = 0 and p_text is null then perform public._raise('INVALID_INPUT', 'Jawaban kosong'); end if;

  select * into g from public._grade_question(qq, v_sel, p_text, null);
  if qq.type not in ('poll', 'word_cloud') and coalesce(g.points, 0) > 0 then
    v_ratio := least(1, g.points / qq.points);
    v_pts := round(v_ratio * (500 + 500 * greatest(0, 1 - v_elapsed::numeric / (s.question_seconds * 1000))))::int;
  end if;
  begin
    insert into public.live_answers (session_id, player_id, question_id, selected_option_ids, text_answer, is_correct, points, elapsed_ms)
    values (s.id, pl.id, v_qid, v_sel, p_text, case when qq.type in ('poll', 'word_cloud') then null else coalesce(g.is_correct, false) end, v_pts, v_elapsed);
  exception when unique_violation then
    perform public._raise('INVALID_INPUT', 'Kamu sudah menjawab soal ini');
  end;
  update public.live_players set score = score + v_pts, correct = correct + case when g.is_correct then 1 else 0 end where id = pl.id;
  return jsonb_build_object('received', true);
end $$;

create or replace function public.live_state(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_uid();
  s public.live_sessions; q public.quizzes; sch public.schools; qq public.quiz_questions;
  v_host boolean; v_player public.live_players; v_qid uuid; v_show boolean; v_question jsonb := null;
  v_board jsonb; v_me jsonb := null; v_players jsonb := null; v_answered int := 0; v_total int;
begin
  select * into s from public.live_sessions where id = p_session;
  if not found then perform public._raise('NOT_FOUND', 'Sesi tidak ditemukan'); end if;
  v_host := public.is_live_host(p_session);
  select * into v_player from public.live_players where session_id = p_session and student_id = v_uid;
  if not v_host and v_player.id is null then perform public._raise('FORBIDDEN', 'Anda belum bergabung di sesi ini'); end if;
  select * into q from public.quizzes where id = s.quiz_id;
  select * into sch from public.schools where id = s.school_id;
  v_show := coalesce(sch.leaderboard_show_names, true) or v_host;
  select count(*) into v_total from public.live_players where session_id = s.id;

  if s.current_index >= 0 and s.status <> 'lobby' then
    v_qid := s.question_ids[s.current_index + 1];
    select * into qq from public.quiz_questions where id = v_qid;
    select count(*) into v_answered from public.live_answers where session_id = s.id and question_id = v_qid;
    v_question := jsonb_build_object(
      'id', qq.id, 'type', qq.type, 'prompt', qq.prompt, 'image_path', qq.image_path, 'points', qq.points,
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                    'is_correct', case when s.status in ('reveal', 'ended') or v_host then o.is_correct end,
                    'count', case when s.status in ('reveal', 'ended') or v_host
                                  then (select count(*) from public.live_answers la where la.session_id = s.id and la.question_id = qq.id and o.id = any(la.selected_option_ids)) end)
                    order by o.position) from public.question_options o where o.question_id = qq.id), '[]'::jsonb),
      'accepted_answers', case when s.status in ('reveal', 'ended') or v_host then to_jsonb(qq.accepted_answers) end,
      'explanation', case when s.status in ('reveal', 'ended') then qq.explanation end,
      'words', case when (s.status in ('reveal', 'ended') or v_host) and qq.type in ('word_cloud', 'short_answer', 'fill_blank') then (
                 select coalesce(jsonb_agg(jsonb_build_object('text', w.t, 'count', w.c) order by w.c desc), '[]'::jsonb)
                 from (select lower(la.text_answer) t, count(*) c from public.live_answers la
                       where la.session_id = s.id and la.question_id = qq.id and la.text_answer is not null
                       group by 1 order by 2 desc limit 40) w) end,
      'answered', v_answered);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', r.rk, 'score', r.score,
           'name', case when v_show or r.student_id = v_uid then r.full_name
                        else left(r.full_name, 1) || '.' end,
           'me', r.student_id = v_uid) order by r.rk), '[]'::jsonb)
    into v_board
  from (select lp.student_id, lp.score, p.full_name, rank() over (order by lp.score desc) rk
        from public.live_players lp join public.profiles p on p.id = lp.student_id
        where lp.session_id = s.id order by lp.score desc limit 10) r;

  if v_player.id is not null then
    select jsonb_build_object(
      'score', v_player.score,
      'rank', (select count(*) + 1 from public.live_players x where x.session_id = s.id and x.score > v_player.score),
      'answered', exists (select 1 from public.live_answers la where la.player_id = v_player.id and la.question_id = v_qid),
      'last', case when s.status in ('reveal', 'ended') then (
                select jsonb_build_object('is_correct', la.is_correct, 'points', la.points)
                from public.live_answers la where la.player_id = v_player.id and la.question_id = v_qid) end)
    into v_me;
  end if;

  if v_host then
    select coalesce(jsonb_agg(p.full_name order by lp.joined_at), '[]'::jsonb) into v_players
    from public.live_players lp join public.profiles p on p.id = lp.student_id where lp.session_id = s.id;
  end if;

  return jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'code', s.code, 'status', s.status, 'current_index', s.current_index,
               'total', cardinality(s.question_ids), 'question_seconds', s.question_seconds,
               'question_started_at', s.question_started_at, 'server_now', now()),
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'language', q.language),
    'is_host', v_host, 'players_count', v_total, 'players', v_players,
    'question', v_question, 'leaderboard', v_board, 'me', v_me);
end $$;

-- ---------- Privileges ---------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.log_integrity_event(uuid, text, text)', 'public.save_question(uuid, uuid, jsonb)',
    'public.get_attempt(uuid)', 'public.get_attempt_review(uuid)',
    'public.get_school_bank(uuid, text, text, integer)', 'public.copy_questions_to_quiz(uuid, uuid[])',
    'public.get_class_mastery(uuid, uuid, date, date)',
    'public.is_live_player(uuid)', 'public.is_live_host(uuid)',
    'public.live_create(uuid, integer)', 'public.live_join(text)', 'public.live_control(uuid, text)',
    'public.live_answer(uuid, uuid[], text)', 'public.live_state(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
