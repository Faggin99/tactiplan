-- 057: mais de um período de treino por dia (Manhã · Tarde · Noite).
-- Cada período = 1 linha de training_sessions na mesma data/clube/workspace.
-- periodo NULL = dia de período único (TODOS os dados atuais: nada muda neles).
-- Só ADD (coluna, check e o índice único novo). Ordem de publicação:
-- 057 → backend novo (pm2 reload) → 058 (larga o índice antigo).
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 057_periodos_treino.sql
BEGIN;

ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS periodo VARCHAR(8);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_periodo_check'
  ) THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_periodo_check
      CHECK (periodo IS NULL OR periodo IN ('manha', 'tarde', 'noite'));
  END IF;
END $$;

-- Novo único: 1 linha por (workspace, data, clube, período). Período único = 'unico'.
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_ws_date_club_periodo_unique
  ON training_sessions (workspace_id, date, club_id, (COALESCE(periodo, 'unico')));

-- O índice antigo (workspace, data, clube) sai na 058, DEPOIS do backend novo
-- no ar: o código antigo usa ON CONFLICT (workspace_id, date, club_id), que
-- precisa dele; o novo usa ON CONFLICT DO NOTHING (serve com os dois).

INSERT INTO schema_migrations (filename) VALUES ('057_periodos_treino.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
