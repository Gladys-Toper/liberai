-- Sprint 8: Author Profile Enhancement for Arena AV
-- Adds portrait + nationality metadata so the Arena can automatically
-- resolve photorealistic portraits and accent-appropriate voices for ANY author.

-- Add portrait & nationality columns to authors table
ALTER TABLE authors ADD COLUMN IF NOT EXISTS portrait_url TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);
ALTER TABLE authors ADD COLUMN IF NOT EXISTS era VARCHAR(50);
-- era examples: '18th century', '19th century', 'modern', etc.

COMMENT ON COLUMN authors.portrait_url IS 'Cached Wikipedia/Wikimedia portrait URL — auto-resolved on first arena appearance';
COMMENT ON COLUMN authors.nationality IS 'Author nationality for accent-appropriate TTS voice selection';
COMMENT ON COLUMN authors.era IS 'Historical era for visual styling (e.g. 19th century, modern)';
