-- =====================================================================
-- EDUQUIZ — 0001 Core schema
-- Multi-tenant: every tenant-owned row carries school_id.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------------------------------------------------
do $$ begin
  create type public.member_role as enum ('school_admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.school_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quiz_status as enum ('draft', 'published', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quiz_access as enum ('assigned', 'code', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_type as enum
    ('multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'fill_blank');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attempt_status as enum ('in_progress', 'submitted');
exception when duplicate_object then null; end $$;

-- ---------- updated_at trigger --------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- schools -------------------------------------------------
create table if not exists public.schools (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 3 and 150),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  address             text,
  email               text,
  phone               text,
  logo_url            text,
  status              public.school_status not null default 'active',
  academic_year       text,              -- e.g. 2026/2027
  semester            text check (semester in ('ganjil', 'genap')),
  timezone            text not null default 'Asia/Jakarta',
  leaderboard_enabled boolean not null default true,
  leaderboard_show_names boolean not null default true,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists schools_status_idx on public.schools(status);
create trigger schools_updated_at before update on public.schools
  for each row execute function public.set_updated_at();

-- ---------- profiles (1:1 auth.users) --------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  full_name          text not null default '' check (char_length(full_name) <= 120),
  avatar_url         text,
  phone              text,
  is_super_admin     boolean not null default false,
  xp                 integer not null default 0 check (xp >= 0),
  level              integer not null default 1 check (level >= 1),
  current_streak     integer not null default 0,
  longest_streak     integer not null default 0,
  last_activity_date date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles(lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- school_members -------------------------------------------
create table if not exists public.school_members (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  role           public.member_role not null,
  status         public.member_status not null default 'active',
  student_number text,                  -- NIS / NISN
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, user_id)
);
create index if not exists school_members_user_idx on public.school_members(user_id);
create index if not exists school_members_school_role_idx on public.school_members(school_id, role);
create unique index if not exists school_members_student_number_uq
  on public.school_members(school_id, student_number) where student_number is not null;
create trigger school_members_updated_at before update on public.school_members
  for each row execute function public.set_updated_at();

-- ---------- invitations (secure onboarding, no shared passwords) ----
create table if not exists public.school_invitations (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  code         text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  role         public.member_role not null,
  email        text,                    -- when set, only this (verified) email can accept
  full_name    text,
  student_number text,
  class_id     uuid,                    -- FK added after classes
  max_uses     integer not null default 1 check (max_uses between 1 and 1000),
  used_count   integer not null default 0 check (used_count >= 0),
  expires_at   timestamptz not null default now() + interval '14 days',
  revoked_at   timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists school_invitations_school_idx on public.school_invitations(school_id);
create index if not exists school_invitations_email_idx on public.school_invitations(lower(email));

-- ---------- classes ---------------------------------------------------
create table if not exists public.classes (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  grade_level        text,
  academic_year      text,
  homeroom_teacher_id uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (school_id, name, academic_year)
);
create index if not exists classes_school_idx on public.classes(school_id);
create trigger classes_updated_at before update on public.classes
  for each row execute function public.set_updated_at();

alter table public.school_invitations
  drop constraint if exists school_invitations_class_fk;
alter table public.school_invitations
  add constraint school_invitations_class_fk foreign key (class_id)
  references public.classes(id) on delete set null;

-- ---------- class_students -------------------------------------------
create table if not exists public.class_students (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);
create index if not exists class_students_student_idx on public.class_students(student_id);
create index if not exists class_students_school_idx on public.class_students(school_id);

-- ---------- subjects --------------------------------------------------
create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 80),
  code       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists subjects_school_idx on public.subjects(school_id);
create trigger subjects_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------- teacher_subjects (teacher teaches subject in class) -----
create table if not exists public.teacher_subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, subject_id, class_id)
);
create index if not exists teacher_subjects_teacher_idx on public.teacher_subjects(teacher_id);
create index if not exists teacher_subjects_class_idx on public.teacher_subjects(class_id);

-- ---------- quizzes ---------------------------------------------------
create table if not exists public.quizzes (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  teacher_id       uuid not null references public.profiles(id) on delete cascade,
  subject_id       uuid references public.subjects(id) on delete set null,
  title            text not null check (char_length(title) between 3 and 150),
  description      text check (char_length(description) <= 2000),
  status           public.quiz_status not null default 'draft',
  access           public.quiz_access not null default 'assigned',
  access_code      text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 600),
  start_at         timestamptz,
  end_at           timestamptz,
  max_attempts     integer not null default 1 check (max_attempts between 1 and 20),
  shuffle_questions boolean not null default false,
  shuffle_options  boolean not null default false,
  passing_grade    numeric(5,2) not null default 70 check (passing_grade between 0 and 100),
  show_result      boolean not null default true,
  show_explanation boolean not null default false,
  published_at     timestamptz,
  closed_at        timestamptz,
  reminder_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at > start_at)
);
create index if not exists quizzes_school_idx on public.quizzes(school_id);
create index if not exists quizzes_teacher_idx on public.quizzes(teacher_id, created_at desc);
create index if not exists quizzes_status_idx on public.quizzes(school_id, status);
create trigger quizzes_updated_at before update on public.quizzes
  for each row execute function public.set_updated_at();

-- ---------- quiz_questions -------------------------------------------
create table if not exists public.quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references public.quizzes(id) on delete cascade,
  school_id        uuid not null references public.schools(id) on delete cascade,
  type             public.question_type not null,
  prompt           text not null check (char_length(prompt) between 1 and 5000),
  image_path       text,
  points           numeric(6,2) not null default 1 check (points > 0 and points <= 1000),
  explanation      text,
  accepted_answers text[] not null default '{}',    -- short_answer / fill_blank keys
  case_sensitive   boolean not null default false,
  manual_grading   boolean not null default false,  -- route unmatched answers to teacher
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions(quiz_id, position);
create index if not exists quiz_questions_school_idx on public.quiz_questions(school_id);
create trigger quiz_questions_updated_at before update on public.quiz_questions
  for each row execute function public.set_updated_at();

-- ---------- question_options -----------------------------------------
create table if not exists public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 1000),
  is_correct  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists question_options_question_idx on public.question_options(question_id, position);

-- ---------- quiz_assignments (quiz -> class) -------------------------
create table if not exists public.quiz_assignments (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (quiz_id, class_id)
);
create index if not exists quiz_assignments_class_idx on public.quiz_assignments(class_id);

-- ---------- quiz_attempts --------------------------------------------
create table if not exists public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes(id) on delete cascade,
  school_id       uuid not null references public.schools(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  attempt_number  integer not null check (attempt_number >= 1),
  status          public.attempt_status not null default 'in_progress',
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_active_at  timestamptz not null default now(),
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  is_late         boolean not null default false,
  question_order  uuid[] not null default '{}',
  option_order    jsonb not null default '{}'::jsonb,
  answered_count  integer not null default 0,
  total_questions integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (quiz_id, student_id, attempt_number)
);
create index if not exists quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id, status);
create index if not exists quiz_attempts_student_idx on public.quiz_attempts(student_id, created_at desc);
create index if not exists quiz_attempts_open_idx on public.quiz_attempts(expires_at) where status = 'in_progress';
-- At most one open attempt per student per quiz (prevents concurrent starts)
create unique index if not exists quiz_attempts_one_open_uq
  on public.quiz_attempts(quiz_id, student_id) where status = 'in_progress';

-- ---------- student_answers ------------------------------------------
create table if not exists public.student_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id         uuid not null references public.quiz_questions(id) on delete cascade,
  school_id           uuid not null references public.schools(id) on delete cascade,
  student_id          uuid not null references public.profiles(id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  text_answer         text check (char_length(text_answer) <= 5000),
  is_correct          boolean,
  points_awarded      numeric(6,2),
  needs_manual_grading boolean not null default false,
  graded_by           uuid references public.profiles(id) on delete set null,
  graded_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index if not exists student_answers_attempt_idx on public.student_answers(attempt_id);
create index if not exists student_answers_manual_idx on public.student_answers(school_id) where needs_manual_grading;
create trigger student_answers_updated_at before update on public.student_answers
  for each row execute function public.set_updated_at();

-- ---------- quiz_results (1:1 attempt) -------------------------------
create table if not exists public.quiz_results (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null unique references public.quiz_attempts(id) on delete cascade,
  quiz_id          uuid not null references public.quizzes(id) on delete cascade,
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  score            numeric(5,2) not null default 0 check (score between 0 and 100),
  points_earned    numeric(8,2) not null default 0,
  points_possible  numeric(8,2) not null default 0,
  correct_count    integer not null default 0,
  wrong_count      integer not null default 0,
  unanswered_count integer not null default 0,
  pending_manual   integer not null default 0,
  passed           boolean not null default false,
  duration_seconds integer not null default 0,
  xp_awarded       integer not null default 0,
  graded_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists quiz_results_quiz_idx on public.quiz_results(quiz_id, score desc);
create index if not exists quiz_results_student_idx on public.quiz_results(student_id, created_at desc);
create index if not exists quiz_results_school_idx on public.quiz_results(school_id, created_at desc);
create trigger quiz_results_updated_at before update on public.quiz_results
  for each row execute function public.set_updated_at();

-- ---------- achievements (global catalogue) --------------------------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,
  icon        text not null default 'award',
  xp_reward   integer not null default 0 check (xp_reward >= 0),
  created_at  timestamptz not null default now()
);

create table if not exists public.student_achievements (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  school_id      uuid references public.schools(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  unique (student_id, achievement_id)
);
create index if not exists student_achievements_student_idx on public.student_achievements(student_id);

-- ---------- XP ledger (idempotency: one award per source) -----------
create table if not exists public.xp_ledger (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  school_id   uuid references public.schools(id) on delete cascade,
  source_type text not null check (source_type in ('attempt', 'achievement')),
  source_id   uuid not null,
  amount      integer not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (student_id, source_type, source_id)
);
create index if not exists xp_ledger_school_idx on public.xp_ledger(school_id, created_at desc);

-- ---------- notifications --------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  school_id  uuid references public.schools(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create unique index if not exists notifications_dedupe_uq
  on public.notifications(user_id, dedupe_key) where dedupe_key is not null;

-- ---------- activity_logs (audit) ------------------------------------
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references public.schools(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_logs_school_idx on public.activity_logs(school_id, created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);
