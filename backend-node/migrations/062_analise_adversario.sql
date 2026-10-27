-- 062: Análise do adversário por JOGO (pedido de 27/10/2026; modelo: Analise_Flamengo_Libertadores_2026.pptx).
-- O treinador preenche por seções; o PDF mostra só o que foi preenchido. `data` = JSON validado por
-- src/services/analiseAdversario.js (normalizar). Apagar o jogo apaga a análise.
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 062_analise_adversario.sql
BEGIN;

CREATE TABLE IF NOT EXISTS opponent_analyses (
  session_id   UUID PRIMARY KEY REFERENCES training_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opponent_analyses_workspace ON opponent_analyses(workspace_id);

INSERT INTO schema_migrations (filename) VALUES ('062_analise_adversario.sql') ON CONFLICT DO NOTHING;

ALTER TABLE opponent_analyses OWNER TO sports_admin;
GRANT SELECT ON opponent_analyses TO admin_ro; -- console Faggin Admin (só leitura)

COMMIT;
