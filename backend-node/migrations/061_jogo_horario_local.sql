-- 061: horário, local e apresentação do jogo (Convocação: o PDF mostrava "—"; pedido de 26/10/2026).
-- Texto livre e curto, opcional. Só ADD (nenhum dado muda).
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 061_jogo_horario_local.sql
BEGIN;

ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS match_kickoff   VARCHAR(5);   -- "16:00"
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS match_venue     VARCHAR(120); -- "Estádio Parque do Sabiá"
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS match_meet_time VARCHAR(5);   -- "14:30"

INSERT INTO schema_migrations (filename) VALUES ('061_jogo_horario_local.sql') ON CONFLICT DO NOTHING;

COMMIT;
