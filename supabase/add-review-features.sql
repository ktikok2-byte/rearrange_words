-- ============================================================
-- 스페이스드 복습 + 레벨 히스토리 기능 추가
-- Supabase SQL Editor 에서 실행하세요.
-- ============================================================

-- 1. user_sentence_status 에 복습 관련 컬럼 추가
ALTER TABLE public.user_sentence_status
  ADD COLUMN IF NOT EXISTS last_wrong_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_category  TEXT;  -- '24h'|'1w'|'3m'|'1y'|'old'

-- 기존 wrong 상태 행: last_wrong_at 초기화
UPDATE public.user_sentence_status
SET last_wrong_at = last_attempted_at
WHERE status = 'wrong' AND last_wrong_at IS NULL AND last_attempted_at IS NOT NULL;

-- 2. 레벨 히스토리 테이블
CREATE TABLE IF NOT EXISTS public.level_history (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_level  INTEGER     NOT NULL,
  to_level    INTEGER     NOT NULL,
  reason      TEXT        NOT NULL,  -- 'correct_streak'|'wrong_streak'|'level_exhausted'
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.level_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own level history"   ON public.level_history;
DROP POLICY IF EXISTS "Users can insert own level history" ON public.level_history;

CREATE POLICY "Users can view own level history"
  ON public.level_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own level history"
  ON public.level_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 확인
SELECT
  COUNT(*) FILTER (WHERE last_wrong_at   IS NOT NULL) AS with_last_wrong_at,
  COUNT(*) FILTER (WHERE review_category IS NOT NULL) AS with_review_category,
  COUNT(*)                                             AS total
FROM public.user_sentence_status;

SELECT COUNT(*) AS level_history_rows FROM public.level_history;
