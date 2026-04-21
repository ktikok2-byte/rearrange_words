-- TOEFL Writing Type 1 feature
-- AI-generated contextually related sentence pairs for TOEFL practice

CREATE TABLE IF NOT EXISTS toefl_exercises (
  id            SERIAL PRIMARY KEY,
  sentence1_en  TEXT NOT NULL,
  sentence2_en  TEXT NOT NULL,
  korean        TEXT NOT NULL,
  dummy_word    TEXT NOT NULL,
  word_count2   INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_toefl_status (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users NOT NULL,
  exercise_id   INTEGER REFERENCES toefl_exercises NOT NULL,
  is_correct    BOOLEAN NOT NULL,
  time_taken_ms INTEGER,
  attempted_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE toefl_exercises   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_toefl_status ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read exercises
CREATE POLICY "auth read toefl_exercises"
  ON toefl_exercises FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role inserts exercises (bypasses RLS automatically)

-- Users can read/write only their own status
CREATE POLICY "user read own toefl_status"
  ON user_toefl_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user insert own toefl_status"
  ON user_toefl_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);
