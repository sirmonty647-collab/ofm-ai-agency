-- Create leads table for Telegram bot
CREATE TABLE IF NOT EXISTS leads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT,
    user_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    message_count INT DEFAULT 1,
    link_sent BOOLEAN DEFAULT FALSE
);

-- Create bot_stats table for daily tracking
CREATE TABLE IF NOT EXISTS bot_stats (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    date DATE UNIQUE,
    unique_users INT DEFAULT 0,
    links_sent INT DEFAULT 0
);

-- Enable RLS but allow anon access for inserts
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can insert leads" ON leads FOR INSERT USING (true);
CREATE POLICY "anon can select leads" ON leads FOR SELECT USING (true);
CREATE POLICY "anon can insert bot_stats" ON bot_stats FOR INSERT USING (true);
CREATE POLICY "anon can select bot_stats" ON bot_stats FOR SELECT USING (true);
CREATE POLICY "anon can update bot_stats" ON bot_stats FOR UPDATE USING (true);
