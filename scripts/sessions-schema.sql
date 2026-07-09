-- =============================================
-- HoodBump Bot Sessions Schema
-- =============================================
-- Phase 4: Bot Worker tables
-- Run this in Supabase SQL Editor

-- =============================================
-- 1. BOT SESSIONS
-- =============================================
-- Active bumping sessions per user
-- Worker polls this every 30s to know which users need swaps
CREATE TABLE IF NOT EXISTS bot_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL,                      -- Main user's Smart Wallet address (lowercase)
  token_address TEXT NOT NULL,                     -- Target token to bump
  amount_usd TEXT NOT NULL,                        -- USD amount per swap
  interval_seconds INTEGER NOT NULL DEFAULT 60,   -- Base interval (10-600s, with anti-detection jitter applied)
  wallet_rotation_index INTEGER NOT NULL DEFAULT 0, -- Current bot wallet index (0-9)
  status TEXT NOT NULL DEFAULT 'pending',          -- 'pending' | 'running' | 'stopped' | 'completed' | 'failed'
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (interval_seconds >= 10 AND interval_seconds <= 600),
  CHECK (wallet_rotation_index >= 0 AND wallet_rotation_index < 10),
  CHECK (status IN ('pending', 'running', 'stopped', 'completed', 'failed'))
);

-- Indexes for worker queries
CREATE INDEX IF NOT EXISTS idx_bot_sessions_status 
ON bot_sessions(status);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_status 
ON bot_sessions(user_address, status);

-- =============================================
-- 2. BOT LOGS
-- =============================================
-- Activity logs for debugging and monitoring
-- Worker writes here on each cycle (skip, swap success/fail, etc)
CREATE TABLE IF NOT EXISTS bot_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES bot_sessions(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  bot_wallet_address TEXT,
  action TEXT NOT NULL,                             -- 'swap_started', 'swap_executed', 'swap_failed', 'cycle_skipped', etc
  status TEXT NOT NULL,                             -- 'success' | 'error' | 'info' | 'pending'
  message TEXT,
  tx_hash TEXT,
  amount_wei TEXT,
  token_address TEXT,
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_address 
ON bot_logs(user_address);

CREATE INDEX IF NOT EXISTS idx_bot_logs_session_id 
ON bot_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at 
ON bot_logs(created_at DESC);

-- =============================================
-- 3. UPDATE TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bot_sessions_updated_at ON bot_sessions;
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 4. RLS POLICIES
-- =============================================
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on bot_sessions" 
ON bot_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on bot_logs" 
ON bot_logs FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- VERIFICATION
-- =============================================
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('bot_sessions', 'bot_logs')
ORDER BY table_name;
