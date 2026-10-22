-- 060: o quadro tático salva jogadas de FUTEBOL 7 (web e app T5).
-- O CHECK antigo só aceitava football_11 e futsal, mas o web já oferece "Futebol 7" no
-- quadro (fieldDimensions.js) e o clube tem modalidade football_7 (032): salvar dava 500.
-- Só alarga a lista (nenhum dado muda). Aplicar com: psql -v ON_ERROR_STOP=1 -f 060_quadro_futebol7.sql
BEGIN;

ALTER TABLE tactical_plays DROP CONSTRAINT IF EXISTS tactical_plays_field_type_check;
ALTER TABLE tactical_plays
  ADD CONSTRAINT tactical_plays_field_type_check
  CHECK (field_type = ANY (ARRAY['football_11'::text, 'football_7'::text, 'futsal'::text]));

INSERT INTO schema_migrations (filename) VALUES ('060_quadro_futebol7.sql') ON CONFLICT DO NOTHING;

COMMIT;
