-- 066: FOTOS por seção na Análise do adversário (08/11/2026). tipo 'foto': imagem da seção (com legenda
-- em `titulo`, ex.: "Bloco alto"), sai no PDF e no PowerPoint num slide depois da seção.
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 066_analise_fotos.sql
BEGIN;

ALTER TABLE opponent_analysis_media DROP CONSTRAINT IF EXISTS opponent_analysis_media_tipo_check;
ALTER TABLE opponent_analysis_media ADD CONSTRAINT opponent_analysis_media_tipo_check CHECK (tipo IN ('escudo', 'video', 'link', 'foto'));

INSERT INTO schema_migrations (filename) VALUES ('066_analise_fotos.sql') ON CONFLICT DO NOTHING;

COMMIT;
