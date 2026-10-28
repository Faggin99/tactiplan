-- 064: vídeo por LINK na Análise do adversário (28/10/2026). Vídeo grande (> 50 MB) não sobe: vai o link
-- (YouTube, Drive…), que aparece clicável no PDF e no PowerPoint. tipo 'link': file_path guarda a URL externa.
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 064_analise_links.sql
BEGIN;

ALTER TABLE opponent_analysis_media DROP CONSTRAINT IF EXISTS opponent_analysis_media_tipo_check;
ALTER TABLE opponent_analysis_media ADD CONSTRAINT opponent_analysis_media_tipo_check CHECK (tipo IN ('escudo', 'video', 'link'));

INSERT INTO schema_migrations (filename) VALUES ('064_analise_links.sql') ON CONFLICT DO NOTHING;

COMMIT;
