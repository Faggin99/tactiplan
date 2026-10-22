-- 058: larga o índice único antigo (workspace, data, clube), que impede o 2º
-- período do dia. Rodar SÓ depois do backend dos períodos no ar (057 + código
-- com ON CONFLICT DO NOTHING). O único novo (057) já cobre o dia de período único.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'training_sessions_ws_date_club_periodo_unique') THEN
    RAISE EXCEPTION 'Aplique a 057 antes (índice novo ausente)';
  END IF;
END $$;

DROP INDEX IF EXISTS training_sessions_workspace_date_club_unique;

INSERT INTO schema_migrations (filename) VALUES ('058_periodos_indice_antigo.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
