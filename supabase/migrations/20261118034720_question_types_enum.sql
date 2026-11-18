-- =====================================================================
-- EDUQUIZ — 0007 New question types (AKM formats & surveys)
-- Kept in its own migration: new enum values must be committed before use.
-- =====================================================================
alter type public.question_type add value if not exists 'tf_grid';     -- PGK Benar/Salah per pernyataan
alter type public.question_type add value if not exists 'matching';    -- Menjodohkan
alter type public.question_type add value if not exists 'ordering';    -- Mengurutkan
alter type public.question_type add value if not exists 'essay';       -- Uraian + rubrik (koreksi guru)
alter type public.question_type add value if not exists 'poll';        -- Polling (tidak dinilai)
alter type public.question_type add value if not exists 'word_cloud';  -- Word cloud (tidak dinilai)
