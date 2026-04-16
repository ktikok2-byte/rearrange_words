-- ============================================================
-- user_sentence_status 테이블에 컬럼 추가
-- attempts 테이블을 대체: solved_at, unsolved_correct
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. 컬럼 추가
ALTER TABLE public.user_sentence_status
  ADD COLUMN IF NOT EXISTS solved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsolved_correct BOOLEAN;

-- 2. 기존 attempts 데이터 마이그레이션
--    unsolved 모드 시도 중 가장 이른 것을 기준으로 이관
UPDATE public.user_sentence_status uss
SET
  solved_at        = a.completed_at,
  unsolved_correct = a.is_correct
FROM (
  SELECT DISTINCT ON (user_id, sentence_id)
    user_id, sentence_id, completed_at, is_correct
  FROM public.attempts
  WHERE mode = 'unsolved'
  ORDER BY user_id, sentence_id, completed_at ASC
) a
WHERE uss.user_id    = a.user_id
  AND uss.sentence_id = a.sentence_id
  AND uss.solved_at   IS NULL;

-- 확인 쿼리
SELECT
  COUNT(*)                                        AS total_rows,
  COUNT(*) FILTER (WHERE solved_at IS NOT NULL)   AS with_solved_at,
  COUNT(*) FILTER (WHERE solved_at IS NULL)        AS without_solved_at
FROM public.user_sentence_status;
