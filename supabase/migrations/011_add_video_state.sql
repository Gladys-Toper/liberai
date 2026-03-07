-- Add video_state JSONB column for self-chaining pipeline state
-- Stores: chunks[], currentChunkIndex, videoUri, stepInProgress, error
-- Used by the self-chaining serverless video pipeline (POST /api/arena/[id]/video)

ALTER TABLE debate_sessions ADD COLUMN IF NOT EXISTS video_state JSONB;
