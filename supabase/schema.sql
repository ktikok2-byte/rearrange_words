-- =============================================
-- Rearrange Words - Supabase Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- =============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  native_language TEXT NOT NULL DEFAULT 'ko',   -- user's native language
  study_language TEXT NOT NULL DEFAULT 'en',     -- language they want to learn
  current_level INTEGER NOT NULL DEFAULT 1,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_wrong INTEGER NOT NULL DEFAULT 0,
  total_solved INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  total_wrong INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- SENTENCES TABLE
-- =============================================
CREATE TABLE public.sentences (
  id SERIAL PRIMARY KEY,
  source_language TEXT NOT NULL,      -- 'ko' or 'en'
  source_text TEXT NOT NULL,          -- original sentence
  target_language TEXT NOT NULL,      -- 'ko' or 'en'
  target_text TEXT NOT NULL,          -- translated sentence
  word_count INTEGER NOT NULL,        -- number of words in target_text
  difficulty_level INTEGER NOT NULL,  -- 1, 2, 3, ... (level the sentence belongs to)
  language_pair TEXT NOT NULL,        -- 'ko-en' or 'en-ko'
  source TEXT NOT NULL DEFAULT 'tatoeba',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public read access for sentences
ALTER TABLE public.sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read sentences" ON public.sentences FOR SELECT USING (true);
CREATE POLICY "Only service role can insert sentences" ON public.sentences FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Index for fast querying by difficulty level and language pair
CREATE INDEX idx_sentences_level_pair ON public.sentences (difficulty_level, language_pair);

-- =============================================
-- ATTEMPTS TABLE (each individual answer)
-- =============================================
CREATE TABLE public.attempts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  sentence_id INTEGER REFERENCES public.sentences ON DELETE CASCADE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('unsolved', 'wrong', 'correct', 'all')),
  is_correct BOOLEAN NOT NULL,
  time_taken_ms INTEGER,               -- null if timed out
  word_count INTEGER NOT NULL,
  level_at_attempt INTEGER NOT NULL,   -- user's level when attempting
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own attempts" ON public.attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own attempts" ON public.attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for statistics queries
CREATE INDEX idx_attempts_user_mode ON public.attempts (user_id, mode, created_at DESC);
CREATE INDEX idx_attempts_user_created ON public.attempts (user_id, created_at DESC);

-- =============================================
-- USER SENTENCE STATUS (tracks solved/wrong/unsolved per user)
-- =============================================
CREATE TABLE public.user_sentence_status (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  sentence_id INTEGER REFERENCES public.sentences ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('correct', 'wrong', 'unsolved')),
  last_attempted_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, sentence_id)
);

ALTER TABLE public.user_sentence_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sentence status" ON public.user_sentence_status FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sentence status" ON public.user_sentence_status FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sentence status" ON public.user_sentence_status FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_user_sentence_status_user ON public.user_sentence_status (user_id, status);

-- =============================================
-- TRIGGER: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, native_language, study_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'native_language', 'ko'),
    COALESCE(NEW.raw_user_meta_data->>'study_language', 'en')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TRIGGER: Update profiles.updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- VIEW: Daily stats per user (unsolved mode only)
-- =============================================
CREATE OR REPLACE VIEW public.daily_stats AS
SELECT
  user_id,
  DATE(created_at AT TIME ZONE 'UTC') AS stat_date,
  COUNT(*) FILTER (WHERE mode = 'unsolved') AS solved,
  COUNT(*) FILTER (WHERE mode = 'unsolved' AND is_correct = true) AS correct,
  COUNT(*) FILTER (WHERE mode = 'unsolved' AND is_correct = false) AS wrong
FROM public.attempts
GROUP BY user_id, DATE(created_at AT TIME ZONE 'UTC');
