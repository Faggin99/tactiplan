-- 059: período de AVALIAÇÃO (session_type = 'assessment').
-- A única informação do período é o tipo de avaliação (lista fixa, seleção
-- múltipla) + "Outra" com texto curto. Só ADD: dados antigos e app antigo intactos
-- (session_type já é VARCHAR livre; 'assessment' é só um valor novo).
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 059_periodo_avaliacao.sql
BEGIN;

ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS assessment_types TEXT[];
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS assessment_other VARCHAR(60);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_assessment_types_check') THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_assessment_types_check
      CHECK (assessment_types IS NULL OR assessment_types <@ ARRAY['fisica','tecnica','tatica','fisiologica','antropometrica','psicologica','outra']::text[]);
  END IF;
END $$;

INSERT INTO schema_migrations (filename) VALUES ('059_periodo_avaliacao.sql')
  ON CONFLICT DO NOTHING;

COMMIT;
