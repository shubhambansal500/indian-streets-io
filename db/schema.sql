-- Indian Streets.io — Database Schema

CREATE TABLE IF NOT EXISTS leaderboard (
  id          SERIAL PRIMARY KEY,
  player_name VARCHAR(32) NOT NULL,
  score       INTEGER     NOT NULL DEFAULT 0,
  kills       INTEGER     NOT NULL DEFAULT 0,
  played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC);

-- All-time hall of fame view
CREATE OR REPLACE VIEW hall_of_fame AS
  SELECT
    player_name,
    MAX(score)  AS best_score,
    SUM(kills)  AS total_kills,
    COUNT(*)    AS games_played,
    MAX(played_at) AS last_seen
  FROM leaderboard
  GROUP BY player_name
  ORDER BY best_score DESC
  LIMIT 100;
