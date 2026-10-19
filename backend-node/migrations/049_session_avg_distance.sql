-- Migration 049 (19/10/2026): distância média percorrida por jogador no dia (km).
-- Info do DIA (training_sessions), não por atividade. Só adição, nullable.

BEGIN;

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS avg_distance_km NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_avg_distance_km_check'
  ) THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_avg_distance_km_check
      CHECK (avg_distance_km IS NULL OR (avg_distance_km >= 0 AND avg_distance_km <= 99.99));
  END IF;
END $$;

COMMIT;
