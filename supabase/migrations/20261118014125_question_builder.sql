-- =====================================================================
-- EDUQUIZ — 0005 Atomic question save (question + options in one tx)
-- =====================================================================
create or replace function public.save_question(p_quiz uuid, p_question uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_question;
  v_type public.question_type;
  v_prompt text := trim(coalesce(p_data->>'prompt', ''));
  v_points numeric := coalesce((p_data->>'points')::numeric, 1);
  v_opts jsonb := coalesce(p_data->'options', '[]'::jsonb);
  v_answers text[];
  v_n_opt int; v_n_ok int; v_pos int;
  o jsonb; i int := 0;
begin
  perform public._require_uid();
  if not public.can_manage_quiz(p_quiz) then
    perform public._raise('FORBIDDEN', 'Anda tidak berhak mengelola kuis ini');
  end if;
  begin
    v_type := (p_data->>'type')::public.question_type;
  exception when others then
    perform public._raise('INVALID_INPUT', 'Tipe soal tidak valid');
  end;
  if v_prompt = '' or char_length(v_prompt) > 5000 then
    perform public._raise('INVALID_INPUT', 'Pertanyaan wajib diisi (maks. 5000 karakter)');
  end if;
  if v_points <= 0 or v_points > 1000 then
    perform public._raise('INVALID_INPUT', 'Bobot nilai harus antara 0 dan 1000');
  end if;
  if p_data ? 'image_path' and nullif(p_data->>'image_path', '') is not null
     and (split_part(p_data->>'image_path', '/', 2) <> p_quiz::text
          or split_part(p_data->>'image_path', '/', 1) <> (select school_id::text from public.quizzes where id = p_quiz)) then
    perform public._raise('INVALID_INPUT', 'Gambar tidak valid untuk kuis ini');
  end if;

  select coalesce(array_agg(trim(x)) filter (where trim(x) <> ''), '{}') into v_answers
  from jsonb_array_elements_text(coalesce(p_data->'accepted_answers', '[]'::jsonb)) x;

  if v_type in ('multiple_choice', 'multiple_select', 'true_false') then
    v_n_opt := jsonb_array_length(v_opts);
    select count(*) into v_n_ok from jsonb_array_elements(v_opts) e where (e->>'is_correct')::boolean;
    if v_n_opt < 2 or v_n_opt > 10 then perform public._raise('INVALID_INPUT', 'Soal pilihan memerlukan 2–10 opsi'); end if;
    if exists (select 1 from jsonb_array_elements(v_opts) e where trim(coalesce(e->>'label', '')) = '') then
      perform public._raise('INVALID_INPUT', 'Teks opsi tidak boleh kosong');
    end if;
    if v_type in ('multiple_choice', 'true_false') and v_n_ok <> 1 then
      perform public._raise('INVALID_INPUT', 'Pilih tepat satu jawaban benar');
    end if;
    if v_type = 'multiple_select' and v_n_ok < 1 then
      perform public._raise('INVALID_INPUT', 'Pilih minimal satu jawaban benar');
    end if;
    v_answers := '{}';
  else
    v_opts := '[]'::jsonb;
    if cardinality(v_answers) = 0 and not coalesce((p_data->>'manual_grading')::boolean, false) then
      perform public._raise('INVALID_INPUT', 'Isi minimal satu kunci jawaban atau aktifkan penilaian manual');
    end if;
  end if;

  if v_id is null then
    select coalesce(max(position), -1) + 1 into v_pos from public.quiz_questions where quiz_id = p_quiz;
    insert into public.quiz_questions (quiz_id, type, prompt, image_path, points, explanation,
                                       accepted_answers, case_sensitive, manual_grading, position)
    values (p_quiz, v_type, v_prompt, nullif(p_data->>'image_path', ''), v_points,
            nullif(trim(coalesce(p_data->>'explanation', '')), ''), v_answers,
            coalesce((p_data->>'case_sensitive')::boolean, false),
            coalesce((p_data->>'manual_grading')::boolean, false), v_pos)
    returning id into v_id;
  else
    update public.quiz_questions set
      type = v_type, prompt = v_prompt, image_path = nullif(p_data->>'image_path', ''), points = v_points,
      explanation = nullif(trim(coalesce(p_data->>'explanation', '')), ''), accepted_answers = v_answers,
      case_sensitive = coalesce((p_data->>'case_sensitive')::boolean, false),
      manual_grading = coalesce((p_data->>'manual_grading')::boolean, false)
    where id = v_id and quiz_id = p_quiz;
    if not found then perform public._raise('NOT_FOUND', 'Soal tidak ditemukan'); end if;
  end if;

  -- Upsert options: keep ids that still exist (attempt option orders stay valid), drop the rest.
  delete from public.question_options
  where question_id = v_id
    and id not in (select (e->>'id')::uuid from jsonb_array_elements(v_opts) e
                   where nullif(e->>'id', '') is not null);
  for o in select * from jsonb_array_elements(v_opts) loop
    if nullif(o->>'id', '') is not null
       and exists (select 1 from public.question_options where id = (o->>'id')::uuid and question_id = v_id) then
      update public.question_options set label = trim(o->>'label'), is_correct = coalesce((o->>'is_correct')::boolean, false), position = i
      where id = (o->>'id')::uuid;
    else
      insert into public.question_options (question_id, label, is_correct, position)
      values (v_id, trim(o->>'label'), coalesce((o->>'is_correct')::boolean, false), i);
    end if;
    i := i + 1;
  end loop;
  return v_id;
end $$;

revoke execute on function public.save_question(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_question(uuid, uuid, jsonb) to authenticated;
