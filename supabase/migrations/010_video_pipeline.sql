-- Video Pipeline: cinematic debate replay via LTX Video 2.3
-- Adds video generation status, progress, URL, and timeline to debate sessions

ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS video_status TEXT;
ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS video_progress INT DEFAULT 0;
ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS video_timeline JSONB;

-- Index for quickly finding sessions with/without video
CREATE INDEX IF NOT EXISTS idx_debate_sessions_video_status
  ON debate_sessions (video_status)
  WHERE video_status IS NOT NULL;

-- Storage bucket for rendered debate videos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('debate-video', 'debate-video', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to debate videos
CREATE POLICY "Public read access for debate videos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'debate-video');

-- Allow service role to upload debate videos
CREATE POLICY "Service role upload for debate videos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'debate-video');
