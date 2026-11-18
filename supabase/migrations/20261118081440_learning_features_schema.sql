-- EDUQUIZ — learning features (schema, RLS). See DATABASE.md.

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

