-- 063: mídias da Análise do adversário (28/10/2026): ESCUDO do adversário (1 por análise) e VÍDEOS por seção.
-- Arquivos em uploads/analise/ (servidos por /uploads como os anexos). O PDF usa o escudo; o PowerPoint embute
-- os vídeos. Apagar o jogo apaga as linhas (os arquivos são apagados pela rota de exclusão / limpeza).
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 063_analise_midias.sql
BEGIN;

CREATE TABLE IF NOT EXISTS opponent_analysis_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tipo         VARCHAR(10) NOT NULL CHECK (tipo IN ('escudo', 'video')),
  secao        VARCHAR(20),               -- seção do vídeo (campanha, sistema, …); NULL no escudo
  titulo       VARCHAR(120),
  file_path    TEXT NOT NULL,             -- /uploads/analise/<uuid>.<ext>
  mime_type    VARCHAR(60) NOT NULL,
  size_bytes   BIGINT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opponent_analysis_media_session ON opponent_analysis_media(session_id);
-- 1 escudo por análise
CREATE UNIQUE INDEX IF NOT EXISTS uq_opponent_analysis_media_escudo ON opponent_analysis_media(session_id) WHERE tipo = 'escudo';

ALTER TABLE opponent_analysis_media OWNER TO sports_admin;
GRANT SELECT ON opponent_analysis_media TO admin_ro; -- console Faggin Admin (só leitura)

INSERT INTO schema_migrations (filename) VALUES ('063_analise_midias.sql') ON CONFLICT DO NOTHING;

COMMIT;
