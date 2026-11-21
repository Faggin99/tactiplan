-- 21/11/2026: SESSÕES SALVAS (modelos de treino) no catálogo de atividades. Guarda o treino inteiro (os 6 blocos
-- com a atividade de cada um) para reaplicar em outro dia. blocos = [{ ordem, nome, atividade: { title_id,
-- description, duration_minutes, groups, is_rest, content_id, selectedStages } | null }]. Só ADD.
CREATE TABLE IF NOT EXISTS treinos_modelo (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome         VARCHAR(80) NOT NULL,
  descricao    TEXT,
  blocos       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_treinos_modelo_ws ON treinos_modelo(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON treinos_modelo TO sports_admin;
