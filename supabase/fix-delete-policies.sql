-- 틀린 문제 초기화 버그 수정: DELETE RLS 정책 추가
-- Supabase SQL Editor에서 실행하세요.

-- user_toefl_status: 개별 삭제 + 초기화
CREATE POLICY "user delete own toefl_status"
  ON user_toefl_status FOR DELETE
  USING (auth.uid() = user_id);

-- user_sentence_status: 개별 문장 삭제
CREATE POLICY "user delete own sentence_status"
  ON user_sentence_status FOR DELETE
  USING (auth.uid() = user_id);

-- ai_topics: 서비스 롤이 삽입하지만, 혹시 필요한 경우를 위해 인증 유저 읽기 허용
ALTER TABLE IF EXISTS ai_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "auth read ai_topics"
  ON ai_topics FOR SELECT
  USING (auth.role() = 'authenticated');
