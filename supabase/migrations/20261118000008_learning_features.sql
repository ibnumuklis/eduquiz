-- =====================================================================
-- EDUQUIZ — 0008 Learning features
--  * AKM question types (grading, validation, safe student payloads)
--  * Stimulus / shared reading passages
--  * Learning objectives (TP/CP Kurikulum Merdeka) per question
--  * Quiz modes: standard / practice (mastery & remedial) / exam
--  * Game score separated from accuracy score
--  * Integrity (anti-cheat) events
--  * Student accommodations (extra time, fewer options, read aloud)
--  * Positive power-ups & instant feedback, quiz themes
--  * Quiz folders, Excel/CSV import, item & mastery analysis
-- =====================================================================

-- ---------- Schema ---------------------------------------------------
create table if not exists public.learning_objectives (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  subject_id  uuid references public.subjects(id) on delete set null,
  code        text not null check (char_length(code) between 1 and 30),
  description text not null check (char_length(description) between 3 and 1000),
  phase       text check (phase in ('A', 'B', 'C', 'D', 'E', 'F')),
  grade_level text check (char_length(grade_level) <= 30),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, code)
);
create index if not exists learning_objectives_subject_idx on public.learning_objectives(subject_id);
drop trigger if exists learning_objectives_updated on public.learning_objectives;
create trigger learning_objectives_updated before update on public.learning_objectives
  for each row execute function public.set_updated_at();

create table if not exists public.quiz_stimuli (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  title      text check (char_length(title) <= 200),
  content    text not null check (char_length(content) between 1 and 20000),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_stimuli_quiz_idx on public.quiz_stimuli(quiz_id);
drop trigger if exists quiz_stimuli_updated on public.quiz_stimuli;
create trigger quiz_stimuli_updated before update on public.quiz_stimuli
  for each row execute function public.set_updated_at();

create table if not exists public.quiz_folders (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  color      text not null default 'brand' check (color in ('brand', 'violet', 'accent', 'amber', 'rose', 'green', 'slate')),
  created_at timestamptz not null default now(),
  unique (owner_id, school_id, name)
);

create table if not exists public.student_accommodations (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  time_multiplier numeric(3,2) not null default 1 check (time_multiplier between 1 and 3),
  reduce_options  boolean not null default false,
  read_aloud      boolean not null default false,
  notes           text check (char_length(notes) <= 500),
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (school_id, student_id)
);
drop trigger if exists student_accommodations_updated on public.student_accommodations;
create trigger student_accommodations_updated before update on public.student_accommodations
  for each row execute function public.set_updated_at();

create table if not exists public.integrity_events (
  id         uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('tab_hidden', 'window_blur', 'fullscreen_exit', 'copy', 'paste', 'context_menu')),
  detail     text check (char_length(detail) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists integrity_events_attempt_idx on public.integrity_events(attempt_id, created_at);
create index if not exists integrity_events_quiz_idx on public.integrity_events(quiz_id, created_at);

alter table public.quizzes
  add column if not exists folder_id uuid references public.quiz_folders(id) on delete set null,
  add column if not exists mode text not null default 'standard',
  add column if not exists mastery_target numeric(5,2) not null default 80,
  add column if not exists require_fullscreen boolean not null default false,
  add column if not exists detect_tab_switch boolean not null default true,
  add column if not exists show_watermark boolean not null default false,
  add column if not exists powerups_enabled boolean not null default false,
  add column if not exists instant_feedback boolean not null default false,
  add column if not exists theme text not null default 'default';
alter table public.quizzes drop constraint if exists quizzes_mode_check;
alter table public.quizzes add constraint quizzes_mode_check check (mode in ('standard', 'practice', 'exam'));
alter table public.quizzes drop constraint if exists quizzes_mastery_target_check;
alter table public.quizzes add constraint quizzes_mastery_target_check check (mastery_target between 0 and 100);
alter table public.quizzes drop constraint if exists quizzes_theme_check;
alter table public.quizzes add constraint quizzes_theme_check
  check (theme in ('default', 'batik', 'nusantara', 'angkasa', 'laut', 'hutan'));
create index if not exists quizzes_folder_idx on public.quizzes(folder_id);

alter table public.quiz_questions
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists stimulus_id uuid references public.quiz_stimuli(id) on delete set null,
  add column if not exists objective_id uuid references public.learning_objectives(id) on delete set null;
create index if not exists quiz_questions_objective_idx on public.quiz_questions(objective_id);
create index if not exists quiz_questions_stimulus_idx on public.quiz_questions(stimulus_id);

alter table public.question_options
  add column if not exists match_text text;
alter table public.question_options drop constraint if exists question_options_match_text_check;
alter table public.question_options add constraint question_options_match_text_check
  check (match_text is null or char_length(match_text) between 1 and 1000);

alter table public.student_answers
  add column if not exists answer_data jsonb,
  add column if not exists locked boolean not null default false,
  add column if not exists teacher_feedback text,
  add column if not exists rubric_scores jsonb;
alter table public.student_answers drop constraint if exists student_answers_feedback_check;
alter table public.student_answers add constraint student_answers_feedback_check
  check (teacher_feedback is null or char_length(teacher_feedback) <= 2000);

alter table public.quiz_attempts
  add column if not exists integrity_count integer not null default 0,
  add column if not exists is_remedial boolean not null default false,
  add column if not exists time_multiplier numeric(3,2) not null default 1,
  add column if not exists hidden_options jsonb not null default '{}'::jsonb,
  add column if not exists powerups_used text[] not null default '{}',
  add column if not exists powerup_log jsonb not null default '{}'::jsonb;

alter table public.quiz_results
  add column if not exists game_score integer not null default 0,
  add column if not exists mastered boolean not null default false;

insert into public.achievements (code, name, description, icon, xp_reward) values
  ('practice_master', 'Tuntas Belajar', 'Mencapai target penguasaan pada mode latihan', 'target', 30)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  icon = excluded.icon, xp_reward = excluded.xp_reward;

-- ---------- Integrity triggers ---------------------------------------
create or replace function public.tg_stimulus_school()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.quiz_id <> old.quiz_id then raise exception 'quiz_id is immutable'; end if;
  select q.school_id into new.school_id from public.quizzes q where q.id = new.quiz_id;
  if nullif(new.image_path, '') is not null
     and (split_part(new.image_path, '/', 1) <> new.school_id::text or split_part(new.image_path, '/', 2) <> new.quiz_id::text) then
    raise exception 'Gambar tidak valid untuk kuis ini' using hint = 'INVALID_INPUT';
  end if;
  return new;
end $$;
drop trigger if exists quiz_stimuli_school on public.quiz_stimuli;
create trigger quiz_stimuli_school before insert or update on public.quiz_stimuli
  for each row execute function public.tg_stimulus_school();

create or replace function public.tg_objective_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.school_id <> old.school_id then raise exception 'school_id is immutable'; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  new.code := upper(trim(new.code));
  if new.subject_id is not null and not exists (
       select 1 from public.subjects s where s.id = new.subject_id and s.school_id = new.school_id) then
    raise exception 'Mata pelajaran tidak valid' using hint = 'INVALID_INPUT';
  end if;
  return new;
end $$;
drop trigger if exists learning_objectives_check on public.learning_objectives;
create trigger learning_objectives_check before insert or update on public.learning_objectives
  for each row execute function public.tg_objective_check();

create or replace function public.tg_folder_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.owner_id := coalesce(auth.uid(), new.owner_id); end if;
  if tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.school_id <> old.school_id) then
    raise exception 'owner_id/school_id are immutable';
  end if;
  return new;
end $$;
drop trigger if exists quiz_folders_owner on public.quiz_folders;
create trigger quiz_folders_owner before insert or update on public.quiz_folders
  for each row execute function public.tg_folder_owner();

-- Mode rules + folder ownership on quizzes
create or replace function public.tg_quiz_mode()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.folder_id is not null and not exists (
       select 1 from public.quiz_folders f
       where f.id = new.folder_id and f.owner_id = new.teacher_id and f.school_id = new.school_id) then
    raise exception 'Folder tidak valid' using hint = 'INVALID_INPUT';
  end if;
  if new.mode = 'exam' then
    new.powerups_enabled := false;
    new.instant_feedback := false;
  elsif new.mode = 'practice' then
    new.show_result := true;
    new.show_explanation := true;
  end if;
  return new;
end $$;
drop trigger if exists quizzes_mode on public.quizzes;
create trigger quizzes_mode before insert or update on public.quizzes
  for each row execute function public.tg_quiz_mode();

create or replace function public.tg_accommodation_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.school_id <> old.school_id or new.student_id <> old.student_id) then
    raise exception 'school_id/student_id are immutable';
  end if;
  if not exists (select 1 from public.school_members m where m.school_id = new.school_id
                 and m.user_id = new.student_id and m.role = 'student') then
    raise exception 'Siswa tidak terdaftar di sekolah ini' using hint = 'INVALID_INPUT';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists student_accommodations_check on public.student_accommodations;
create trigger student_accommodations_check before insert or update on public.student_accommodations
  for each row execute function public.tg_accommodation_check();

-- ---------- RLS & privileges -----------------------------------------
alter table public.learning_objectives    enable row level security;
alter table public.quiz_stimuli           enable row level security;
alter table public.quiz_folders           enable row level security;
alter table public.student_accommodations enable row level security;
alter table public.integrity_events       enable row level security;

revoke all on public.learning_objectives, public.quiz_stimuli, public.quiz_folders,
              public.student_accommodations, public.integrity_events from anon, authenticated;
grant select on public.learning_objectives, public.quiz_stimuli, public.quiz_folders,
               public.student_accommodations, public.integrity_events to authenticated;

grant insert (school_id, subject_id, code, description, phase, grade_level),
      update (subject_id, code, description, phase, grade_level), delete
  on public.learning_objectives to authenticated;
grant insert (quiz_id, title, content, image_path), update (title, content, image_path), delete
  on public.quiz_stimuli to authenticated;
grant insert (school_id, name, color), update (name, color), delete on public.quiz_folders to authenticated;
grant insert (school_id, student_id, time_multiplier, reduce_options, read_aloud, notes),
      update (time_multiplier, reduce_options, read_aloud, notes), delete
  on public.student_accommodations to authenticated;
-- integrity_events: written only through log_integrity_event()

grant insert (folder_id, mode, mastery_target, require_fullscreen, detect_tab_switch, show_watermark,
              powerups_enabled, instant_feedback, theme),
      update (folder_id, mode, mastery_target, require_fullscreen, detect_tab_switch, show_watermark,
              powerups_enabled, instant_feedback, theme)
  on public.quizzes to authenticated;

drop policy if exists objectives_select on public.learning_objectives;
create policy objectives_select on public.learning_objectives for select to authenticated
  using (public.is_staff(school_id) or public.is_super_admin());
drop policy if exists objectives_insert on public.learning_objectives;
create policy objectives_insert on public.learning_objectives for insert to authenticated
  with check (public.is_staff(school_id));
drop policy if exists objectives_update on public.learning_objectives;
create policy objectives_update on public.learning_objectives for update to authenticated
  using (public.is_staff(school_id)) with check (public.is_staff(school_id));
drop policy if exists objectives_delete on public.learning_objectives;
create policy objectives_delete on public.learning_objectives for delete to authenticated
  using (public.is_school_admin(school_id) or (public.is_staff(school_id) and created_by = auth.uid()));

drop policy if exists stimuli_select on public.quiz_stimuli;
create policy stimuli_select on public.quiz_stimuli for select to authenticated
  using (public.can_manage_quiz(quiz_id) or public.is_super_admin());
drop policy if exists stimuli_insert on public.quiz_stimuli;
create policy stimuli_insert on public.quiz_stimuli for insert to authenticated
  with check (public.can_manage_quiz(quiz_id));
drop policy if exists stimuli_update on public.quiz_stimuli;
create policy stimuli_update on public.quiz_stimuli for update to authenticated
  using (public.can_manage_quiz(quiz_id)) with check (public.can_manage_quiz(quiz_id));
drop policy if exists stimuli_delete on public.quiz_stimuli;
create policy stimuli_delete on public.quiz_stimuli for delete to authenticated
  using (public.can_manage_quiz(quiz_id));

drop policy if exists folders_select on public.quiz_folders;
create policy folders_select on public.quiz_folders for select to authenticated using (owner_id = auth.uid());
drop policy if exists folders_insert on public.quiz_folders;
create policy folders_insert on public.quiz_folders for insert to authenticated
  with check (owner_id = auth.uid() and public.is_staff(school_id));
drop policy if exists folders_update on public.quiz_folders;
create policy folders_update on public.quiz_folders for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists folders_delete on public.quiz_folders;
create policy folders_delete on public.quiz_folders for delete to authenticated using (owner_id = auth.uid());

drop policy if exists accommodations_select on public.student_accommodations;
create policy accommodations_select on public.student_accommodations for select to authenticated
  using (student_id = auth.uid() or public.is_staff(school_id) or public.is_super_admin());
drop policy if exists accommodations_insert on public.student_accommodations;
create policy accommodations_insert on public.student_accommodations for insert to authenticated
  with check (public.is_staff(school_id));
drop policy if exists accommodations_update on public.student_accommodations;
create policy accommodations_update on public.student_accommodations for update to authenticated
  using (public.is_staff(school_id)) with check (public.is_staff(school_id));
drop policy if exists accommodations_delete on public.student_accommodations;
create policy accommodations_delete on public.student_accommodations for delete to authenticated
  using (public.is_staff(school_id));

drop policy if exists integrity_select on public.integrity_events;
create policy integrity_select on public.integrity_events for select to authenticated
  using (student_id = auth.uid() or public.can_manage_quiz(quiz_id) or public.is_super_admin());

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
    'public.save_answer(uuid, uuid, uuid[], text, jsonb)', 'public.check_answer(uuid, uuid)',
    'public.use_powerup(uuid, uuid, text)', 'public.log_integrity_event(uuid, text, text)',
    'public.get_attempt_review(uuid)', 'public.grade_answer(uuid, numeric, text, jsonb)',
    'public.get_quiz_monitor(uuid)', 'public.get_quiz_analysis(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

alter function public._is_answered(uuid[], text, jsonb) set search_path = public;
alter function public.try_numeric(text) set search_path = public;
