CREATE TABLE ai_diagnostics (
  id INTEGER PRIMARY KEY,
  at_ms INTEGER NOT NULL,
  room_code TEXT NOT NULL,
  match_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  job_id INTEGER NOT NULL,
  seat INTEGER NOT NULL,
  game_day INTEGER NOT NULL,
  phase TEXT NOT NULL,
  stage INTEGER NOT NULL,
  part TEXT NOT NULL,
  channel TEXT,
  event TEXT NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
);

CREATE INDEX ai_diagnostics_room_time ON ai_diagnostics (room_code, at_ms);
CREATE INDEX ai_diagnostics_time ON ai_diagnostics (at_ms);

CREATE VIEW recent_ai_diagnostics AS
  SELECT * FROM ai_diagnostics
  WHERE at_ms >= unixepoch('now', '-3 days') * 1000;
