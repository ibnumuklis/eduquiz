-- =====================================================================
-- EDUQUIZ — 0004 Reference data, Realtime, Storage, scheduled jobs
-- Each Supabase-specific block is guarded so the migration also runs on
-- a plain PostgreSQL used for local automated tests.
-- =====================================================================

-- ---------- Achievement catalogue (reference data) ------------------
insert into public.achievements (code, name, description, icon, xp_reward) values
  ('first_quiz',     'Langkah Pertama', 'Menyelesaikan kuis pertama',                 'rocket',   10),
  ('first_pass',     'Lulus!',          'Mencapai passing grade untuk pertama kali',  'badge-check', 15),
  ('perfect_score',  'Nilai Sempurna',  'Mendapat nilai 100 pada sebuah kuis',        'trophy',   50),
  ('five_quizzes',   'Rajin Belajar',   'Menyelesaikan 5 kuis',                       'book-open', 25),
  ('twenty_quizzes', 'Maraton Kuis',    'Menyelesaikan 20 kuis',                      'medal',    75),
  ('streak_3',       'Konsisten',       'Belajar 3 hari berturut-turut',              'flame',    20),
  ('streak_7',       'Tak Terhentikan', 'Belajar 7 hari berturut-turut',              'zap',      60),
  ('speedster',      'Kilat',           'Nilai ≥ 80 dalam waktu kurang dari 2 menit', 'timer',    20),
  ('level_5',        'Level 5',         'Mencapai level 5',                           'star',     40)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  icon = excluded.icon, xp_reward = excluded.xp_reward;

-- ---------- Realtime (RLS-aware postgres_changes) --------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.quiz_attempts; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.quiz_results;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  end if;
end $$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------- Storage: private bucket, paths "<school_id>/<quiz_id>/<file>" ----
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('quiz-media', 'quiz-media', false, 5242880,
            array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$ drop policy if exists quiz_media_read on storage.objects $p$;
    execute $p$ create policy quiz_media_read on storage.objects for select to authenticated
      using (bucket_id = 'quiz-media' and public.is_member(public.try_uuid((storage.foldername(name))[1]))) $p$;

    execute $p$ drop policy if exists quiz_media_insert on storage.objects $p$;
    execute $p$ create policy quiz_media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'quiz-media'
                  and public.is_staff(public.try_uuid((storage.foldername(name))[1]))
                  and public.can_manage_quiz(public.try_uuid((storage.foldername(name))[2]))
                  and exists (select 1 from public.quizzes q
                              where q.id = public.try_uuid((storage.foldername(name))[2])
                                and q.school_id = public.try_uuid((storage.foldername(name))[1]))) $p$;

    execute $p$ drop policy if exists quiz_media_update on storage.objects $p$;
    execute $p$ create policy quiz_media_update on storage.objects for update to authenticated
      using (bucket_id = 'quiz-media' and public.can_manage_quiz(public.try_uuid((storage.foldername(name))[2]))) $p$;

    execute $p$ drop policy if exists quiz_media_delete on storage.objects $p$;
    execute $p$ create policy quiz_media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'quiz-media' and public.can_manage_quiz(public.try_uuid((storage.foldername(name))[2]))) $p$;
  end if;
end $$;

-- ---------- pg_cron: auto-submit expired attempts + reminders ---------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      perform cron.unschedule(jobid) from cron.job where jobname = 'eduquiz-jobs';
      perform cron.schedule('eduquiz-jobs', '* * * * *', 'select public.run_scheduled_jobs()');
    exception when others then
      raise notice 'pg_cron not configured: %', sqlerrm;
    end;
  end if;
end $$;
