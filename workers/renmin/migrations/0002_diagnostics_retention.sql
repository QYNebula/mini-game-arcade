DROP VIEW recent_ai_diagnostics;

CREATE VIEW recent_ai_diagnostics AS
  SELECT * FROM ai_diagnostics
  WHERE at_ms >= unixepoch('now', '-1 day') * 1000;
