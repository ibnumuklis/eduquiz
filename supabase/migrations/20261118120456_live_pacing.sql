-- =====================================================================
-- EDUQUIZ — Live: reading time, manual start, pause / resume
--  * answer_mode 'auto'  : answering opens after read_seconds (question read aloud first)
--  * answer_mode 'manual': answering opens when the host presses "Mulai menjawab"
--  * pause / resume keeps the remaining time; scoring ignores paused time
-- Additive: same function signatures (create or replace) + one new RPC.
-- =====================================================================

alter table public.live_sessions
  add column if not exists answer_mode text not null default 'auto' check (answer_mode in ('auto', 'manual')),
  add column if not exists read_seconds integer not null default 0 check (read_seconds between 0 and 60),
  add column if not exists paused_remaining_ms integer;

create or replace function public.live_configure(p_session uuid, p_mode text, p_read_seconds int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_uid();
  if not public.is_live_host(p_session) then perform public._raise('FORBIDDEN', 'Anda bukan pemandu sesi ini'); end if;
  if p_mode not in ('auto', 'manual') then perform public._raise('INVALID_INPUT', 'Mode mulai tidak dikenal'); end if;
  if p_read_seconds is null or p_read_seconds < 0 or p_read_seconds > 60 then
    perform public._raise('INVALID_INPUT', 'Waktu membaca 0–60 detik');
  end if;
  update public.live_sessions set answer_mode = p_mode, read_seconds = p_read_seconds
   where id = p_session and status <> 'ended';
end $$;

create or replace function public.live_control(p_session uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.live_sessions; v_elapsed int;
begin
  perform public._require_uid();
  select * into s from public.live_sessions where id = p_session for update;
  if not found or not public.is_live_host(p_session) then perform public._raise('FORBIDDEN', 'Anda bukan pemandu sesi ini'); end if;
  if s.status = 'ended' then perform public._raise('INVALID_INPUT', 'Sesi sudah selesai'); end if;
  if p_action = 'next' then
    if s.current_index + 1 >= cardinality(s.question_ids) then
      update public.live_sessions set status = 'ended', ended_at = now(), paused_remaining_ms = null where id = s.id;
    else
      -- Manual: answering opens when the host presses "Mulai menjawab".
      -- Auto: answering opens after the reading time (question shown and read aloud first).
      update public.live_sessions
         set status = 'question', current_index = s.current_index + 1, paused_remaining_ms = null,
             question_started_at = case when s.answer_mode = 'manual' then null
                                        else now() + make_interval(secs => s.read_seconds) end
       where id = s.id;
    end if;
  elsif p_action = 'open' then
    if s.status <> 'question' or s.paused_remaining_ms is not null then perform public._raise('INVALID_INPUT', 'Tidak ada soal yang menunggu dibuka'); end if;
    if s.question_started_at is null or s.question_started_at > now() then
      update public.live_sessions set question_started_at = now() where id = s.id;
    end if;
  elsif p_action = 'pause' then
    if s.status <> 'question' or s.paused_remaining_ms is not null then perform public._raise('INVALID_INPUT', 'Tidak ada soal yang berjalan'); end if;
    if s.question_started_at is null or s.question_started_at > now() then
      -- Still in reading time: hold until the host opens answering.
      update public.live_sessions set question_started_at = null where id = s.id;
    else
      v_elapsed := (extract(epoch from (now() - s.question_started_at)) * 1000)::int;
      update public.live_sessions
         set paused_remaining_ms = greatest(1000, s.question_seconds * 1000 - v_elapsed), question_started_at = null
       where id = s.id;
    end if;
  elsif p_action = 'resume' then
    if s.status <> 'question' or s.paused_remaining_ms is null then perform public._raise('INVALID_INPUT', 'Soal tidak sedang dijeda'); end if;
    update public.live_sessions
       set question_started_at = now() - make_interval(secs => (s.question_seconds * 1000 - s.paused_remaining_ms) / 1000.0),
           paused_remaining_ms = null
     where id = s.id;
  elsif p_action = 'reveal' then
    if s.status <> 'question' then perform public._raise('INVALID_INPUT', 'Tidak ada soal yang sedang berjalan'); end if;
    update public.live_sessions set status = 'reveal', paused_remaining_ms = null where id = s.id;
  elsif p_action = 'end' then
    update public.live_sessions set status = 'ended', ended_at = now(), paused_remaining_ms = null where id = s.id;
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
  if s.paused_remaining_ms is not null then perform public._raise('INVALID_INPUT', 'Kuis sedang dijeda oleh guru'); end if;
  if s.question_started_at is null or s.question_started_at > now() then
    perform public._raise('INVALID_INPUT', 'Tunggu, waktu menjawab belum dimulai');
  end if;
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
               'question_started_at', s.question_started_at, 'server_now', now(),
               'answer_mode', s.answer_mode, 'read_seconds', s.read_seconds,
               'paused', s.paused_remaining_ms is not null, 'remaining_ms', s.paused_remaining_ms),
    'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'language', q.language),
    'is_host', v_host, 'players_count', v_total, 'players', v_players,
    'question', v_question, 'leaderboard', v_board, 'me', v_me);
end $$;

revoke execute on function public.live_configure(uuid, text, integer) from public, anon;
grant execute on function public.live_configure(uuid, text, integer) to authenticated;
